function runSimulation() {
    const years = Number(document.getElementById("years").value);
    const capital = parseCurrencyInput(document.getElementById("capital").value);
    const initialWithdrawalRate = Number(document.getElementById("withdrawalRate").value) / 100;
    const inflationRate = Number(document.getElementById("inflationRate").value) / 100;

    const stocks = Number(document.getElementById("stocks").value) / 100;
    const bonds = Number(document.getElementById("bonds").value) / 100;
    const chartMode = getChartMode();
    const skipInflationAfterBadYear = document.getElementById("skipInflationAfterBadYear").checked;

    const person1Age = Number(document.getElementById("person1Age").value);
    const person2Age = Number(document.getElementById("person2Age").value);
    const statePensionAge = Number(document.getElementById("statePensionAge").value);
    const statePensionAmount = parseCurrencyInput(document.getElementById("statePensionAmount").value);

    if (Math.abs((stocks + bonds) - 1) > 0.0001) {
        alert("Stock and bond allocation must add up to 100%.");
        return;
    }

    if (capital <= 0 || years <= 0 || initialWithdrawalRate <= 0) {
        alert("Please enter sensible positive values.");
        return;
    }

    if (inflationRate < 0) {
        alert("Inflation assumption cannot be negative.");
        return;
    }

    if (statePensionAge <= 0 || statePensionAmount < 0) {
        alert("Please enter sensible state pension assumptions.");
        return;
    }

    const params = {
        upper: Number(document.getElementById("upperGuard").value),
        lower: Number(document.getElementById("lowerGuard").value),
        down: Number(document.getElementById("downAdjust").value),
        up: Number(document.getElementById("upAdjust").value)
    };

    const simulationCount = 10000;

    const portfolioPaths = [];
    const totalSpendingPaths = [];
    const portfolioWithdrawalPaths = [];
    const statePensionIncomePaths = [];

    const endingValues = [];
    const totalPortfolioWithdrawals = [];
    const totalHouseholdSpending = [];
    const totalStatePensionIncome = [];

    let successCount = 0;

    for (let i = 0; i < simulationCount; i++) {
        const result = runSingleSimulation({
            years,
            capital,
            initialWithdrawalRate,
            inflationRate,
            stocks,
            bonds,
            params,
            skipInflationAfterBadYear,
            person1Age,
            person2Age,
            statePensionAge,
            statePensionAmount
        });

        portfolioPaths.push(chartMode === "real" ? result.realPortfolioPath : result.nominalPortfolioPath);
        totalSpendingPaths.push(chartMode === "real" ? result.realSpendingPath : result.nominalSpendingPath);
        portfolioWithdrawalPaths.push(chartMode === "real" ? result.realPortfolioWithdrawalPath : result.nominalPortfolioWithdrawalPath);
        statePensionIncomePaths.push(chartMode === "real" ? result.realStatePensionIncomePath : result.nominalStatePensionIncomePath);

        endingValues.push(chartMode === "real" ? result.realEndingPortfolio : result.nominalEndingPortfolio);
        totalPortfolioWithdrawals.push(chartMode === "real" ? result.realTotalPortfolioWithdrawals : result.nominalTotalPortfolioWithdrawals);
        totalHouseholdSpending.push(chartMode === "real" ? result.realTotalHouseholdSpending : result.nominalTotalHouseholdSpending);
        totalStatePensionIncome.push(chartMode === "real" ? result.realTotalStatePensionIncome : result.nominalTotalStatePensionIncome);

        if (result.succeeded) {
            successCount++;
        }
    }

    const portfolioSummary = buildSummary(
        endingValues,
        totalPortfolioWithdrawals,
        totalHouseholdSpending,
        totalStatePensionIncome,
        successCount,
        simulationCount
    );

    const portfolioChartData = buildPercentileChartData(portfolioPaths, years);
    const totalSpendingChartData = buildPercentileChartData(totalSpendingPaths, years);
    const withdrawalMedianData = buildMedianChartData(portfolioWithdrawalPaths, years);
    const pensionMedianData = buildMedianChartData(statePensionIncomePaths, years);

    drawRangeChart("chart", portfolioChartData, "currency");
    drawSpendingBreakdownChart(
        "spendingChart",
        totalSpendingChartData,
        withdrawalMedianData,
        pensionMedianData
    );

    showSummary(
        portfolioSummary,
        capital,
        years,
        initialWithdrawalRate,
        inflationRate,
        chartMode,
        simulationCount,
        person1Age,
        person2Age,
        statePensionAge,
        statePensionAmount,
        skipInflationAfterBadYear
    );
}

function runSingleSimulation(config) {
    const {
        years,
        capital,
        initialWithdrawalRate,
        inflationRate,
        stocks,
        bonds,
        params,
        skipInflationAfterBadYear,
        person1Age,
        person2Age,
        statePensionAge,
        statePensionAmount
    } = config;

    let portfolio = capital;
    let desiredSpending = capital * initialWithdrawalRate;
    let inflationIndex = 1;
    let previousReturn = null;
    let succeeded = true;

    let nominalTotalPortfolioWithdrawals = 0;
    let realTotalPortfolioWithdrawals = 0;
    let nominalTotalHouseholdSpending = 0;
    let realTotalHouseholdSpending = 0;
    let nominalTotalStatePensionIncome = 0;
    let realTotalStatePensionIncome = 0;

    const nominalPortfolioPath = [];
    const realPortfolioPath = [];

    const nominalSpendingPath = [];
    const realSpendingPath = [];

    const nominalPortfolioWithdrawalPath = [];
    const realPortfolioWithdrawalPath = [];

    const nominalStatePensionIncomePath = [];
    const realStatePensionIncomePath = [];

    const initialPensionIncome = getNominalPensionIncomeForYear(
        0,
        inflationIndex,
        person1Age,
        person2Age,
        statePensionAge,
        statePensionAmount
    );

    const startingPortfolioWithdrawal = Math.max(desiredSpending - initialPensionIncome, 0);
    const startingPortfolioWithdrawalRate = capital > 0 ? startingPortfolioWithdrawal / capital : 0;

    for (let year = 0; year < years; year++) {
        const annualReturn = portfolioReturn(stocks, bonds);
        portfolio *= (1 + annualReturn);

        if (year > 0) {
            inflationIndex *= (1 + inflationRate);

            const shouldSkipInflation =
                skipInflationAfterBadYear && previousReturn !== null && previousReturn < 0;

            if (!shouldSkipInflation) {
                desiredSpending *= (1 + inflationRate);
            }
        }

        const nominalPensionIncome = getNominalPensionIncomeForYear(
            year,
            inflationIndex,
            person1Age,
            person2Age,
            statePensionAge,
            statePensionAmount
        );

        let requiredPortfolioWithdrawal = Math.max(desiredSpending - nominalPensionIncome, 0);

        if (startingPortfolioWithdrawalRate > 0 && requiredPortfolioWithdrawal > 0) {
            requiredPortfolioWithdrawal = applyGuardrails(
                requiredPortfolioWithdrawal,
                portfolio,
                startingPortfolioWithdrawalRate,
                params
            );
        }

        if (requiredPortfolioWithdrawal > portfolio) {
            requiredPortfolioWithdrawal = portfolio;
        }

        portfolio -= requiredPortfolioWithdrawal;

        const actualTotalSpending = requiredPortfolioWithdrawal + nominalPensionIncome;

        nominalTotalPortfolioWithdrawals += requiredPortfolioWithdrawal;
        realTotalPortfolioWithdrawals += requiredPortfolioWithdrawal / inflationIndex;

        nominalTotalStatePensionIncome += nominalPensionIncome;
        realTotalStatePensionIncome += nominalPensionIncome / inflationIndex;

        nominalTotalHouseholdSpending += actualTotalSpending;
        realTotalHouseholdSpending += actualTotalSpending / inflationIndex;

        nominalPortfolioPath.push(Math.max(portfolio, 0));
        realPortfolioPath.push(Math.max(portfolio, 0) / inflationIndex);

        nominalSpendingPath.push(actualTotalSpending);
        realSpendingPath.push(actualTotalSpending / inflationIndex);

        nominalPortfolioWithdrawalPath.push(requiredPortfolioWithdrawal);
        realPortfolioWithdrawalPath.push(requiredPortfolioWithdrawal / inflationIndex);

        nominalStatePensionIncomePath.push(nominalPensionIncome);
        realStatePensionIncomePath.push(nominalPensionIncome / inflationIndex);

        previousReturn = annualReturn;

        if (portfolio <= 0) {
            succeeded = false;

            for (let remaining = year + 1; remaining < years; remaining++) {
                inflationIndex *= (1 + inflationRate);

                nominalPortfolioPath.push(0);
                realPortfolioPath.push(0);

                const pensionOnlyIncome = getNominalPensionIncomeForYear(
                    remaining,
                    inflationIndex,
                    person1Age,
                    person2Age,
                    statePensionAge,
                    statePensionAmount
                );

                nominalSpendingPath.push(pensionOnlyIncome);
                realSpendingPath.push(pensionOnlyIncome / inflationIndex);

                nominalPortfolioWithdrawalPath.push(0);
                realPortfolioWithdrawalPath.push(0);

                nominalStatePensionIncomePath.push(pensionOnlyIncome);
                realStatePensionIncomePath.push(pensionOnlyIncome / inflationIndex);

                nominalTotalStatePensionIncome += pensionOnlyIncome;
                realTotalStatePensionIncome += pensionOnlyIncome / inflationIndex;

                nominalTotalHouseholdSpending += pensionOnlyIncome;
                realTotalHouseholdSpending += pensionOnlyIncome / inflationIndex;
            }

            break;
        }
    }

    return {
        nominalPortfolioPath,
        realPortfolioPath,
        nominalSpendingPath,
        realSpendingPath,
        nominalPortfolioWithdrawalPath,
        realPortfolioWithdrawalPath,
        nominalStatePensionIncomePath,
        realStatePensionIncomePath,
        nominalEndingPortfolio: nominalPortfolioPath[nominalPortfolioPath.length - 1] || 0,
        realEndingPortfolio: realPortfolioPath[realPortfolioPath.length - 1] || 0,
        nominalTotalPortfolioWithdrawals,
        realTotalPortfolioWithdrawals,
        nominalTotalHouseholdSpending,
        realTotalHouseholdSpending,
        nominalTotalStatePensionIncome,
        realTotalStatePensionIncome,
        succeeded
    };
}

function getNominalPensionIncomeForYear(
    yearIndex,
    inflationIndex,
    person1Age,
    person2Age,
    statePensionAge,
    statePensionAmount
) {
    let total = 0;

    if ((person1Age + yearIndex) >= statePensionAge) {
        total += statePensionAmount * inflationIndex;
    }

    if ((person2Age + yearIndex) >= statePensionAge) {
        total += statePensionAmount * inflationIndex;
    }

    return total;
}

function buildSummary(
    endingValues,
    totalPortfolioWithdrawals,
    totalHouseholdSpending,
    totalStatePensionIncome,
    successCount,
    simulationCount
) {
    const sortedEndings = [...endingValues].sort((a, b) => a - b);
    const sortedPortfolioWithdrawals = [...totalPortfolioWithdrawals].sort((a, b) => a - b);
    const sortedHouseholdSpending = [...totalHouseholdSpending].sort((a, b) => a - b);
    const sortedStatePensionIncome = [...totalStatePensionIncome].sort((a, b) => a - b);

    return {
        successRate: (successCount / simulationCount) * 100,
        medianEnding: percentileFromSorted(sortedEndings, 50),
        p10Ending: percentileFromSorted(sortedEndings, 10),
        p90Ending: percentileFromSorted(sortedEndings, 90),
        medianPortfolioWithdrawals: percentileFromSorted(sortedPortfolioWithdrawals, 50),
        medianHouseholdSpending: percentileFromSorted(sortedHouseholdSpending, 50),
        medianStatePensionIncome: percentileFromSorted(sortedStatePensionIncome, 50),
        worstEnding: sortedEndings[0],
        bestEnding: sortedEndings[sortedEndings.length - 1]
    };
}

function buildPercentileChartData(allPaths, years) {
    const p10 = [];
    const p50 = [];
    const p90 = [];

    for (let year = 0; year < years; year++) {
        const yearValues = allPaths.map(path => path[year]).sort((a, b) => a - b);
        p10.push(percentileFromSorted(yearValues, 10));
        p50.push(percentileFromSorted(yearValues, 50));
        p90.push(percentileFromSorted(yearValues, 90));
    }

    return { p10, p50, p90 };
}

function buildMedianChartData(allPaths, years) {
    const p50 = [];

    for (let year = 0; year < years; year++) {
        const yearValues = allPaths.map(path => path[year]).sort((a, b) => a - b);
        p50.push(percentileFromSorted(yearValues, 50));
    }

    return { p50 };
}

function percentileFromSorted(sortedArray, percentile) {
    if (!sortedArray.length) {
        return 0;
    }

    const index = (percentile / 100) * (sortedArray.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);

    if (lower === upper) {
        return sortedArray[lower];
    }

    const weight = index - lower;
    return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
}

function drawRangeChart(canvasId, chartData, valueType) {
    const canvas = document.getElementById(canvasId);
    const ctx = canvas.getContext("2d");

    const width = canvas.width;
    const height = canvas.height;
    const padding = {
        top: 24,
        right: 18,
        bottom: 42,
        left: 64
    };

    ctx.clearRect(0, 0, width, height);

    const allValues = [...chartData.p10, ...chartData.p50, ...chartData.p90];
    const maxY = Math.max(...allValues, 1) * 1.10;

    drawAxes(ctx, width, height, padding, maxY, chartData.p50.length, valueType);
    drawBand(ctx, chartData.p10, chartData.p90, width, height, padding, maxY);
    drawLine(ctx, chartData.p90, width, height, padding, maxY, "#9ca3af", 2);
    drawLine(ctx, chartData.p50, width, height, padding, maxY, "#2563eb", 3);
    drawLine(ctx, chartData.p10, width, height, padding, maxY, "#dc2626", 2);
}

function drawSpendingBreakdownChart(canvasId, totalChartData, withdrawalMedianData, pensionMedianData) {
    const canvas = document.getElementById(canvasId);
    const ctx = canvas.getContext("2d");

    const width = canvas.width;
    const height = canvas.height;
    const padding = {
        top: 24,
        right: 18,
        bottom: 42,
        left: 64
    };

    ctx.clearRect(0, 0, width, height);

    const allValues = [
        ...totalChartData.p10,
        ...totalChartData.p50,
        ...totalChartData.p90,
        ...withdrawalMedianData.p50,
        ...pensionMedianData.p50
    ];
    const maxY = Math.max(...allValues, 1) * 1.12;

    drawAxes(ctx, width, height, padding, maxY, totalChartData.p50.length, "currency");
    drawBand(ctx, totalChartData.p10, totalChartData.p90, width, height, padding, maxY);
    drawLine(ctx, totalChartData.p50, width, height, padding, maxY, "#2563eb", 3.2);
    drawLine(ctx, withdrawalMedianData.p50, width, height, padding, maxY, "#dc2626", 2.4);
    drawLine(ctx, pensionMedianData.p50, width, height, padding, maxY, "#16a34a", 3);
}

function drawAxes(ctx, width, height, padding, maxY, years, valueType) {
    const plotLeft = padding.left;
    const plotRight = width - padding.right;
    const plotTop = padding.top;
    const plotBottom = height - padding.bottom;

    ctx.strokeStyle = "#d1d5db";
    ctx.lineWidth = 1;

    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
        const value = (maxY / yTicks) * i;
        const y = plotBottom - (value / maxY) * (plotBottom - plotTop);

        ctx.beginPath();
        ctx.moveTo(plotLeft, y);
        ctx.lineTo(plotRight, y);
        ctx.stroke();

        ctx.fillStyle = "#6b7280";
        ctx.font = "12px Arial";
        ctx.textAlign = "left";
        ctx.fillText(formatAxisValue(value, valueType), 10, y + 4);
    }

    ctx.strokeStyle = "#9ca3af";
    ctx.lineWidth = 1.4;

    ctx.beginPath();
    ctx.moveTo(plotLeft, plotTop);
    ctx.lineTo(plotLeft, plotBottom);
    ctx.lineTo(plotRight, plotBottom);
    ctx.stroke();

    const xTicks = Math.min(years, 6);
    for (let i = 0; i <= xTicks; i++) {
        const yearIndex = Math.round((i / xTicks) * (years - 1));
        const x = plotLeft + (yearIndex / Math.max(years - 1, 1)) * (plotRight - plotLeft);

        ctx.beginPath();
        ctx.moveTo(x, plotBottom);
        ctx.lineTo(x, plotBottom + 6);
        ctx.stroke();

        ctx.fillStyle = "#6b7280";
        ctx.font = "12px Arial";
        ctx.textAlign = "center";
        ctx.fillText(String(yearIndex + 1), x, plotBottom + 22);
    }

    ctx.fillStyle = "#4b5563";
    ctx.font = "13px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Year", width / 2, height - 8);
}

function drawBand(ctx, lowerData, upperData, width, height, padding, maxY) {
    const plotLeft = padding.left;
    const plotRight = width - padding.right;
    const plotTop = padding.top;
    const plotBottom = height - padding.bottom;

    ctx.beginPath();

    for (let i = 0; i < upperData.length; i++) {
        const x = plotLeft + (i / Math.max(upperData.length - 1, 1)) * (plotRight - plotLeft);
        const y = plotBottom - (upperData[i] / maxY) * (plotBottom - plotTop);

        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }

    for (let i = lowerData.length - 1; i >= 0; i--) {
        const x = plotLeft + (i / Math.max(lowerData.length - 1, 1)) * (plotRight - plotLeft);
        const y = plotBottom - (lowerData[i] / maxY) * (plotBottom - plotTop);
        ctx.lineTo(x, y);
    }

    ctx.closePath();
    ctx.fillStyle = "rgba(37, 99, 235, 0.10)";
    ctx.fill();
}

function drawLine(ctx, data, width, height, padding, maxY, colour, lineWidth) {
    const plotLeft = padding.left;
    const plotRight = width - padding.right;
    const plotTop = padding.top;
    const plotBottom = height - padding.bottom;

    ctx.beginPath();

    for (let i = 0; i < data.length; i++) {
        const x = plotLeft + (i / Math.max(data.length - 1, 1)) * (plotRight - plotLeft);
        const y = plotBottom - (data[i] / maxY) * (plotBottom - plotTop);

        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }

    ctx.strokeStyle = colour;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
}

function showSummary(
    summary,
    startingCapital,
    years,
    initialWithdrawalRate,
    inflationRate,
    chartMode,
    simulationCount,
    person1Age,
    person2Age,
    statePensionAge,
    statePensionAmount,
    skipInflationAfterBadYear
) {
    const yearsUntilP1 = Math.max(statePensionAge - person1Age, 0);
    const yearsUntilP2 = Math.max(statePensionAge - person2Age, 0);

    const p1ProjectedStart = statePensionAmount * Math.pow(1 + inflationRate, yearsUntilP1);
    const p2ProjectedStart = statePensionAmount * Math.pow(1 + inflationRate, yearsUntilP2);

    const summaryDiv = document.getElementById("summary");

    summaryDiv.innerHTML = `
        <div class="summary-item">
            <span class="summary-label">Simulations run</span>
            <span class="summary-value">${formatNumber(simulationCount)}</span>
        </div>

        <div class="summary-item">
            <span class="summary-label">Years modelled</span>
            <span class="summary-value">${formatNumber(years)}</span>
        </div>

        <div class="summary-item">
            <span class="summary-label">Starting portfolio</span>
            <span class="summary-value">£${formatNumber(Math.round(startingCapital))}</span>
        </div>

        <div class="summary-item">
            <span class="summary-label">Initial withdrawal</span>
            <span class="summary-value">${formatPercent(initialWithdrawalRate * 100)}</span>
        </div>

        <div class="summary-item">
            <span class="summary-label">Inflation assumption</span>
            <span class="summary-value">${formatPercent(inflationRate * 100)}</span>
        </div>

        <div class="summary-item">
            <span class="summary-label">Inflation skip rule</span>
            <span class="summary-value">${skipInflationAfterBadYear ? "On" : "Off"}</span>
        </div>

        <div class="summary-item">
            <span class="summary-label">Chart mode</span>
            <span class="summary-value">${capitalise(chartMode)}</span>
        </div>

        <div class="summary-item">
            <span class="summary-label">State pension assumption today</span>
            <span class="summary-value">£${formatNumber(Math.round(statePensionAmount))} each</span>
        </div>

        <div class="summary-item">
            <span class="summary-label">Person 1 state pension start</span>
            <span class="summary-value">${getPensionStartLabel(person1Age, statePensionAge)}</span>
        </div>

        <div class="summary-item">
            <span class="summary-label">Person 1 projected state pension at start</span>
            <span class="summary-value">£${formatNumber(Math.round(p1ProjectedStart))}</span>
        </div>

        <div class="summary-item">
            <span class="summary-label">Person 2 state pension start</span>
            <span class="summary-value">${getPensionStartLabel(person2Age, statePensionAge)}</span>
        </div>

        <div class="summary-item">
            <span class="summary-label">Person 2 projected state pension at start</span>
            <span class="summary-value">£${formatNumber(Math.round(p2ProjectedStart))}</span>
        </div>

        <div class="summary-item">
            <span class="summary-label">Success rate</span>
            <span class="summary-value">${formatPercent(summary.successRate)}</span>
        </div>

        <div class="summary-item">
            <span class="summary-label">Median ending portfolio</span>
            <span class="summary-value">£${formatNumber(Math.round(summary.medianEnding))}</span>
        </div>

        <div class="summary-item">
            <span class="summary-label">Median total household spending</span>
            <span class="summary-value">£${formatNumber(Math.round(summary.medianHouseholdSpending))}</span>
        </div>

        <div class="summary-item">
            <span class="summary-label">Median total portfolio withdrawals</span>
            <span class="summary-value">£${formatNumber(Math.round(summary.medianPortfolioWithdrawals))}</span>
        </div>

        <div class="summary-item">
            <span class="summary-label">Median total state pension income</span>
            <span class="summary-value">£${formatNumber(Math.round(summary.medianStatePensionIncome))}</span>
        </div>

        <div class="summary-item">
            <span class="summary-label">10th percentile ending</span>
            <span class="summary-value">£${formatNumber(Math.round(summary.p10Ending))}</span>
        </div>

        <div class="summary-item">
            <span class="summary-label">90th percentile ending</span>
            <span class="summary-value">£${formatNumber(Math.round(summary.p90Ending))}</span>
        </div>

        <div class="summary-item">
            <span class="summary-label">Worst ending portfolio</span>
            <span class="summary-value">£${formatNumber(Math.round(summary.worstEnding))}</span>
        </div>

        <div class="summary-item">
            <span class="summary-label">Best ending portfolio</span>
            <span class="summary-value">£${formatNumber(Math.round(summary.bestEnding))}</span>
        </div>
    `;
}

function getChartMode() {
    const selected = document.querySelector('input[name="chartMode"]:checked');
    return selected ? selected.value : "real";
}

function parseCurrencyInput(value) {
    const cleaned = String(value).replace(/,/g, "").trim();
    return Number(cleaned);
}

function formatCurrencyInput(value) {
    const digitsOnly = String(value).replace(/[^\d]/g, "");

    if (!digitsOnly) {
        return "";
    }

    return Number(digitsOnly).toLocaleString("en-GB");
}

function updateInitialWithdrawalAmount() {
    const capitalInput = document.getElementById("capital");
    const withdrawalRateInput = document.getElementById("withdrawalRate");
    const output = document.getElementById("initialWithdrawalAmount");

    if (!capitalInput || !withdrawalRateInput || !output) {
        return;
    }

    const capital = parseCurrencyInput(capitalInput.value);
    const withdrawalRate = Number(withdrawalRateInput.value) / 100;

    if (!Number.isFinite(capital) || capital <= 0 || !Number.isFinite(withdrawalRate) || withdrawalRate <= 0) {
        output.value = "";
        return;
    }

    const annualAmount = capital * withdrawalRate;
    output.value = formatNumber(Math.round(annualAmount));
}

function updateStatePensionSummary() {
    const person1Age = Number(document.getElementById("person1Age").value);
    const person2Age = Number(document.getElementById("person2Age").value);
    const statePensionAge = Number(document.getElementById("statePensionAge").value);
    const summary = document.getElementById("statePensionSummary");

    if (!summary) {
        return;
    }

    const label1 = getPensionStartLabel(person1Age, statePensionAge);
    const label2 = getPensionStartLabel(person2Age, statePensionAge);

    summary.value = `P1: ${label1} | P2: ${label2}`;
}

function getPensionStartLabel(currentAge, pensionAge) {
    if (currentAge >= pensionAge) {
        return "Already in payment";
    }

    const yearsUntil = pensionAge - currentAge;
    return `Year ${yearsUntil + 1}`;
}

function formatAxisValue(value, valueType) {
    if (valueType === "currency") {
        return "£" + formatCompactCurrency(Math.round(value));
    }

    return formatNumber(Math.round(value));
}

function formatNumber(value) {
    return Number(value).toLocaleString("en-GB");
}

function formatPercent(value) {
    return `${Number(value).toFixed(1)}%`;
}

function formatCompactCurrency(value) {
    if (value >= 1000000) {
        return (value / 1000000).toFixed(1).replace(".0", "") + "m";
    }

    if (value >= 1000) {
        return (value / 1000).toFixed(1).replace(".0", "") + "k";
    }

    return String(value);
}

function capitalise(value) {
    const text = String(value || "");
    return text.charAt(0).toUpperCase() + text.slice(1);
}

window.addEventListener("DOMContentLoaded", () => {
    const yearsInput = document.getElementById("years");
    const yearsValue = document.getElementById("yearsValue");
    const capitalInput = document.getElementById("capital");
    const statePensionAmountInput = document.getElementById("statePensionAmount");
    const withdrawalRateInput = document.getElementById("withdrawalRate");
    const inflationRateInput = document.getElementById("inflationRate");
    const chartModeInputs = document.querySelectorAll('input[name="chartMode"]');
    const skipInflationCheckbox = document.getElementById("skipInflationAfterBadYear");
    const person1AgeInput = document.getElementById("person1Age");
    const person2AgeInput = document.getElementById("person2Age");
    const statePensionAgeInput = document.getElementById("statePensionAge");

    if (yearsInput && yearsValue) {
        yearsValue.textContent = yearsInput.value;
        yearsInput.addEventListener("input", () => {
            yearsValue.textContent = yearsInput.value;
        });
    }

    if (capitalInput) {
        capitalInput.value = formatCurrencyInput(capitalInput.value);

        capitalInput.addEventListener("input", () => {
            capitalInput.value = formatCurrencyInput(capitalInput.value);
            updateInitialWithdrawalAmount();
        });

        capitalInput.addEventListener("blur", () => {
            capitalInput.value = formatCurrencyInput(capitalInput.value);
            updateInitialWithdrawalAmount();
        });
    }

    if (statePensionAmountInput) {
        statePensionAmountInput.value = formatCurrencyInput(statePensionAmountInput.value);

        statePensionAmountInput.addEventListener("input", () => {
            statePensionAmountInput.value = formatCurrencyInput(statePensionAmountInput.value);
        });

        statePensionAmountInput.addEventListener("blur", () => {
            statePensionAmountInput.value = formatCurrencyInput(statePensionAmountInput.value);
        });
    }

    if (withdrawalRateInput) {
        withdrawalRateInput.addEventListener("input", () => {
            updateInitialWithdrawalAmount();
        });
    }

    if (inflationRateInput) {
        inflationRateInput.addEventListener("input", () => {
            runSimulation();
        });
    }

    if (skipInflationCheckbox) {
        skipInflationCheckbox.addEventListener("change", () => {
            runSimulation();
        });
    }

    chartModeInputs.forEach(input => {
        input.addEventListener("change", () => {
            runSimulation();
        });
    });

    [person1AgeInput, person2AgeInput, statePensionAgeInput].forEach(input => {
        if (input) {
            input.addEventListener("input", () => {
                updateStatePensionSummary();
                runSimulation();
            });
        }
    });

    if (statePensionAmountInput) {
        statePensionAmountInput.addEventListener("input", () => {
            runSimulation();
        });

        statePensionAmountInput.addEventListener("blur", () => {
            runSimulation();
        });
    }

    updateInitialWithdrawalAmount();
    updateStatePensionSummary();
    runSimulation();
});
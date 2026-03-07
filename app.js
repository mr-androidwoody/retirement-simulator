function runSimulation() {
    const years = Number(document.getElementById("years").value);
    const capital = parseCurrencyInput(document.getElementById("capital").value);
    const initialWithdrawalRate = Number(document.getElementById("withdrawalRate").value) / 100;

    const stocks = Number(document.getElementById("stocks").value) / 100;
    const bonds = Number(document.getElementById("bonds").value) / 100;

    if (Math.abs((stocks + bonds) - 1) > 0.0001) {
        alert("Stock and bond allocation must add up to 100%.");
        return;
    }

    if (capital <= 0 || years <= 0 || initialWithdrawalRate <= 0) {
        alert("Please enter sensible positive values.");
        return;
    }

    const params = {
        upper: Number(document.getElementById("upperGuard").value),
        lower: Number(document.getElementById("lowerGuard").value),
        down: Number(document.getElementById("downAdjust").value),
        up: Number(document.getElementById("upAdjust").value)
    };

    const simulationCount = 10000;
    const allPaths = [];
    const endingValues = [];
    const totalWithdrawals = [];
    let successCount = 0;

    for (let i = 0; i < simulationCount; i++) {
        const result = runSingleSimulation(
            years,
            capital,
            initialWithdrawalRate,
            stocks,
            bonds,
            params
        );

        allPaths.push(result.portfolioPath);
        endingValues.push(result.endingPortfolio);
        totalWithdrawals.push(result.totalWithdrawn);

        if (result.succeeded) {
            successCount++;
        }
    }

    const summary = buildSummary(endingValues, totalWithdrawals, successCount, simulationCount);
    const chartData = buildPercentileChartData(allPaths, years);

    drawMonteCarloChart(chartData);
    showSummary(summary, capital, years, initialWithdrawalRate, simulationCount);
}

function runSingleSimulation(years, capital, initialWithdrawalRate, stocks, bonds, params) {
    let portfolio = capital;
    let withdrawal = capital * initialWithdrawalRate;

    const portfolioPath = [];
    let totalWithdrawn = 0;
    let succeeded = true;

    for (let year = 0; year < years; year++) {
        const annualReturn = portfolioReturn(stocks, bonds);

        portfolio *= (1 + annualReturn);

        withdrawal = applyGuardrails(withdrawal, portfolio, initialWithdrawalRate, params);

        if (withdrawal > portfolio) {
            withdrawal = portfolio;
        }

        portfolio -= withdrawal;
        totalWithdrawn += withdrawal;

        portfolioPath.push(Math.max(portfolio, 0));

        if (portfolio <= 0) {
            succeeded = false;

            for (let remaining = year + 1; remaining < years; remaining++) {
                portfolioPath.push(0);
            }

            break;
        }
    }

    while (portfolioPath.length < years) {
        portfolioPath.push(Math.max(portfolio, 0));
    }

    return {
        portfolioPath,
        endingPortfolio: Math.max(portfolio, 0),
        totalWithdrawn,
        succeeded
    };
}

function buildSummary(endingValues, totalWithdrawals, successCount, simulationCount) {
    const sortedEndings = [...endingValues].sort((a, b) => a - b);
    const sortedWithdrawals = [...totalWithdrawals].sort((a, b) => a - b);

    return {
        successRate: (successCount / simulationCount) * 100,
        medianEnding: percentileFromSorted(sortedEndings, 50),
        p10Ending: percentileFromSorted(sortedEndings, 10),
        p90Ending: percentileFromSorted(sortedEndings, 90),
        medianWithdrawn: percentileFromSorted(sortedWithdrawals, 50),
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

function drawMonteCarloChart(chartData) {
    const canvas = document.getElementById("chart");
    const ctx = canvas.getContext("2d");

    const width = canvas.width;
    const height = canvas.height;
    const padding = {
        top: 16,
        right: 18,
        bottom: 42,
        left: 56
    };

    ctx.clearRect(0, 0, width, height);

    const allValues = [...chartData.p10, ...chartData.p50, ...chartData.p90];
    const maxY = Math.max(...allValues, 1);

    drawAxes(ctx, width, height, padding, maxY, chartData.p50.length);
    drawBand(ctx, chartData.p10, chartData.p90, width, height, padding, maxY);
    drawLine(ctx, chartData.p90, width, height, padding, maxY, "#9ca3af", 2);
    drawLine(ctx, chartData.p50, width, height, padding, maxY, "#2563eb", 3);
    drawLine(ctx, chartData.p10, width, height, padding, maxY, "#dc2626", 2);
}

function drawAxes(ctx, width, height, padding, maxY, years) {
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
        ctx.fillText("£" + formatCompactCurrency(Math.round(value)), 10, y + 4);
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
    ctx.fillStyle = "rgba(37, 99, 235, 0.08)";
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

function showSummary(summary, startingCapital, years, initialWithdrawalRate, simulationCount) {
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
            <span class="summary-label">Success rate</span>
            <span class="summary-value">${formatPercent(summary.successRate)}</span>
        </div>

        <div class="summary-item">
            <span class="summary-label">Median ending portfolio</span>
            <span class="summary-value">£${formatNumber(Math.round(summary.medianEnding))}</span>
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
            <span class="summary-label">Median total withdrawn</span>
            <span class="summary-value">£${formatNumber(Math.round(summary.medianWithdrawn))}</span>
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

function parseCurrencyInput(value) {
    const cleaned = String(value).replace(/,/g, "").trim();
    return Number(cleaned);
}

function formatCapitalInput(value) {
    const digitsOnly = String(value).replace(/[^\d]/g, "");

    if (!digitsOnly) {
        return "";
    }

    return Number(digitsOnly).toLocaleString("en-GB");
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

window.addEventListener("DOMContentLoaded", () => {
    const yearsInput = document.getElementById("years");
    const yearsValue = document.getElementById("yearsValue");
    const capitalInput = document.getElementById("capital");

    if (yearsInput && yearsValue) {
        yearsValue.textContent = yearsInput.value;

        yearsInput.addEventListener("input", () => {
            yearsValue.textContent = yearsInput.value;
        });
    }

    if (capitalInput) {
        capitalInput.value = formatCapitalInput(capitalInput.value);

        capitalInput.addEventListener("input", () => {
            capitalInput.value = formatCapitalInput(capitalInput.value);
        });

        capitalInput.addEventListener("blur", () => {
            capitalInput.value = formatCapitalInput(capitalInput.value);
        });
    }

    runSimulation();
});
function applyGuardrails(withdrawal, portfolio, initialWR, params){

    let currentWR = withdrawal / portfolio;

    let upper = initialWR * (1 + params.upper/100);
    let lower = initialWR * (1 - params.lower/100);

    if(currentWR > upper){

        withdrawal *= (1 - params.down/100);

    }

    if(currentWR < lower){

        withdrawal *= (1 + params.up/100);

    }

    return withdrawal;
}
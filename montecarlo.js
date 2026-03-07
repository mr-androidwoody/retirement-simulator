function randomNormal(mean, std) {

    let u = 0, v = 0;

    while(u === 0) u = Math.random();
    while(v === 0) v = Math.random();

    let num = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);

    return mean + std * num;
}

function portfolioReturn(stockWeight, bondWeight){

    let stockReturn = randomNormal(0.07, 0.18);
    let bondReturn = randomNormal(0.02, 0.06);

    return (stockReturn * stockWeight) + (bondReturn * bondWeight);

}
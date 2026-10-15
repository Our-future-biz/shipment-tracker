// A quantity of cargo - pieces, kilograms, cubic metres: thousands separated the way amounts are,
// and up to the three decimals a volume is worked out to.
export const fmtQuantity = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 3 });

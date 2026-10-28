// Amounts of the tariffs' currencies, to the cent. Pure.

/**
 * An amount rounded to cents, half up. The tiny nudge keeps a half cent that binary floating point
 * holds just below it (1.005 is 1.00499999…) from rounding down.
 */
export const roundCents = (n: number): number => Math.round(n * 100 * (1 + Number.EPSILON)) / 100;

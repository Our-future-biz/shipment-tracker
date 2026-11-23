// The planner keeps every size in whole millimetres; the user picks the unit sizes are typed and shown in.

export type DimUnit = "mm" | "cm" | "m";

export const DIM_UNITS: readonly DimUnit[] = ["mm", "cm", "m"];

const MM_PER: Record<DimUnit, number> = { mm: 1, cm: 10, m: 1000 };

/** How many decimals a size takes in each unit: down to the millimetre. */
export const DIM_DECIMALS: Record<DimUnit, number> = { mm: 0, cm: 1, m: 3 };

export const toMm = (value: number, unit: DimUnit): number => Math.round(value * MM_PER[unit]);

export const fromMm = (mm: number, unit: DimUnit): number => mm / MM_PER[unit];

const figure = (value: number, decimals: number) => value.toLocaleString("en-US", { maximumFractionDigits: decimals });

/** A size in the chosen unit, without the unit: "1,200", "120", "1.2". */
export const formatDim = (mm: number, unit: DimUnit): string => figure(fromMm(mm, unit), DIM_DECIMALS[unit]);

/** "1,200 × 800 × 1,000 mm". */
export const formatSize = (lengthMm: number, widthMm: number, heightMm: number, unit: DimUnit): string =>
  `${formatDim(lengthMm, unit)} × ${formatDim(widthMm, unit)} × ${formatDim(heightMm, unit)} ${unit}`;

/** A weight: "12,500 kg". */
export const formatKg = (kg: number): string => `${figure(kg, 1)} kg`;

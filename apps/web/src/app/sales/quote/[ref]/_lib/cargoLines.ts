import { containerType } from "@/lib/cargo";
import type { PackageLine, QuoteContainerLine } from "../../../_lib/types";
import { fmtQuantity } from "./fmtQuantity";

// The cargo lines of a quote (its containers, its packages) as the Cargo details step lists them:
// each line reads as text until it is opened for editing, as on a shipment's Container Details,
// and its "⋯" menu copies or deletes it. Pure, so it is unit-tested.

/** The lines with a copy of line `index` right after it (the "⋯" menu's Copy); a line that is not there copies nothing. */
export function withLineCopied<T extends object>(lines: readonly T[], index: number): T[] {
  const line = lines[index];
  if (!line) return [...lines];
  return [...lines.slice(0, index + 1), { ...line }, ...lines.slice(index + 1)];
}

/** The lines without line `index` (the "⋯" menu's Delete). */
export function withoutLine<T>(lines: readonly T[], index: number): T[] {
  return lines.filter((_, j) => j !== index);
}

/** A figure of a line as it reads: "" when nobody entered one (the cell then shows "—"). */
export const lineFigure = (n: number | undefined | null): string => (typeof n === "number" && Number.isFinite(n) ? fmtQuantity(n) : "");

/** How a container line reads, as one phrase ("2 × 40' HC"), for the delete confirmation. */
export const containerLineName = (c: QuoteContainerLine): string => `${lineFigure(c.qty) || "?"} × ${containerType(c.type) || "container"}`;

/** How a package line reads, as one phrase ("3 × Pallets"), for the delete confirmation. */
export const packageLineName = (p: PackageLine): string => `${lineFigure(p.qty) || "?"} × ${p.type || "package"}`;

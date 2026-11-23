import type { interfaces } from "@/lib/api/client";
import { num, STACKABLE } from "@/lib/cargo";
import type { DraftLine } from "./cargoForm";

// A shipment's Dimensions rows and a quote's package lines as the planner's cargo lines. Both keep
// sizes in cm and the weight per piece in kg; the planner keeps sizes in whole mm. A figure the job
// does not have stays empty, so the user sees the line and fills it in.

/** A quote's package line, as the quote's document holds it. */
export interface QuotePackage {
  qty?: number;
  type?: string;
  length?: number;
  width?: number;
  height?: number;
  weight?: number;
  stackable?: boolean;
}

const mm = (cm: number): number | null => (cm > 0 ? Math.round(cm * 10) : null);
const positive = (value: number): number | null => (value > 0 ? value : null);
const colliOf = (value: number): number | null => (value >= 1 ? Math.floor(value) : null);

/** The name a line takes from its package type: "Pallet", or "Pallet 2" when the type repeats. */
function named(lines: Omit<DraftLine, "id">[], newId: () => string): DraftLine[] {
  const seen = new Map<string, number>();
  const total = new Map<string, number>();
  for (const line of lines) total.set(line.name, (total.get(line.name) ?? 0) + 1);
  return lines.map((line) => {
    const count = (seen.get(line.name) ?? 0) + 1;
    seen.set(line.name, count);
    const base = line.name || "Cargo";
    return { ...line, id: newId(), name: (total.get(line.name) ?? 0) > 1 ? `${base} ${count}` : base };
  });
}

/** The Dimensions rows of a shipment's Cargo Details; a row nobody filled in is left out. */
export function linesFromShipment(rows: interfaces.CargoDimensionLine[] | null | undefined, newId: () => string): DraftLine[] {
  const lines = (rows ?? [])
    .map((row) => ({
      name: row.packageType.trim(),
      lengthMm: mm(num(row.lengthCm)),
      widthMm: mm(num(row.widthCm)),
      heightMm: mm(num(row.heightCm)),
      weightKg: positive(num(row.weightPerPcKg)),
      colli: colliOf(num(row.pieces)),
      canTurn: true,
      stackable: row.stackable === STACKABLE,
    }))
    .filter((line) => line.lengthMm || line.widthMm || line.heightMm || line.weightKg);
  return named(lines, newId);
}

/** The package lines of a quote; a line with no size and no weight is left out. */
export function linesFromQuote(packages: QuotePackage[] | null | undefined, newId: () => string): DraftLine[] {
  const lines = (packages ?? [])
    .map((p) => ({
      name: (p.type ?? "").trim(),
      lengthMm: mm(Number(p.length) || 0),
      widthMm: mm(Number(p.width) || 0),
      heightMm: mm(Number(p.height) || 0),
      weightKg: positive(Number(p.weight) || 0),
      colli: colliOf(Number(p.qty) || 0),
      canTurn: true,
      stackable: p.stackable === true,
    }))
    .filter((line) => line.lengthMm || line.widthMm || line.heightMm || line.weightKg);
  return named(lines, newId);
}

/** The package lines out of a quote's document, whatever else it holds. */
export function quotePackages(data: unknown): QuotePackage[] {
  const packages = (data as { packages?: unknown } | null)?.packages;
  return Array.isArray(packages) ? (packages as QuotePackage[]) : [];
}

/** Where a linked job opens. */
export const jobHref = (kind: interfaces.PlanLinkKind, id: string, ref: string): string =>
  kind === "shipment" ? `/shipments/${id}` : `/sales/quote/${encodeURIComponent(ref)}`;

export const JOB_KIND_LABEL: Record<interfaces.PlanLinkKind, string> = { shipment: "Shipment", quote: "Quote" };

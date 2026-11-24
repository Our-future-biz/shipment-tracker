import type { interfaces } from "@/lib/api/client";
import { num, STACKABLE } from "@/lib/cargo";
import type { DraftLine } from "./cargoForm";
import { cleanClass, cleanUn } from "./dangerous";

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

// "Stackable" was the wording before "Stackable / Overstowable"; rows written then still carry it.
const STACKABLE_WORDS = [STACKABLE, "Stackable", "Overstowable"];

type Unnamed = Omit<DraftLine, "id">;

/** A row with nothing in it at all: no pieces, no type, no figure. Only such a row is left out. */
const isEmptyRow = (line: Unnamed, hadColli: boolean) => !line.name && !hadColli && !line.lengthMm && !line.widthMm && !line.heightMm && !line.weightKg;

/** The name a line takes from its package type: "Pallet", or "Pallet 2" when the type repeats. */
function named(lines: Unnamed[], newId: () => string): DraftLine[] {
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

/**
 * The Dimensions rows of a shipment's Cargo Details. A row that has pieces or a package type but
 * no sizes or weight (a volume-only row) comes in as a line to finish, so no cargo goes missing;
 * only a row with nothing in it is left out. A row marked as dangerous goods keeps the mark.
 */
export function linesFromShipment(rows: interfaces.CargoDimensionLine[] | null | undefined, newId: () => string): DraftLine[] {
  const lines = (rows ?? []).flatMap((row) => {
    const line: Unnamed = {
      name: row.packageType.trim(),
      lengthMm: mm(num(row.lengthCm)),
      widthMm: mm(num(row.widthCm)),
      heightMm: mm(num(row.heightCm)),
      weightKg: positive(num(row.weightPerPcKg)),
      colli: colliOf(num(row.pieces)),
      canTurn: true,
      stackable: STACKABLE_WORDS.includes(row.stackable),
      ...(row.adrUn || row.adrClass ? { dg: true } : {}),
      // Its UN number and class go with it where they read as such; anything else stays on the job.
      ...(cleanUn(row.adrUn) ? { un: cleanUn(row.adrUn) } : {}),
      ...(cleanClass(row.adrClass) ? { dgClass: cleanClass(row.adrClass) } : {}),
    };
    return isEmptyRow(line, line.colli !== null) ? [] : [line];
  });
  return named(lines, newId);
}

/** The package lines of a quote; a line with a quantity or a type but no figures comes in to finish. */
export function linesFromQuote(packages: QuotePackage[] | null | undefined, newId: () => string): DraftLine[] {
  const lines = (packages ?? []).flatMap((p) => {
    const line: Unnamed = {
      name: (p.type ?? "").trim(),
      lengthMm: mm(Number(p.length) || 0),
      widthMm: mm(Number(p.width) || 0),
      heightMm: mm(Number(p.height) || 0),
      weightKg: positive(Number(p.weight) || 0),
      colli: colliOf(Number(p.qty) || 0),
      canTurn: true,
      stackable: p.stackable === true,
    };
    return isEmptyRow(line, line.colli !== null) ? [] : [line];
  });
  return named(lines, newId);
}

/**
 * Whether two job numbers name the same job. A job's letters follow its Freight Mode until its
 * first invoice (CZ00000053 becomes CZLCL00000053), so the country and the digits decide.
 */
export function sameJobNumber(a: string, b: string): boolean {
  const parts = (value: string) => /^([A-Za-z]{2})[A-Za-z]*(\d+)$/.exec(value.trim());
  const [x, y] = [parts(a), parts(b)];
  if (!x || !y) return a.trim().toLowerCase() === b.trim().toLowerCase();
  return x[1]!.toLowerCase() === y[1]!.toLowerCase() && Number(x[2]) === Number(y[2]);
}

/** The package lines out of a quote's document, whatever else it holds. */
export function quotePackages(data: unknown): QuotePackage[] {
  const packages = (data as { packages?: unknown } | null)?.packages;
  return Array.isArray(packages) ? (packages as QuotePackage[]) : [];
}

/**
 * The cargo of a sailing's box as planner lines (Council Outlay 14, C1): each shipment's lines under
 * its job number, named "CZLCL00000053 · Pallet" so a piece says whose it is on every drawing and
 * table. A shipment with totals only brings one line with no sizes: a line to finish.
 */
export function linesFromSailing(box: interfaces.SailingPlanCargo, newId: () => string): DraftLine[] {
  return box.shipments.flatMap((s) => {
    const lines = s.lines.map(
      (l): Unnamed => ({
        name: l.packageType,
        lengthMm: mm(l.lengthCm),
        widthMm: mm(l.widthCm),
        heightMm: mm(l.heightCm),
        weightKg: positive(l.weightPerPcKg),
        colli: colliOf(l.pieces),
        canTurn: true,
        stackable: l.stackable,
        ...(l.dangerous ? { dg: true } : {}),
        ...(cleanUn(l.adrUn) ? { un: cleanUn(l.adrUn) } : {}),
        ...(cleanClass(l.adrClass) ? { dgClass: cleanClass(l.adrClass) } : {}),
      }),
    );
    const job = s.jobNumber || "(no job number)";
    // "Pallet", or "Pallet 2" where a shipment has several lines of one type; then the job number in front.
    return named(lines, newId).map((line) => ({ ...line, name: `${job} · ${s.totalsOnly ? "no sizes yet" : line.name}`.slice(0, 120), group: job }));
  });
}

/** The planner's container type of a sailing's ("40' HC"), by its name; null for a type the planner has no sizes for (a reefer). */
export const plannerTypeOf = (containerType: string, types: readonly { id: string; name: string }[]): string | null => types.find((t) => t.name === containerType.trim())?.id ?? null;

/**
 * Where a linked job opens. A sailing's page stands under its service; the page reads the sailing
 * by its own id, so the service's place in the address may be a dash.
 */
export const jobHref = (kind: interfaces.PlanLinkKind, id: string, ref: string): string =>
  kind === "shipment" ? `/shipments/${id}` : kind === "sailing" ? `/co-loading/-/sailings/${id}` : `/sales/quote/${encodeURIComponent(ref)}`;

export const JOB_KIND_LABEL: Record<interfaces.PlanLinkKind, string> = { shipment: "Shipment", quote: "Quote", sailing: "Sailing" };

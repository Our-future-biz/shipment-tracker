import { isUuid } from "../../../lib/uuid";
import { cargoNum, dimensionVolumePerPiece, type PieceSizes } from "../../../lib/cargoVolume";
import { parseTypedAmount } from "../../../lib/typedAmount";
import type { ContainerLine, CargoItemLine, CargoDimensionLine } from "../interfaces/interfaces";

// Numeric fields on container/cargo lines are free-text; parse them the same way
// everywhere: strip everything but digits, ".", "," and "-", treat "," as ".",
// non-numbers as 0 (lib/cargoVolume, which the warehouse's e-mail counts by too).
export const num = cargoNum;

// The volume of a piece of a dimension line: from its sizes when all three are known, else the m³
// typed for it - one rule with the warehouse's e-mail, so it lives in lib/cargoVolume.
export { dimensionVolumePerPiece } from "../../../lib/cargoVolume";

// en-US thousands separators; integers without decimals, otherwise at most 2.
export function fmtNum(n: number): string {
  return n % 1 === 0
    ? n.toLocaleString("en-US")
    : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

// TEU is always derived from the container type (20' → 1, 40' and 45' → 2), never
// taken from the client.
export function teuForType(type: string): string {
  const t = (type ?? "").trim();
  if (t.startsWith("45") || t.startsWith("40")) return "2";
  if (t.startsWith("20")) return "1";
  return "";
}

const sum = <T>(rows: T[], pick: (r: T) => number): number => rows.reduce((s, r) => s + pick(r), 0);

const uniqJoin = (values: string[], sep: string): string =>
  [...new Set(values.map((v) => v.trim()).filter(Boolean))].join(sep);

// The commercial invoices' values summed per currency: "12 500 USD, 3 000 EUR". A value
// without a currency is shown as a bare number. A value is read as an amount (lib/typedAmount),
// as the dialog that saves it reads it: "12,500.00" is 12 500, not 12.5 as a cargo number would
// read it; text that is no amount counts nothing.
export function invoiceValueByCurrency(invoices: { value: string; currency: string }[]): string {
  const byCurrency = new Map<string, number>();
  for (const inv of invoices) {
    const value = parseTypedAmount(inv.value);
    if (!value) continue;
    const currency = inv.currency.trim().toUpperCase();
    byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + value);
  }
  return [...byCurrency.entries()].map(([c, v]) => `${fmtNum(v)} ${c}`.trim()).join(", ");
}

// The read-only Shipment Details fields, computed from the detail rows. Empty
// string means "no data" (the UI renders it as —). The primary source is always
// the container declaration; only when its total is empty do the cargo items and
// then the dimension lines fill in (volume skips cargo items — they have none).
export interface CargoProjection {
  pcs: string;
  typeOfPackages: string;
  hsCode: string;
  cargoDescription: string;
  containerTypeSummary: string;
  totalTeu: string;
  totalGrossWeightKg: string;
  totalVolumeM3: string;
}

// What the projection reads of each line: a line as the API serves it, or its row as stored.
type ContainerCargo = Pick<ContainerLine, "packages" | "grossWeight" | "volume" | "teu" | "type" | "packageType">;
type ItemCargo = Pick<CargoItemLine, "pieces" | "grossWeight" | "packageType" | "hsCode" | "cargoDescription">;
type DimensionCargo = Pick<CargoDimensionLine, "pieces" | "weightPerPcKg"> & PieceSizes;

export function projectCargo(
  containers: ContainerCargo[],
  items: ItemCargo[],
  dimensions: DimensionCargo[],
): CargoProjection {
  const dimPcs = sum(dimensions, (d) => num(d.pieces));
  const dimKg = sum(dimensions, (d) => num(d.pieces) * num(d.weightPerPcKg));
  const dimM3 = sum(dimensions, (d) => num(d.pieces) * dimensionVolumePerPiece(d));

  const pcs = sum(containers, (c) => num(c.packages)) || sum(items, (i) => num(i.pieces)) || dimPcs;
  const grossWeight = sum(containers, (c) => num(c.grossWeight)) || sum(items, (i) => num(i.grossWeight)) || dimKg;
  const volume = sum(containers, (c) => num(c.volume)) || dimM3;
  const teu = sum(containers, (c) => num(c.teu));

  // "2× 40' HC, 1× 20' GP" — types in first-seen order.
  const typeCounts = new Map<string, number>();
  for (const c of containers) {
    const t = c.type.trim();
    if (t) typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
  }
  const containerTypeSummary = [...typeCounts.entries()].map(([t, n]) => `${n}× ${t}`).join(", ");

  return {
    pcs: pcs ? fmtNum(pcs) : "",
    typeOfPackages: uniqJoin(
      [...items.map((i) => i.packageType), ...containers.map((c) => c.packageType)],
      ", ",
    ),
    hsCode: uniqJoin(items.map((i) => i.hsCode), ", "),
    cargoDescription: items.map((i) => i.cargoDescription.trim()).filter(Boolean).join("; "),
    containerTypeSummary,
    totalTeu: teu ? fmtNum(teu) : "",
    totalGrossWeightKg: grossWeight ? fmtNum(grossWeight) : "",
    totalVolumeM3: volume ? fmtNum(volume) : "",
  };
}

// A container number is 4 letters + 7 digits (ISO 6346). It is stored in one
// canonical form — uppercase, with no spaces/hyphens/other separators — no matter
// how it was entered or read (e.g. "MSMU 272727-7" → "MSMU2727277").
export function normalizeContainerNumber(raw: string): string {
  return (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Canonical shape: 4 letters + 7 digits. An empty value is allowed (row not filled in yet). */
export function isValidContainerNumber(raw: string): boolean {
  const n = normalizeContainerNumber(raw);
  return n === "" || /^[A-Z]{4}[0-9]{7}$/.test(n);
}

/** What a sync of a shipment's containers does with one line of the list it is given. */
export interface ContainerRowMatch {
  line: ContainerLine;
  /** The existing row the line updates in place; null when it becomes a new row. */
  id: string | null;
  /** The id a new row takes: one the client made for it (a UUID no row of the shipment has). */
  insertId?: string;
}

// Which existing container row (`existingIds`, in their order) each line of `lines` updates.
// Lines are matched to existing rows by id. A new line from Container Details brings its own
// id (a UUID made when the row was added), which the inserted row keeps, so that screen never
// depends on position. Lines without an id come only from callers that do not echo ids (the
// create wizard, document extraction, a master job renaming a house container); those adopt
// the unclaimed existing row at the same position, which keeps a renamed container's cargo.
// An existing row no line claims is removed by the sync.
export function matchContainerRows(existingIds: string[], lines: ContainerLine[]): ContainerRowMatch[] {
  const existing = new Set(existingIds);
  const claimed = new Set<string>();
  const matches: ContainerRowMatch[] = lines.map((line) => {
    if (line.id && existing.has(line.id) && !claimed.has(line.id)) {
      claimed.add(line.id);
      return { line, id: line.id };
    }
    // A client-made id for a new row (never one already used in this list).
    if (line.id && isUuid(line.id) && !existing.has(line.id) && !claimed.has(line.id)) {
      claimed.add(line.id);
      return { line, id: null, insertId: line.id };
    }
    return { line, id: null };
  });
  matches.forEach((m, i) => {
    if (m.id || m.insertId) return;
    const candidate = existingIds[i];
    if (candidate && !claimed.has(candidate)) {
      claimed.add(candidate);
      m.id = candidate;
    }
  });
  return matches;
}

// A dimension row is either both stackable and overstowable, or neither (migration 0051).
export const STACKABLE = "Stackable / Overstowable";
export const NOT_STACKABLE = "Not stackable / Not overstowable";

/**
 * A shipment's Cargo Stackability, read from its dimension rows as the shipment page reads it: one
 * row not stackable makes the whole shipment not stackable; else one stackable row makes it
 * stackable; "" when no row says either.
 */
export function cargoStackability(dimensions: { stackable: string }[]): string {
  if (dimensions.some((d) => d.stackable === NOT_STACKABLE)) return NOT_STACKABLE;
  if (dimensions.some((d) => d.stackable === STACKABLE)) return STACKABLE;
  return "";
}

/** A house's cargo as its master job lists it; "" is no data (shown as —). */
export interface HouseCargo {
  /** COLLI: the number of pieces. */
  pieces: string;
  /** Type of packages: "Pallets, Cartons". */
  packages: string;
  weightKg: string;
  volumeM3: string;
  stackability: string;
}

/**
 * A house's pieces, packages, weight, volume and stackability, as its own page shows them: worked
 * out from its Container and Cargo Details rows, the stored fields only for a shipment that has
 * none (as the Shipments grid, weight and volume also when the rows give none).
 */
export function houseCargo(
  stored: { pcs: string; typeOfPackages: string; totalWeightTons: string | null; totalVolumeCbm: string | null },
  containers: ContainerCargo[],
  items: ItemCargo[],
  dimensions: (DimensionCargo & { stackable: string })[],
): HouseCargo {
  const hasRows = containers.length > 0 || items.length > 0 || dimensions.length > 0;
  const p = projectCargo(containers, items, dimensions);
  const tons = num(stored.totalWeightTons);
  const cbm = num(stored.totalVolumeCbm);
  return {
    pieces: hasRows ? p.pcs : stored.pcs,
    packages: hasRows ? p.typeOfPackages : stored.typeOfPackages,
    weightKg: p.totalGrossWeightKg || (tons ? fmtNum(tons * 1000) : ""),
    volumeM3: p.totalVolumeM3 || (cbm ? fmtNum(cbm) : ""),
    stackability: cargoStackability(dimensions),
  };
}

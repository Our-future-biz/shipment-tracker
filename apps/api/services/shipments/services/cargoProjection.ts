import type { ContainerLine, CargoItemLine, CargoDimensionLine } from "../interfaces/interfaces";

// Numeric fields on container/cargo lines are free-text; parse them the same way
// everywhere: strip everything but digits, ".", "," and "-", treat "," as ".",
// non-numbers as 0.
export function num(v: string | null | undefined): number {
  const n = parseFloat(
    String(v ?? "")
      .replace(/[^0-9.,-]/g, "")
      .replace(",", "."),
  );
  return Number.isFinite(n) ? n : 0;
}

// en-US thousands separators; integers without decimals, otherwise at most 2.
export function fmtNum(n: number): string {
  return n % 1 === 0
    ? n.toLocaleString("en-US")
    : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

// TEU is always derived from the container type (20' → 1, 40' → 2), never taken
// from the client.
export function teuForType(type: string): string {
  const t = (type ?? "").trim();
  if (t.startsWith("40")) return "2";
  if (t.startsWith("20")) return "1";
  return "";
}

// Volume of one piece of a dimension line in m³ (cm³ → m³). Derived, never stored.
export function dimensionVolumePerPiece(d: CargoDimensionLine): number {
  return (num(d.lengthCm) * num(d.widthCm) * num(d.heightCm)) / 1e6;
}

const sum = <T>(rows: T[], pick: (r: T) => number): number => rows.reduce((s, r) => s + pick(r), 0);

const uniqJoin = (values: string[], sep: string): string =>
  [...new Set(values.map((v) => v.trim()).filter(Boolean))].join(sep);

// Commercial invoice value summed per currency: "12 500 USD, 3 000 EUR".
// An empty currency counts as USD.
export function civByCurrency(items: CargoItemLine[]): string {
  const byCurrency = new Map<string, number>();
  for (const item of items) {
    const value = num(item.commercialInvoiceValue);
    if (!value) continue;
    const currency = item.currency.trim().toUpperCase() || "USD";
    byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + value);
  }
  return [...byCurrency.entries()].map(([c, v]) => `${fmtNum(v)} ${c}`).join(", ");
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
  civByCurrency: string;
  containerTypeSummary: string;
  totalTeu: string;
  totalGrossWeightKg: string;
  totalVolumeM3: string;
}

export function projectCargo(
  containers: ContainerLine[],
  items: CargoItemLine[],
  dimensions: CargoDimensionLine[],
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
    civByCurrency: civByCurrency(items),
    containerTypeSummary,
    totalTeu: teu ? fmtNum(teu) : "",
    totalGrossWeightKg: grossWeight ? fmtNum(grossWeight) : "",
    totalVolumeM3: volume ? fmtNum(volume) : "",
  };
}

// A sailing's load list (Council Outlay 14, A8): what is in the box, for the CFS, the co-loader or
// the agent - one row per shipment with its parties, its cargo and its marks, and the totals. No
// money on it. Pure, so it is tested without the browser; the PDF and the file for Excel are both
// made from the one model.

import type { BoxRow } from "./boxUtilization";

/** A linked shipment as the load list reads it (a shipments-list row). */
export interface LoadListShipment {
  id: string;
  jobNumber: string;
  houseBolNumber?: string | null;
  shipper?: string | null;
  consignee?: string | null;
  typeOfPackages?: string | null;
  cargoDescription?: string | null;
  deliveryAddress?: string | null;
}

export interface LoadListRow {
  no: number;
  jobNumber: string;
  houseBol: string;
  shipper: string;
  consignee: string;
  colli: number;
  packages: string;
  weightKg: number;
  volumeCbm: number;
  cargo: string;
  /** "DG UN 1263 · class 3", "Not stackable", "Out of gauge", "Temperature controlled", "Weight missing"… */
  marks: string[];
  delivery: string;
}

export interface LoadList {
  title: string;
  /** The sailing's facts, each a label and its value, in the order they are printed. */
  facts: [string, string][];
  rows: LoadListRow[];
  totals: { shipments: number; colli: number; weightKg: number; volumeCbm: number };
  /** Cancelled shipments still linked: left off the list, and said so. */
  cancelled: number;
  madeOn: string;
}

const text = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim();

/** A row's marks: what the stuffing must know of. */
export function loadListMarks(row: Pick<BoxRow, "dangerous" | "adr" | "notStackable" | "outOfGauge" | "temperatureControlled" | "weightMissing" | "volumeMissing">): string[] {
  const marks: string[] = [];
  if (row.dangerous) marks.push((row.adr ?? []).length > 0 ? `DG ${row.adr.join(", ")}` : "DG");
  if (row.notStackable) marks.push("Not stackable");
  if (row.outOfGauge) marks.push("Out of gauge");
  if (row.temperatureControlled) marks.push("Temperature controlled");
  if (row.weightMissing) marks.push("Weight missing");
  if (row.volumeMissing) marks.push("Volume missing");
  return marks;
}

/**
 * The load list of a sailing: its counted shipments by job number, with the box's own figures (the
 * ones Box utilization shows), so the list and the meters agree. A cancelled shipment is left off.
 * `formatDate` writes a day (YYYY-MM-DD) the app's way; `madeOn` is the day it is made.
 */
export function loadListOf(
  sailing: { vessel: string; voyage: string; pol: string; pod: string; hub: string; containerType: string; containerCount: number; cutoffDate: string | null; departureDate: string | null },
  serviceName: string,
  shipments: readonly LoadListShipment[],
  boxRows: readonly BoxRow[],
  madeOn: string,
  formatDate: (day: string) => string = (d) => d,
): LoadList {
  const byId = new Map(shipments.map((s) => [s.id, s]));
  const counted = boxRows.filter((r) => r.counted).sort((a, b) => a.jobNumber.localeCompare(b.jobNumber));
  const rows: LoadListRow[] = counted.map((r, i) => {
    const s = byId.get(r.shipmentId);
    return {
      no: i + 1,
      jobNumber: r.jobNumber,
      houseBol: text(s?.houseBolNumber),
      shipper: text(s?.shipper),
      consignee: text(s?.consignee),
      colli: r.colli,
      packages: text(s?.typeOfPackages),
      weightKg: r.weightKg,
      volumeCbm: r.volumeCbm,
      cargo: text(s?.cargoDescription),
      marks: loadListMarks(r),
      delivery: text(s?.deliveryAddress),
    };
  });
  const sum = (pick: (r: LoadListRow) => number, decimals: number) => Math.round(rows.reduce((t, r) => t + pick(r), 0) * 10 ** decimals) / 10 ** decimals;
  const name = [sailing.vessel, sailing.voyage].filter(Boolean).join(" ");
  return {
    title: `Load list ${name}`,
    facts: [
      ["Service", serviceName],
      ["Vessel / voyage", name],
      ["Port of Loading", sailing.pol],
      ["Port of Discharge", sailing.pod],
      ["HUB", sailing.hub],
      ["Containers", sailing.containerCount > 1 ? `${sailing.containerCount} × ${sailing.containerType}` : sailing.containerType],
      ["Cut-off", sailing.cutoffDate ? formatDate(sailing.cutoffDate) : "—"],
      ["Departure", sailing.departureDate ? formatDate(sailing.departureDate) : "—"],
    ],
    rows,
    totals: { shipments: rows.length, colli: sum((r) => r.colli, 0), weightKg: sum((r) => r.weightKg, 1), volumeCbm: sum((r) => r.volumeCbm, 3) },
    cancelled: boxRows.length - counted.length,
    madeOn: formatDate(madeOn),
  };
}

export const LOAD_LIST_COLUMNS = ["No.", "Shipment", "House B/L", "Shipper", "Consignee", "Colli", "Packages", "Weight (kg)", "Volume (cbm)", "Cargo", "Marks", "Delivery"] as const;

/** The list as rows of cells for a spreadsheet: the sailing's facts, a blank row, the headings, the shipments, the totals. Numbers plain, so they add up. */
export function loadListCells(list: LoadList): string[][] {
  const n = (v: number) => (v > 0 ? String(v) : "");
  return [
    [list.title],
    ...list.facts.map(([label, value]) => [label, value]),
    ["Made on", list.madeOn],
    [],
    [...LOAD_LIST_COLUMNS],
    ...list.rows.map((r) => [String(r.no), r.jobNumber, r.houseBol, r.shipper, r.consignee, n(r.colli), r.packages, n(r.weightKg), n(r.volumeCbm), r.cargo, r.marks.join("; "), r.delivery]),
    ["", `Total: ${list.totals.shipments} ${list.totals.shipments === 1 ? "shipment" : "shipments"}`, "", "", "", String(list.totals.colli), "", String(list.totals.weightKg), String(list.totals.volumeCbm), "", "", ""],
    ...(list.cancelled > 0 ? [["", `${list.cancelled} cancelled, not on the list`]] : []),
  ];
}

/** The file name of a sailing's load list, without its ending: letters, digits, spaces, dashes and underscores only. */
export const loadListFileName = (title: string): string =>
  title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 _-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "Load list";

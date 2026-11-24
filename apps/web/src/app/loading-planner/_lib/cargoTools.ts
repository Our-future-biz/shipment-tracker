// Tools of the cargo table (Council Outlay 14, P3 and P5): standard units that fill a line's sizes,
// rows pasted straight from a spreadsheet, a line copied or moved, and whether a plan's cargo still
// is the linked job's. Pure, so they are tested without React.

import { isBlank, newDraftLine, type DraftLine } from "./cargoForm";
import { toMm, type DimUnit } from "./units";

/** A unit load of a usual size: picking it fills a line's name and sizes; the weight and the colli stay the user's. */
export interface StandardUnit {
  key: string;
  /** As the menu offers it, with its sizes. */
  label: string;
  /** What a line with no name is called after it. */
  name: string;
  lengthMm: number;
  widthMm: number;
  /** Only where the unit itself has a height: a pallet's height is its cargo's. */
  heightMm?: number;
}

export const STANDARD_UNITS: StandardUnit[] = [
  { key: "eur", name: "EUR pallet", label: "EUR pallet 1200 × 800", lengthMm: 1200, widthMm: 800 },
  { key: "industrial", name: "Industrial pallet", label: "Industrial pallet 1200 × 1000", lengthMm: 1200, widthMm: 1000 },
  { key: "half", name: "Half pallet", label: "Half pallet 800 × 600", lengthMm: 800, widthMm: 600 },
  { key: "ibc", name: "IBC", label: "IBC 1200 × 1000 × 1160", lengthMm: 1200, widthMm: 1000, heightMm: 1160 },
  { key: "drum", name: "Drum 200 l", label: "Drum 200 l, 585 × 585 × 880", lengthMm: 585, widthMm: 585, heightMm: 880 },
];

/** The line with a standard unit's sizes; its name is filled only while it has none. */
export function withStandardUnit(line: DraftLine, unit: StandardUnit): DraftLine {
  return { ...line, name: line.name.trim() ? line.name : unit.name, lengthMm: unit.lengthMm, widthMm: unit.widthMm, ...(unit.heightMm ? { heightMm: unit.heightMm } : {}) };
}

/** A copy of a line right under it, to change one figure of. */
export function duplicateLine(lines: DraftLine[], id: string, newId: () => string): DraftLine[] {
  const at = lines.findIndex((l) => l.id === id);
  if (at < 0) return lines;
  return [...lines.slice(0, at + 1), { ...lines[at]!, id: newId() }, ...lines.slice(at + 1)];
}

/** A line moved one place up (-1) or down (+1); the list as it is when it cannot move. */
export function moveLine(lines: DraftLine[], id: string, by: -1 | 1): DraftLine[] {
  const at = lines.findIndex((l) => l.id === id);
  const to = at + by;
  if (at < 0 || to < 0 || to >= lines.length) return lines;
  const next = [...lines];
  [next[at], next[to]] = [next[to]!, next[at]!];
  return next;
}

/** A number as a spreadsheet writes it: "1 200", "1,200.5", "1200,5", "1.200,5". Null for anything else. */
export function sheetNumber(cell: string): number | null {
  let text = cell.trim().replace(/[\s ]/g, "");
  if (!text) return null;
  const [commas, dots] = [(text.match(/,/g) ?? []).length, (text.match(/\./g) ?? []).length];
  if (commas > 0 && dots > 0) text = text.lastIndexOf(",") > text.lastIndexOf(".") ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  // One comma is a decimal comma unless three digits follow it ("1,200"); several are thousands.
  else if (commas === 1) text = /,\d{3}$/.test(text) ? text.replace(",", "") : text.replace(",", ".");
  else if (commas > 1) text = text.replace(/,/g, "");
  else if (dots > 1) text = text.replace(/\./g, "");
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  return Number(text);
}

/**
 * Rows copied from a spreadsheet as cargo lines, or null when the text is no table (so a plain
 * paste into a cell stays a plain paste). The columns are read in the table's own order: an
 * optional name first, then length, width, height (in `unit`), weight per piece (kg) and colli. A
 * row with fewer figures keeps what it has and shows as a line to finish; a heading row and empty
 * rows are left out. Colli missing means 1.
 */
export function pastedLines(text: string, unit: DimUnit, newId: () => string): DraftLine[] | null {
  const rows = text
    .replace(/\r/g, "")
    .split("\n")
    .map((row) => row.split("\t"))
    .filter((cells) => cells.some((c) => c.trim()));
  // A table: more than one row, or one row of several cells.
  if (rows.length === 0 || (rows.length === 1 && rows[0]!.length < 3)) return null;
  const lines: DraftLine[] = [];
  for (const cells of rows) {
    const first = cells[0]?.trim() ?? "";
    const named = sheetNumber(first) === null;
    const figures = (named ? cells.slice(1) : cells).map(sheetNumber);
    // A heading row, or a row of words: no figure in it.
    if (figures.every((f) => f === null)) continue;
    const [l, w, h, kg, colli] = figures;
    const size = (v: number | null | undefined) => (v != null && v > 0 ? toMm(v, unit) : null);
    lines.push({
      ...newDraftLine(newId()),
      name: named ? first.slice(0, 120) : "",
      lengthMm: size(l),
      widthMm: size(w),
      heightMm: size(h),
      weightKg: kg != null && kg > 0 ? kg : null,
      colli: colli != null && colli >= 1 ? Math.floor(colli) : 1,
    });
  }
  return lines.length > 0 ? lines : null;
}

/** A line as it is compared: its figures only. A name, an id and "may turn" are the plan's own. */
const figuresOf = (l: DraftLine) => [l.lengthMm, l.widthMm, l.heightMm, l.weightKg, l.colli, l.stackable].join("|");

/**
 * Whether a plan's cargo is no longer the linked job's cargo: the two lists do not hold the same
 * lines by size, weight, colli and stackability, in any order. Blank lines do not count. It cannot
 * tell a change of the job from a change made in the plan on purpose: it says they differ.
 */
export function cargoDiffers(planLines: readonly DraftLine[], jobLines: readonly DraftLine[]): boolean {
  const key = (lines: readonly DraftLine[]) => lines.filter((l) => !isBlank(l)).map(figuresOf).sort().join("\n");
  return key(planLines) !== key(jobLines);
}

/**
 * The colour each cargo line is drawn in, as a place in the palette (Council Outlay 14, C1): by its
 * row in the cargo table, or - `byShipment`, in a plan of a sailing's box - by the shipment it
 * belongs to, so all of a shipment's pieces share one colour. A line with no shipment keeps a
 * colour of its own after the shipments'.
 */
export function colourIndexes(lines: readonly { id: string; group?: string }[], byShipment: boolean): Map<string, number> {
  if (!byShipment) return new Map(lines.map((line, index) => [line.id, index]));
  const groups: string[] = [];
  for (const line of lines) if (line.group && !groups.includes(line.group)) groups.push(line.group);
  let loose = groups.length;
  return new Map(lines.map((line) => [line.id, line.group ? groups.indexOf(line.group) : loose++]));
}

/** The shipments a box plan holds, in the order of the cargo table: what "Colour by shipment" colours by. */
export const shipmentsOf = (lines: readonly { group?: string }[]): string[] => [...new Set(lines.flatMap((line) => line.group ?? []))];

/** What a plan came to, for the lists: "2 × 40' HC · 3 colli not loaded"; "" when nothing is loaded and nothing left out. */
export function resultWords(result: { equipment: { name: string; count: number }[]; notLoaded: number } | null | undefined): string {
  if (!result) return "";
  return [result.equipment.map((e) => `${e.count} × ${e.name}`).join(" + "), result.notLoaded > 0 ? `${result.notLoaded} colli not loaded` : ""].filter(Boolean).join(" · ");
}

/**
 * What a plan of a sailing's box says about the sailing's containers: null while the plan needs no
 * more than the sailing has (or holds no cargo), else the sentence. `nominatedType` is the
 * planner's name of the sailing's container type; null when the planner has no such type.
 */
export function boxVerdict(loads: readonly { container: { name: string } }[], notLoaded: number, sailing: { containerType: string; containerCount: number }): string | null {
  const has = `${sailing.containerCount} × ${sailing.containerType}`;
  const needs = loads.length;
  if (needs === 0 && notLoaded === 0) return null;
  const other = loads.filter((l) => l.container.name !== sailing.containerType).length;
  if (other > 0) return `This plan uses other equipment than the sailing's ${has}: nominate the sailing's container type to judge its box.`;
  if (needs > sailing.containerCount) return `The cargo needs ${needs} × ${sailing.containerType}; the sailing has ${has}.`;
  if (notLoaded > 0) return `${notLoaded} colli found no place in the sailing's ${has}.`;
  return null;
}

/**
 * Whether a plan of a sailing's box no longer holds the box's cargo (Council Outlay 14, C1): a
 * shipment joined or left the sailing, or the lines of a shipment that has its sizes changed. A
 * shipment with no sizes on its job is judged by its being there only: its sizes are typed in the
 * plan, which is no difference.
 */
export function boxCargoDiffers(planLines: readonly DraftLine[], jobLines: readonly DraftLine[]): boolean {
  const plan = planLines.filter((l) => !isBlank(l));
  const jobs = shipmentsOf(jobLines);
  const inPlan = shipmentsOf(plan);
  if (jobs.length !== inPlan.length || jobs.some((job) => !inPlan.includes(job))) return true;
  return jobs.some((job) => {
    const ofJob = jobLines.filter((l) => l.group === job);
    const sized = ofJob.every((l) => l.lengthMm !== null && l.widthMm !== null && l.heightMm !== null && l.weightKg !== null && l.colli !== null);
    return sized && cargoDiffers(plan.filter((l) => l.group === job), ofJob);
  });
}

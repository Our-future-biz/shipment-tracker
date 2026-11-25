import type { ContainerLoad } from "./plan";

// Dangerous goods and lashing notes on a plan (Council Outlay 14, P11, D22): a line's UN number and
// class are carried from the job or typed, shown and printed; a container that holds two classes is
// warned about, never refused - the app is no segregation table. A lashing note per line and a free
// note per plan go on the PDF. Pure.

/** Four digits, or none. The server holds the same rule (loadingPlanner lib/planInput). */
export const UN_NUMBER = /^(\d{4})?$/;
/** "3", "2.1", "1.4S"; or none. */
export const DG_CLASS = /^([1-9](\.\d)?[A-S]?)?$/;
export const LASHING_MAX = 200;
export const PLAN_NOTE_MAX = 1000;

export interface DgFacts {
  dg?: boolean;
  un?: string;
  dgClass?: string;
  lashing?: string;
}

/** A UN number as the plan keeps it: "UN 1263" and "un1263" are 1263; "" for one that is none. */
export const cleanUn = (value: string | null | undefined): string => {
  const digits = (value ?? "").trim().replace(/^UN\s*/i, "");
  return /^\d{4}$/.test(digits) ? digits : "";
};

/** A class as the plan keeps it: "Class 3" is 3; "" for one that is none. */
export const cleanClass = (value: string | null | undefined): string => {
  const text = (value ?? "").trim().replace(/^class\s*/i, "").toUpperCase();
  return text && DG_CLASS.test(text) ? text : "";
};

/** Whether the line is dangerous goods: marked so, or naming a UN number or a class. */
export const isDangerous = (line: DgFacts): boolean => line.dg === true || !!line.un || !!line.dgClass;

/** A line's dangerous goods in a few words: "UN 1263 · class 3"; "DG" for one only marked; "" for none. */
export function dgWords(line: DgFacts): string {
  const parts = [line.un ? `UN ${line.un}` : "", line.dgClass ? `class ${line.dgClass}` : ""].filter(Boolean);
  return parts.length ? parts.join(" · ") : line.dg ? "DG" : "";
}

/** What is wrong with what was typed for a line's dangerous goods, or null. */
export function dgProblem(un: string, dgClass: string): string | null {
  if (!UN_NUMBER.test(un.trim())) return "A UN number is four digits, like 1263.";
  if (!DG_CLASS.test(dgClass.trim().toUpperCase())) return "A class is like 3, 2.1 or 1.4S.";
  return null;
}

/** The classes of dangerous goods in a container, each once, in order. */
export function classesIn(load: ContainerLoad, factsOf: (lineId: string) => DgFacts | undefined): string[] {
  const classes = new Set<string>();
  for (const piece of load.pieces) {
    const dgClass = factsOf(piece.lineId)?.dgClass;
    if (dgClass) classes.add(dgClass);
  }
  return [...classes].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}

/**
 * What a container's dangerous goods are warned about, as a sentence; null when there is nothing to
 * say. Two classes in one container: check the segregation. Dangerous goods beside other cargo are
 * usual and say nothing.
 */
export function dgWarning(load: ContainerLoad, factsOf: (lineId: string) => DgFacts | undefined): string | null {
  const classes = classesIn(load, factsOf);
  if (classes.length < 2) return null;
  const list = `${classes.slice(0, -1).join(", ")} and ${classes[classes.length - 1]}`;
  return `Dangerous goods of classes ${list} share this container: check their segregation (IMDG Code) with the carrier before stuffing. The plan does not judge it.`;
}

/** The lashing notes of a plan's lines for the PDF: "3 · Tank: 2 belts across", by line number. */
export function lashingNotes(lines: readonly { id: string; name: string; lashing?: string }[], numberOf: (lineId: string) => number): string[] {
  return lines.filter((l) => l.lashing?.trim()).map((l) => `${numberOf(l.id)} · ${l.name || "Cargo"}: ${l.lashing!.trim()}`);
}

/** The highest container number a line is pinned to. The server holds the same. */
export const PIN_BOX_MAX = 9;

/** A line's pins in a few words: "at the doors · container no. 2"; "" for none (Council Outlay 14, P8). */
export function pinWords(line: { pinEnd?: "front" | "doors"; pinBox?: number }): string {
  return [line.pinEnd === "front" ? "at the front wall" : line.pinEnd === "doors" ? "at the doors" : "", line.pinBox ? `container no. ${line.pinBox}` : ""].filter(Boolean).join(" · ");
}

/**
 * " (#2 of the plan)" after a pinned container number: the plan's container that stands for it, as
 * the plan's pages and cards are numbered (a number is the user's name for a container, not its
 * place); " (not loaded)" when none does; "" for no number.
 */
export function pinPlaceWords(plan: { loads: readonly ContainerLoad[] }, box: number | undefined): string {
  if (!box) return "";
  const index = plan.loads.findIndex((load) => load.pinBox === box);
  return index < 0 ? " (not loaded)" : ` (#${index + 1} of the plan)`;
}

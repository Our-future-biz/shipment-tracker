import type { GateChecklist, GateEvent, GateTransportLeg } from "../schemas/gateMovement.schema";
import { pragueStamp } from "./storage";

// The gate record's History lines for edits of its customs, its transport legs and its checklist
// (mock test: a customs procedure, MRN or customs status changed by hand, a haulier or plate typed
// on a leg, or a checklist icon clicked left no trace - nobody could tell who changed what, or what
// it was before). One line per field that changed, "<what>: <now>" with "was <before>" under it,
// as the record's other edits are logged (Received in warehouse, Free days). Pure (no database).

/** The History kinds these lines are logged under (the web's History tab files them under "Record & details"). */
export const CUSTOMS_EDITED = "customsEdited";
export const LEG_EDITED = "transportLegEdited";
export const CHECK_EDITED = "checklistEdited";

type CustomsFields = { customsMode: string; mrn: string; customsStatus: string };

// As the gate job's Overview names them.
const CUSTOMS_LABELS: { key: keyof CustomsFields; label: string }[] = [
  { key: "customsMode", label: "Customs procedure" },
  { key: "mrn", label: "MRN" },
  { key: "customsStatus", label: "Customs status" },
];
const LEG_LABELS: { key: "company" | "plate" | "driver" | "phone" | "gateTime"; label: string }[] = [
  { key: "company", label: "transport company" },
  { key: "plate", label: "plate" },
  { key: "driver", label: "driver's name" },
  { key: "phone", label: "phone" },
  { key: "gateTime", label: "gate time" },
];
const CHECK_LABELS: Record<keyof GateChecklist, string> = { ht: "HT", photos: "Photos", measure: "Measure", vgm: "VGM", seal: "Seal", dg: "DG/ADR" };
const CHECK_TEXT: Record<string, string> = { n: "n/a", g: "done", a: "pending", r: "problem" };

const shown = (v: string | null | undefined) => (v ?? "").trim();
const now = (v: string) => v || "cleared";
const was = (v: string) => `was ${v || "—"}`;

// A gate time typed as an ISO time, as the instant it names; null for free text.
function gateInstant(v: string): Date | null {
  const s = shown(v);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(s)) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

// A gate time typed as an ISO time reads as the Prague day and time; free text as typed.
function gateTimeText(v: string): string {
  const d = gateInstant(v);
  return d ? pragueStamp(d).replace("T", " ") : shown(v);
}

// Two gate times are the same when they name the same instant, however written (review of system-22: one stored
// as "…T08:30:00Z" and sent back as "…T08:30:00.000Z" logged "gate time: 09:30 / was 09:30"); free text as typed.
function sameGateTime(a: string, b: string): boolean {
  const ia = gateInstant(a);
  const ib = gateInstant(b);
  return ia && ib ? ia.getTime() === ib.getTime() : shown(a) === shown(b);
}

/** One line per customs field the save changes (`patch`: the fields as they will be stored; left out: not changed). */
export function customsEditEvents(before: CustomsFields, patch: Partial<CustomsFields>, at: string, by: string): GateEvent[] {
  const out: GateEvent[] = [];
  for (const { key, label } of CUSTOMS_LABELS) {
    const next = patch[key];
    if (next === undefined || shown(next) === shown(before[key])) continue;
    out.push({ kind: CUSTOMS_EDITED, label: `${label}: ${now(shown(next))}`, at, by, detail: was(shown(before[key])) });
  }
  return out;
}

/** One line per leg field that differs between the legs as stored and as they will be stored. */
export function legEditEvents(before: GateTransportLeg[], after: GateTransportLeg[], at: string, by: string): GateEvent[] {
  const out: GateEvent[] = [];
  for (const leg of after) {
    const old = before.find((l) => l.leg === leg.leg);
    for (const { key, label } of LEG_LABELS) {
      const a = shown(old?.[key]);
      const b = shown(leg[key]);
      if (key === "gateTime" ? sameGateTime(a, b) : a === b) continue;
      const text = key === "gateTime" ? gateTimeText : (v: string) => v;
      out.push({ kind: LEG_EDITED, label: `${leg.leg} leg ${label}: ${now(text(b))}`, at, by, detail: was(text(a)) });
    }
  }
  return out;
}

/** One line per checklist icon whose state changes. `before` as stored (missing icons read as the default). */
export function checkEditEvents(before: Partial<GateChecklist>, defaults: GateChecklist, change: Partial<GateChecklist>, at: string, by: string): GateEvent[] {
  const out: GateEvent[] = [];
  for (const key of Object.keys(CHECK_LABELS) as (keyof GateChecklist)[]) {
    const next = change[key];
    const old = before[key] ?? defaults[key];
    if (next === undefined || next === old) continue;
    out.push({ kind: CHECK_EDITED, label: `Checklist ${CHECK_LABELS[key]}: ${CHECK_TEXT[next] ?? next}`, at, by, detail: was(CHECK_TEXT[old] ?? old) });
  }
  return out;
}

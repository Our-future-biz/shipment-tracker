// Supplier e-mails of the warehouse (VGM, Survey, Remeasurement) — the subject and the plain
// text, built from what the warehouse recorded. Pure: no database, no provider.
//
//   subject   "VGM — WCZ2026101500012 · Job no. SEA-001234" (Survey / Remeasurement alike)
//   body      plain English: what was measured or found, compared with what was declared,
//             then the attachments (attached / download links / on file), the user's note and
//             who sent it.
//   limits    at most 5 attachments and 10 MB raw in total; what does not fit is linked (or
//             named, when no link can be made).

import { SUPPLIER_KIND_LABEL, type SupplierKind } from "./settingsRules";

export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
/** Variance threshold of the warehouse (more than 5 % off is a variance). */
const TOLERANCE = 0.05;

const pragueTime = (iso: string | Date) => {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return Number.isNaN(d.getTime())
    ? String(iso)
    : new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
        .format(d)
        .replace(/\//g, ".")
        .replace(",", "");
};

const group = (n: number, digits: number) => {
  const [i, f] = n.toFixed(digits).split(".");
  return `${i!.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}${f ? `.${f}` : ""}`;
};
export const kg = (v: number) => `${group(Math.round(v * 10) / 10, v % 1 ? 1 : 0)} kg`;
export const cbm = (v: number) => `${group(v, 3)} cbm`;
const pct = (p: number | null) => (p == null ? "" : `${p >= 0 ? "+" : "−"}${Math.abs(p * 100).toFixed(1)} %`);
const rel = (declared: number, actual: number) => (declared > 0 && actual > 0 ? (actual - declared) / declared : null);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export interface EmailPosition {
  /** WCZ reference of the position */
  wczRef: string;
  jobNumber: string;
  customer: string;
  containerNumber: string;
  sealNumber: string;
  bookingNumber: string;
  hblNumber: string;
  colli: number;
  packing: string;
  weightKg: number;
  measureCbm: number;
}

export interface EmailReweigh {
  weighedKg: number;
  weighedAt: string;
  weighedBy: string;
  declaredKg: number | null;
  declaredSource: string;
  variancePct: number | null;
  flagged: boolean;
  note: string;
}

export interface EmailSurvey {
  container: string;
  phase: string;
  damaged: number;
  lost: number;
  lines: { qty: number | null; outerPacking: string; visual: string[]; inner: string[] }[];
  driverNote: string;
  warehouseNote: string;
  surveyedAt: string;
  surveyedBy: string;
}

export interface EmailException {
  type: string;
  pieces: number;
  status: string;
  container: string;
  note: string;
  resolutionNote: string;
}

export interface EmailRemeasureLine {
  pieces: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightPerPcKg: number;
}

export interface EmailTotals {
  pieces: number;
  kg: number;
  cbm: number;
}

/** The files of a message: attached ones, ones offered as a download link, and ones only named. */
export interface EmailFiles {
  attached: string[];
  linked: { name: string; url: string }[];
  listed: string[];
  /** Days the download links work. */
  linkDays: number;
  /** Photos of the position in all (survey). */
  photoCount: number;
}

export type EmailContent =
  | { kind: "vgm"; reweigh: EmailReweigh | null; needsReweigh: boolean }
  | { kind: "survey"; surveys: EmailSurvey[]; exceptions: EmailException[] }
  | { kind: "remeasurement"; lines: EmailRemeasureLine[]; totals: EmailTotals; declared: EmailTotals | null; savedAt: string };

export interface ComposeInput {
  position: EmailPosition;
  content: EmailContent;
  files: EmailFiles;
  note: string;
  senderName: string;
  /** Name of the company / warehouse that signs the e-mail. */
  signature: string;
}

export function emailSubject(kind: SupplierKind, p: Pick<EmailPosition, "wczRef" | "jobNumber">) {
  return `${SUPPLIER_KIND_LABEL[kind]} — ${p.wczRef}${p.jobNumber ? ` · Job no. ${p.jobNumber}` : ""}`;
}

function refsBlock(p: EmailPosition): string[] {
  const rows: [string, string][] = [
    ["Warehouse ref.", p.wczRef],
    ["Job no.", p.jobNumber],
    ["Customer", p.customer],
    ["Container", p.containerNumber],
    ["Seal", p.sealNumber],
    ["Booking", p.bookingNumber],
    ["House B/L", p.hblNumber],
  ];
  return rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
}

function vgmBody(c: Extract<EmailContent, { kind: "vgm" }>, p: EmailPosition): string[] {
  const out = ["Weighing of the cargo at our warehouse (re-weighed on receipt):", ""];
  const rw = c.reweigh;
  if (!rw) {
    out.push(c.needsReweigh ? "The cargo has not been re-weighed by the warehouse yet." : "The warehouse does not re-weigh this cargo (not LCL).");
    if (p.weightKg > 0) out.push(`Weight on our gate record: ${kg(p.weightKg)}`);
  } else {
    out.push(`Re-weighed gross weight: ${kg(rw.weighedKg)}`);
    out.push(`Weighed: ${pragueTime(rw.weighedAt)}${rw.weighedBy ? ` by ${rw.weighedBy}` : ""}`);
    if (rw.declaredKg) {
      const src = rw.declaredSource === "shipment" ? "shipment" : rw.declaredSource === "gate" ? "warehouse gate record" : "declared";
      out.push(`Declared gross weight: ${kg(rw.declaredKg)} (from the ${src})`);
      const p2 = rw.variancePct ?? rel(rw.declaredKg, rw.weighedKg);
      out.push(
        `Difference: ${kg(Math.abs(rw.weighedKg - rw.declaredKg))} ${rw.weighedKg >= rw.declaredKg ? "heavier" : "lighter"} (${pct(p2)})` +
          (rw.flagged ? " — more than 5 %, please check the declared weight" : " — within 5 %"),
      );
    } else {
      out.push("Declared gross weight: not known — nothing to compare with.");
    }
    if (rw.note) out.push(`Weighing note: ${rw.note}`);
  }
  if (p.colli) out.push(`Packages: ${p.colli}${p.packing ? ` ${p.packing}` : ""}`);
  out.push("", "This is a summary of the warehouse weighing; it is not a signed SOLAS VGM declaration.");
  return out;
}

function surveyBody(c: Extract<EmailContent, { kind: "survey" }>, files: EmailFiles): string[] {
  const out = ["Cargo survey at our warehouse:", ""];
  if (!c.surveys.length) out.push("No survey has been recorded for this position yet.");
  for (const s of c.surveys) {
    const where = s.container ? `Container ${s.container}` : "Position";
    out.push(`${where}${s.phase ? ` — ${s.phase}` : ""} · surveyed ${pragueTime(s.surveyedAt)}${s.surveyedBy ? ` by ${s.surveyedBy}` : ""}`);
    out.push(`  Damaged: ${s.damaged} · Short (lost): ${s.lost}`);
    for (const l of s.lines) {
      const cond = [...l.visual, ...l.inner].filter(Boolean);
      out.push(`  - ${l.qty ?? "?"} × ${l.outerPacking || "packages"}${cond.length ? `: ${cond.join(", ")}` : ": no remarks"}`);
    }
    if (s.driverNote) out.push(`  Driver's note: ${s.driverNote}`);
    if (s.warehouseNote) out.push(`  Warehouse note: ${s.warehouseNote}`);
    out.push("");
  }
  const byType = (t: string) => c.exceptions.filter((e) => e.type === t);
  const sum = (l: EmailException[]) => l.reduce((n, e) => n + (e.pieces || 0), 0);
  if (c.exceptions.length) {
    out.push("Exceptions (damage / short / over):");
    for (const t of ["Damaged", "Short", "Over"]) {
      const l = byType(t);
      if (l.length) out.push(`  ${t}: ${plural(sum(l), "piece")} (${l.filter((e) => e.status === "open").length} open, ${l.filter((e) => e.status !== "open").length} resolved)`);
    }
    for (const e of c.exceptions) {
      out.push(
        `  - ${e.type} ${plural(e.pieces, "piece")}${e.container ? ` · ${e.container}` : ""} · ${e.status === "open" ? "open" : "resolved"}` +
          `${e.note ? ` — ${e.note}` : ""}${e.status !== "open" && e.resolutionNote ? ` (resolved: ${e.resolutionNote})` : ""}`,
      );
    }
  } else {
    out.push("Exceptions: none recorded (no damage, short or over).");
  }
  out.push(`Photos on file: ${files.photoCount}`);
  return out;
}

const dims = (l: EmailRemeasureLine) => `${group(l.lengthCm, l.lengthCm % 1 ? 1 : 0)} × ${group(l.widthCm, l.widthCm % 1 ? 1 : 0)} × ${group(l.heightCm, l.heightCm % 1 ? 1 : 0)} cm`;

function totalsLine(label: string, t: EmailTotals) {
  return `${label}: ${plural(t.pieces, "piece")} · ${kg(t.kg)} · ${cbm(t.cbm)}`;
}

function compareLine(label: string, base: EmailTotals, t: EmailTotals): string {
  const parts: string[] = [];
  parts.push(base.pieces === t.pieces ? "pieces match" : `pieces ${t.pieces - base.pieces > 0 ? "+" : ""}${t.pieces - base.pieces}`);
  const k = rel(base.kg, t.kg);
  const c = rel(base.cbm, t.cbm);
  parts.push(k == null ? "weight not comparable" : `weight ${pct(k)}${Math.abs(k) > TOLERANCE + 1e-9 ? " (more than 5 %)" : ""}`);
  parts.push(c == null ? "volume not comparable" : `volume ${pct(c)}${Math.abs(c) > TOLERANCE + 1e-9 ? " (more than 5 %)" : ""}`);
  return `Compared with ${label}: ${parts.join(", ")}`;
}

function remeasureBody(c: Extract<EmailContent, { kind: "remeasurement" }>, p: EmailPosition): string[] {
  const out = ["Remeasurement of the cargo at our warehouse:", ""];
  if (!c.lines.length) {
    out.push("No remeasured lines have been saved for this position yet.");
  } else {
    c.lines.forEach((l, i) => {
      out.push(`  ${i + 1}. Qty ${l.pieces} · ${dims(l)} · ${kg(l.weightPerPcKg)} per piece`);
    });
    out.push("");
    out.push(totalsLine("Remeasured total", c.totals));
    if (c.savedAt) out.push(`Saved: ${pragueTime(c.savedAt)}`);
  }
  out.push("");
  if (c.declared) {
    out.push(totalsLine("Declared (shipment)", c.declared));
    if (c.lines.length) out.push(compareLine("the declared figures", c.declared, c.totals));
  } else {
    out.push("Declared (shipment): not known.");
  }
  const gate = { pieces: p.colli, kg: p.weightKg, cbm: p.measureCbm };
  if (gate.pieces || gate.kg || gate.cbm) {
    out.push(totalsLine("Warehouse gate record", gate));
    if (c.lines.length) out.push(compareLine("the gate record", gate, c.totals));
  }
  return out;
}

function filesBlock(f: EmailFiles): string[] {
  const out: string[] = [];
  if (f.attached.length) out.push(`Attached: ${f.attached.join(", ")}`);
  if (f.linked.length) {
    out.push(`More files (download links work for ${plural(f.linkDays, "day")}):`);
    for (const l of f.linked) out.push(`  ${l.name}: ${l.url}`);
  }
  if (f.listed.length) out.push(`${plural(f.listed.length, "more file")} on file at the warehouse (not attached): ${f.listed.join(", ")} — ask us if you need them.`);
  return out;
}

/** The plain-text body of a supplier e-mail. */
export function emailText(input: ComposeInput): string {
  const { position: p, content: c } = input;
  const body = c.kind === "vgm" ? vgmBody(c, p) : c.kind === "survey" ? surveyBody(c, input.files) : remeasureBody(c, p);
  const files = filesBlock(input.files);
  const lines = [
    "Hello,",
    "",
    ...body,
    "",
    ...refsBlock(p),
    ...(files.length ? ["", ...files] : []),
    ...(input.note.trim() ? ["", "Note:", input.note.trim()] : []),
    "",
    "Kind regards,",
    input.senderName || "Warehouse",
    ...(input.signature ? [input.signature] : []),
  ];
  return lines.join("\n");
}

/** A candidate file for attaching: newest first is the caller's order. */
export interface FileCandidate {
  id: string;
  name: string;
  size: number;
}

/**
 * Which files are attached: in the given order, while at most MAX_ATTACHMENTS and
 * MAX_ATTACHMENT_BYTES in total; the rest is left over (to link or name).
 */
export function pickAttachments<T extends FileCandidate>(files: T[], maxCount = MAX_ATTACHMENTS, maxBytes = MAX_ATTACHMENT_BYTES): { attach: T[]; rest: T[] } {
  const attach: T[] = [];
  const rest: T[] = [];
  let bytes = 0;
  for (const f of files) {
    if (attach.length < maxCount && f.size > 0 && bytes + f.size <= maxBytes) {
      attach.push(f);
      bytes += f.size;
    } else {
      rest.push(f);
    }
  }
  return { attach, rest };
}

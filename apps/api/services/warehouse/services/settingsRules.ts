// Warehouse settings — pure rules (no imports from the database or the services).
//
//   supplier e-mail   per message type (VGM, Survey, Remeasurement): on/off, To and Cc lists.
//                     Addresses are trimmed, lower-cased and de-duplicated; at most 20 per list
//                     and 50 in To + Cc together (the provider's limit for one message).
//   docks             the dock names, opening hours and working days used for dock utilisation.
//                     The defaults are the four docks, 06:00–19:00, Monday to Friday.

import { InputError } from "./inputError";

export const SUPPLIER_KINDS = ["vgm", "survey", "remeasurement"] as const;
export type SupplierKind = (typeof SUPPLIER_KINDS)[number];
export const SUPPLIER_KIND_LABEL: Record<SupplierKind, string> = { vgm: "VGM", survey: "Survey", remeasurement: "Remeasurement" };

export interface SupplierRecipients {
  /** E-mail this type when it is sent; off = "Mark as sent" records it only. */
  enabled: boolean;
  to: string[];
  cc: string[];
}
export type SupplierEmailSettings = Record<SupplierKind, SupplierRecipients>;

export interface DockSettings {
  docks: string[];
  /** "HH:MM", Prague time */
  opensAt: string;
  closesAt: string;
  /** ISO weekdays the docks work: 1 = Monday … 7 = Sunday */
  workingDays: number[];
}

/** One change of the settings, for the change log. */
export interface SettingsEvent {
  at: string;
  by: string;
  label: string;
}

export const MAX_PER_LIST = 20;
export const MAX_PER_MESSAGE = 50;
export const MAX_DOCKS = 20;
const MAX_DOCK_NAME = 40;
const MAX_ADDRESS = 254;

export const DEFAULT_SUPPLIER_EMAIL: SupplierEmailSettings = {
  vgm: { enabled: false, to: [], cc: [] },
  survey: { enabled: false, to: [], cc: [] },
  remeasurement: { enabled: false, to: [], cc: [] },
};
export const DEFAULT_DOCKS: DockSettings = { docks: ["Dock 1", "Dock 2", "Dock 3", "Dock 4"], opensAt: "06:00", closesAt: "19:00", workingDays: [1, 2, 3, 4, 5] };

// A plain address: one @, a dot in the domain, no spaces, quotes, commas or angle brackets.
const EMAIL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

export const isEmailAddress = (v: string) => v.length <= MAX_ADDRESS && EMAIL.test(v) && !v.includes("..") && !v.startsWith(".") && !v.split("@")[0]!.endsWith(".");

/** Trimmed, lower-cased, de-duplicated; throws an Error naming the first bad address. */
export function cleanAddressList(list: unknown, label: string): string[] {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list)) throw new InputError(`${label} must be a list of e-mail addresses`);
  const out: string[] = [];
  for (const raw of list) {
    if (typeof raw !== "string") throw new InputError(`${label}: every address must be text`);
    const a = raw.trim().toLowerCase();
    if (!a) continue;
    if (!isEmailAddress(a)) throw new InputError(`${label}: "${raw.trim().slice(0, 80)}" is not a valid e-mail address`);
    if (!out.includes(a)) out.push(a);
  }
  if (out.length > MAX_PER_LIST) throw new InputError(`${label}: at most ${MAX_PER_LIST} addresses`);
  return out;
}

/** One message type's recipients, checked; an address in both To and Cc is kept in To only. */
export function cleanRecipients(input: unknown, kind: SupplierKind, strict = true): SupplierRecipients {
  const label = SUPPLIER_KIND_LABEL[kind];
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new InputError(`${label}: recipients are missing`);
  const o = input as Record<string, unknown>;
  if (o.enabled !== undefined && typeof o.enabled !== "boolean") throw new InputError(`${label}: on/off must be true or false`);
  const to = cleanAddressList(o.to, `${label} To`);
  const cc = cleanAddressList(o.cc, `${label} Cc`).filter((a) => !to.includes(a));
  if (to.length + cc.length > MAX_PER_MESSAGE) throw new InputError(`${label}: at most ${MAX_PER_MESSAGE} addresses in To and Cc together`);
  if (strict && o.enabled === true && !to.length) throw new InputError(`${label}: add at least one To address before switching e-mail on`);
  return { enabled: o.enabled === true, to, cc };
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export function cleanDocks(input: unknown): DockSettings {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new InputError("Docks: the settings are missing");
  const o = input as Record<string, unknown>;
  if (!Array.isArray(o.docks)) throw new InputError("Docks: the dock names must be a list");
  const docks: string[] = [];
  for (const d of o.docks) {
    if (typeof d !== "string") throw new InputError("Docks: every dock name must be text");
    const n = d.trim();
    if (!n) continue;
    if (n.length > MAX_DOCK_NAME) throw new InputError(`Docks: "${n.slice(0, 40)}…" is too long (at most ${MAX_DOCK_NAME} characters)`);
    if (docks.some((x) => x.toLowerCase() === n.toLowerCase())) throw new InputError(`Docks: "${n}" is listed twice`);
    docks.push(n);
  }
  if (!docks.length) throw new InputError("Docks: add at least one dock");
  if (docks.length > MAX_DOCKS) throw new InputError(`Docks: at most ${MAX_DOCKS} docks`);
  const opensAt = typeof o.opensAt === "string" ? o.opensAt.trim() : "";
  const closesAt = typeof o.closesAt === "string" ? o.closesAt.trim() : "";
  if (!HHMM.test(opensAt) || !HHMM.test(closesAt)) throw new InputError("Docks: opening hours must be times like 06:00");
  if (minutesOf(closesAt) <= minutesOf(opensAt)) throw new InputError("Docks: closing time must be after opening time");
  if (!Array.isArray(o.workingDays) || o.workingDays.some((d) => !Number.isInteger(d) || (d as number) < 1 || (d as number) > 7)) {
    throw new InputError("Docks: working days must be weekday numbers 1 (Monday) to 7 (Sunday)");
  }
  const workingDays = [...new Set(o.workingDays as number[])].sort((a, b) => a - b);
  if (!workingDays.length) throw new InputError("Docks: choose at least one working day");
  return { docks, opensAt, closesAt, workingDays };
}

/** Stored values read defensively: anything missing or broken falls back to the default. */
export function readSupplierEmail(v: unknown): SupplierEmailSettings {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const out = { ...DEFAULT_SUPPLIER_EMAIL };
  for (const k of SUPPLIER_KINDS) {
    try {
      out[k] = o[k] ? cleanRecipients({ ...(o[k] as object), enabled: (o[k] as { enabled?: unknown }).enabled === true }, k, false) : DEFAULT_SUPPLIER_EMAIL[k];
    } catch {
      out[k] = DEFAULT_SUPPLIER_EMAIL[k];
    }
  }
  return out;
}

export function readDocks(v: unknown): DockSettings {
  try {
    return cleanDocks(v);
  } catch {
    return DEFAULT_DOCKS;
  }
}

/** The recipients a send goes to, or null when this type is not e-mailed (off or no To). */
export function activeRecipients(s: SupplierEmailSettings, kind: SupplierKind): { to: string[]; cc: string[] } | null {
  const r = s[kind];
  return r && r.enabled && r.to.length ? { to: r.to, cc: r.cc } : null;
}

const listText = (l: string[]) => (l.length ? l.join(", ") : "none");
const WEEKDAY = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Plain-English lines for the change log: what changed from `a` to `b`. */
export function settingsChanges(
  a: { supplierEmail: SupplierEmailSettings; docks: DockSettings },
  b: { supplierEmail: SupplierEmailSettings; docks: DockSettings },
): string[] {
  const out: string[] = [];
  for (const k of SUPPLIER_KINDS) {
    const x = a.supplierEmail[k];
    const y = b.supplierEmail[k];
    const label = `Supplier e-mail ${SUPPLIER_KIND_LABEL[k]}`;
    if (x.enabled !== y.enabled) out.push(`${label}: e-mail ${y.enabled ? "on" : "off"}`);
    if (x.to.join() !== y.to.join()) out.push(`${label}: To ${listText(x.to)} → ${listText(y.to)}`);
    if (x.cc.join() !== y.cc.join()) out.push(`${label}: Cc ${listText(x.cc)} → ${listText(y.cc)}`);
  }
  if (a.docks.docks.join("|") !== b.docks.docks.join("|")) out.push(`Docks: ${a.docks.docks.join(", ")} → ${b.docks.docks.join(", ")}`);
  if (a.docks.opensAt !== b.docks.opensAt || a.docks.closesAt !== b.docks.closesAt) {
    out.push(`Dock hours: ${a.docks.opensAt}–${a.docks.closesAt} → ${b.docks.opensAt}–${b.docks.closesAt}`);
  }
  if (a.docks.workingDays.join() !== b.docks.workingDays.join()) {
    out.push(`Dock working days: ${a.docks.workingDays.map((d) => WEEKDAY[d]).join(" ")} → ${b.docks.workingDays.map((d) => WEEKDAY[d]).join(" ")}`);
  }
  return out;
}

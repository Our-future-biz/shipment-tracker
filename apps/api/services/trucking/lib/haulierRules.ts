import { APIError } from "encore.dev/api";
import { addDays, isRealYmd } from "../../../lib/businessDate";
import { isUuid } from "../../../lib/uuid";
import { formatDay } from "./format";
import { normaliseBankAccount } from "./bankAccount";
import type {
  HaulierIssue,
  HaulierProfile,
  HaulierProfileInput,
  HaulierStatus,
  PreferredLaneInput,
} from "../interfaces/interfaces";

// Haulier profile rules: what a new profile starts with, the checks a save must pass, and the
// issues (computed on read) that decide whether a haulier may be put on a trip.

/** Days ahead in which an expiring insurance or licence is warned about, and after which a VAT check is due again. */
export const WARN_DAYS = 30;
export const CURRENCIES = ["CZK", "EUR"] as const;
const MAX_LANES = 200;
const MAX_BANK_ACCOUNTS = 20;

/**
 * The published bank accounts as saved: each normalised (lib/bankAccount.ts), each once, at most
 * 20; throws invalid_argument naming the account that is not a Czech account or an IBAN.
 */
export function cleanBankAccounts(v: unknown): string[] {
  const list = Array.isArray(v) ? v : [];
  const out: string[] = [];
  list.forEach((raw, i) => {
    if (typeof raw === "string" && !raw.trim()) return;
    const account = normaliseBankAccount(raw);
    if (!account) throw bad(`Bank account ${i + 1} ("${String(raw).trim().slice(0, 40)}") is not a valid Czech account (prefix-number/bank) or IBAN`);
    if (!out.includes(account)) out.push(account);
  });
  if (out.length > MAX_BANK_ACCOUNTS) throw bad(`At most ${MAX_BANK_ACCOUNTS} published bank accounts are allowed`);
  return out;
}

/** A profile that is not saved yet (version 0). */
export const defaultProfile = (customerId: string): HaulierProfile => ({
  customerId,
  insurer: "",
  insurancePolicyNo: "",
  insuranceLimit: null,
  insuranceCurrency: "EUR",
  insuranceValidTo: null,
  licenceNo: "",
  licenceValidTo: null,
  licenceUnlimited: true,
  adrCapable: false,
  vehicleTypes: [],
  paymentDays: 30,
  currency: "CZK",
  vatUnreliable: false,
  bankAccountPublished: false,
  vatCheckedAt: null,
  bankAccounts: [],
  bankAccountsChangedAt: null,
  bankAccountsChangedBy: null,
  bankAccountsChangedByUserId: null,
  bankChangeHoldUntil: null,
  costSplitBasis: "chargeable_weight",
  blocked: false,
  blockReason: "",
  blockedAt: null,
  blockedBy: null,
  notes: "",
  preferredLanes: [],
  version: 0,
});

export { formatDay };

const block = (code: HaulierIssue["code"], message: string): HaulierIssue => ({ code, severity: "block", message });
const warn = (code: HaulierIssue["code"], message: string): HaulierIssue => ({ code, severity: "warn", message });

/** Issues of a haulier with no profile yet: it cannot be used until insurance and licence are on file. */
export const NO_PROFILE_ISSUES: HaulierIssue[] = [
  block("missing_insurance", "No carrier liability insurance on file"),
  block("missing_licence", "No road transport licence on file"),
];

/**
 * What stands in the way of using the haulier on `today` (a Prague business day, YYYY-MM-DD).
 * Block issues keep it off trips; warn issues are shown but do not.
 */
export function haulierIssues(p: HaulierProfile, today: string): HaulierIssue[] {
  const issues: HaulierIssue[] = [];
  const warnUntil = addDays(today, WARN_DAYS);
  if (p.blocked) issues.push(block("blocked", p.blockReason ? `Blocked: ${p.blockReason}` : "Blocked"));

  if (!p.insuranceValidTo || p.insuranceLimit === null) {
    issues.push(block("missing_insurance", "No carrier liability insurance on file"));
  } else if (p.insuranceValidTo < today) {
    issues.push(block("insurance_expired", `Carrier liability insurance expired on ${formatDay(p.insuranceValidTo)}`));
  } else if (p.insuranceValidTo <= warnUntil) {
    issues.push(warn("insurance_expiring", `Carrier liability insurance expires on ${formatDay(p.insuranceValidTo)}`));
  }

  if (!p.licenceNo) {
    issues.push(block("missing_licence", "No road transport licence on file"));
  } else if (!p.licenceUnlimited && !p.licenceValidTo) {
    issues.push(block("missing_licence", "The road transport licence has no end date (mark it unlimited if it has none)"));
  } else if (!p.licenceUnlimited && p.licenceValidTo && p.licenceValidTo < today) {
    issues.push(block("licence_expired", `Road transport licence expired on ${formatDay(p.licenceValidTo)}`));
  } else if (!p.licenceUnlimited && p.licenceValidTo && p.licenceValidTo <= warnUntil) {
    issues.push(warn("licence_expiring", `Road transport licence expires on ${formatDay(p.licenceValidTo)}`));
  }

  if (p.vatUnreliable) issues.push(block("vat_unreliable", "Listed as an unreliable VAT payer"));
  if (!p.vatCheckedAt) {
    issues.push(warn("vat_check_due", "The VAT register has never been checked"));
  } else if (p.vatCheckedAt < addDays(today, -WARN_DAYS)) {
    issues.push(warn("vat_check_due", `The VAT register was last checked on ${formatDay(p.vatCheckedAt)}`));
  }
  return issues;
}

export function haulierStatus(issues: HaulierIssue[]): HaulierStatus {
  if (issues.some((i) => i.severity === "block")) return "blocked";
  if (issues.length) return "warning";
  return "ok";
}

const bad = (message: string) => APIError.invalidArgument(message);

const text = (v: unknown, what: string, max: number): string => {
  const s = typeof v === "string" ? v.trim() : "";
  if (s.length > max) throw bad(`${what} can be at most ${max} characters long`);
  return s;
};

const day = (v: unknown, what: string): string | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string" || !isRealYmd(v)) throw bad(`${what} must be a date like 2026-12-31`);
  return v;
};

const currency = (v: unknown, what: string): string => {
  const c = typeof v === "string" ? v.trim().toUpperCase() : "";
  if (!(CURRENCIES as readonly string[]).includes(c)) throw bad(`${what} must be CZK or EUR`);
  return c;
};

/** A CZ postcode (PSČ) as stored: 5 digits, no space ("110 00" → "11000"); null when it is not one. */
export const normaliseCzPostcode = (v: unknown): string | null => {
  const digits = typeof v === "string" ? v.replace(/\s+/g, "") : "";
  return /^\d{5}$/.test(digits) ? digits : null;
};

/** A lane as saved; throws invalid_argument naming the lane (1-based) and what is wrong. */
export function cleanLane(lane: PreferredLaneInput, n: number): PreferredLaneInput {
  const postcode = (v: unknown, what: string) => {
    const p = normaliseCzPostcode(v);
    if (!p) throw bad(`Lane ${n}: the ${what} postcode must be 5 digits, like 110 00`);
    return p;
  };
  const originPostcodeFrom = postcode(lane.originPostcodeFrom, "origin from");
  const originPostcodeTo = postcode(lane.originPostcodeTo, "origin to");
  const destPostcodeFrom = postcode(lane.destPostcodeFrom, "destination from");
  const destPostcodeTo = postcode(lane.destPostcodeTo, "destination to");
  if (originPostcodeFrom > originPostcodeTo) throw bad(`Lane ${n}: the origin postcode range must run from the lower to the higher postcode`);
  if (destPostcodeFrom > destPostcodeTo) throw bad(`Lane ${n}: the destination postcode range must run from the lower to the higher postcode`);
  if (!["ANY", "LTL", "FTL", "LINEHAUL"].includes(lane.serviceKind)) throw bad(`Lane ${n}: the kind of service must be ANY, LTL, FTL or LINEHAUL`);
  const id = lane.id ? String(lane.id) : undefined;
  if (id !== undefined && !isUuid(id)) throw bad(`Lane ${n}: unknown lane id`);
  return {
    ...(id ? { id } : {}),
    originPostcodeFrom,
    originPostcodeTo,
    destPostcodeFrom,
    destPostcodeTo,
    serviceKind: lane.serviceKind,
    note: text(lane.note, `Lane ${n}: the note`, 500),
  };
}

/**
 * A profile save as it is stored. `vehicleCodes` are the vehicle types of the trucking settings;
 * `today` is the Prague business day (a VAT check cannot be dated in the future).
 */
export function cleanProfileInput(input: HaulierProfileInput, vehicleCodes: string[], today: string): HaulierProfileInput {
  const insuranceLimit = input.insuranceLimit;
  if (insuranceLimit !== null && (typeof insuranceLimit !== "number" || !Number.isFinite(insuranceLimit) || insuranceLimit <= 0)) {
    throw bad("The insurance limit must be more than 0 (or left empty)");
  }
  if (!Number.isInteger(input.paymentDays) || input.paymentDays < 0 || input.paymentDays > 365) {
    throw bad("Payment days must be a whole number between 0 and 365");
  }
  if (!["chargeable_weight", "ldm", "pallet_places"].includes(input.costSplitBasis)) {
    throw bad("The cost split must be by chargeable weight, loading metres or pallet places");
  }
  const vehicleTypes = [...new Set((Array.isArray(input.vehicleTypes) ? input.vehicleTypes : []).map((c) => String(c).trim()))];
  const unknown = vehicleTypes.filter((c) => !vehicleCodes.includes(c));
  if (unknown.length) throw bad(`Unknown vehicle type: ${unknown.join(", ")}`);
  const vatCheckedAt = day(input.vatCheckedAt, "The VAT check date");
  if (vatCheckedAt && vatCheckedAt > today) throw bad("The VAT check date cannot be in the future");
  const lanes = Array.isArray(input.preferredLanes) ? input.preferredLanes : [];
  if (lanes.length > MAX_LANES) throw bad(`At most ${MAX_LANES} preferred lanes are allowed`);
  const preferredLanes = lanes.map((l, i) => cleanLane(l, i + 1));
  const ids = preferredLanes.map((l) => l.id).filter(Boolean);
  if (new Set(ids).size !== ids.length) throw bad("A lane is listed twice");
  const licenceUnlimited = input.licenceUnlimited === true;
  return {
    insurer: text(input.insurer, "The insurer", 200),
    insurancePolicyNo: text(input.insurancePolicyNo, "The insurance policy number", 100),
    insuranceLimit,
    insuranceCurrency: currency(input.insuranceCurrency, "The insurance currency"),
    insuranceValidTo: day(input.insuranceValidTo, "The insurance end date"),
    licenceNo: text(input.licenceNo, "The licence number", 100),
    licenceValidTo: licenceUnlimited ? null : day(input.licenceValidTo, "The licence end date"),
    licenceUnlimited,
    adrCapable: input.adrCapable === true,
    vehicleTypes,
    paymentDays: input.paymentDays,
    currency: currency(input.currency, "The payment currency"),
    vatUnreliable: input.vatUnreliable === true,
    bankAccountPublished: input.bankAccountPublished === true,
    vatCheckedAt,
    bankAccounts: cleanBankAccounts(input.bankAccounts),
    costSplitBasis: input.costSplitBasis,
    notes: text(input.notes, "The notes", 4000),
    preferredLanes,
  };
}

const laneKey = (l: PreferredLaneInput) => [l.originPostcodeFrom, l.originPostcodeTo, l.destPostcodeFrom, l.destPostcodeTo, l.serviceKind, l.note].join("|");

/** The profile fields that differ between the stored profile and a save, with before and after. */
export function profileChanges(before: HaulierProfile, after: HaulierProfileInput): Record<string, { before: unknown; after: unknown }> {
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  for (const key of Object.keys(after) as (keyof HaulierProfileInput)[]) {
    if (key === "preferredLanes") continue;
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) changes[key] = { before: before[key], after: after[key] };
  }
  const lanesBefore = before.preferredLanes.map(laneKey);
  const lanesAfter = after.preferredLanes.map(laneKey);
  const sameIds = JSON.stringify(before.preferredLanes.map((l) => l.id)) === JSON.stringify(after.preferredLanes.map((l) => l.id ?? null));
  if (!sameIds || JSON.stringify(lanesBefore) !== JSON.stringify(lanesAfter)) {
    const strip = (l: PreferredLaneInput) => ({ ...l, id: undefined });
    changes.preferredLanes = { before: before.preferredLanes.map(strip), after: after.preferredLanes.map(strip) };
  }
  return changes;
}

// ---- VAT and bank fields (owner decision 6, 16 Oct 2026) -------------------------------------------

/**
 * The profile fields only a manager may change: what the VAT bank-account check (ručení za DPH)
 * trusts. Each with how it is named in a refusal.
 */
export const MANAGER_ONLY_FIELDS = {
  vatUnreliable: "unreliable VAT payer",
  bankAccountPublished: "account published in the VAT register",
  vatCheckedAt: "VAT check date",
  bankAccounts: "published bank accounts",
} as const;

/** Days after a bank-account change in which an exact-match invoice of the haulier is not approved automatically. */
export const BANK_HOLD_DAYS = 30;

/** The manager-only fields among a save's changes. */
export const managerOnlyChanges = (changes: Record<string, unknown>): (keyof typeof MANAGER_ONLY_FIELDS)[] =>
  (Object.keys(MANAGER_ONLY_FIELDS) as (keyof typeof MANAGER_ONLY_FIELDS)[]).filter((k) => k in changes);

/** The refusal of a save by a user who is not a manager that changes manager-only fields. */
export const managerOnlyRefusal = (fields: (keyof typeof MANAGER_ONLY_FIELDS)[]): string =>
  `Only a manager can change the VAT and bank details (${fields.map((f) => MANAGER_ONLY_FIELDS[f]).join(", ")}). Nothing was saved: reload, leave them as they are, or ask a manager.`;

/** Whether a save adds an account that was not published before (removing one changes nothing a payment could go to). */
export const bankAccountAdded = (before: string[], after: string[]): boolean => after.some((a) => !before.includes(a));

/** The end of the hold after a bank-account change. */
export const bankHoldUntil = (changedAt: Date): Date => new Date(changedAt.getTime() + BANK_HOLD_DAYS * 86_400_000);

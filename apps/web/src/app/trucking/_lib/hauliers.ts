import type { interfaces } from "@/lib/api/client";
import { addDays } from "@/lib/date";
import { formatPostcode } from "@/lib/postcode";

// Pure helpers of the Hauliers tab and the haulier page: status chip, postcodes (PSČ), expiry and
// the checks a profile must pass before it is saved.

export type HaulierStatus = interfaces.HaulierStatus;
export type HaulierIssue = interfaces.HaulierIssue;

export const EXPIRY_WARNING_DAYS = 30;

/** Text and tone of a status chip; the chip also carries an icon, so colour is never the only sign. */
export const HAULIER_STATUS_CHIP: Record<HaulierStatus, { label: string; tone: "green" | "amber" | "red"; hint: string }> = {
  ok: { label: "OK", tone: "green", hint: "Can be put on a trip" },
  warning: { label: "Warning", tone: "amber", hint: "Can be put on a trip, but something needs attention soon" },
  blocked: { label: "Blocked", tone: "red", hint: "Cannot be put on a trip until the issues are solved" },
};

/** Block issues first, then warnings, each group in the server's order. */
export function sortIssues(issues: readonly HaulierIssue[]): HaulierIssue[] {
  return [...issues.filter((i) => i.severity === "block"), ...issues.filter((i) => i.severity !== "block")];
}

/** "Carrier liability insurance expired … +2": the first issue (block first) and how many more. */
export function issueSummary(issues: readonly HaulierIssue[]): { first: string; more: number } | null {
  const sorted = sortIssues(issues);
  if (!sorted.length) return null;
  return { first: sorted[0]!.message, more: sorted.length - 1 };
}

/** A Czech postcode as shown: "110 00"; anything not 5 digits stays as typed. */
export function formatPsc(psc: string): string {
  return formatPostcode(psc);
}

/** What is typed into a postcode field, kept to its digits (at most 5): "110 00" → "11000". */
export function pscDigits(input: string): string {
  return input.replace(/\D/g, "").slice(0, 5);
}

export const isValidPsc = (psc: string) => /^\d{5}$/.test(psc);

/** Why a postcode range cannot be saved, or null when it can. */
export function pscRangeProblem(from: string, to: string): string | null {
  if (!isValidPsc(from) || !isValidPsc(to)) return "postcodes have 5 digits";
  if (from > to) return "“from” must not be after “to”";
  return null;
}

/** A date (YYYY-MM-DD) from today up to `days` days ahead; past or missing dates are not "expiring". */
export function expiresWithin(date: string | null | undefined, today: string, days = EXPIRY_WARNING_DAYS): boolean {
  if (!date) return false;
  return date >= today && date <= addDays(today, days);
}

/** Quick filters of the Hauliers tab. */
export type HaulierChipId = "attention" | "expiring" | "adr" | "noProfile";

export const HAULIER_CHIPS: { id: HaulierChipId; label: string; hint: string; danger?: boolean; match: (h: interfaces.HaulierListItem, today: string) => boolean }[] = [
  { id: "attention", label: "Needs attention", hint: "Blocked or with a warning", danger: true, match: (h) => h.status !== "ok" },
  {
    id: "expiring",
    label: `Expiring in ${EXPIRY_WARNING_DAYS} days`,
    hint: `Insurance or licence ends within ${EXPIRY_WARNING_DAYS} days`,
    match: (h, today) => expiresWithin(h.insuranceValidTo, today) || expiresWithin(h.licenceValidTo, today),
  },
  { id: "adr", label: "ADR capable", hint: "Can carry dangerous goods (ADR)", match: (h) => h.adrCapable },
  { id: "noProfile", label: "No profile", hint: "Haulier in the Customer Database without a Trucking profile yet", match: (h) => !h.hasProfile },
];

export const LANE_KIND_LABELS: Record<interfaces.LaneServiceKind, string> = {
  ANY: "Any",
  LTL: "LTL",
  FTL: "FTL",
  LINEHAUL: "Line haul",
};

export const COST_SPLIT_LABELS: Record<interfaces.CostSplitBasis, string> = {
  chargeable_weight: "Chargeable weight",
  ldm: "LDM",
  pallet_places: "Pallet places",
};

export const CURRENCIES = ["CZK", "EUR"] as const;

/** A preferred lane being edited: `key` tells rows apart, `id` is there once it is saved. */
export interface LaneDraft {
  key: string;
  id?: string;
  originPostcodeFrom: string;
  originPostcodeTo: string;
  destPostcodeFrom: string;
  destPostcodeTo: string;
  serviceKind: interfaces.LaneServiceKind;
  note: string;
}

export interface ProfileDraftChecks {
  insuranceLimit: number | null;
  paymentDays: number;
  preferredLanes: readonly LaneDraft[];
}

/** Why a profile cannot be saved yet, one line per problem. */
export function profileProblems(draft: ProfileDraftChecks): string[] {
  const out: string[] = [];
  if (draft.insuranceLimit != null && draft.insuranceLimit < 0) out.push("Insurance limit cannot be negative");
  if (!Number.isInteger(draft.paymentDays) || draft.paymentDays < 0) out.push("Payment days must be a whole number, 0 or more");
  draft.preferredLanes.forEach((l, i) => {
    const origin = pscRangeProblem(l.originPostcodeFrom, l.originPostcodeTo);
    const dest = pscRangeProblem(l.destPostcodeFrom, l.destPostcodeTo);
    if (origin) out.push(`Lane ${i + 1} origin: ${origin}`);
    if (dest) out.push(`Lane ${i + 1} destination: ${dest}`);
  });
  return out;
}

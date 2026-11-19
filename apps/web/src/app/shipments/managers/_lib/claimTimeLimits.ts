import type { controllers, interfaces } from "@/lib/api/client";
import { businessDateTime } from "@/lib/date";

// The company's claim time limits on Shipments → Managers → Settings (Council Outlay 11, D21): how
// many days after delivery (else the ATA) the carrier must be told of a cargo claim, and how many
// months after it a suit is time-barred, by how the job travels. The numbers offered are general
// practice, NOT confirmed with the insurer: the limits stay switched off until a manager switches
// them on, and switching them on with the four modes' numbers is the confirmation the server
// stamps with who did it (apps/api services/shipments lib/claimTimeLimits). Switched off, nothing
// is said of deadlines: no date on the Claims tab, no time-limit tag on the Cockpit.

export type ClaimTimeLimitsSettings = interfaces.ClaimTimeLimitsSettings;
export type ClaimModesLimits = interfaces.ClaimModesLimits;
export type ClaimMode = keyof ClaimModesLimits;

/** The modes, in the order the table lists them. */
export const CLAIM_LIMIT_MODES: readonly { key: ClaimMode; label: string }[] = [
  { key: "sea", label: "Sea" },
  { key: "air", label: "Air" },
  { key: "rail", label: "Rail" },
  { key: "road", label: "Road" },
];

/** The ranges the server keeps (NOTICE_DAYS_MAX, SUIT_MONTHS_MAX). */
export const NOTICE_DAYS_MAX = 365;
export const SUIT_MONTHS_MAX = 120;

/** The note over the table, as agreed: the numbers are to be confirmed before they are switched on. */
export const GENERAL_PRACTICE_NOTE =
  "These are general practice (sea 3 days, road and rail 7, air 14 to notify the carrier; suit within 1 year, air 2 years). Confirm them with your insurer and your forwarding conditions before switching them on.";

/** What the form holds: the switch, and each mode's two numbers (null while a box is empty). */
export interface LimitsDraft {
  enabled: boolean;
  limits: Record<ClaimMode, { noticeDays: number | null; suitMonths: number | null }>;
}

/** The form filled with what the company keeps. */
export const draftOfSettings = (s: Pick<ClaimTimeLimitsSettings, "enabled" | "limits">): LimitsDraft => ({
  enabled: s.enabled,
  limits: {
    sea: { ...s.limits.sea },
    air: { ...s.limits.air },
    rail: { ...s.limits.rail },
    road: { ...s.limits.road },
  },
});

const whole = (n: number | null, max: number): n is number => n !== null && Number.isInteger(n) && n >= 1 && n <= max;

/** Why the form can't be saved, in the server's words; null when it can. */
export function limitsProblem(draft: LimitsDraft): string | null {
  for (const { key } of CLAIM_LIMIT_MODES) {
    const { noticeDays, suitMonths } = draft.limits[key];
    if (!whole(noticeDays, NOTICE_DAYS_MAX)) return `The notice days (${key}) must be a whole number from 1 to ${NOTICE_DAYS_MAX}`;
    if (!whole(suitMonths, SUIT_MONTHS_MAX)) return `The suit months (${key}) must be a whole number from 1 to ${SUIT_MONTHS_MAX}`;
  }
  return null;
}

/**
 * The save as the server takes it: always all four modes, so switching on is never refused for a
 * mode left out and the numbers on screen are the numbers confirmed. Call it only when
 * limitsProblem says nothing.
 */
export function saveRequest(draft: LimitsDraft): controllers.ClaimTimeLimitsSaveRequest {
  const mode = (key: ClaimMode) => ({ noticeDays: draft.limits[key].noticeDays ?? 0, suitMonths: draft.limits[key].suitMonths ?? 0 });
  return { enabled: draft.enabled, sea: mode("sea"), air: mode("air"), rail: mode("rail"), road: mode("road") };
}

/** Whether the form differs from what is kept: the switch or any number. */
export function limitsChanged(draft: LimitsDraft, kept: Pick<ClaimTimeLimitsSettings, "enabled" | "limits">): boolean {
  if (draft.enabled !== kept.enabled) return true;
  return CLAIM_LIMIT_MODES.some(({ key }) => draft.limits[key].noticeDays !== kept.limits[key].noticeDays || draft.limits[key].suitMonths !== kept.limits[key].suitMonths);
}

/** "3 days", "1 day". */
export const daysText = (n: number): string => `${n} day${n === 1 ? "" : "s"}`;

/** A suit period in words: whole years as years ("1 year", "2 years"), else months ("18 months"). */
export function monthsText(n: number): string {
  if (n > 0 && n % 12 === 0) {
    const years = n / 12;
    return `${years} year${years === 1 ? "" : "s"}`;
  }
  return `${n} month${n === 1 ? "" : "s"}`;
}

/** Whether a mode's numbers are the general practice. */
export const isGeneralPractice = (draft: LimitsDraft, general: ClaimModesLimits, mode: ClaimMode): boolean =>
  draft.limits[mode].noticeDays === general[mode].noticeDays && draft.limits[mode].suitMonths === general[mode].suitMonths;

/** "Confirmed by jana@cto.cz on 19.11.2026 14:05" while on; "" while off. */
export function confirmedText(s: Pick<ClaimTimeLimitsSettings, "enabled" | "confirmedBy" | "confirmedAt">): string {
  if (!s.enabled) return "";
  const who = s.confirmedBy.trim() || "a manager";
  const when = businessDateTime(s.confirmedAt);
  return when ? `Confirmed by ${who} on ${when}` : `Confirmed by ${who}`;
}

/** Who saved them last: "Last saved by … on …"; never saved: the numbers shown are the general practice. */
export function savedText(s: Pick<ClaimTimeLimitsSettings, "saved" | "updatedBy" | "updatedAt">): string {
  if (!s.saved) return "Never saved: the numbers shown are the general practice.";
  const when = businessDateTime(s.updatedAt);
  const who = s.updatedBy.trim();
  return [`Last saved`, who && `by ${who}`, when && `on ${when}`].filter(Boolean).join(" ");
}

/** What the Save button does, said beside it: switching on (or saving while on) confirms the numbers. */
export function saveMeaning(draft: LimitsDraft, kept: Pick<ClaimTimeLimitsSettings, "enabled">): string {
  if (draft.enabled) return "Saving with the switch On confirms these numbers in your name.";
  return kept.enabled ? "Saving with the switch Off stops the deadlines and their signals, and clears the confirmation." : "Switched off: the numbers are kept, and nothing is said of deadlines.";
}

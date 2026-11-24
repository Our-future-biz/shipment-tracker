// A Co-Loading Concept service's sailings as the module shows them. Pure, so it is tested without React.
// The server checks the same (api lib/coLoadingSailing).

// "WEEK 44", "week44", "Wk 44", "W44": the week a sailing goes, for an import whose vessel is not known yet.
const WEEK = /^(?:week|wk|w)\.?\s*(\d{1,2})$/i;

/** The week a Vessel names, "WEEK 44", or null when it names a vessel. */
export function sailingWeek(vessel: string): string | null {
  const m = WEEK.exec(vessel.trim());
  if (!m) return null;
  const week = Number(m[1]);
  return week >= 1 && week <= 53 ? `WEEK ${week}` : null;
}

/** Whether the Voyage is needed: with a vessel's name, not with a week. */
export const voyageNeeded = (vessel: string): boolean => !sailingWeek(vessel);

/** What is missing from the form, in words, or null when it can be sent. */
export function sailingFormError(f: {
  vessel: string;
  voyage?: string;
  pol: string;
  pod: string;
  hub: string;
  containerType: string;
  cutoffDate?: string | null;
  departureDate?: string | null;
}): string | null {
  if (!f.vessel.trim()) return "Give the vessel, or the week it sails (WEEK 44).";
  if (voyageNeeded(f.vessel) && !(f.voyage ?? "").trim())
    return "Give the voyage, or write the week in Vessel (WEEK 44) while the vessel is not known.";
  if (!f.pol) return "Give the Port of Loading.";
  if (!f.pod) return "Give the Port of Discharge.";
  if (!f.hub) return "Give the HUB.";
  if (!f.containerType) return "Pick the container type.";
  // Said before sending, as the server would (both YYYY-MM-DD, so they compare as text).
  if (f.cutoffDate && f.departureDate && f.cutoffDate > f.departureDate) return "The cut-off cannot be after the departure date.";
  return null;
}

/** Where a sailing stands, set by hand, in order (Council Outlay 14, C3). The server holds the same list. */
export const SAILING_STAGES = ["open", "closed", "departed", "arrived", "devanned"] as const;
export type SailingStage = (typeof SAILING_STAGES)[number];
export const SAILING_STAGE_LABEL: Record<SailingStage, string> = { open: "Open", closed: "Closed for cargo", departed: "Departed", arrived: "Arrived", devanned: "Devanned" };
/** A stage's colour as a pill: open says nothing, closed warns, the rest are done. */
export const SAILING_STAGE_TONE: Record<SailingStage, "green" | "amber" | "slate"> = { open: "green", closed: "amber", departed: "slate", arrived: "slate", devanned: "slate" };
/** The stage of a sailing read before stages existed is open. */
export const stageOf = (s: { stage?: string | null }): SailingStage => ((SAILING_STAGES as readonly string[]).includes(s.stage ?? "") ? (s.stage as SailingStage) : "open");
/** The stage says the sailing has left. */
export const stageHasLeft = (s: { stage?: string | null }): boolean => SAILING_STAGES.indexOf(stageOf(s)) >= SAILING_STAGES.indexOf("departed");
/** Linking to it asks for a reason: closed for cargo, or any later stage. */
export const linkNeedsReason = (s: { stage?: string | null }): boolean => stageOf(s) !== "open";
/** Its departure date has passed and nobody has set it to Departed: a stage to bring up to date, or a date to correct. */
export const stageBehind = (s: { stage?: string | null; departureDate: string | null }, today: string): boolean => !stageHasLeft(s) && s.departureDate !== null && s.departureDate < today;

/**
 * The shipment statuses from before a departure: on a sailing that has left, a shipment still at one
 * of these has a status to bring up to date.
 */
const BEFORE_DEPARTURE = /^(Booking Confirmation Pending|Pick Up Date Pending From Customer|All Done - Waiting To Be Shipped)\b/;
export const statusBeforeDeparture = (status: string | null | undefined): boolean => BEFORE_DEPARTURE.test((status ?? "").trim());

/**
 * A sailing has left: its stage says so, or its departure date is before `today` (both YYYY-MM-DD).
 * One with no date and an early stage is still to come.
 */
export const sailingDeparted = (s: { departureDate: string | null; stage?: string | null }, today: string): boolean => stageHasLeft(s) || (s.departureDate !== null && s.departureDate < today);

/**
 * A service's sailings as its list shows them (Council Outlay 14, A2): those still to come by
 * departure, the soonest first and the ones with no date after them; then those that have left,
 * the last one to leave first. Within the same day, the one made first.
 */
export function sailingsInOrder<T extends { departureDate: string | null; createdAt: string; stage?: string | null }>(sailings: readonly T[], today: string): { coming: T[]; departed: T[] } {
  const byMade = (a: T, b: T) => a.createdAt.localeCompare(b.createdAt);
  const coming = sailings
    .filter((s) => !sailingDeparted(s, today))
    .sort((a, b) => (a.departureDate === null ? (b.departureDate === null ? byMade(a, b) : 1) : b.departureDate === null ? -1 : a.departureDate.localeCompare(b.departureDate) || byMade(a, b)));
  // One set to Departed with no date stands first among them: it left, and its date is still to be typed.
  const departed = sailings.filter((s) => sailingDeparted(s, today)).sort((a, b) => (b.departureDate ?? "9999").localeCompare(a.departureDate ?? "9999") || byMade(a, b));
  return { coming, departed };
}

const addDays = (day: string, days: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** The ISO week (1 to 53) a day falls in (YYYY-MM-DD). */
export function isoWeek(day: string): number {
  const d = new Date(Date.parse(`${day}T00:00:00Z`));
  // The Thursday of the day's week decides the year the week belongs to.
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

/** How many days lie between two sailings of a service of this frequency; null for one that sails as needed. */
export const sailingStepDays = (frequency: string): number | null => (frequency === "weekly" ? 7 : frequency === "bi_weekly" ? 14 : null);

/**
 * What "Create new sailing" starts from (Council Outlay 14, A4): the service's last sailing with its
 * ports, HUB, container type and number of containers, and - for a weekly or bi-weekly service - the
 * next week's name with the cut-off and the departure moved on by 7 or 14 days. The last sailing is
 * the one that leaves last - or one with no departure date yet, when it was made after that one. A
 * named vessel is not carried over: the next one has another. Null when the service has no sailing
 * yet. `today` (YYYY-MM-DD) says how many weeks the year has, for a week counted on without a date.
 * Everything stays editable.
 */
export function nextSailingStart(
  sailings: readonly { vessel: string; pol: string; pod: string; hub: string; containerType: string; containerCount: number; cutoffDate: string | null; departureDate: string | null; createdAt: string }[],
  frequency: string,
  today: string,
): { from: string; values: { vessel: string; voyage: string; pol: string; pod: string; hub: string; containerType: string; containerCount: number; cutoffDate: string | null; departureDate: string | null } } | null {
  if (sailings.length === 0) return null;
  const madeLast = <T extends { createdAt: string }>(list: T[]) => [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const dated = [...sailings.filter((s) => s.departureDate !== null)].sort((a, b) => b.departureDate!.localeCompare(a.departureDate!) || b.createdAt.localeCompare(a.createdAt))[0];
  const undated = madeLast(sailings.filter((s) => s.departureDate === null && (!dated || s.createdAt > dated.createdAt)));
  const last = (undated ?? dated ?? madeLast([...sailings]))!;
  const step = sailingStepDays(frequency);
  const departureDate = step && last.departureDate ? addDays(last.departureDate, step) : null;
  const cutoffDate = step && last.cutoffDate ? addDays(last.cutoffDate, step) : null;
  const week = sailingWeek(last.vessel);
  let vessel = "";
  if (step && week) {
    // The week the new departure falls in when it is known; else the last week counted on, back to 1 after the year's last week (28 December is always in it).
    const weeksInYear = isoWeek(`${today.slice(0, 4)}-12-28`);
    const counted = Number(week.slice(5)) + step / 7;
    vessel = `WEEK ${departureDate ? isoWeek(departureDate) : counted > weeksInYear ? counted - weeksInYear : counted}`;
  }
  return {
    from: last.vessel,
    values: { vessel, voyage: "", pol: last.pol, pod: last.pod, hub: last.hub, containerType: last.containerType, containerCount: last.containerCount, cutoffDate, departureDate },
  };
}

/**
 * The sailing cargo is rolled to: the first one still to come that leaves after this one. For a
 * sailing with no departure date yet, the first one to come that was made after it - an earlier
 * week is never offered as "next". Null when there is none: then the sailing is picked by hand.
 */
export function nextSailingAfter<T extends { id: string; departureDate: string | null; createdAt: string; stage?: string | null }>(sailing: { id: string; departureDate: string | null; createdAt: string }, sailings: readonly T[], today: string): T | null {
  const coming = sailingsInOrder(sailings, today).coming.filter((s) => s.id !== sailing.id);
  if (!sailing.departureDate) return coming.find((s) => s.createdAt > sailing.createdAt) ?? null;
  return coming.find((s) => s.departureDate === null || s.departureDate >= sailing.departureDate!) ?? null;
}

/** The cut-off beside today, in words: "today", "in 2 days", "3 days ago"; "" with no cut-off. Both YYYY-MM-DD. */
export function cutoffWords(cutoffDate: string | null, today: string): string {
  if (!cutoffDate) return "";
  const days = Math.round((Date.parse(`${cutoffDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (Number.isNaN(days)) return "";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

/** The days before a cut-off from which it shows amber (Council Outlay 14, D9). */
export const CUTOFF_NEAR_DAYS = 3;

/** How a cut-off stands beside today: "passed" (red), "near" (amber, within 3 days), or "far". "" with no cut-off. */
export function cutoffState(cutoffDate: string | null, today: string): "passed" | "near" | "far" | "" {
  if (!cutoffDate) return "";
  const days = Math.round((Date.parse(`${cutoffDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (Number.isNaN(days)) return "";
  return days < 0 ? "passed" : days <= CUTOFF_NEAR_DAYS ? "near" : "far";
}

/** The colour of a cut-off's remark. */
export const CUTOFF_TONE = { passed: "text-red-600", near: "text-amber-700", far: "text-slate-500", "": "" } as const;

/** What "Edit sailing" would change, as the request sends it: only the facts that differ, with the three details always. */
export function sailingEditOf(
  sailing: { vessel: string; voyage: string; pol: string; pod: string; hub: string; containerType: string },
  form: { vessel: string; voyage: string; pol: string; pod: string; hub: string; containerType: string; containerCount: number; cutoffDate: string | null; departureDate: string | null },
) {
  const facts = (["vessel", "voyage", "pol", "pod", "hub", "containerType"] as const).filter((k) => form[k].trim() !== sailing[k]);
  return { containerCount: form.containerCount, cutoffDate: form.cutoffDate, departureDate: form.departureDate, ...Object.fromEntries(facts.map((k) => [k, form[k].trim()])) };
}

/** A sailing's own page, under its service's: /co-loading/<service>/sailings/<sailing>. */
export const sailingHref = (s: { id: string; serviceId: string }) =>
  `/co-loading/${s.serviceId}/sailings/${s.id}`;

/** A sailing as its page names it: "MSC Anna 445W", or "WEEK 44" while the vessel is not known. */
export const sailingTitle = (s: { vessel: string; voyage: string }) =>
  [s.vessel, s.voyage].filter(Boolean).join(" ");

/** The tabs of a sailing's page, in order: the first is the one it opens on. */
export const SAILING_TABS = [
  { key: "box", label: "Box utilization" },
  { key: "shipments", label: "Linked shipments" },
  { key: "log", label: "Checklist and history" },
  { key: "earnings", label: "Earnings" },
] as const;
export type SailingTab = (typeof SAILING_TABS)[number]["key"];

/** The tabs a person sees: Earnings is for managers and admins only (Council Outlay 13, D14). */
export const sailingTabsFor = (manager: boolean) => SAILING_TABS.filter((t) => manager || t.key !== "earnings");

/** The tab an address asks for (?tab=), the first one for anything else - or for a tab the person may not see. */
export const sailingTabOf = (asked: string | null, manager = true): SailingTab =>
  sailingTabsFor(manager).find((t) => t.key === asked)?.key ?? "box";

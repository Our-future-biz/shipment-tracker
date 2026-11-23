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
}): string | null {
  if (!f.vessel.trim()) return "Give the vessel, or the week it sails (WEEK 44).";
  if (voyageNeeded(f.vessel) && !(f.voyage ?? "").trim())
    return "Give the voyage, or write the week in Vessel (WEEK 44) while the vessel is not known.";
  if (!f.pol) return "Give the Port of Loading.";
  if (!f.pod) return "Give the Port of Discharge.";
  if (!f.hub) return "Give the HUB.";
  if (!f.containerType) return "Pick the container type.";
  return null;
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
  { key: "earnings", label: "Earnings" },
] as const;
export type SailingTab = (typeof SAILING_TABS)[number]["key"];

/** The tab an address asks for (?tab=), the first one for anything else. */
export const sailingTabOf = (asked: string | null): SailingTab =>
  SAILING_TABS.find((t) => t.key === asked)?.key ?? "box";

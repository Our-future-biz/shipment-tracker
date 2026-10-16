import { TERMS } from "./glossary";

// Trucking module tabs, in work order; the Read me (in the "?" help drawer) lists each with its purpose.

export interface TruckingTabInfo {
  key: string;
  label: string;
  /** One line on what the tab is for (shown in the Read me). */
  purpose: string;
}

export const TRUCKING_TABS = [
  {
    key: "consignments",
    label: "Consignments",
    purpose: `Every ${TERMS.consignment.toLowerCase()} we carry, from order to ${TERMS.pod}.`,
  },
  {
    key: "planning",
    label: "Planning",
    purpose: `Puts the open ${TERMS.ltl} ${TERMS.leg.toLowerCase()}s on trucks for the coming days.`,
  },
  {
    key: "trips",
    label: "Trips",
    purpose: `Each ${TERMS.trip.toLowerCase()} as it runs: truck, driver or ${TERMS.haulier.toLowerCase()}, stops and consignments.`,
  },
  {
    key: "haulierInvoices",
    label: "Haulier invoices",
    purpose: `What the ${TERMS.haulier.toLowerCase()}s bill us, matched line by line against their trips and partner deliveries.`,
  },
  {
    key: "internalBilling",
    label: "Internal billing",
    purpose: `What Trucking charges another department for transport it runs for their jobs, month by month.`,
  },
  {
    key: "hauliers",
    label: "Hauliers",
    purpose: `The ${TERMS.haulier.toLowerCase()}s we hire, and what they can carry.`,
  },
  {
    key: "tariffs",
    label: "Tariffs",
    purpose: "The prices we buy, sell and charge internally at.",
  },
  {
    key: "calculator",
    label: "Rate calculator",
    purpose: "Prices a consignment before it is booked, for a quote or a phone enquiry.",
  },
  {
    key: "reports",
    label: "Reports",
    purpose: "How Trucking is doing, and what it earns.",
  },
] as const satisfies readonly TruckingTabInfo[];

export type TruckingTab = (typeof TRUCKING_TABS)[number]["key"];

/**
 * A tab's own filters: the Consignments ?status=, ?view= and ?job=, the Trips ?view=, the Planning
 * ?kind= and ?date=, the Tariffs ?side=, the Internal billing ?month= and the Reports ?period=,
 * ?from=, ?to=. They do not follow the user into another tab.
 */
export const TAB_OWN_PARAMS = ["status", "view", "job", "kind", "date", "side", "month", "period", "from", "to"] as const;

/** The address of another tab: the tab's own filters dropped, the first tab without ?tab=. */
export function tabSearch(current: string, tab: TruckingTab): string {
  const params = new URLSearchParams(current);
  for (const key of TAB_OWN_PARAMS) params.delete(key);
  if (tab === TRUCKING_TABS[0].key) params.delete("tab");
  else params.set("tab", tab);
  return params.toString();
}


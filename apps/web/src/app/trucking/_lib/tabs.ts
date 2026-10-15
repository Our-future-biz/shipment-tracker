import { TERMS } from "./glossary";

// Trucking module tabs, in work order; the Read me is in the "?" help drawer. Until a tab's phase
// is built it shows what it will hold (TruckingEmptyTab), never sample data.

export interface TruckingTabInfo {
  key: string;
  label: string;
  /** One line on what the tab is for. */
  purpose: string;
  /** What it will hold, in a few points. */
  holds: readonly string[];
  /** The phase of the Trucking plan that brings it. */
  phase: number;
}

export const TRUCKING_TABS = [
  {
    key: "consignments",
    label: "Consignments",
    purpose: `Every ${TERMS.consignment.toLowerCase()} we carry, from order to ${TERMS.pod}.`,
    holds: [
      `${TERMS.ltl} and ${TERMS.ftl} consignments with pick-up and delivery address, ${TERMS.zone.toLowerCase()} and ${TERMS.serviceLevel.toLowerCase()}`,
      `Pieces, weight, ${TERMS.palletPlaces.toLowerCase()}, ${TERMS.ldm} and ${TERMS.chargeableWeight.toLowerCase()}`,
      `Status from pick-up to delivery, with ${TERMS.avizace}, ${TERMS.cmr} and ${TERMS.pod}`,
    ],
    phase: 4,
  },
  {
    key: "planning",
    label: "Planning",
    purpose: "Puts the open consignments on trucks for the coming days.",
    holds: [
      `Consignments due by ${TERMS.serviceLevel.toLowerCase()}, grouped by ${TERMS.zone.toLowerCase()}`,
      `Building ${TERMS.pickupRun.toLowerCase()}s, ${TERMS.lineHaul.toLowerCase()}s and ${TERMS.deliveryRun.toLowerCase()}s, with truck capacity`,
      `The ${TERMS.haulier.toLowerCase()} we ordered for each trip`,
    ],
    phase: 5,
  },
  {
    key: "trips",
    label: "Trips",
    purpose: `Each ${TERMS.trip.toLowerCase()} as it runs: truck, driver or ${TERMS.haulier.toLowerCase()}, stops and consignments.`,
    holds: [
      `${TERMS.pickupRun}s, ${TERMS.lineHaul.toLowerCase()}s and ${TERMS.deliveryRun.toLowerCase()}s with their stops in order`,
      `The ${TERMS.transportOrder.toLowerCase()} sent to the haulier and its confirmation`,
      `${TERMS.waitingTime} and extra costs, buy cost against what the trip earns`,
    ],
    phase: 4,
  },
  {
    key: "hauliers",
    label: "Hauliers",
    purpose: `The ${TERMS.haulier.toLowerCase()}s we hire, and what they can carry.`,
    holds: [
      "Company, contacts, insurance and licences with their expiry dates",
      `Fleet and equipment: trailer types, ${TERMS.tailLift.toLowerCase()}, ${TERMS.adr}`,
      `The zones they serve and their ${TERMS.buyTariff.toLowerCase()}s`,
    ],
    phase: 1,
  },
  {
    key: "tariffs",
    label: "Tariffs",
    purpose: "The prices we buy, sell and charge internally at.",
    holds: [
      `${TERMS.sellTariff}s per customer or standard, by ${TERMS.zone.toLowerCase()} and ${TERMS.chargeableWeight.toLowerCase()}`,
      `${TERMS.buyTariff}s per haulier`,
      `The ${TERMS.internalTariff.toLowerCase()} Operations is charged at, with surcharges (${TERMS.adr}, ${TERMS.b2cDelivery}, ${TERMS.tailLift.toLowerCase()}, express)`,
    ],
    phase: 2,
  },
  {
    key: "calculator",
    label: "Rate calculator",
    purpose: "Prices a consignment before it is booked, for a quote or a phone enquiry.",
    holds: [
      `From and to by postcode (PSČ), with the ${TERMS.zone.toLowerCase()} found for you`,
      `Pieces, weight, ${TERMS.palletPlaces.toLowerCase()} or ${TERMS.ldm}, ${TERMS.serviceLevel.toLowerCase()} and extras`,
      "Sell price, buy price and margin from the tariffs, ready to use in Sales",
    ],
    phase: 2,
  },
  {
    key: "reports",
    label: "Reports",
    purpose: "How Trucking is doing, and what it bills.",
    holds: [
      `On-time delivery against the ${TERMS.serviceLevel.toLowerCase()}`,
      "Margin per trip, customer and haulier",
      `The monthly ${TERMS.internalCharge.toLowerCase()} to Operations`,
    ],
    phase: 7,
  },
] as const satisfies readonly TruckingTabInfo[];

export type TruckingTab = (typeof TRUCKING_TABS)[number]["key"];

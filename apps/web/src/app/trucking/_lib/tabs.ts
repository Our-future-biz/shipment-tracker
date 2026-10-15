import { TERMS } from "./glossary";

// Trucking module tabs, in work order; the Read me is in the "?" help drawer. Until a tab's phase
// is built it shows what it will hold (TruckingEmptyTab), never sample data; a built tab is `live`.

export interface TruckingTabInfo {
  key: string;
  label: string;
  /** One line on what the tab is for. */
  purpose: string;
  /** What it will hold, in a few points. */
  holds: readonly string[];
  /** The phase of the Trucking plan that brings it. */
  phase: number;
  /** Built: the tab shows real records. */
  live?: boolean;
}

export const TRUCKING_TABS = [
  {
    key: "consignments",
    label: "Consignments",
    purpose: `Every ${TERMS.consignment.toLowerCase()} we carry, from order to ${TERMS.pod}.`,
    holds: [
      `${TERMS.ftl} and ${TERMS.ltl} consignments with pick-up and delivery address, ${TERMS.serviceLevel.toLowerCase()} and promised date`,
      `Pieces, weight, ${TERMS.palletPlaces.toLowerCase()}, ${TERMS.ldm} and ${TERMS.chargeableWeight.toLowerCase()}, sell, buy and margin`,
      `Status from booking to ${TERMS.pod}, with the ${TERMS.transportOrder.toLowerCase()}, ${TERMS.cmr} and ${TERMS.pod}`,
    ],
    phase: 4,
    live: true,
  },
  {
    key: "planning",
    label: "Planning",
    purpose: `Puts the open ${TERMS.ltl} ${TERMS.leg.toLowerCase()}s on trucks for the coming days.`,
    holds: [
      `Open ${TERMS.leg.toLowerCase()}s by ${TERMS.zone.toLowerCase()}, with their deadline`,
      `Building ${TERMS.pickupRun.toLowerCase()}s, ${TERMS.lineHaul.toLowerCase()}s and ${TERMS.deliveryRun.toLowerCase()}s, with truck capacity`,
      `The ${TERMS.haulier.toLowerCase()} we ordered for each trip`,
    ],
    phase: 5,
    live: true,
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
    live: true,
  },
  {
    key: "haulierInvoices",
    label: "Haulier invoices",
    purpose: `What the ${TERMS.haulier.toLowerCase()}s bill us, matched line by line against their trips and partner deliveries.`,
    holds: [
      `Each ${TERMS.haulierInvoice.toLowerCase()} with its lines, the expected cost and the difference — ${TERMS.exactMatch.toLowerCase()} or a manager's approval`,
      `The ${TERMS.vatBankAccountCheck}: an invoice is blocked while the haulier or its bank account fails it`,
      "On approval the real cost goes to the jobs",
    ],
    phase: 6,
    live: true,
  },
  {
    key: "internalBilling",
    label: "Internal billing",
    purpose: `What Trucking charges the other departments for transport it runs for their jobs, month by month.`,
    holds: [
      `${TERMS.internalCharge}s per month and department, priced from the ${TERMS.internalTariff.toLowerCase()}`,
      `The ${TERMS.monthClose.toLowerCase()} into one ${TERMS.internalStatement.toLowerCase()} per department (PDF), and the Excel export`,
    ],
    phase: 6,
    live: true,
  },
  {
    key: "hauliers",
    label: "Hauliers",
    purpose: `The ${TERMS.haulier.toLowerCase()}s we hire, and what they can carry.`,
    holds: [
      `${TERMS.liabilityInsurance}, ${TERMS.transportLicence.toLowerCase()} and VAT-register checks, with their expiry dates`,
      `${TERMS.vehicleType}s, ${TERMS.adr}, payment terms and ${TERMS.preferredLane.toLowerCase()}s`,
      "A status per haulier: OK, Warning or Blocked, and why",
    ],
    phase: 1,
    live: true,
  },
  {
    key: "tariffs",
    label: "Tariffs",
    purpose: "The prices we buy, sell and charge internally at.",
    holds: [
      `${TERMS.sellTariff}s per customer or standard, by ${TERMS.zone.toLowerCase()} and ${TERMS.chargeableWeight.toLowerCase()}`,
      `${TERMS.buyTariff}s per haulier`,
      `The ${TERMS.internalTariff.toLowerCase()} Operations is charged at, with surcharges (${TERMS.adr}, ${TERMS.b2cDelivery}, ${TERMS.tailLift.toLowerCase()}, express)`,
      `Price lists uploaded from the Excel ${TERMS.template.toLowerCase()}, checked and compared before they are activated`,
    ],
    phase: 2,
    live: true,
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
    live: true,
  },
  {
    key: "reports",
    label: "Reports",
    purpose: "How Trucking is doing, and what it earns.",
    holds: [
      `${TERMS.onTime}, ${TERMS.firstAttempt.toLowerCase()}, ${TERMS.daysToPod}, ${TERMS.fill.toLowerCase()}, cost and margin for a period`,
      "Margin by customer, lane and service level, and a scorecard per haulier",
      `${TERMS.coverageGap}s and the ${TERMS.departmentResult.toLowerCase()}, with an Excel export`,
    ],
    phase: 7,
    live: true,
  },
] as const satisfies readonly TruckingTabInfo[];

export type TruckingTab = (typeof TRUCKING_TABS)[number]["key"];

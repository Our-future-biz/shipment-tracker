// The customer's read-only link to a shipment (Council Outlay 8, D22): 32 random bytes in the URL,
// only their SHA-256 stored. What the page shows is an allow-list built here, field by field, so a
// new internal field can never reach a customer by accident. Pure, so it is unit-tested.

import { createHash, randomBytes } from "node:crypto";
import { addDays } from "../../../lib/businessDate";
import type { PublicShipmentStatus, TrackingMilestone } from "../interfaces/interfaces";
import { CANCELLED_STATUS } from "./fieldDefaults";

/** Days after the delivery the link stays open. */
export const LINK_DAYS_AFTER_DELIVERY = 30;

/** The one answer to every link that doesn't open: nobody learns which ones existed. */
export const LINK_INVALID = "This link is no longer valid";

export const hashLinkToken = (token: string): string => createHash("sha256").update(token, "utf8").digest("hex");

export function newLinkToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashLinkToken(token) };
}

export const looksLikeLinkToken = (token: unknown): token is string => typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);

export const customerLinkUrl = (appUrl: string, token: string) => `${appUrl.replace(/\/+$/, "")}/track/${token}`;

/** The last day the link opens; null until the job is delivered. */
export const linkOpenUntil = (deliveryDay: string | null): string | null => (deliveryDay ? addDays(deliveryDay, LINK_DAYS_AFTER_DELIVERY) : null);

/** Whether a shipment can have an open link today. */
export function linkMayOpen(s: { status: string; actualDeliveryDate: string | null }, today: string): boolean {
  if (s.status === CANCELLED_STATUS) return false;
  const until = linkOpenUntil(s.actualDeliveryDate);
  return !until || today <= until;
}

interface StatusShipment {
  jobNumber: string;
  customerReference: string;
  tradeDirection: string;
  freightMode: string;
  pol: string;
  pod: string;
  vessel: string;
  voyage: string;
}

type PublicState = PublicShipmentStatus["milestones"][number]["state"];

// A step whose planned day passed with no actual reads "not yet confirmed", never "late": the customer must
// not take a planned departure for one that happened, and "late" is ours to chase (User Council E2, Q15).
// Only the first open step is the next one: after an unconfirmed step the later ones are just planned.
// An earlier step nobody noted while a later one happened is only planned, as on the Tracking tab.
function publicStates(milestones: readonly TrackingMilestone[]): PublicState[] {
  const lastDone = milestones.reduce((last, m, i) => (m.state === "done" ? i : last), -1);
  let reached = false;
  return milestones.map((m, i): PublicState => {
    if (m.state === "done") return "done";
    if (i < lastDone) return "open";
    const state: PublicState = m.state === "late" ? "unconfirmed" : m.state === "next" && !reached ? "next" : "open";
    if (m.state === "late" || m.state === "next") reached = true;
    return state;
  });
}

/** What a customer sees of a shipment: nothing that isn't named here. */
export function publicStatusOf(shipment: StatusShipment, milestones: readonly TrackingMilestone[], containers: readonly string[], ourCompany: string, now: Date): PublicShipmentStatus {
  const states = publicStates(milestones);
  return {
    ourCompany,
    reference: shipment.jobNumber,
    customerReference: shipment.customerReference,
    direction: shipment.tradeDirection,
    freightMode: shipment.freightMode,
    pol: shipment.pol,
    pod: shipment.pod,
    vessel: [shipment.vessel, shipment.voyage].filter(Boolean).join(" "),
    containers: [...containers],
    milestones: milestones.map((m, i) => ({
      key: m.key,
      label: m.label,
      leg: m.leg,
      place: m.place,
      planned: m.planned,
      actual: m.actual,
      // A customs row's wording is the one detail meant for a customer.
      detail: m.key === "customs" ? m.detail : "",
      state: states[i]!,
    })),
    asOf: now.toISOString(),
  };
}

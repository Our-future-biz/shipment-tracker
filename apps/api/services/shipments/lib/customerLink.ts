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

// Late is ours to chase, not a mark to show. A customs row's wording is the one detail meant for a customer.
const publicState = (state: TrackingMilestone["state"]): "done" | "next" | "open" => (state === "done" ? "done" : state === "next" || state === "late" ? "next" : "open");

/** What a customer sees of a shipment: nothing that isn't named here. */
export function publicStatusOf(shipment: StatusShipment, milestones: readonly TrackingMilestone[], containers: readonly string[], ourCompany: string, now: Date): PublicShipmentStatus {
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
    milestones: milestones.map((m) => ({
      key: m.key,
      label: m.label,
      leg: m.leg,
      place: m.place,
      planned: m.planned,
      actual: m.actual,
      detail: m.key === "customs" ? m.detail : "",
      state: publicState(m.state),
    })),
    asOf: now.toISOString(),
  };
}

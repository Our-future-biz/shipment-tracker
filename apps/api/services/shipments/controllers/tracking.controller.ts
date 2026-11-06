import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import type { ShipmentTracking } from "../interfaces/interfaces";
import { trackingService, type TrackingActor } from "../services/tracking.service";

const actor = (): TrackingActor => {
  const { userID, companyID, role } = getAuthData()!;
  return { userID, companyID, role };
};

// A shipment's Tracking tab: its milestones, its events, the logged changes of its dates, what
// needs a look, its ticks and its tax date.
export const shipmentTracking = api(
  { expose: true, auth: true, method: "GET", path: "/shipments/:shipmentId/tracking" },
  async ({ shipmentId }: { shipmentId: string }): Promise<ShipmentTracking> => {
    return trackingService.get(shipmentId, actor());
  },
);

interface TrackingEventRecordRequest {
  shipmentId: string;
  kind: string & MinLen<1>;
  /** YYYY-MM-DD */
  occurredOn: string;
  /** HH:MM in Prague; left out when not known. */
  occurredTime?: string;
  place?: string & MaxLen<200>;
  containerNumber?: string & MaxLen<20>;
  note?: string & MaxLen<1000>;
  /** The checklist tick this event comes with. */
  taskKey?: string;
}

// A person records a dated fact. One that sets a shipment field goes through the normal update.
export const trackingEventRecord = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/:shipmentId/tracking/events" },
  async ({ shipmentId, ...input }: TrackingEventRecordRequest): Promise<{ id: string }> => {
    const row = await trackingService.record(shipmentId, actor(), input);
    return { id: row.id };
  },
);

interface TrackingEventRequest {
  shipmentId: string;
  eventId: string;
}

// A person confirms a date a source proposed: only now does it reach the shipment.
export const trackingEventConfirm = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/:shipmentId/tracking/events/:eventId/confirm" },
  async ({ shipmentId, eventId }: TrackingEventRequest): Promise<{ ok: boolean }> => {
    await trackingService.confirm(shipmentId, eventId, actor());
    return { ok: true };
  },
);

// A person turns a proposed date down.
export const trackingEventDismiss = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/:shipmentId/tracking/events/:eventId/dismiss" },
  async ({ shipmentId, eventId }: TrackingEventRequest): Promise<{ ok: boolean }> => {
    await trackingService.dismiss(shipmentId, eventId, actor());
    return { ok: true };
  },
);

// Closes an exception by hand.
export const trackingEventResolve = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/:shipmentId/tracking/events/:eventId/resolve" },
  async ({ shipmentId, eventId }: TrackingEventRequest): Promise<{ ok: boolean }> => {
    await trackingService.resolve(shipmentId, eventId, actor());
    return { ok: true };
  },
);

interface TrackingEventStrikeRequest extends TrackingEventRequest {
  reason: string & MinLen<1> & MaxLen<500>;
}

// Takes back what somebody recorded by mistake, with a reason.
export const trackingEventStrike = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/:shipmentId/tracking/events/:eventId/strike" },
  async ({ shipmentId, eventId, reason }: TrackingEventStrikeRequest): Promise<{ ok: boolean }> => {
    await trackingService.strike(shipmentId, eventId, reason, actor());
    return { ok: true };
  },
);

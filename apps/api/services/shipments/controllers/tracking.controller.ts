import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import type { MasterJobTrackingHouse, ShipmentTracking, TrackingReadingPreview, TrackingVesselChange } from "../interfaces/interfaces";
import { trackingService, type FreeTimeInput, type KeptFact, type KeptFile, type TrackingActor } from "../services/tracking.service";

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

interface TrackingReadingPreviewRequest {
  shipmentId: string;
  /** What document reading got from the notice. */
  extracted: Record<string, string>;
}

// What a read document says about this shipment, for a person to look over. Nothing is kept yet.
export const trackingReadingPreview = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/:shipmentId/tracking/reading/preview" },
  async ({ shipmentId, extracted }: TrackingReadingPreviewRequest): Promise<TrackingReadingPreview> => {
    return trackingService.previewReading(shipmentId, actor().companyID, extracted);
  },
);

interface TrackingReadingKeepRequest {
  shipmentId: string;
  facts: KeptFact[] & MaxLen<50>;
  /** The document itself, when it was a file: filed on the shipment as a Carrier notice. */
  file?: KeptFile;
  vesselChange?: TrackingVesselChange;
  /** The last free day it states, for the boxes chosen. */
  lastFreeDay?: { day: string; containerIds: string[] };
}

// Keeps what a person chose of a read document: ATA and ATD wait to be confirmed, the rest goes by the rule.
export const trackingReadingKeep = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/:shipmentId/tracking/reading/keep", bodyLimit: 50 * 1024 * 1024 },
  async ({ shipmentId, facts, file, vesselChange, lastFreeDay }: TrackingReadingKeepRequest): Promise<{ ok: boolean }> => {
    await trackingService.keepReading(shipmentId, actor(), { facts, file, vesselChange, lastFreeDay });
    return { ok: true };
  },
);

// A master job's houses, each with where it stands.
export const masterJobTracking = api(
  { expose: true, auth: true, method: "GET", path: "/master-jobs/:masterJobId/tracking" },
  async ({ masterJobId }: { masterJobId: string }): Promise<{ houses: MasterJobTrackingHouse[] }> => {
    return { houses: await trackingService.masterJobHouses(masterJobId, actor().companyID) };
  },
);

interface TrackingFreeTimeRequest extends FreeTimeInput {
  shipmentId: string;
}

// The free time a booking gives a shipment's boxes.
export const trackingFreeTimeSet = api(
  { expose: true, auth: true, method: "PUT", path: "/shipments/:shipmentId/tracking/free-time" },
  async ({ shipmentId, ...input }: TrackingFreeTimeRequest): Promise<{ ok: boolean }> => {
    await trackingService.setFreeTime(shipmentId, actor(), input);
    return { ok: true };
  },
);

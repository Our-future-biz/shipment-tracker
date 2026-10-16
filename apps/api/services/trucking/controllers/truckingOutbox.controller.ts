import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { failedUpdates, sendAgain } from "../services/truckingSendAgain.service";
import type { TruckingUnsentUpdate } from "../interfaces/outbox.interfaces";
import { requireModule } from "../../../lib/modules";

interface TruckingOutboxFailedRequest {
  /** Only this consignment's updates */
  consignmentId?: string;
  /** Only the updates of the consignments on this trip */
  tripId?: string;
}

interface TruckingOutboxFailedResponse {
  updates: TruckingUnsentUpdate[];
}

// Managers: job updates that failed for good ("Not sent"), of a consignment, a trip or the company.
export const truckingOutboxFailed = api(
  { expose: true, auth: true, method: "GET", path: "/trucking/outbox/failed" },
  async (req: TruckingOutboxFailedRequest): Promise<TruckingOutboxFailedResponse> => {
    await requireModule("trucking_concept");
    return { updates: await failedUpdates(requireRole(), { consignmentId: req.consignmentId, tripId: req.tripId }) };
  },
);

interface TruckingSendAgainRequest {
  id: string;
}

interface TruckingSendAgainResponse {
  /** How many failed updates were sent again */
  requeued: number;
  /** What is still failed afterwards */
  unsent: TruckingUnsentUpdate[];
}

// Managers: "Send again" for a consignment's failed job updates (logged in its history).
export const truckingConsignmentSendAgain = api(
  { expose: true, auth: true, method: "POST", path: "/trucking/consignments/:id/send-again" },
  async ({ id }: TruckingSendAgainRequest): Promise<TruckingSendAgainResponse> => {
    await requireModule("trucking_concept");
    return sendAgain(requireRole(), { consignmentId: id });
  },
);

// Managers: "Send again" for the failed job updates of the consignments on a trip.
export const truckingTripSendAgain = api(
  { expose: true, auth: true, method: "POST", path: "/trucking/trips/:id/send-again" },
  async ({ id }: TruckingSendAgainRequest): Promise<TruckingSendAgainResponse> => {
    await requireModule("trucking_concept");
    return sendAgain(requireRole(), { tripId: id });
  },
);

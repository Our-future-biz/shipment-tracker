import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { attachmentService } from "../services/attachment.service";
import { trackingService } from "../services/tracking.service";

interface TrackingFactRequest {
  shipmentId: string;
  kind: "delivery_advised" | "pod_received" | "picked_up" | "haulier_confirmed";
  occurredAt: string;
  note: string & MaxLen<1000>;
  externalId: string & MinLen<1> & MaxLen<300>;
}

/** Internal API of the trucking service: a fact for the shipment's timeline, once per `externalId`. */
export const _internalTrackingFact = api(
  { expose: false, auth: true, method: "POST", path: "/internal/shipments/:shipmentId/tracking/facts" },
  async ({ shipmentId, kind, occurredAt, note, externalId }: TrackingFactRequest): Promise<void> => {
    const auth = getAuthData()!;
    await trackingService.addFact(shipmentId, auth.companyID, auth.userID, { kind, source: "trucking", occurredAt: new Date(occurredAt), note, externalId });
  },
);

interface TrackingFactVoidRequest {
  shipmentId: string;
  externalId: string & MinLen<1> & MaxLen<300>;
}

/** Internal API of the trucking service: a stamp was voided, so its fact leaves the timeline. */
export const _internalTrackingFactVoid = api(
  { expose: false, auth: true, method: "POST", path: "/internal/shipments/:shipmentId/tracking/facts/void" },
  async ({ shipmentId, externalId }: TrackingFactVoidRequest): Promise<void> => {
    await trackingService.voidFact(shipmentId, getAuthData()!.companyID, "trucking", externalId);
  },
);

interface ModuleDocumentRequest {
  shipmentId: string;
  fileName: string & MinLen<1>;
  fileType: string;
  contentBase64: string & MinLen<1>;
  documentType: string;
  sourceRef: string & MinLen<1> & MaxLen<300>;
}

/** Internal API of the trucking service: a file for the shipment's Documents, once per `sourceRef`. */
export const _internalModuleDocument = api(
  { expose: false, auth: true, method: "POST", path: "/internal/shipments/:shipmentId/documents", bodyLimit: 50 * 1024 * 1024 },
  async ({ shipmentId, ...file }: ModuleDocumentRequest): Promise<{ created: boolean }> => {
    const auth = getAuthData()!;
    return attachmentService.addFromModule(shipmentId, auth.companyID, file, auth.userID);
  },
);

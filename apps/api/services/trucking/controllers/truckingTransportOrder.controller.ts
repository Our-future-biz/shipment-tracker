import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { transportOrderService } from "../services/transportOrder.service";
import type { DocLanguageCode, FileDownload, TripDetail } from "../interfaces/interfaces";
import { requireModule } from "../../../lib/modules";

interface TruckingFileResponse {
  file: FileDownload;
}

interface TruckingTransportOrderPdfRequest {
  id: string;
  /** Typed by the user (shown once in Shipments): printed on the PDF only, never stored or logged */
  pickupPin: string | null;
  language: DocLanguageCode;
}

// The transport order PDF. Refused while the margin is below the floor without approval, or the haulier is blocked.
export const truckingTransportOrderPdf = api(
  { expose: true, auth: true, method: "POST", path: "/trucking/trips/:id/transport-order/pdf", sensitive: true },
  async ({ id, pickupPin, language }: TruckingTransportOrderPdfRequest): Promise<TruckingFileResponse> => {
    await requireModule("trucking_concept");
    return { file: await transportOrderService.pdf(requireRole(), id, { pickupPin, language }) };
  },
);

interface TruckingTransportOrderSendRequest {
  id: string;
  pickupPin: string | null;
  language: DocLanguageCode;
  to: string[];
  note: string;
}

interface TruckingTransportOrderSendResponse {
  trip: TripDetail;
  /** E-mail is off: recorded as sent, the PDF comes back for the user to send */
  recordedOnly: boolean;
  file: FileDownload;
}

// Sends (or, while e-mail is off, records as sent) the transport order with a new haulier link.
export const truckingTransportOrderSend = api(
  { expose: true, auth: true, method: "POST", path: "/trucking/trips/:id/transport-order/send", sensitive: true },
  async ({ id, ...input }: TruckingTransportOrderSendRequest): Promise<TruckingTransportOrderSendResponse> => {
    await requireModule("trucking_concept");
    return transportOrderService.send(requireRole(), id, input);
  },
);

interface TruckingTransportOrderConfirmRequest {
  id: string;
  note: string;
}

interface TruckingTripResponse {
  trip: TripDetail;
}

// Records the haulier's confirmation given by phone or e-mail.
export const truckingTransportOrderConfirm = api(
  { expose: true, auth: true, method: "POST", path: "/trucking/trips/:id/transport-order/confirm" },
  async ({ id, note }: TruckingTransportOrderConfirmRequest): Promise<TruckingTripResponse> => {
    await requireModule("trucking_concept");
    return { trip: await transportOrderService.confirm(requireRole(), id, note) };
  },
);

interface TruckingCmrPdfRequest {
  id: string;
}

// The CMR (consignment note) of a consignment.
export const truckingCmrPdf = api(
  { expose: true, auth: true, method: "POST", path: "/trucking/consignments/:id/cmr" },
  async ({ id }: TruckingCmrPdfRequest): Promise<TruckingFileResponse> => {
    await requireModule("trucking_concept");
    return { file: await transportOrderService.cmr(requireRole(), id) };
  },
);

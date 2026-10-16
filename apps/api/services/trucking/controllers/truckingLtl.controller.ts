import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { ltlService } from "../services/ltl.service";
import { ltlDocumentService } from "../services/ltlDocument.service";
import type { ConsignmentDetail, DocLanguageCode, FileDownload, LtlTripKind, PlanningBoard, TripDetail, TripPriceInput } from "../interfaces/interfaces";
import { requireModule } from "../../../lib/modules";

// LTL groupage: the planning board, pick-up runs / line hauls / delivery runs and their legs, a
// partner's delivery, trip stamps, the manifest and the labels.

interface TruckingPlanningBoardRequest {
  /** YYYY-MM-DD */
  date: string;
  kind: LtlTripKind;
}

// Legs waiting for a trip of the kind (with deadlines) and the day's trips. Refused until our warehouse's address is set.
export const truckingPlanningBoard = api(
  { expose: true, auth: true, method: "GET", path: "/trucking/planning" },
  async ({ date, kind }: TruckingPlanningBoardRequest): Promise<PlanningBoard> => {
    await requireModule("trucking_concept");
    return ltlService.board(requireRole(), date, kind);
  },
);

interface TruckingTripResponse {
  trip: TripDetail;
}

interface TruckingTripCreateLtlRequest {
  kind: LtlTripKind;
  /** YYYY-MM-DD */
  date: string;
  haulierCustomerId: string;
  vehicleTypeCode: string;
  /** Open legs of the trip's kind, in stop order (may be empty) */
  legIds: string[];
  price: TripPriceInput;
}

// A new pick-up run, line haul or delivery run with a usable haulier.
export const truckingTripCreateLtl = api(
  { expose: true, auth: true, method: "POST", path: "/trucking/trips/ltl" },
  async (req: TruckingTripCreateLtlRequest): Promise<TruckingTripResponse> => {
    await requireModule("trucking_concept");
    return { trip: await ltlService.createTrip(requireRole(), req) };
  },
);

interface TruckingTripAssignLegsRequest {
  id: string;
  add: string[];
  remove: string[];
  /** Every leg of the trip once, in the new order; null = keep the order (new legs last) */
  stopOrder: string[] | null;
  /** The trip's version read; stale = 409 */
  version: number;
}

// Legs on / off an LTL trip and the stop order (trip row locked); refused once the truck has left.
export const truckingTripAssignLegs = api(
  { expose: true, auth: true, method: "POST", path: "/trucking/trips/:id/legs" },
  async ({ id, ...input }: TruckingTripAssignLegsRequest): Promise<TruckingTripResponse> => {
    await requireModule("trucking_concept");
    return { trip: await ltlService.assignLegs(requireRole(), id, input) };
  },
);

interface TruckingTripRepriceRequest {
  id: string;
  price: TripPriceInput;
  /** Required once the transport order is sent (a manager only); an agreed price's own reason stands in when left out */
  reason?: string;
}

// An LTL trip priced again (the tariff now, or an agreed price with the reason), split over its legs.
// Once the transport order is sent: a manager with a reason; never once the trip is on a haulier invoice.
export const truckingTripReprice = api(
  { expose: true, auth: true, method: "POST", path: "/trucking/trips/:id/price" },
  async ({ id, price, reason }: TruckingTripRepriceRequest): Promise<TruckingTripResponse> => {
    await requireModule("trucking_concept");
    return { trip: await ltlService.reprice(requireRole(), id, price, reason) };
  },
);

interface TruckingLegPartnerRequest {
  id: string;
  haulierCustomerId: string;
  /** A delivery site of the partner; null = it collects at our warehouse */
  depotSiteId: string | null;
  price: TripPriceInput;
  /** Required to change the partner or price once the partner was given the delivery (a manager only) */
  reason?: string;
}

interface TruckingConsignmentResponse {
  consignment: ConsignmentDetail;
}

// The partner who delivers an LTL consignment (last mile PARTNER), priced from its BUY tariff (LTL) or agreed.
export const truckingLegPartner = api(
  { expose: true, auth: true, method: "PUT", path: "/trucking/legs/:id/partner" },
  async ({ id, ...input }: TruckingLegPartnerRequest): Promise<TruckingConsignmentResponse> => {
    await requireModule("trucking_concept");
    return { consignment: await ltlService.legPartner(requireRole(), id, input) };
  },
);

interface TruckingTripStampRequest {
  id: string;
  /** departed | arrived */
  kind: string;
  /** null = now; a past time within 7 days is allowed */
  at: string | null;
}

// The departure / arrival of an LTL trip (a pick-up run's arrival is not the gate-in: the warehouse stamps that).
export const truckingTripStamp = api(
  { expose: true, auth: true, method: "POST", path: "/trucking/trips/:id/stamps/:kind" },
  async ({ id, kind, at }: TruckingTripStampRequest): Promise<TruckingTripResponse> => {
    await requireModule("trucking_concept");
    return { trip: await ltlService.tripStamp(requireRole(), id, kind, at ?? null) };
  },
);

interface TruckingFileResponse {
  file: FileDownload;
}

interface TruckingManifestPdfRequest {
  id: string;
  language: DocLanguageCode;
}

// The manifest (nakládací list) of a run or line haul.
export const truckingManifestPdf = api(
  { expose: true, auth: true, method: "POST", path: "/trucking/trips/:id/manifest" },
  async ({ id, language }: TruckingManifestPdfRequest): Promise<TruckingFileResponse> => {
    await requireModule("trucking_concept");
    return { file: await ltlDocumentService.manifest(requireRole(), id, language) };
  },
);

interface TruckingLabelsPdfRequest {
  consignmentIds: string[];
  /** One label per piece ("n / N"); false = one per consignment */
  perPiece: boolean;
}

// 100×150 mm labels of consignments.
export const truckingLabelsPdf = api(
  { expose: true, auth: true, method: "POST", path: "/trucking/consignments/labels" },
  async ({ consignmentIds, perPiece }: TruckingLabelsPdfRequest): Promise<TruckingFileResponse> => {
    await requireModule("trucking_concept");
    return { file: await ltlDocumentService.labels(requireRole(), consignmentIds, perPiece) };
  },
);

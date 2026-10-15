import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { consignmentService } from "../services/consignment.service";
import type {
  ConsignmentCounts,
  ConsignmentDetail,
  ConsignmentListItem,
  ConsignmentPriceInput,
  ConsignmentStatus,
  ConsignmentView,
  LoadInput,
  ServiceLevelCode,
  StampKind,
  StopInput,
} from "../interfaces/interfaces";

interface TruckingConsignmentListRequest {
  status?: ConsignmentStatus;
  view?: ConsignmentView;
  /** Ref, job number, customer, city, postcode, trip ref or haulier */
  search?: string;
  shipmentId?: string;
}

interface TruckingConsignmentListResponse {
  consignments: ConsignmentListItem[];
  /** Over the consignments matching status / search / job, whatever the view */
  counts: ConsignmentCounts;
}

// The consignments worklist with its tiles and chips.
export const truckingConsignmentList = api(
  { expose: true, auth: true, method: "GET", path: "/trucking/consignments" },
  async (req: TruckingConsignmentListRequest): Promise<TruckingConsignmentListResponse> => {
    return consignmentService.list(requireRole(), req);
  },
);

interface TruckingConsignmentResponse {
  consignment: ConsignmentDetail;
}

interface TruckingConsignmentCreateRequest {
  /** null = a Road / Domestic job is created for the order */
  shipmentId: string | null;
  customerId: string;
  quoteNumber: string | null;
  serviceLevel: ServiceLevelCode | null;
  /** YYYY-MM-DD */
  pickupDate: string;
  /** "HH:MM" or null */
  pickupTime: string | null;
  pickup: StopInput;
  delivery: StopInput;
  load: LoadInput;
  price: ConsignmentPriceInput;
}

// Creates a consignment (any user): priced from the tariff, a quote or an agreed price. A margin
// below the floor is saved; the transport order then waits for a manager's approval.
export const truckingConsignmentCreate = api(
  { expose: true, auth: true, method: "POST", path: "/trucking/consignments" },
  async (req: TruckingConsignmentCreateRequest): Promise<TruckingConsignmentResponse> => {
    return { consignment: await consignmentService.create(requireRole(), req) };
  },
);

interface TruckingConsignmentGetRequest {
  id: string;
}

export const truckingConsignmentGet = api(
  { expose: true, auth: true, method: "GET", path: "/trucking/consignments/:id" },
  async ({ id }: TruckingConsignmentGetRequest): Promise<TruckingConsignmentResponse> => {
    return { consignment: await consignmentService.get(requireRole(), id) };
  },
);

interface TruckingConsignmentUpdateRequest {
  id: string;
  quoteNumber: string | null;
  serviceLevel: ServiceLevelCode | null;
  pickupDate: string;
  pickupTime: string | null;
  pickup: StopInput;
  delivery: StopInput;
  load: LoadInput;
  price: ConsignmentPriceInput;
  /** The version read */
  version: number;
  /** Price again from the price source; otherwise the stored price stays */
  reprice: boolean;
}

// Edits a consignment with the version read (stale = 409). After the pick-up only notes and references.
export const truckingConsignmentUpdate = api(
  { expose: true, auth: true, method: "PUT", path: "/trucking/consignments/:id" },
  async ({ id, ...input }: TruckingConsignmentUpdateRequest): Promise<TruckingConsignmentResponse> => {
    return { consignment: await consignmentService.update(requireRole(), id, input) };
  },
);

interface TruckingConsignmentReasonRequest {
  id: string;
  /** 3 to 500 characters */
  reason: string;
}

// Cancels a consignment (manager), refused after the pick-up; its trip and Trucking cost lines go with it.
export const truckingConsignmentCancel = api(
  { expose: true, auth: true, method: "POST", path: "/trucking/consignments/:id/cancel" },
  async ({ id, reason }: TruckingConsignmentReasonRequest): Promise<TruckingConsignmentResponse> => {
    return { consignment: await consignmentService.cancel(requireRole(), id, reason) };
  },
);

// Approves a margin below the floor (manager), so the transport order may go out.
export const truckingConsignmentApproveMargin = api(
  { expose: true, auth: true, method: "POST", path: "/trucking/consignments/:id/margin-approval" },
  async ({ id, reason }: TruckingConsignmentReasonRequest): Promise<TruckingConsignmentResponse> => {
    return { consignment: await consignmentService.approveMargin(requireRole(), id, reason) };
  },
);

interface TruckingConsignmentStampRequest {
  id: string;
  /** confirmed | pickedUp | delivered | podReceived */
  kind: string;
  /** null = now; a past time within 7 days is allowed */
  at: string | null;
}

// Sets a stamp once (any user; POD received without a POD document: a manager). Twice → 409 "Already stamped".
export const truckingConsignmentStamp = api(
  { expose: true, auth: true, method: "POST", path: "/trucking/consignments/:id/stamps/:kind" },
  async ({ id, kind, at }: TruckingConsignmentStampRequest): Promise<TruckingConsignmentResponse> => {
    return { consignment: await consignmentService.stamp(requireRole(), id, kind as StampKind, at ?? null) };
  },
);

interface TruckingConsignmentVoidStampRequest {
  id: string;
  kind: string;
  reason: string;
}

// Voids a stamp (manager) with the reason; the stamp's event is kept.
export const truckingConsignmentVoidStamp = api(
  { expose: true, auth: true, method: "POST", path: "/trucking/consignments/:id/stamps/:kind/void" },
  async ({ id, kind, reason }: TruckingConsignmentVoidStampRequest): Promise<TruckingConsignmentResponse> => {
    return { consignment: await consignmentService.voidStamp(requireRole(), id, kind as StampKind, reason) };
  },
);

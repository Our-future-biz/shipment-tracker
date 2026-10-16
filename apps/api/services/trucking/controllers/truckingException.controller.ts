import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { exceptionService } from "../services/exception.service";
import type {
  DeliveryException,
  DeliveryExceptionListItem,
  ExceptionCause,
  ExceptionDecision,
  ExceptionKind,
  FailedReason,
} from "../interfaces/avizace.interfaces";

interface TruckingExceptionResponse {
  exception: DeliveryException;
}

interface TruckingExceptionCreateRequest {
  /** The consignment */
  id: string;
  kind: ExceptionKind;
  /** Required for FAILED_DELIVERY */
  failedReason: FailedReason | null;
  cause: ExceptionCause | null;
  description: string;
  pieces: number | null;
  /** Required for WAITING_TIME */
  waitingMinutes: number | null;
  /** null = none yet (waiting time: priced from the tariff when it can be) */
  amount: number | null;
  currency: "CZK" | "EUR" | null;
  /** The LTL leg it happened on */
  legId: string | null;
}

// Records a delivery exception (any user); it blocks the consignment's ready to bill until closed.
export const truckingExceptionCreate = api(
  { expose: true, auth: true, method: "POST", path: "/trucking/consignments/:id/exceptions" },
  async ({ id, ...input }: TruckingExceptionCreateRequest): Promise<TruckingExceptionResponse> => {
    return { exception: await exceptionService.create(requireRole(), id, input) };
  },
);

interface TruckingExceptionDecideRequest {
  id: string;
  decision: ExceptionDecision;
  cause: ExceptionCause | null;
  /** null = the exception's amount */
  amount: number | null;
  currency: "CZK" | "EUR" | null;
  /** 3 to 500 characters */
  reason: string;
}

// Decides an exception once: a manager for CHARGE_CUSTOMER, CLAIM_HAULIER or ABSORB above 0.
export const truckingExceptionDecide = api(
  { expose: true, auth: true, method: "POST", path: "/trucking/exceptions/:id/decide" },
  async ({ id, ...input }: TruckingExceptionDecideRequest): Promise<TruckingExceptionResponse> => {
    return { exception: await exceptionService.decide(requireRole(), id, input) };
  },
);

interface TruckingExceptionCloseRequest {
  id: string;
  note: string;
}

// Closes a decided exception (any user).
export const truckingExceptionClose = api(
  { expose: true, auth: true, method: "POST", path: "/trucking/exceptions/:id/close" },
  async ({ id, note }: TruckingExceptionCloseRequest): Promise<TruckingExceptionResponse> => {
    return { exception: await exceptionService.close(requireRole(), id, note) };
  },
);

interface TruckingExceptionPhotoRequest {
  id: string;
  fileName: string;
  fileBase64: string;
}

// Adds a photo or PDF (10 MB, the type from the bytes); downloaded as a consignment document.
export const truckingExceptionPhoto = api(
  { expose: true, auth: true, method: "POST", path: "/trucking/exceptions/:id/photos" },
  async ({ id, fileName, fileBase64 }: TruckingExceptionPhotoRequest): Promise<TruckingExceptionResponse> => {
    return { exception: await exceptionService.addPhoto(requireRole(), id, { fileName, fileBase64 }) };
  },
);

interface TruckingExceptionListRequest {
  /** true = not closed, false = closed; left out = all */
  open?: boolean;
  kind?: ExceptionKind;
  consignmentId?: string;
}

interface TruckingExceptionListResponse {
  exceptions: DeliveryExceptionListItem[];
}

export const truckingExceptionList = api(
  { expose: true, auth: true, method: "GET", path: "/trucking/exceptions" },
  async (q: TruckingExceptionListRequest): Promise<TruckingExceptionListResponse> => {
    return { exceptions: await exceptionService.list(requireRole(), q) };
  },
);

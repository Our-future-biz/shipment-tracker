import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { haulierInvoiceService } from "../services/haulierInvoice.service";
import type { FileDownload } from "../interfaces/interfaces";
import type {
  HaulierInvoice,
  HaulierInvoiceCandidate,
  HaulierInvoiceLineInput,
  HaulierInvoiceStatus,
} from "../interfaces/haulierInvoice.interfaces";

// Haulier invoices (Phase 6 B). Any user enters and corrects them; a manager approves one with a
// difference or rejects one, with a reason. Approval is refused for everyone while the haulier
// fails the VAT bank-account check (ručení za DPH).

interface HaulierInvoiceBody {
  haulierCustomerId: string;
  invoiceNumber: string;
  /** YYYY-MM-DD */
  issueDate: string;
  dueDate: string | null;
  /** Date of taxable supply */
  duzp: string | null;
  currency: "CZK" | "EUR";
  totalNet: number;
  vatAmount: number;
  totalGross: number;
  /** "prefix-number/bank" or IBAN, as on the invoice */
  bankAccount: string;
  /** Optional copy of the invoice: PDF or photo, at most 10 MB */
  fileName?: string;
  fileBase64?: string;
  lines: HaulierInvoiceLineInput[];
}

interface HaulierInvoiceResponse {
  invoice: HaulierInvoice;
}

export const truckingHaulierInvoiceCreate = api(
  { expose: true, auth: true, method: "POST", path: "/trucking/haulier-invoices", bodyLimit: 15 * 1024 * 1024 },
  async (req: HaulierInvoiceBody): Promise<HaulierInvoiceResponse> => {
    return { invoice: await haulierInvoiceService.create(requireRole(), req) };
  },
);

interface HaulierInvoiceUpdateRequest extends HaulierInvoiceBody {
  id: string;
  /** The version read; a save on top of a newer one is refused with 409 */
  version: number;
}

// DRAFT, NEEDS_APPROVAL or BLOCKED only; the status is worked out again.
export const truckingHaulierInvoiceUpdate = api(
  { expose: true, auth: true, method: "PUT", path: "/trucking/haulier-invoices/:id", bodyLimit: 15 * 1024 * 1024 },
  async ({ id, ...req }: HaulierInvoiceUpdateRequest): Promise<HaulierInvoiceResponse> => {
    return { invoice: await haulierInvoiceService.update(requireRole(), id, req) };
  },
);

interface HaulierInvoiceIdRequest {
  id: string;
}

export const truckingHaulierInvoiceGet = api(
  { expose: true, auth: true, method: "GET", path: "/trucking/haulier-invoices/:id" },
  async ({ id }: HaulierInvoiceIdRequest): Promise<HaulierInvoiceResponse> => {
    return { invoice: await haulierInvoiceService.get(requireRole(), id) };
  },
);

interface HaulierInvoiceListRequest {
  status?: HaulierInvoiceStatus;
  haulierCustomerId?: string;
}

interface HaulierInvoiceListResponse {
  invoices: HaulierInvoice[];
}

export const truckingHaulierInvoiceList = api(
  { expose: true, auth: true, method: "GET", path: "/trucking/haulier-invoices" },
  async (req: HaulierInvoiceListRequest): Promise<HaulierInvoiceListResponse> => {
    return { invoices: await haulierInvoiceService.list(requireRole(), req) };
  },
);

interface HaulierInvoiceCandidatesRequest {
  haulierCustomerId: string;
}

interface HaulierInvoiceCandidatesResponse {
  targets: HaulierInvoiceCandidate[];
}

// The haulier's done trips and partner deliveries not yet on an approved invoice.
export const truckingHaulierInvoiceCandidates = api(
  { expose: true, auth: true, method: "GET", path: "/trucking/haulier-invoices/candidates" },
  async ({ haulierCustomerId }: HaulierInvoiceCandidatesRequest): Promise<HaulierInvoiceCandidatesResponse> => {
    return { targets: await haulierInvoiceService.candidates(requireRole(), haulierCustomerId) };
  },
);

interface HaulierInvoiceReasonRequest {
  id: string;
  reason: string;
}

// Manager; refused while BLOCKED (for everyone).
export const truckingHaulierInvoiceApprove = api(
  { expose: true, auth: true, method: "POST", path: "/trucking/haulier-invoices/:id/approve" },
  async ({ id, reason }: HaulierInvoiceReasonRequest): Promise<HaulierInvoiceResponse> => {
    return { invoice: await haulierInvoiceService.approve(requireRole(), id, reason) };
  },
);

// Manager.
export const truckingHaulierInvoiceReject = api(
  { expose: true, auth: true, method: "POST", path: "/trucking/haulier-invoices/:id/reject" },
  async ({ id, reason }: HaulierInvoiceReasonRequest): Promise<HaulierInvoiceResponse> => {
    return { invoice: await haulierInvoiceService.reject(requireRole(), id, reason) };
  },
);

interface HaulierInvoiceFileResponse {
  file: FileDownload;
}

export const truckingHaulierInvoiceFile = api(
  { expose: true, auth: true, method: "GET", path: "/trucking/haulier-invoices/:id/file" },
  async ({ id }: HaulierInvoiceIdRequest): Promise<HaulierInvoiceFileResponse> => {
    return { file: await haulierInvoiceService.file(requireRole(), id) };
  },
);

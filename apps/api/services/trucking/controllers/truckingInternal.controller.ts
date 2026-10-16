import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { internalMonthService } from "../services/internalMonth.service";
import type { FileDownload } from "../interfaces/interfaces";
import type { InternalCharge, InternalMonth } from "../interfaces/internal.interfaces";
import { requireModule } from "../../../lib/modules";

// Internal billing: what Trucking charges other departments, month by month.

interface TruckingInternalMonthListResponse {
  /** The current month and the 12 before it, newest first */
  months: InternalMonth[];
}

export const truckingInternalMonthList = api(
  { expose: true, auth: true, method: "GET", path: "/trucking/internal/months" },
  async (): Promise<TruckingInternalMonthListResponse> => {
    await requireModule("trucking_concept");
    return { months: await internalMonthService.list(requireRole()) };
  },
);

interface TruckingInternalMonthRequest {
  /** "2026-10" */
  month: string;
}

interface TruckingInternalChargesResponse {
  charges: InternalCharge[];
}

export const truckingInternalCharges = api(
  { expose: true, auth: true, method: "GET", path: "/trucking/internal/months/:month/charges" },
  async ({ month }: TruckingInternalMonthRequest): Promise<TruckingInternalChargesResponse> => {
    await requireModule("trucking_concept");
    return { charges: await internalMonthService.charges(requireRole(), month) };
  },
);

interface TruckingInternalMonthCloseResponse {
  month: InternalMonth;
}

// Closes a month (manager): one ICZ statement per receiving department; refused while a charge is not priced.
export const truckingInternalMonthClose = api(
  { expose: true, auth: true, method: "POST", path: "/trucking/internal/months/:month/close" },
  async ({ month }: TruckingInternalMonthRequest): Promise<TruckingInternalMonthCloseResponse> => {
    await requireModule("trucking_concept");
    return { month: await internalMonthService.close(requireRole(), month) };
  },
);

interface TruckingInternalStatementRequest {
  /** "ICZ20260001" */
  number: string;
}

interface TruckingFileResponse {
  file: FileDownload;
}

export const truckingInternalStatementPdf = api(
  { expose: true, auth: true, method: "GET", path: "/trucking/internal/statements/:number/pdf" },
  async ({ number }: TruckingInternalStatementRequest): Promise<TruckingFileResponse> => {
    await requireModule("trucking_concept");
    return { file: await internalMonthService.statementPdf(requireRole(), number) };
  },
);

export const truckingInternalMonthExport = api(
  { expose: true, auth: true, method: "GET", path: "/trucking/internal/months/:month/export" },
  async ({ month }: TruckingInternalMonthRequest): Promise<TruckingFileResponse> => {
    await requireModule("trucking_concept");
    return { file: await internalMonthService.exportMonth(requireRole(), month) };
  },
);

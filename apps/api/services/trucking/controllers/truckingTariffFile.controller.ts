import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { requireRole } from "../../../lib/rbac";
import { tariffFileService } from "../services/tariffFile.service";
import type { FileDownload, TariffImportResult } from "../interfaces/interfaces";

interface TruckingFileResponse {
  file: FileDownload;
}

interface TruckingTariffTemplateRequest {
  /** The tariff */
  id: string;
  /** The version to export; default the active one, else the empty template */
  versionId?: string;
}

// The tariff as the standard Excel file to fill in: a version exported (default the active one),
// or the empty template when the tariff has none. Not logged.
export const truckingTariffTemplate = api(
  { expose: true, auth: true, method: "GET", path: "/trucking/tariffs/:id/template" },
  async ({ id, versionId }: TruckingTariffTemplateRequest): Promise<TruckingFileResponse> => {
    return { file: await tariffFileService.template(getAuthData()!.companyID, id, versionId || undefined) };
  },
);

interface TruckingTariffImportRequest {
  /** The tariff */
  id: string;
  fileName: string;
  /** The .xlsx file, base64; at most 5 MB */
  fileBase64: string;
}

// Reads a filled tariff file into a new DRAFT version (manager). The draft is saved even with
// errors; its findings name the sheet, row and column of each problem. The file is kept.
export const truckingTariffImport = api(
  // 10 MiB: a 5 MB file is ~6.7 MB as base64, past Encore's 2 MiB default; bigger files up to here
  // get the plain "larger than 5 MB" answer from the service.
  { expose: true, auth: true, method: "POST", path: "/trucking/tariffs/:id/import", bodyLimit: 10 * 1024 * 1024 },
  async ({ id, fileName, fileBase64 }: TruckingTariffImportRequest): Promise<TariffImportResult> => {
    const { userID, companyID, role } = requireRole("superadmin", "admin", "manager");
    return tariffFileService.import(companyID, userID, role, id, fileName, fileBase64);
  },
);

interface TruckingTariffVersionSourceRequest {
  id: string;
}

// The Excel file a version was imported from; 404 when it was entered without one.
export const truckingTariffVersionSource = api(
  { expose: true, auth: true, method: "GET", path: "/trucking/tariff-versions/:id/source" },
  async ({ id }: TruckingTariffVersionSourceRequest): Promise<TruckingFileResponse> => {
    return { file: await tariffFileService.source(getAuthData()!.companyID, id) };
  },
);

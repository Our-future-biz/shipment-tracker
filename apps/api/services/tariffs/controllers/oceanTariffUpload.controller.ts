import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { requireRole } from "../../../lib/rbac";
import type { RailDirection } from "../interfaces/interfaces";
import { oceanTariffService, type OceanTariffVersionDetail } from "../services/oceanTariff.service";

interface OceanUploadRequest {
  /** The line's Customer Database id */
  supplierCustomerId: string & MaxLen<36>;
  /** The tariff the file is a new version of; a new tariff of the line when left out */
  tariffId?: string & MaxLen<36>;
  /** A new tariff's import / export, at least one; ignored for a new version */
  directions?: RailDirection[] & MaxLen<2>;
  fileName: string & MinLen<1> & MaxLen<255>;
  /** The .xlsx or .csv file, base64; at most 10 MB */
  fileBase64: string & MinLen<1>;
}

interface OceanUploadResponse {
  version: OceanTariffVersionDetail;
}

// Reads a shipping line's rate document into a new draft (manager): the AI reads where each part
// is, the code every rate and port. Nothing prices with it until it is approved.
export const oceanUpload = api(
  // 15 MiB: a 10 MB file is ~13.4 MB as base64.
  { expose: true, auth: true, method: "POST", path: "/tariffs/ocean/upload", bodyLimit: 15 * 1024 * 1024 },
  async (req: OceanUploadRequest): Promise<OceanUploadResponse> => {
    const actor = requireRole("superadmin", "admin", "manager");
    return { version: await oceanTariffService.upload(actor, req) };
  },
);

import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { requireRole } from "../../../lib/rbac";
import { railTariffService } from "../services/railTariff.service";
import type { RailDirection, SupplierTariffVersionDetail, TariffPortCode } from "../interfaces/interfaces";

interface RailTariffUploadRequest {
  /** The rail operator's Customer Database id */
  supplierCustomerId: string & MaxLen<36>;
  /** The tariff the file is a new version of; a new tariff of the operator when left out */
  tariffId?: string & MaxLen<36>;
  /** A new tariff's ports, at least one; ignored for a new version */
  ports?: TariffPortCode[] & MaxLen<10>;
  /** A new tariff's import, export or both; ignored for a new version */
  directions?: RailDirection[] & MaxLen<2>;
  fileName: string & MinLen<1> & MaxLen<255>;
  /** The .xlsx or .csv file, base64; at most 10 MB */
  fileBase64: string & MinLen<1>;
}

interface RailTariffUploadResponse {
  version: SupplierTariffVersionDetail;
}

// Reads a rail operator's tariff file into a new draft (manager): the AI reads the layout, the
// code every row, the checks list what looks wrong. Nothing prices with it until it is approved.
export const railTariffUpload = api(
  // 15 MiB: a 10 MB file is ~13.4 MB as base64, past Encore's 2 MiB default; bigger files get the
  // plain "larger than 10 MB" answer from the service.
  { expose: true, auth: true, method: "POST", path: "/tariffs/rail/upload", bodyLimit: 15 * 1024 * 1024 },
  async (req: RailTariffUploadRequest): Promise<RailTariffUploadResponse> => {
    const actor = requireRole("superadmin", "admin", "manager");
    return { version: await railTariffService.upload(actor, req) };
  },
);

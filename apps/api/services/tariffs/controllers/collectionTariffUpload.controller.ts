import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { requireRole } from "../../../lib/rbac";
import type { CollectionFreightMode, CollectionTariffVersionDetail } from "../interfaces/interfaces";
import { collectionTariffService } from "../services/collectionTariff.service";

interface CollectionUploadRequest {
  /** The haulier's Customer Database id */
  supplierCustomerId: string & MaxLen<36>;
  /** The tariff the file is a new version of; a new tariff of the haulier when left out */
  tariffId?: string & MaxLen<36>;
  /** A new tariff's freight, at least one; ignored for a new version */
  freightModes?: CollectionFreightMode[] & MaxLen<2>;
  fileName: string & MinLen<1> & MaxLen<255>;
  /** The .xlsx or .csv file, base64; at most 10 MB */
  fileBase64: string & MinLen<1>;
}

interface CollectionUploadResponse {
  version: CollectionTariffVersionDetail;
}

// Reads a haulier's tariff file into a new draft (manager): the AI reads where each part is, the
// code every figure, the checks list what looks wrong. Nothing prices with it until it is approved.
export const collectionUpload = api(
  // 15 MiB: a 10 MB file is ~13.4 MB as base64.
  { expose: true, auth: true, method: "POST", path: "/tariffs/collections/upload", bodyLimit: 15 * 1024 * 1024 },
  async (req: CollectionUploadRequest): Promise<CollectionUploadResponse> => {
    const actor = requireRole("superadmin", "admin", "manager");
    return { version: await collectionTariffService.upload(actor, req) };
  },
);

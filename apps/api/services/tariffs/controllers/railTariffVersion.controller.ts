import { api } from "encore.dev/api";
import type { Max, MaxLen, Min } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { requireRole } from "../../../lib/rbac";
import { railTariffService, type RailRatePage } from "../services/railTariff.service";
import type { TariffFile, RailLayout, SupplierTariffVersionDetail } from "../interfaces/interfaces";

interface VersionRequest {
  versionId: string;
}

interface RailTariffVersionResponse {
  version: SupplierTariffVersionDetail;
}

// One version with its layout, findings and the first rows of its file.
export const railTariffVersionGet = api(
  { expose: true, auth: true, method: "GET", path: "/tariffs/rail/versions/:versionId" },
  async ({ versionId }: VersionRequest): Promise<RailTariffVersionResponse> => {
    return { version: await railTariffService.version(getAuthData()!.companyID, versionId) };
  },
);

interface RailTariffRatesRequest {
  versionId: string;
  /** Words to find in the place, postcode, region or note */
  search?: string & MaxLen<200>;
  /** Only rows via this terminal */
  via?: string & MaxLen<200>;
  offset?: number & Min<0>;
  limit?: number & Min<1> & Max<200>;
}

// A page of a version's rows in sheet order.
export const railTariffRates = api(
  { expose: true, auth: true, method: "GET", path: "/tariffs/rail/versions/:versionId/rates" },
  async ({ versionId, search, via, offset, limit }: RailTariffRatesRequest): Promise<RailRatePage> => {
    return railTariffService.rates(getAuthData()!.companyID, versionId, { search: search?.trim() || undefined, via: via || undefined, offset: offset ?? 0, limit: limit ?? 50 });
  },
);

interface RailTariffLayoutRequest {
  versionId: string;
  layout: RailLayout;
}

// Reads a draft's file again with a corrected layout (manager); its rows and findings are replaced.
export const railTariffLayout = api(
  { expose: true, auth: true, method: "POST", path: "/tariffs/rail/versions/:versionId/layout" },
  async ({ versionId, layout }: RailTariffLayoutRequest): Promise<RailTariffVersionResponse> => {
    const { companyID } = requireRole("superadmin", "admin", "manager");
    return { version: await railTariffService.relayout(companyID, versionId, layout) };
  },
);

// Approves a draft without errors (manager): it prices from its start date; active versions whose
// dates it covers give way.
export const railTariffApprove = api(
  { expose: true, auth: true, method: "POST", path: "/tariffs/rail/versions/:versionId/approve" },
  async ({ versionId }: VersionRequest): Promise<RailTariffVersionResponse> => {
    const actor = requireRole("superadmin", "admin", "manager");
    return { version: await railTariffService.approve(actor, versionId) };
  },
);

interface OkResponse {
  ok: boolean;
}

// Throws a draft away (manager).
export const railTariffDiscard = api(
  { expose: true, auth: true, method: "POST", path: "/tariffs/rail/versions/:versionId/discard" },
  async ({ versionId }: VersionRequest): Promise<OkResponse> => {
    const { companyID } = requireRole("superadmin", "admin", "manager");
    await railTariffService.discard(companyID, versionId);
    return { ok: true };
  },
);

interface FileResponse {
  file: TariffFile;
}

// The file a version was read from, as uploaded.
export const railTariffSource = api(
  { expose: true, auth: true, method: "GET", path: "/tariffs/rail/versions/:versionId/source" },
  async ({ versionId }: VersionRequest): Promise<FileResponse> => {
    return { file: await railTariffService.source(getAuthData()!.companyID, versionId) };
  },
);

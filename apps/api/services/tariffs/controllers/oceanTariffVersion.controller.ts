import { api, type Query } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import type { Max, MaxLen, Min, MinLen } from "encore.dev/validate";
import { requireRole } from "../../../lib/rbac";
import type { OceanLayout, TariffFile } from "../interfaces/interfaces";
import { oceanTariffService, type OceanRatePage, type OceanTariffVersionDetail } from "../services/oceanTariff.service";

interface OceanVersionRequest {
  versionId: string;
}

interface OceanVersionResponse {
  version: OceanTariffVersionDetail;
}

// One version with its layout, findings, the first rows of its file and its port names.
export const oceanVersionGet = api(
  { expose: true, auth: true, method: "GET", path: "/tariffs/ocean/versions/:versionId" },
  async ({ versionId }: OceanVersionRequest): Promise<OceanVersionResponse> => {
    return { version: await oceanTariffService.version(getAuthData()!.companyID, versionId) };
  },
);

interface OceanRatesRequest {
  versionId: string;
  /** Words to find in the port names, the transshipment port or the port of discharge's code */
  search?: Query<string & MaxLen<200>>;
  /** One table, by its index in the layout */
  table?: Query<number & Min<0>>;
  offset?: Query<number & Min<0>>;
  limit?: Query<number & Min<1> & Max<500>>;
}

// A page of a version's rates in table and sheet order.
export const oceanVersionRates = api(
  { expose: true, auth: true, method: "GET", path: "/tariffs/ocean/versions/:versionId/rates" },
  async ({ versionId, search, table, offset, limit }: OceanRatesRequest): Promise<OceanRatePage> => {
    return oceanTariffService.rates(getAuthData()!.companyID, versionId, { search: search?.trim() || undefined, table, offset: offset ?? 0, limit: limit ?? 100 });
  },
);

interface OceanLayoutRequest {
  versionId: string;
  layout: OceanLayout;
}

// Reads a draft's file again with a corrected layout (manager).
export const oceanVersionLayout = api(
  { expose: true, auth: true, method: "POST", path: "/tariffs/ocean/versions/:versionId/layout" },
  async ({ versionId, layout }: OceanLayoutRequest): Promise<OceanVersionResponse> => {
    const { companyID } = requireRole("superadmin", "admin", "manager");
    return { version: await oceanTariffService.relayout(companyID, versionId, layout) };
  },
);

interface OceanPortSetRequest {
  versionId: string;
  side: "pol" | "pod";
  /** The port name as the version lists it */
  name: string & MinLen<1> & MaxLen<200>;
  /** The UN/LOCODE it means; null leaves its rates out */
  code: (string & MaxLen<10>) | null;
}

// Sets what a port name of a draft means (manager): a place picked, or none.
export const oceanVersionPort = api(
  { expose: true, auth: true, method: "POST", path: "/tariffs/ocean/versions/:versionId/ports" },
  async ({ versionId, ...req }: OceanPortSetRequest): Promise<OceanVersionResponse> => {
    const { companyID } = requireRole("superadmin", "admin", "manager");
    return { version: await oceanTariffService.setPort(companyID, versionId, req) };
  },
);

// Approves a draft without errors and with every port matched (manager).
export const oceanVersionApprove = api(
  { expose: true, auth: true, method: "POST", path: "/tariffs/ocean/versions/:versionId/approve" },
  async ({ versionId }: OceanVersionRequest): Promise<OceanVersionResponse> => {
    const actor = requireRole("superadmin", "admin", "manager");
    return { version: await oceanTariffService.approve(actor, versionId) };
  },
);

// Throws a draft away (manager).
export const oceanVersionDiscard = api(
  { expose: true, auth: true, method: "POST", path: "/tariffs/ocean/versions/:versionId/discard" },
  async ({ versionId }: OceanVersionRequest): Promise<void> => {
    const { companyID } = requireRole("superadmin", "admin", "manager");
    await oceanTariffService.discard(companyID, versionId);
  },
);

interface OceanSourceResponse {
  file: TariffFile;
}

// The file a version was read from, as uploaded.
export const oceanVersionSource = api(
  { expose: true, auth: true, method: "GET", path: "/tariffs/ocean/versions/:versionId/source" },
  async ({ versionId }: OceanVersionRequest): Promise<OceanSourceResponse> => {
    return { file: await oceanTariffService.source(getAuthData()!.companyID, versionId) };
  },
);

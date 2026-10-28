import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import type { MaxLen } from "encore.dev/validate";
import { requireRole } from "../../../lib/rbac";
import type { CollectionLayout, CollectionTariffVersionDetail, CollectionTry, TariffFile } from "../interfaces/interfaces";
import { collectionTariffService } from "../services/collectionTariff.service";

interface CollectionVersionRequest {
  versionId: string;
}

interface CollectionVersionResponse {
  version: CollectionTariffVersionDetail;
}

// One version with its layout, findings, the first rows of its file and its price tables.
export const collectionVersionGet = api(
  { expose: true, auth: true, method: "GET", path: "/tariffs/collections/versions/:versionId" },
  async ({ versionId }: CollectionVersionRequest): Promise<CollectionVersionResponse> => {
    return { version: await collectionTariffService.version(getAuthData()!.companyID, versionId) };
  },
);

interface CollectionLayoutRequest {
  versionId: string;
  layout: CollectionLayout;
}

// Reads a draft's file again with a corrected layout (manager).
export const collectionVersionLayout = api(
  { expose: true, auth: true, method: "POST", path: "/tariffs/collections/versions/:versionId/layout" },
  async ({ versionId, layout }: CollectionLayoutRequest): Promise<CollectionVersionResponse> => {
    const { companyID } = requireRole("superadmin", "admin", "manager");
    return { version: await collectionTariffService.relayout(companyID, versionId, layout) };
  },
);

// Approves a draft without errors (manager): it prices from its start date.
export const collectionVersionApprove = api(
  { expose: true, auth: true, method: "POST", path: "/tariffs/collections/versions/:versionId/approve" },
  async ({ versionId }: CollectionVersionRequest): Promise<CollectionVersionResponse> => {
    const actor = requireRole("superadmin", "admin", "manager");
    return { version: await collectionTariffService.approve(actor, versionId) };
  },
);

// Throws a draft away (manager).
export const collectionVersionDiscard = api(
  { expose: true, auth: true, method: "POST", path: "/tariffs/collections/versions/:versionId/discard" },
  async ({ versionId }: CollectionVersionRequest): Promise<void> => {
    const { companyID } = requireRole("superadmin", "admin", "manager");
    await collectionTariffService.discard(companyID, versionId);
  },
);

interface CollectionSourceResponse {
  file: TariffFile;
}

// The file a version was read from, as uploaded.
export const collectionVersionSource = api(
  { expose: true, auth: true, method: "GET", path: "/tariffs/collections/versions/:versionId/source" },
  async ({ versionId }: CollectionVersionRequest): Promise<CollectionSourceResponse> => {
    return { file: await collectionTariffService.source(getAuthData()!.companyID, versionId) };
  },
);

interface CollectionTryRequest {
  versionId: string;
  /** Our hub's postcode, 5 digits */
  hubPostcode: string & MaxLen<20>;
  /** The customer's postcode, 5 digits */
  customerPostcode: string & MaxLen<20>;
  weightKg: number | null;
  cbm: number | null;
  longestCm: number | null;
}

// What one version (a draft too) asks between two postcodes: for checking it before approving.
export const collectionVersionTry = api(
  { expose: true, auth: true, method: "POST", path: "/tariffs/collections/versions/:versionId/try" },
  async ({ versionId, ...route }: CollectionTryRequest): Promise<CollectionTry> => {
    return collectionTariffService.tryRoute(getAuthData()!.companyID, versionId, route);
  },
);

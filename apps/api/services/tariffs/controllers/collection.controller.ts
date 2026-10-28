import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { requireRole } from "../../../lib/rbac";
import type {
  CollectionFreightMode,
  CollectionHaulierItem,
  CollectionHub,
  CollectionLayout,
  CollectionTariffVersionDetail,
  CollectionTry,
  TariffFile,
} from "../interfaces/interfaces";
import { collectionTariffService, type CollectionHaulierDetail, type CollectionOffersResult, type CollectionTariffFields } from "../services/collectionTariff.service";

// Tariffs → Last / First Mile Collections: first / last mile hauliers' tariffs for collecting and
// delivering LCL and air consignments, our hubs, and the offers Sales asks for. Anyone signed in
// may look and ask; managers upload, correct, approve, discard and set the hubs.

const MANAGERS = ["superadmin", "admin", "manager"] as const;

interface CollectionHaulierListResponse {
  /** Customer Database companies with the First / last mile haulier role, by name */
  hauliers: CollectionHaulierItem[];
}

export const collectionHaulierList = api(
  { expose: true, auth: true, method: "GET", path: "/tariffs/collections/hauliers" },
  async (): Promise<CollectionHaulierListResponse> => {
    return { hauliers: await collectionTariffService.hauliers(getAuthData()!.companyID) };
  },
);

interface CollectionHaulierGetRequest {
  /** The haulier's Customer Database id */
  customerId: string;
}

export const collectionHaulierGet = api(
  { expose: true, auth: true, method: "GET", path: "/tariffs/collections/hauliers/:customerId" },
  async ({ customerId }: CollectionHaulierGetRequest): Promise<CollectionHaulierDetail> => {
    return collectionTariffService.haulier(getAuthData()!.companyID, customerId);
  },
);

interface CollectionUploadRequest {
  /** The haulier's Customer Database id */
  supplierCustomerId: string;
  /** The tariff the file is a new version of; a new tariff of the haulier when left out */
  tariffId?: string;
  /** A new tariff's freight, at least one; ignored for a new version */
  freightModes?: CollectionFreightMode[];
  fileName: string & MinLen<1>;
  /** The .xlsx or .csv file, base64; at most 10 MB */
  fileBase64: string & MinLen<1>;
}

interface CollectionVersionResponse {
  version: CollectionTariffVersionDetail;
}

// Reads a haulier's tariff file into a new draft (manager): the AI reads where each part is, the
// code every figure, the checks list what looks wrong. Nothing prices with it until it is approved.
export const collectionUpload = api(
  // 15 MiB: a 10 MB file is ~13.4 MB as base64.
  { expose: true, auth: true, method: "POST", path: "/tariffs/collections/upload", bodyLimit: 15 * 1024 * 1024 },
  async (req: CollectionUploadRequest): Promise<CollectionVersionResponse> => {
    const actor = requireRole(...MANAGERS);
    return { version: await collectionTariffService.upload(actor, req) };
  },
);

interface CollectionVersionRequest {
  id: string;
}

export const collectionVersionGet = api(
  { expose: true, auth: true, method: "GET", path: "/tariffs/collections/versions/:id" },
  async ({ id }: CollectionVersionRequest): Promise<CollectionVersionResponse> => {
    return { version: await collectionTariffService.version(getAuthData()!.companyID, id) };
  },
);

interface CollectionLayoutRequest {
  id: string;
  layout: CollectionLayout;
}

// Reads a draft's file again with a corrected layout (manager).
export const collectionVersionLayout = api(
  { expose: true, auth: true, method: "POST", path: "/tariffs/collections/versions/:id/layout" },
  async ({ id, layout }: CollectionLayoutRequest): Promise<CollectionVersionResponse> => {
    const { companyID } = requireRole(...MANAGERS);
    return { version: await collectionTariffService.relayout(companyID, id, layout) };
  },
);

// Approves a draft without errors (manager): it prices from its start date.
export const collectionVersionApprove = api(
  { expose: true, auth: true, method: "POST", path: "/tariffs/collections/versions/:id/approve" },
  async ({ id }: CollectionVersionRequest): Promise<CollectionVersionResponse> => {
    const actor = requireRole(...MANAGERS);
    return { version: await collectionTariffService.approve(actor, id) };
  },
);

// Throws a draft away (manager).
export const collectionVersionDiscard = api(
  { expose: true, auth: true, method: "POST", path: "/tariffs/collections/versions/:id/discard" },
  async ({ id }: CollectionVersionRequest): Promise<void> => {
    const { companyID } = requireRole(...MANAGERS);
    await collectionTariffService.discard(companyID, id);
  },
);

interface CollectionSourceResponse {
  file: TariffFile;
}

export const collectionVersionSource = api(
  { expose: true, auth: true, method: "GET", path: "/tariffs/collections/versions/:id/source" },
  async ({ id }: CollectionVersionRequest): Promise<CollectionSourceResponse> => {
    return { file: await collectionTariffService.source(getAuthData()!.companyID, id) };
  },
);

interface CollectionTryRequest {
  id: string;
  /** Our hub's postcode, 5 digits */
  hubPostcode: string;
  /** The customer's postcode, 5 digits */
  customerPostcode: string;
  weightKg: number | null;
  cbm: number | null;
  longestCm: number | null;
}

// What one version (a draft too) asks between two postcodes: for checking it before approving.
export const collectionVersionTry = api(
  { expose: true, auth: true, method: "POST", path: "/tariffs/collections/versions/:id/try" },
  async ({ id, ...route }: CollectionTryRequest): Promise<CollectionTry> => {
    return collectionTariffService.tryRoute(getAuthData()!.companyID, id, route);
  },
);

interface CollectionTariffUpdateRequest {
  id: string;
  name: string & MinLen<1> & MaxLen<200>;
  /** At least one */
  freightModes: CollectionFreightMode[];
}

// Changes a tariff's name and what it collects and delivers (manager).
export const collectionTariffUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/tariffs/collections/tariffs/:id" },
  async ({ id, ...fields }: CollectionTariffUpdateRequest): Promise<CollectionTariffFields> => {
    const { companyID } = requireRole(...MANAGERS);
    return collectionTariffService.update(companyID, id, fields);
  },
);

interface CollectionHubsResponse {
  /** One per freight mode that has one */
  hubs: CollectionHub[];
}

export const collectionHubList = api(
  { expose: true, auth: true, method: "GET", path: "/tariffs/collections/hubs" },
  async (): Promise<CollectionHubsResponse> => {
    return { hubs: await collectionTariffService.hubs(getAuthData()!.companyID) };
  },
);

interface CollectionHubSetRequest {
  freightMode: CollectionFreightMode;
  /** 5 digits, e.g. "25261" or "252 61" */
  postcode: string;
  /** ISO 3166-1 alpha-2 */
  country: string;
  label: string & MaxLen<100>;
}

// Sets our hub for a freight mode (manager): where its collections end and deliveries start.
export const collectionHubSet = api(
  { expose: true, auth: true, method: "PUT", path: "/tariffs/collections/hubs" },
  async (req: CollectionHubSetRequest): Promise<CollectionHub> => {
    const actor = requireRole(...MANAGERS);
    return collectionTariffService.setHub(actor, req);
  },
);

interface CollectionOffersRequest {
  freightMode: CollectionFreightMode;
  /** Our hub's postcode; the hub set for the freight mode when left out */
  hubPostcode?: string;
  /** The customer's postcode */
  customerPostcode: string;
  /** YYYY-MM-DD the prices must be valid on */
  date: string;
  /** Real weight in kg; null when not known */
  weightKg: number | null;
  /** m³; null when not known */
  cbm: number | null;
  /** The longest side of the longest piece, cm; null when not known */
  longestCm: number | null;
}

// Every first / last mile haulier's price for a consignment between our hub and the customer,
// cheapest first (Sales → Pricing → Tariffs available on an LCL or air quote). Nothing is written.
export const collectionOffers = api(
  { expose: true, auth: true, method: "POST", path: "/tariffs/collections/offers" },
  async (req: CollectionOffersRequest): Promise<CollectionOffersResult> => {
    return collectionTariffService.offers(getAuthData()!.companyID, req);
  },
);

import { api, type Query } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import type { Max, MaxLen, Min, MinLen } from "encore.dev/validate";
import { requireRole } from "../../../lib/rbac";
import type { OceanLayout, RailDirection, TariffFile } from "../interfaces/interfaces";
import {
  oceanTariffService,
  type OceanOffersResult,
  type OceanRatePage,
  type OceanTariffVersionDetail,
  type ShippingLineDetail,
  type ShippingLineItem,
} from "../services/oceanTariff.service";

// Tariffs → Shipping Lines: shipping lines' ocean tariffs, read from their own rate documents, and
// the offers Sales asks for on a Sea FCL quote. Anyone signed in may look and ask; managers upload,
// correct, match ports, approve and discard.

const MANAGERS = ["superadmin", "admin", "manager"] as const;

interface ShippingLineListResponse {
  /** Customer Database companies with the Shipping line role, by name */
  lines: ShippingLineItem[];
}

export const shippingLineList = api(
  { expose: true, auth: true, method: "GET", path: "/tariffs/ocean/lines" },
  async (): Promise<ShippingLineListResponse> => {
    return { lines: await oceanTariffService.lines(getAuthData()!.companyID) };
  },
);

interface ShippingLineGetRequest {
  /** The line's Customer Database id */
  customerId: string;
}

export const shippingLineGet = api(
  { expose: true, auth: true, method: "GET", path: "/tariffs/ocean/lines/:customerId" },
  async ({ customerId }: ShippingLineGetRequest): Promise<ShippingLineDetail> => {
    return oceanTariffService.line(getAuthData()!.companyID, customerId);
  },
);

interface OceanUploadRequest {
  /** The line's Customer Database id */
  supplierCustomerId: string;
  /** The tariff the file is a new version of; a new tariff of the line when left out */
  tariffId?: string;
  /** A new tariff's import / export, at least one; ignored for a new version */
  directions?: RailDirection[];
  fileName: string & MinLen<1>;
  /** The .xlsx or .csv file, base64; at most 10 MB */
  fileBase64: string & MinLen<1>;
}

interface OceanVersionResponse {
  version: OceanTariffVersionDetail;
}

// Reads a shipping line's rate document into a new draft (manager): the AI reads where each part
// is, the code every rate and port. Nothing prices with it until it is approved.
export const oceanUpload = api(
  // 15 MiB: a 10 MB file is ~13.4 MB as base64.
  { expose: true, auth: true, method: "POST", path: "/tariffs/ocean/upload", bodyLimit: 15 * 1024 * 1024 },
  async (req: OceanUploadRequest): Promise<OceanVersionResponse> => {
    const actor = requireRole(...MANAGERS);
    return { version: await oceanTariffService.upload(actor, req) };
  },
);

interface OceanVersionRequest {
  id: string;
}

export const oceanVersionGet = api(
  { expose: true, auth: true, method: "GET", path: "/tariffs/ocean/versions/:id" },
  async ({ id }: OceanVersionRequest): Promise<OceanVersionResponse> => {
    return { version: await oceanTariffService.version(getAuthData()!.companyID, id) };
  },
);

interface OceanRatesRequest {
  id: string;
  /** Words to find in the port names, the transshipment port or the port of discharge's code */
  search?: Query<string>;
  /** One table, by its index in the layout */
  table?: Query<number>;
  offset?: Query<number & Min<0>>;
  limit?: Query<number & Min<1> & Max<500>>;
}

export const oceanVersionRates = api(
  { expose: true, auth: true, method: "GET", path: "/tariffs/ocean/versions/:id/rates" },
  async ({ id, search, table, offset, limit }: OceanRatesRequest): Promise<OceanRatePage> => {
    return oceanTariffService.rates(getAuthData()!.companyID, id, { search: search?.trim() || undefined, table, offset: offset ?? 0, limit: limit ?? 100 });
  },
);

interface OceanLayoutRequest {
  id: string;
  layout: OceanLayout;
}

// Reads a draft's file again with a corrected layout (manager).
export const oceanVersionLayout = api(
  { expose: true, auth: true, method: "POST", path: "/tariffs/ocean/versions/:id/layout" },
  async ({ id, layout }: OceanLayoutRequest): Promise<OceanVersionResponse> => {
    const { companyID } = requireRole(...MANAGERS);
    return { version: await oceanTariffService.relayout(companyID, id, layout) };
  },
);

interface OceanPortSetRequest {
  id: string;
  side: "pol" | "pod";
  /** The port name as the version lists it */
  name: string & MinLen<1> & MaxLen<200>;
  /** The UN/LOCODE it means; null leaves its rates out */
  code: string | null;
}

// Sets what a port name of a draft means (manager): a place picked, or none.
export const oceanVersionPort = api(
  { expose: true, auth: true, method: "POST", path: "/tariffs/ocean/versions/:id/ports" },
  async ({ id, ...req }: OceanPortSetRequest): Promise<OceanVersionResponse> => {
    const { companyID } = requireRole(...MANAGERS);
    return { version: await oceanTariffService.setPort(companyID, id, req) };
  },
);

// Approves a draft without errors and with every port matched (manager).
export const oceanVersionApprove = api(
  { expose: true, auth: true, method: "POST", path: "/tariffs/ocean/versions/:id/approve" },
  async ({ id }: OceanVersionRequest): Promise<OceanVersionResponse> => {
    const actor = requireRole(...MANAGERS);
    return { version: await oceanTariffService.approve(actor, id) };
  },
);

// Throws a draft away (manager).
export const oceanVersionDiscard = api(
  { expose: true, auth: true, method: "POST", path: "/tariffs/ocean/versions/:id/discard" },
  async ({ id }: OceanVersionRequest): Promise<void> => {
    const { companyID } = requireRole(...MANAGERS);
    await oceanTariffService.discard(companyID, id);
  },
);

interface OceanSourceResponse {
  file: TariffFile;
}

export const oceanVersionSource = api(
  { expose: true, auth: true, method: "GET", path: "/tariffs/ocean/versions/:id/source" },
  async ({ id }: OceanVersionRequest): Promise<OceanSourceResponse> => {
    return { file: await oceanTariffService.source(getAuthData()!.companyID, id) };
  },
);

interface OceanTariffUpdateRequest {
  id: string;
  name: string & MinLen<1> & MaxLen<200>;
  /** Import, export or both */
  directions: RailDirection[];
}

interface OceanTariffUpdateResponse {
  id: string;
  name: string;
  directions: RailDirection[];
}

// Changes a tariff's name and import / export (manager).
export const oceanTariffUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/tariffs/ocean/tariffs/:id" },
  async ({ id, ...fields }: OceanTariffUpdateRequest): Promise<OceanTariffUpdateResponse> => {
    const { companyID } = requireRole(...MANAGERS);
    return oceanTariffService.update(companyID, id, fields);
  },
);

interface OceanOffersRequest {
  direction: RailDirection;
  /** The quote's port of loading, UN/LOCODE */
  polCode: string;
  /** The quote's port of discharge, UN/LOCODE */
  podCode: string;
  /** Every port of loading the tariffs have to the port of discharge, not only polCode */
  comparePols: boolean;
  /** YYYY-MM-DD the rates must be valid on */
  date: string;
  /** The quote's container lines */
  containers: { type: string; qty: number }[];
  /** Dangerous goods: IMO surcharges apply */
  dangerous: boolean;
}

// Every shipping line's way to take a Sea FCL quote's containers from port to port, with freight and
// surcharges (Sales → Pricing → Tariffs available on the Ocean freight line). Nothing is written.
export const oceanOffers = api(
  { expose: true, auth: true, method: "POST", path: "/tariffs/ocean/offers" },
  async (req: OceanOffersRequest): Promise<OceanOffersResult> => {
    return oceanTariffService.offers(getAuthData()!.companyID, req);
  },
);

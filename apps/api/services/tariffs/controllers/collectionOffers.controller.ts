import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import type { MaxLen } from "encore.dev/validate";
import type { CollectionFreightMode } from "../interfaces/interfaces";
import { collectionTariffService, type CollectionOffersResult } from "../services/collectionTariff.service";

interface CollectionOffersRequest {
  freightMode: CollectionFreightMode;
  /** Our hub's postcode; the hub set for the freight mode when left out */
  hubPostcode?: string & MaxLen<20>;
  /** The customer's postcode */
  customerPostcode: string & MaxLen<20>;
  /** YYYY-MM-DD the prices must be valid on */
  date: string & MaxLen<10>;
  /** Real weight in kg; null when not known */
  weightKg: number | null;
  /** m³; null when not known */
  cbm: number | null;
  /** The longest side of the longest piece, cm; null when not known */
  longestCm: number | null;
}

// Every first / last mile haulier's price for a consignment between our hub and the customer,
// cheapest first (Sales → Pricing → Tariffs available on an LCL or air quote). Anyone signed in
// may ask; nothing is written.
export const collectionOffers = api(
  { expose: true, auth: true, method: "POST", path: "/tariffs/collections/offers" },
  async (req: CollectionOffersRequest): Promise<CollectionOffersResult> => {
    return collectionTariffService.offers(getAuthData()!.companyID, req);
  },
);

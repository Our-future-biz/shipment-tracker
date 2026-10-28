import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import type { MaxLen } from "encore.dev/validate";
import type { OceanOfferContainer, RailDirection } from "../interfaces/interfaces";
import { oceanTariffService, type OceanOffersResult } from "../services/oceanTariff.service";

interface OceanOffersRequest {
  direction: RailDirection;
  /** The quote's port of loading, UN/LOCODE */
  polCode: string & MaxLen<10>;
  /** The quote's port of discharge, UN/LOCODE */
  podCode: string & MaxLen<10>;
  /** Every port of loading the tariffs have to the port of discharge, not only polCode */
  comparePols: boolean;
  /** YYYY-MM-DD the rates must be valid on */
  date: string & MaxLen<10>;
  /** The quote's container lines, at most 20 */
  containers: OceanOfferContainer[] & MaxLen<20>;
  /** Dangerous goods: IMO surcharges apply */
  dangerous: boolean;
}

// Every shipping line's way to take a Sea FCL quote's containers from port to port, with freight and
// surcharges (Sales → Pricing → Tariffs available on the Ocean freight line). Anyone signed in may
// ask; nothing is written.
export const oceanOffers = api(
  { expose: true, auth: true, method: "POST", path: "/tariffs/ocean/offers" },
  async (req: OceanOffersRequest): Promise<OceanOffersResult> => {
    return oceanTariffService.offers(getAuthData()!.companyID, req);
  },
);

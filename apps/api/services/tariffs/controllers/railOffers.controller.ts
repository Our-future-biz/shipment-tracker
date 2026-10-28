import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import type { MaxLen } from "encore.dev/validate";
import type { RailDirection, RailOfferContainer, TariffPortCode } from "../interfaces/interfaces";
import { railTariffService, type RailOffersResult } from "../services/railTariff.service";

interface RailOffersRequest {
  /** The sea port: the quote's port of discharge on an import, of loading on an export */
  port: TariffPortCode;
  direction: RailDirection;
  /** The inland place: a text with a postcode in it ("602 00", an address), or a town's name */
  place: string & MaxLen<300>;
  /** ISO 3166-1 alpha-2 of the inland place; CZ when left out */
  country?: string & MaxLen<10>;
  /** YYYY-MM-DD the prices must be valid on */
  date: string & MaxLen<10>;
  /** At most 20 lines */
  containers: RailOfferContainer[] & MaxLen<20>;
}

// What the rail tariffs ask for a quote's containers on its route, cheapest first (Sales →
// Pricing → Tariffs available). Anyone signed in may ask; nothing is written.
export const railOffers = api(
  { expose: true, auth: true, method: "POST", path: "/tariffs/rail/offers" },
  async (req: RailOffersRequest): Promise<RailOffersResult> => {
    return railTariffService.offers(getAuthData()!.companyID, req);
  },
);

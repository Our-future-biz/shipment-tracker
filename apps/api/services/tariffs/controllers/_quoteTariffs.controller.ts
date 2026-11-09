import { api, APIError, ErrCode } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { collectionTariffService, type CollectionOffersQuery } from "../services/collectionTariff.service";
import { oceanTariffService, type OceanOffersQuery } from "../services/oceanTariff.service";
import { railTariffService, type RailOffersQuery } from "../services/railTariff.service";
import { tariffRepository } from "../repositories/tariff.repository";
import { collectionOfferSummary, oceanOfferSummary, railOfferSummary, type QuoteOfferSummary } from "../lib/quoteOfferSummary";
import { isUuid } from "../../../lib/uuid";

// What the overnight tariff check of quotes (services/quotes) asks of the tariffs. Internal only, and
// for the company the check calls as (its auth data, as every service call the offers make needs it).

interface TariffRefsRequest {
  /** YYYY-MM-DD the tariffs must be valid on */
  date: string;
  /** The tariffRef of buying lines: "ocean:<versionId>:<rateId>", "rail:<versionId>:<rateId>", "collection:<versionId>" */
  refs: string[];
}

interface TariffRefCheck {
  ref: string;
  valid: boolean;
  /** The tariff the version belongs to; null when the version is gone */
  tariffId: string | null;
}

/** Whether each tariffRef is still valid on the day: its version, and a rail rate's own dates. */
export const _quoteTariffRefs = api(
  { expose: false, auth: true, method: "POST", path: "/internal/tariffs/quote-refs" },
  async ({ date, refs }: TariffRefsRequest): Promise<{ checks: TariffRefCheck[] }> => {
    const companyId = getAuthData()!.companyID;
    const parts = refs.map((ref) => {
      const [kind, versionId, rateId] = ref.split(":");
      return { ref, kind, versionId: versionId ?? "", rateId: rateId ?? "" };
    });
    const versionIds = [...new Set(parts.map((p) => p.versionId).filter(isUuid))];
    const railRateIds = [...new Set(parts.filter((p) => p.kind === "rail").map((p) => p.rateId).filter(isUuid))];
    const { versions, validRailRateIds } = await tariffRepository.quoteRefs(companyId, date, versionIds, railRateIds);
    const byId = new Map(versions.map((v) => [v.id, v]));
    const validRates = new Set(validRailRateIds);
    return {
      checks: parts.map(({ ref, kind, versionId, rateId }) => {
        const version = byId.get(versionId);
        return { ref, tariffId: version?.tariffId ?? null, valid: !!version?.valid && (kind !== "rail" || !rateId || validRates.has(rateId)) };
      }),
    };
  },
);

interface QuoteOffersRequest {
  ocean?: OceanOffersQuery;
  rail?: RailOffersQuery;
  collection?: CollectionOffersQuery;
}

interface QuoteOffersResponse {
  offers: QuoteOfferSummary[];
  /** Why the tariffs refused to price the route (a port without rail tariffs, a consignment out of range); null when they did not */
  refused: string | null;
}

// A route the tariffs refuse has no offers, and says why: the check then keeps the quote's lines.
async function offersOr<T>(ask: () => Promise<T[]>): Promise<{ offers: T[]; refused: string | null }> {
  try {
    return { offers: await ask(), refused: null };
  } catch (err) {
    if (err instanceof APIError && err.code === ErrCode.InvalidArgument) return { offers: [], refused: err.message };
    throw err;
  }
}

/** What the tariffs offer for one route today, in short. Exactly one of ocean, rail or collection is asked. */
export const _quoteTariffOffers = api(
  { expose: false, auth: true, method: "POST", path: "/internal/tariffs/quote-offers" },
  async ({ ocean, rail, collection }: QuoteOffersRequest): Promise<QuoteOffersResponse> => {
    const companyId = getAuthData()!.companyID;
    if (ocean) {
      const { offers, refused } = await offersOr(async () => (await oceanTariffService.offers(companyId, ocean)).offers);
      return { offers: offers.map(oceanOfferSummary), refused };
    }
    if (rail) {
      const { offers, refused } = await offersOr(async () => (await railTariffService.offers(companyId, rail)).offers);
      return { offers: offers.map(railOfferSummary), refused };
    }
    if (collection) {
      const { offers, refused } = await offersOr(async () => (await collectionTariffService.offers(companyId, collection)).offers);
      return { offers: offers.map(collectionOfferSummary), refused };
    }
    return { offers: [], refused: "no route was given" };
  },
);

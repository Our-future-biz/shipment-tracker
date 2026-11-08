import { api, APIError, ErrCode } from "encore.dev/api";
import { collectionTariffService, type CollectionOffersQuery } from "../services/collectionTariff.service";
import { oceanTariffService, type OceanOffersQuery } from "../services/oceanTariff.service";
import { railTariffService, type RailOffersQuery } from "../services/railTariff.service";
import { tariffRepository } from "../repositories/tariff.repository";
import { isUuid } from "../../../lib/uuid";

// What the overnight tariff check of quotes (services/quotes) asks of the tariffs. Internal only.

interface TariffRefsRequest {
  companyId: string;
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
  { expose: false, method: "POST", path: "/internal/tariffs/quote-refs" },
  async ({ companyId, date, refs }: TariffRefsRequest): Promise<{ checks: TariffRefCheck[] }> => {
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
  companyId: string;
  ocean?: OceanOffersQuery;
  rail?: RailOffersQuery;
  collection?: CollectionOffersQuery;
}

interface QuoteOfferSummary {
  versionId: string;
  /** Null for a collections offer, which is priced by the whole version */
  rateId: string | null;
  tariffId: string;
  supplierName: string;
  via: string;
  totals: { currency: string; amount: number }[];
}

// A route the tariffs refuse (a port without rail tariffs, a consignment out of range) has no offers.
async function offersOr<T>(ask: () => Promise<T[]>): Promise<T[]> {
  try {
    return await ask();
  } catch (err) {
    if (err instanceof APIError && err.code === ErrCode.InvalidArgument) return [];
    throw err;
  }
}

/** What the tariffs offer for one route today, in short. Exactly one of ocean, rail or collection is asked. */
export const _quoteTariffOffers = api(
  { expose: false, method: "POST", path: "/internal/tariffs/quote-offers" },
  async ({ companyId, ocean, rail, collection }: QuoteOffersRequest): Promise<{ offers: QuoteOfferSummary[] }> => {
    if (ocean) {
      const offers = await offersOr(async () => (await oceanTariffService.offers(companyId, ocean)).offers);
      return { offers: offers.map((o) => ({ versionId: o.versionId, rateId: o.rateId, tariffId: o.tariffId, supplierName: o.supplierName, via: o.via, totals: o.totals })) };
    }
    if (rail) {
      const offers = await offersOr(async () => (await railTariffService.offers(companyId, rail)).offers);
      return { offers: offers.map((o) => ({ versionId: o.versionId, rateId: o.rateId, tariffId: o.tariffId, supplierName: o.supplierName, via: o.via, totals: [{ currency: o.currency, amount: o.total }] })) };
    }
    if (collection) {
      const offers = await offersOr(async () => (await collectionTariffService.offers(companyId, collection)).offers);
      return { offers: offers.map((o) => ({ versionId: o.versionId, rateId: null, tariffId: o.tariffId, supplierName: o.supplierName, via: "", totals: [{ currency: o.currency, amount: o.total }] })) };
    }
    return { offers: [] };
  },
);

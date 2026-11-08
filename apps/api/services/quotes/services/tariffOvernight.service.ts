import { appMeta } from "encore.dev";
import { APIError, ErrCode } from "encore.dev/api";
import log from "encore.dev/log";
import { tariffs, trucking } from "~encore/clients";
import { businessDay, businessMinutes } from "../../../lib/businessDate";
import { revisionRoot } from "../../../lib/salesReference";
import { quoteCommentRepository } from "../repositories/quoteComment.repository";
import { salesQuoteRepository } from "../repositories/salesQuote.repository";
import type { SalesQuoteRecord } from "../schemas/quote.schema";
import type { ServiceLevelCode } from "../../trucking/interfaces/interfaces";
import type { QuoteRoadInput } from "../interfaces/interfaces";
import { choosePricing, rateRequestOf } from "../lib/roadPricing";
import { actionForLapsed, applyTariffActions, offersRequestOf, roadActionFor, roadPricingOf, roadRatingDay, TARIFF_CHECK_AUTHOR_ID, tariffKindOf, tariffRefsOf, type OfferSummary, type TariffAction, type TariffKind } from "../lib/tariffOvernight";

// Checks the tariffs behind every quote not yet sent, once a night (lib/tariffOvernight says what
// becomes of each). What changes is told in the quote's Sales chat, tagging its owner, which also
// puts it under the owner's bell. A quote someone saved meanwhile is left for the next night, as
// is one whose tariffs could not be read.

// A road quote is rated again as the Sales editor would, for its service level and haulier.
async function roadAction(quote: SalesQuoteRecord, data: Record<string, unknown>, today: string): Promise<TariffAction | null> {
  const pricing = roadPricingOf(data);
  if (!pricing) return null;
  const authData = { userID: TARIFF_CHECK_AUTHOR_ID, companyID: quote.companyId, role: "user" };
  const road = data.road as unknown as QuoteRoadInput;
  const level = pricing.serviceLevel as ServiceLevelCode;
  const rate = async () => {
    try {
      const request = rateRequestOf({ ...road, pickupDate: roadRatingDay(road.pickupDate, today) }, level, quote.customerId, today);
      const rated = await trucking.truckingRate(request, { authData });
      const result = rated.results.find((r) => r.serviceLevel === level);
      const choice = result ? choosePricing(result, pricing.buy?.haulierCustomerId ?? null) : null;
      return choice?.ok ? { sell: choice.sell, buy: choice.buy } : null;
    } catch (err) {
      if (err instanceof APIError && err.code === ErrCode.InvalidArgument) return null;
      throw err;
    }
  };
  const rated = await rate();
  if (rated) return roadActionFor(pricing, rated, true);
  const ids = [pricing.sell.tariffVersionId, ...(pricing.buy ? [pricing.buy.tariffVersionId] : [])];
  const { valid } = await trucking._internalTruckingVersionsValid({ ids, date: roadRatingDay(road.pickupDate, today) }, { authData });
  return roadActionFor(pricing, null, ids.every((id) => valid.includes(id)));
}

async function checkQuote(quote: SalesQuoteRecord, today: string): Promise<boolean> {
  const data = quote.data as Record<string, unknown>;
  const refs = tariffRefsOf(data);
  const { checks } = refs.length ? await tariffs._quoteTariffRefs({ companyId: quote.companyId, date: today, refs }) : { checks: [] };

  const asked = new Map<TariffKind, OfferSummary[]>();
  const offersFor = async (kind: TariffKind) => {
    if (!asked.has(kind)) {
      const request = offersRequestOf(kind, data, today);
      asked.set(kind, request ? (await tariffs._quoteTariffOffers({ companyId: quote.companyId, ...request })).offers : []);
    }
    return asked.get(kind)!;
  };

  const actions: TariffAction[] = [];
  for (const { ref, valid, tariffId } of checks) {
    actions.push(valid ? { ref, do: "keep" } : actionForLapsed(ref, data, tariffId, await offersFor(tariffKindOf(ref)!)));
  }
  const road = await roadAction(quote, data, today);
  if (road) actions.push(road);
  if (!actions.length) return false;

  const { data: next, messages, changed } = applyTariffActions(data, actions);
  if (!changed) return false;
  const saved = await salesQuoteRepository.saveDocument(quote.companyId, quote.quoteNumber, { data: next, carry: [] }, { dataVersion: quote.dataVersion });
  if (!saved) return false;
  if (messages.length) {
    await quoteCommentRepository.createForCompany(quote.companyId, {
      threadRef: revisionRoot(quote.quoteNumber.trim()),
      quoteNumber: quote.quoteNumber,
      authorId: TARIFF_CHECK_AUTHOR_ID,
      message: messages.join("\n"),
      mentionedUserIds: quote.ownerUserId ? [quote.ownerUserId] : [],
    });
  }
  return true;
}

export async function runTariffCheck(now = new Date()): Promise<void> {
  const today = businessDay(now);
  const quotes = await salesQuoteRepository.unsentWithTariffLines();
  let changed = 0;
  for (const quote of quotes) {
    try {
      if (await checkQuote(quote, today)) changed++;
    } catch (err) {
      log.error(err, "tariff check of a quote failed", { quoteNumber: quote.quoteNumber });
    }
  }
  log.info("overnight tariff check done", { quotes: quotes.length, changed });
}

// Cron jobs don't fire under `encore run`. Locally a minute timer runs the check at the same hour,
// only while the app is on then: it never catches up at start-up, so restarting the app changes no quote.
const LOCAL_FROM = 3 * 60;
const LOCAL_UNTIL = LOCAL_FROM + 5;
let started = false;
let doneFor = "";

export function startLocalTariffCheck(): void {
  if (started) return;
  started = true;
  if (appMeta().environment.cloud !== "local") return;
  setInterval(() => {
    const now = new Date();
    const minutes = businessMinutes(now);
    const today = businessDay(now);
    if (minutes < LOCAL_FROM || minutes >= LOCAL_UNTIL || doneFor === today) return;
    doneFor = today;
    void runTariffCheck(now).catch((err) => log.error(err, "overnight tariff check failed"));
  }, 60_000).unref();
}

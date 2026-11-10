import { appMeta } from "encore.dev";
import { APIError, ErrCode } from "encore.dev/api";
import log from "encore.dev/log";
import { tariffs, trucking } from "~encore/clients";
import { businessDay, businessMinutes } from "../../../lib/businessDate";
import { quoteThreadOf } from "../../../lib/salesReference";
import { quoteCommentRepository } from "../repositories/quoteComment.repository";
import { salesQuoteRepository } from "../repositories/salesQuote.repository";
import type { SalesQuoteRecord } from "../schemas/quote.schema";
import type { ServiceLevelCode } from "../../trucking/interfaces/interfaces";
import type { QuoteRoadInput } from "../interfaces/interfaces";
import { choosePricing, rateRequestOf, roadPricingOf as pricingRecordOf, truckingLines } from "../lib/roadPricing";
import {
  actionForLapsed,
  applyTariffActions,
  isTariffCheckable,
  offersRequestOf,
  roadActionFor,
  roadPricingOf,
  roadRatingDay,
  TARIFF_CHECK_AUTHOR_ID,
  TARIFF_CHECK_STATUSES,
  tariffKindOf,
  tariffRefsOf,
  unaskableReason,
  type OffersAsked,
  type RoadRated,
  type TariffAction,
  type TariffKind,
} from "../lib/tariffOvernight";
import { carryKeys } from "../utils/quoteDocument.utils";

// Checks the tariffs behind every quote not yet sent, and every revision of a Won quote (its prices
// are open), once a night (lib/tariffOvernight says what becomes of each). What changes is told in the quote's Sales chat, tagging its owner, which also
// puts it under the owner's bell. A quote someone saved meanwhile is left for the next night, as
// is one whose tariffs could not be read.

/** How many quotes are found at a time; each is read again whole only when its turn comes. */
export const TARIFF_CHECK_PAGE = 200;

/**
 * What the check's save takes from the quote as stored at that moment: every key only the server
 * writes (its status, history, owner, validity, rates), so a move made meanwhile that wrote no new
 * version of the document is kept - except the road pricing and its margin approval, which the
 * check itself moves or clears.
 */
export const TARIFF_CHECK_CARRY: readonly string[] = carryKeys().filter((key) => key !== "roadPricing" && key !== "marginApproval");

// Who the check calls the other services as: nobody in particular, of the quote's company. Every
// call it makes needs it - the tariffs and trucking answer for that company alone, and the offers
// ask the Customer Database for their suppliers.
const authOf = (quote: SalesQuoteRecord) => ({ userID: TARIFF_CHECK_AUTHOR_ID, companyID: quote.companyId, role: "user" });
type CheckAuth = ReturnType<typeof authOf>;

// A road quote is rated again as the Sales editor would, for its service level and haulier, and the
// trucking tariffs are asked whether the versions it was priced on still hold on its rating day: only
// a lapsed version holds it for approval (lib/tariffOvernight roadActionFor).
async function roadAction(quote: SalesQuoteRecord, data: Record<string, unknown>, today: string, authData: CheckAuth): Promise<TariffAction | null> {
  const pricing = roadPricingOf(data);
  if (!pricing) return null;
  const road = data.road as unknown as QuoteRoadInput;
  const level = pricing.serviceLevel as ServiceLevelCode;
  const day = roadRatingDay(road.pickupDate, today);
  const rate = async (): Promise<RoadRated | null> => {
    try {
      const rated = await trucking.truckingRate(rateRequestOf({ ...road, pickupDate: day }, level, quote.customerId, today), { authData });
      const result = rated.results.find((r) => r.serviceLevel === level);
      const choice = result ? choosePricing(result, pricing.buy?.haulierCustomerId ?? null) : null;
      if (!result || !choice?.ok) return null;
      // As a pricing in the editor records it (salesQuote.service roadPrice).
      const recorded = pricingRecordOf(result, choice.sell, choice.buy, rated.ratedAt);
      const buyLines = choice.buy ? truckingLines(choice.buy, result.serviceLevel, { name: choice.buy.ownerName ?? "", customerId: choice.buy.ownerCustomerId ?? "" }) : [];
      return { sell: recorded.sell, buy: recorded.buy, buyLines };
    } catch (err) {
      if (err instanceof APIError && err.code === ErrCode.InvalidArgument) return null;
      throw err;
    }
  };
  const ids = [pricing.sell.tariffVersionId, ...(pricing.buy ? [pricing.buy.tariffVersionId] : [])];
  const [rated, { valid }] = await Promise.all([rate(), trucking._internalTruckingVersionsValid({ ids, date: day }, { authData })]);
  return roadActionFor(pricing, rated, ids.every((id) => valid.includes(id)));
}

/** Checks one quote, read again now; whether it was changed. */
export async function checkQuote(found: { companyId: string; quoteNumber: string }, today: string): Promise<boolean> {
  // As it is now, not as it was when the run found it: it may have been sent, decided or edited since.
  // Not sent yet, or the revision of a Won quote: a Won quote that is no revision is never touched.
  const quote = await salesQuoteRepository.loadSales(found.companyId, found.quoteNumber);
  if (!quote || !isTariffCheckable(quote.status, quote.data)) return false;
  const data = quote.data as Record<string, unknown>;
  const authData = authOf(quote);
  const refs = tariffRefsOf(data);
  const { checks } = refs.length ? await tariffs._quoteTariffRefs({ date: today, refs }, { authData }) : { checks: [] };

  // Each kind of tariff is asked once for the quote's route; null when the route can't be asked.
  const asked = new Map<TariffKind, OffersAsked | null>();
  const offersFor = async (kind: TariffKind) => {
    if (!asked.has(kind)) {
      const request = offersRequestOf(kind, data, today);
      asked.set(kind, request ? await tariffs._quoteTariffOffers({ ...request }, { authData }) : null);
    }
    return asked.get(kind)!;
  };

  const actions: TariffAction[] = [];
  for (const { ref, valid, tariffId } of checks) {
    const kind = tariffKindOf(ref)!;
    actions.push(valid ? { ref, do: "keep" } : actionForLapsed(ref, data, tariffId, await offersFor(kind), unaskableReason(kind)));
  }
  const road = await roadAction(quote, data, today, authData);
  if (road) actions.push(road);
  if (!actions.length) return false;

  const { data: next, messages, changed } = applyTariffActions(data, actions);
  if (!changed) return false;
  // Written only while the quote is the version read above and its prices are still open.
  const saved = await salesQuoteRepository.saveDocument(
    quote.companyId,
    quote.quoteNumber,
    { data: next, carry: [...TARIFF_CHECK_CARRY] },
    { dataVersion: quote.dataVersion },
    { statuses: TARIFF_CHECK_STATUSES, wonRevision: true },
  );
  if (!saved) return false;
  if (messages.length) {
    await quoteCommentRepository.createForCompany(quote.companyId, {
      threadRef: quoteThreadOf(quote.quoteNumber),
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
  let afterId: string | null = null;
  let found = 0;
  let changed = 0;
  for (;;) {
    const page: { id: string; companyId: string; quoteNumber: string }[] = await salesQuoteRepository.unsentWithTariffLines(afterId, TARIFF_CHECK_PAGE);
    for (const quote of page) {
      found++;
      try {
        if (await checkQuote(quote, today)) changed++;
      } catch (err) {
        log.error(err, "tariff check of a quote failed", { quoteNumber: quote.quoteNumber });
      }
    }
    if (page.length < TARIFF_CHECK_PAGE) break;
    afterId = page[page.length - 1]!.id;
  }
  log.info("overnight tariff check done", { quotes: found, changed });
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

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
import {
  actionForLapsed,
  applyTariffActions,
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
  type TariffAction,
  type TariffKind,
} from "../lib/tariffOvernight";
import { carryKeys } from "../utils/quoteDocument.utils";

// Checks the tariffs behind every quote not yet sent, once a night (lib/tariffOvernight says what
// becomes of each). What changes is told in the quote's Sales chat, tagging its owner, which also
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

// A road quote is rated again as the Sales editor would, for its service level and haulier.
async function roadAction(quote: SalesQuoteRecord, data: Record<string, unknown>, today: string, authData: CheckAuth): Promise<TariffAction | null> {
  const pricing = roadPricingOf(data);
  if (!pricing) return null;
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

/** Checks one quote, read again now; whether it was changed. */
export async function checkQuote(found: { companyId: string; quoteNumber: string }, today: string): Promise<boolean> {
  // As it is now, not as it was when the run found it: it may have been sent, decided or edited since.
  const quote = await salesQuoteRepository.loadSales(found.companyId, found.quoteNumber);
  if (!quote || !TARIFF_CHECK_STATUSES.includes(quote.status)) return false;
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
  // Written only while the quote is the version read above and still not sent.
  const saved = await salesQuoteRepository.saveDocument(
    quote.companyId,
    quote.quoteNumber,
    { data: next, carry: [...TARIFF_CHECK_CARRY] },
    { dataVersion: quote.dataVersion },
    { statuses: TARIFF_CHECK_STATUSES },
  );
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

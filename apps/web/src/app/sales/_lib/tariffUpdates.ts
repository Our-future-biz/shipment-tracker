import { fmtMoney } from "@/lib/money";
import type { CostLine, SalesQuoteData, TariffUpdate } from "./types";

// A new rate the overnight tariff check found for a lapsed tariff (the server's lib/tariffOvernight).
// It waits for the user to approve it knowingly in Pricing. A rate whose lines are gone - approved,
// another tariff picked, the lines removed - no longer waits. A road rate is settled by pricing the
// road transport again, which also takes it off the quote.

const isRoadLine = (line: CostLine) => !!line.tariffRef?.startsWith("trucking:");

type Quote = Pick<SalesQuoteData, "tariffUpdates" | "buyingLines" | "sellingLines">;

/** The new rates still waiting for approval. */
export function waitingTariffUpdates(data: Quote): TariffUpdate[] {
  const lines = [...(data.buyingLines ?? []), ...(data.sellingLines ?? [])];
  const refs = new Set(lines.map((l) => l.tariffRef));
  return (data.tariffUpdates ?? []).filter((u) => (u.kind === "road" ? lines.some(isRoadLine) : refs.has(u.oldRef)));
}

/** The indexes of the buying lines a waiting rate is for. */
export function linesWaitingForRate(data: Quote): number[] {
  const waiting = waitingTariffUpdates(data);
  const refs = new Set(waiting.map((u) => u.oldRef));
  const road = waiting.some((u) => u.kind === "road");
  return (data.buyingLines ?? []).flatMap((l, i) => ((l.tariffRef && refs.has(l.tariffRef)) || (road && isRoadLine(l)) ? [i] : []));
}

const amounts = (totals: TariffUpdate["now"]) => totals.map((t) => fmtMoney(t.amount, t.currency)).join(" + ");

/** "Was USD 1,200.00, now USD 1,350.00." - on a road quote, for selling and buying. */
export function tariffUpdateChange(update: TariffUpdate): string {
  if (update.kind !== "road") return `Was ${amounts(update.was)}, now ${amounts(update.now)}.`;
  const buying = update.buyWas && update.buyNow ? ` Buying was ${amounts(update.buyWas)}, now ${amounts(update.buyNow)}.` : "";
  return `Selling was ${amounts(update.was)}, now ${amounts(update.now)}.${buying}`;
}

/** What approving a rate does to the selling price, in words. */
export const tariffUpdateSelling = (update: TariffUpdate) =>
  update.kind === "road" ? "Approving changes the selling price too." : "The selling price has not changed.";

/** Whether an offer is the new rate that waits. */
export const isOfferOfUpdate = (offer: { versionId: string; rateId?: string }, update: TariffUpdate) =>
  offer.versionId === update.newVersionId && (update.newRateId === null || offer.rateId === update.newRateId);

/** The road input to price an approved rate with: a pickup date already past would price the old day's rate. */
export function roadForToday<T extends { pickupDate?: string | null }>(road: T, today: string): T {
  return road.pickupDate && road.pickupDate < today ? { ...road, pickupDate: null } : road;
}

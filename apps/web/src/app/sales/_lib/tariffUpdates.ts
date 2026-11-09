import { containerType } from "@/lib/cargo";
import { fmtMoney } from "@/lib/money";
import type { TariffPick } from "./tariffQuote";
import type { CostLine, SalesQuoteData, TariffUpdate } from "./types";

// A new rate the overnight tariff check found for a lapsed tariff (the server's lib/tariffOvernight).
// It waits for the user to approve it knowingly in Pricing. A rate whose buying lines are gone -
// approved, another tariff picked, the lines removed - no longer waits; a selling line copied from
// one may keep the old tag, and does not hold it. A road rate is settled by pricing the road transport
// again, which also takes it off the quote.

const isRoadLine = (line: CostLine) => !!line.tariffRef?.startsWith("trucking:");

type Quote = Pick<SalesQuoteData, "tariffUpdates" | "buyingLines" | "sellingLines">;

/** The new rates still waiting for approval. Twin of the server's tariffUpdateGateMessage. */
export function waitingTariffUpdates(data: Quote): TariffUpdate[] {
  const buyingRefs = new Set((data.buyingLines ?? []).map((l) => l.tariffRef));
  const hasRoadLine = [...(data.buyingLines ?? []), ...(data.sellingLines ?? [])].some(isRoadLine);
  return (data.tariffUpdates ?? []).filter((u) => (u.kind === "road" ? hasRoadLine : buyingRefs.has(u.oldRef)));
}

/** The indexes of the buying lines a waiting rate is for. */
export function linesWaitingForRate(data: Quote): number[] {
  const waiting = waitingTariffUpdates(data);
  const refs = new Set(waiting.map((u) => u.oldRef));
  const road = waiting.some((u) => u.kind === "road");
  return (data.buyingLines ?? []).flatMap((l, i) => ((l.tariffRef && refs.has(l.tariffRef)) || (road && isRoadLine(l)) ? [i] : []));
}

/** Why the quote can't be sent while a new rate waits, in the server's words; null when none does. */
export function tariffUpdateBlock(data: Quote): string | null {
  const waiting = waitingTariffUpdates(data).length;
  if (!waiting) return null;
  return `${waiting === 1 ? "A tariff has" : `${waiting} tariffs have`} a new rate — approve it in Pricing, or pick another tariff, before the quote goes out`;
}

/** The rates still waiting once `update` is approved: it leaves the quote in the same change as its lines. */
export function withoutTariffUpdate(data: Quote, update: TariffUpdate): TariffUpdate[] | undefined {
  const left = (data.tariffUpdates ?? []).filter((u) => u.oldRef !== update.oldRef);
  return left.length ? left : undefined;
}

const amounts = (totals: TariffUpdate["now"]) => totals.map((t) => fmtMoney(t.amount, t.currency)).join(" + ");

/** "Was USD 1,200.00, now USD 1,350.00." - on a road quote, for selling and buying. */
export function tariffUpdateChange(update: TariffUpdate): string {
  if (update.kind !== "road") return `Was ${amounts(update.was)}, now ${amounts(update.now)}.`;
  const buying = update.buyWas && update.buyNow ? ` Buying was ${amounts(update.buyWas)}, now ${amounts(update.buyNow)}.` : "";
  return `Selling was ${amounts(update.was)}, now ${amounts(update.now)}.${buying}`;
}

/**
 * What approving a rate does to the selling price, in words. A road rate sets the selling too; a
 * quote in the FCL layout sells each charge at its buying plus its own profit, so its selling follows
 * the new buying; any other quote keeps its selling lines as they are.
 */
export const tariffUpdateSelling = (update: TariffUpdate, fclLayout: boolean) =>
  update.kind === "road"
    ? "Approving changes the selling price too."
    : fclLayout
      ? "The selling price has not changed yet: approving moves it with the new buying, each charge keeping its profit."
      : "The selling price has not changed.";

/** Whether an offer is the new rate that waits. */
export const isOfferOfUpdate = (offer: { versionId: string; rateId?: string }, update: TariffUpdate) =>
  offer.versionId === update.newVersionId && (update.newRateId === null || offer.rateId === update.newRateId);

/** The road input to price an approved rate with: a pickup date already past would price the old day's rate. */
export function roadForToday<T extends { pickupDate?: string | null }>(road: T, today: string): T {
  return road.pickupDate && road.pickupDate < today ? { ...road, pickupDate: null } : road;
}

/**
 * The buying line a new rate is approved on: the first of its freight lines (the line its tariff is
 * picked on), else the first line priced from the old rate; -1 when none is left.
 */
export function approvalLineOf(lines: readonly CostLine[], update: TariffUpdate, isFreight: (line: CostLine) => boolean): number {
  const freight = lines.findIndex((l) => l.tariffRef === update.oldRef && isFreight(l));
  return freight >= 0 ? freight : lines.findIndex((l) => l.tariffRef === update.oldRef);
}

// The charge a line is, and the containers it is for.
const chargeKey = (line: CostLine) => `${line.chargeCode || line.type}|${containerType(line.containerType)}`;

/**
 * The lines an approved rate makes, each with what the user set on the charge it replaces: the old
 * line of the same charge and container type (of the same description first) gives its profit, its
 * "All in" tick and its pairing with a selling line. A charge the old rate did not have starts with
 * none of them, and gives up a pairing another line kept.
 */
export function keepChargeSettings(old: readonly CostLine[], priced: readonly CostLine[]): CostLine[] {
  const unused = [...old];
  const take = (line: CostLine) => {
    let i = unused.findIndex((o) => chargeKey(o) === chargeKey(line) && (o.description ?? "") === (line.description ?? ""));
    if (i < 0) i = unused.findIndex((o) => chargeKey(o) === chargeKey(line));
    return i < 0 ? undefined : unused.splice(i, 1)[0];
  };
  const matched = priced.map((line) => ({ line, from: take(line) }));
  const kept = new Set(matched.flatMap(({ from }) => (from?.pairId ? [from.pairId] : [])));
  return matched.map(({ line, from }) => {
    const next: CostLine = { ...line };
    delete next.chargeProfit;
    delete next.inAllIn;
    if (from) {
      if (from.chargeProfit) next.chargeProfit = from.chargeProfit;
      if (from.inAllIn !== undefined) next.inAllIn = from.inAllIn;
      if (from.pairId) next.pairId = from.pairId;
      else delete next.pairId;
    } else if (next.pairId && kept.has(next.pairId)) {
      delete next.pairId;
    }
    return next;
  });
}

/** A pick of an approved rate, its lines keeping what the user set on the charges (keepChargeSettings). */
export function withApprovedRate(pick: TariffPick, old: readonly CostLine[]): TariffPick {
  const offered = pick.lines.slice(pick.at, pick.at + pick.count);
  return { ...pick, lines: [...pick.lines.slice(0, pick.at), ...keepChargeSettings(old, offered), ...pick.lines.slice(pick.at + pick.count)] };
}

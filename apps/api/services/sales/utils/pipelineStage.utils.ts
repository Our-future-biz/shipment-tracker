import { businessDay } from "../../../lib/businessDate";
import type { PipelineBoard, PipelineCard, PipelineStage } from "../interfaces/interfaces";

// THE ONE DEFINITION of the customer pipeline: where a customer stands, and what the board shows.
// Pure - the facts are passed in - so every rule is covered by a unit test. Nothing of it is
// stored: a stage follows from the customer's quotes and shipments, so it cannot go stale.

export const PIPELINE_STAGES: readonly PipelineStage[] = ["prospect", "proposal", "won"];

/** A customer as the customers service lists it for the pipeline. */
export interface PipelineCustomer {
  id: string;
  companyName: string;
  /** Active / Prospect / Inactive, as set by hand on the customer. */
  status: string;
  label: string;
  salesOwner: string;
  createdAt: string;
}

/** What the quotes service tells about the company's customers. */
export interface CustomerQuoteFeed {
  customers: {
    customerId: string;
    hasSentQuote: boolean;
    sentQuotes: number;
    firstSentAt: string | null;
    firstSentAtKnown: boolean;
    sentQuotesWithoutDate: number;
    lastActivityAt: string;
  }[];
  openQuotes: {
    customerId: string;
    quoteNumber: string;
    status: string;
    validUntil: string | null;
    currency: string;
    fx: unknown;
    rates: unknown;
    sellingLines: unknown;
  }[];
  quotesWithoutCustomer: number;
}

/** What the shipments service tells about the company's customers. */
export interface CustomerShipmentFeed {
  customers: {
    customerId: string;
    firstShipmentAt: string;
    firstShipmentId: string;
    firstJobNumber: string;
    lastShipmentAt: string;
    shipmentCount: number;
  }[];
  shipmentsWithoutCustomer: number;
}

/** Which part of the board is asked for. */
export interface BoardView {
  /** The Won column holds the customers whose first shipment was created on this day (YYYY-MM-DD) or later; null = all of them. */
  wonSince: string | null;
  /** How many cards a column carries at most. */
  limit: number;
  /** Only this column's cards, from `offset` on: the way to fetch more of a column. */
  stage?: PipelineStage;
  offset?: number;
}

/**
 * Where a customer stands, or null for one the pipeline does not show.
 * - Won: the customer ordered - a shipment exists for it. A shipment beats everything, also the
 *   status somebody set on the customer.
 * - Otherwise a customer set to Inactive is not shown.
 * - Proposal: a quote for the customer went out.
 * - Prospect: the customer's status says so. An Active customer with neither a sent quote nor a
 *   shipment is on no stage.
 */
export function pipelineStage(customer: { status: string; hasSentQuote: boolean; firstShipmentAt: string | null }): PipelineStage | null {
  if (customer.firstShipmentAt !== null) return "won";
  if (customer.status === "Inactive") return null;
  if (customer.hasSentQuote) return "proposal";
  return customer.status === "Prospect" ? "prospect" : null;
}

// ISO strings of one form - what toISOString() writes - compare as the moments they name.
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// The later of the moments that exist.
function latest(...moments: (string | null | undefined)[]): string | null {
  let last: string | null = null;
  for (const moment of moments) {
    if (moment && (last === null || moment > last)) last = moment;
  }
  return last;
}

/**
 * The board: every customer of the company placed by what its quotes and shipments say, joined
 * by customer id. A customer whose first shipment is older than the period asked for is not on
 * the board - it is Won, just not in that period - so the period changes the Won column alone.
 * Prospects come by when the customer was created, the other columns by last activity, the
 * newest first. The totals cover every customer of a column; the cards are cut to the view.
 * What cannot be placed is counted: quotes and shipments that name no customer record (their
 * services count those), and sent quotes and shipments whose customer is not among `customers`
 * any more.
 */
export function buildBoard(
  customers: PipelineCustomer[],
  quoteFacts: CustomerQuoteFeed,
  shipmentFacts: CustomerShipmentFeed,
  view: BoardView,
): PipelineBoard {
  const quotesOf = new Map(quoteFacts.customers.map((facts) => [facts.customerId, facts]));
  const shipmentsOf = new Map(shipmentFacts.customers.map((facts) => [facts.customerId, facts]));
  const openQuotesOf = new Map<string, PipelineCard["openQuotes"]>();
  for (const { customerId, ...quote } of quoteFacts.openQuotes) {
    openQuotesOf.set(customerId, [...(openQuotesOf.get(customerId) ?? []), quote]);
  }

  // The newest customer first: the order of the Prospect column, and what settles equal activity
  // in the other two. The id settles the rest, so a column is cut at the same place every time.
  const newestFirst = [...customers].sort((a, b) => compare(b.createdAt, a.createdAt) || compare(a.id, b.id));
  const columns: Record<PipelineStage, PipelineCard[]> = { prospect: [], proposal: [], won: [] };
  let sentQuotesWithoutDate = 0;
  for (const customer of newestFirst) {
    const quotes = quotesOf.get(customer.id);
    const shipments = shipmentsOf.get(customer.id);
    const stage = pipelineStage({
      status: customer.status,
      hasSentQuote: quotes?.hasSentQuote ?? false,
      firstShipmentAt: shipments?.firstShipmentAt ?? null,
    });
    if (stage === null) continue;
    // A customer with a shipment is Won; the period counts by the business day its first one was created on.
    if (shipments && view.wonSince !== null && businessDay(new Date(shipments.firstShipmentAt)) < view.wonSince) continue;
    // Only under Proposal does the board show when the first quote went out.
    if (stage === "proposal") sentQuotesWithoutDate += quotes?.sentQuotesWithoutDate ?? 0;
    columns[stage].push({
      customerId: customer.id,
      companyName: customer.companyName,
      label: customer.label,
      salesOwner: customer.salesOwner,
      stage,
      firstQuoteSentAt: quotes?.firstSentAt ?? null,
      firstQuoteSentAtKnown: quotes?.firstSentAtKnown ?? false,
      firstShipmentAt: shipments?.firstShipmentAt ?? null,
      firstShipmentId: shipments?.firstShipmentId ?? null,
      firstJobNumber: shipments?.firstJobNumber ?? null,
      shipmentCount: shipments?.shipmentCount ?? 0,
      lastActivityAt: latest(quotes?.lastActivityAt, shipments?.lastShipmentAt),
      openQuotes: openQuotesOf.get(customer.id) ?? [],
    });
  }
  // The sort keeps the order above among cards of equal activity.
  const byLastActivity = (a: PipelineCard, b: PipelineCard) => compare(b.lastActivityAt ?? "", a.lastActivityAt ?? "");
  columns.proposal.sort(byLastActivity);
  columns.won.sort(byLastActivity);

  // A customer deleted from the Customer Database keeps its id on its quotes and shipments: the
  // other services cannot know, so what still names it is counted here.
  const known = new Set(customers.map((customer) => customer.id));
  const quotesOfMissingCustomers = quoteFacts.customers
    .filter((facts) => !known.has(facts.customerId))
    .reduce((sum, facts) => sum + facts.sentQuotes, 0);
  const shipmentsOfMissingCustomers = shipmentFacts.customers
    .filter((facts) => !known.has(facts.customerId))
    .reduce((sum, facts) => sum + facts.shipmentCount, 0);

  // A column that was not asked for carries no cards; the one asked for starts at the offset.
  const cut = (stage: PipelineStage): PipelineCard[] => {
    if (view.stage && view.stage !== stage) return [];
    const from = view.stage ? (view.offset ?? 0) : 0;
    return columns[stage].slice(from, from + view.limit);
  };
  return {
    wonSince: view.wonSince,
    totals: { prospect: columns.prospect.length, proposal: columns.proposal.length, won: columns.won.length },
    cards: { prospect: cut("prospect"), proposal: cut("proposal"), won: cut("won") },
    notes: {
      shipmentsWithoutCustomer: shipmentFacts.shipmentsWithoutCustomer + shipmentsOfMissingCustomers,
      quotesWithoutCustomer: quoteFacts.quotesWithoutCustomer,
      quotesOfMissingCustomers,
      sentQuotesWithoutDate,
    },
  };
}

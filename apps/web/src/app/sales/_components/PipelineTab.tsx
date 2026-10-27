"use client";

import { Fragment, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";
import { Alert, Button, Select, Spin, Tooltip } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { CustomerAccountTypeBadge } from "@/app/customers/_components/CustomerAccountTypeBadge";
import { asData, businessDay, businessToday, computeTotals, sellingSum, type LivePricing } from "@/app/sales/_lib/salesQuote";
import { LINK_CLASS } from "@/components/linkClass";
import { Pill } from "@/components/Pill";
import { CountChip, SectionCard } from "@/components/SectionCard";
import { useCurrentExchangeRates } from "@/hooks/useExchangeRates";
import { useSalesPipeline, type PipelineBoard, type PipelineCard, type PipelineStage } from "@/hooks/useSalesPipeline";
import { apiErrorMessage } from "@/lib/api";
import { formatDate } from "@/lib/date";
import type { ExchangeRates } from "@/lib/exchangeRates";
import { useToast } from "@/lib/toast";
import { SALES_PAGES } from "../_lib/tabs";
import { CustomerLink } from "./CustomerLink";
import { ExchangeRatesError } from "./ExchangeRatesError";
import { SalesPage } from "./SalesPage";
import { ToolbarButton } from "./ToolbarButton";

// The columns of the board: the three stages a customer can stand on. Where a customer stands is
// the server's answer; this is only how its column is titled and what the page says the stage means.
const COLUMNS: { stage: PipelineStage; name: string; meaning: string }[] = [
  { stage: "prospect", name: "Prospect", meaning: "Interested, but no quotation has been sent yet." },
  { stage: "proposal", name: "Proposal", meaning: "A quotation has been sent." },
  { stage: "won", name: "Won", meaning: "The customer has placed their first shipment order." },
];

// The line under the page's title: what each stage means.
const STAGE_MEANINGS = COLUMNS.map(({ stage, name, meaning }, index) => (
  <Fragment key={stage}>
    {index > 0 && " · "}
    <span className="font-semibold text-slate-700">{name}</span>: {meaning}
  </Fragment>
));

// The periods of the Won column: the customers whose first shipment was created in it.
const PERIOD_LABELS = {
  "30": "Last 30 days",
  "90": "Last 90 days",
  "180": "Last 180 days",
  year: "This year",
  all: "All time",
} as const;
type Period = keyof typeof PERIOD_LABELS;
// In the order the select offers them.
const PERIODS: Period[] = ["30", "90", "180", "year", "all"];
const PERIOD_OPTIONS = PERIODS.map((value) => ({ value, label: PERIOD_LABELS[value] }));

// Ties the visible "Won in" to the select it names.
const PERIOD_SELECT_ID = "pipeline-won-period";

// The first day of a period (YYYY-MM-DD), counted on the company's calendar as the server counts
// the day a shipment was created on; undefined for all time.
function periodStart(period: Period): string | undefined {
  if (period === "all") return undefined;
  const today = dayjs(businessToday());
  const start = period === "year" ? today.startOf("year") : today.subtract(Number(period), "day");
  return start.format("YYYY-MM-DD");
}

// "06.10.2026" for the day of a moment on the company's calendar.
const dayOf = (at: string) => formatDate(businessDay(new Date(at)));

// "1 shipment", "14 shipments".
const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

// What the board cannot place, as the sentence under it; empty when there is nothing to say. Such
// quotes and shipments name no customer record, so no customer can be counted for them - they are
// reported, never guessed from a name.
function notesLine(notes: PipelineBoard["notes"]): string {
  const unlinkedQuotes = notes.quotesWithoutCustomer + notes.quotesOfMissingCustomers;
  const unlinked = [
    notes.shipmentsWithoutCustomer > 0 && plural(notes.shipmentsWithoutCustomer, "shipment", "shipments"),
    unlinkedQuotes > 0 && plural(unlinkedQuotes, "sent quote", "sent quotes"),
  ].filter((part) => part !== false);
  const one = notes.shipmentsWithoutCustomer + unlinkedQuotes === 1;
  const undated = notes.sentQuotesWithoutDate;
  return [
    unlinked.length > 0 && `${unlinked.join(" and ")} ${one ? "has no linked customer and is not counted" : "have no linked customer and are not counted"}`,
    undated > 0 &&
      `${plural(undated, "sent quote", "sent quotes")} ${undated === 1 ? "has no sent date and is shown by its creation date" : "have no sent date and are shown by their creation date"}`,
  ]
    .filter((part) => part !== false)
    .join(" - ");
}

// What put the customer on its stage, as the first line of the card's facts.
function stageFact(card: PipelineCard): ReactNode {
  if (card.stage === "prospect") return "No quote sent yet";
  if (card.stage === "proposal") {
    if (!card.firstQuoteSentAt) return null;
    // A quote that went out without anybody recording when counts from the day it was created.
    return card.firstQuoteSentAtKnown ? `First quote sent ${dayOf(card.firstQuoteSentAt)}` : `First quote created ${dayOf(card.firstQuoteSentAt)} - sent date not recorded`;
  }
  if (!card.firstShipmentAt) return null;
  // The job number leads to the shipment; a shipment that has none yet is only dated.
  const job = card.firstJobNumber && card.firstShipmentId && (
    <Link
      href={`/shipments/${card.firstShipmentId}`}
      // The card around it opens the customer: the click must not open that as well.
      onClick={(e) => e.stopPropagation()}
      className={`font-mono font-semibold ${LINK_CLASS}`}
    >
      {card.firstJobNumber}
    </Link>
  );
  return (
    <>
      First shipment {job} on {dayOf(card.firstShipmentAt)}
    </>
  );
}

interface CustomerCardProps {
  card: PipelineCard;
  sheet: ExchangeRates;
  live: LivePricing;
}

// One customer on the board. The whole card opens the customer's page, as a row of the Customer
// Database does; the name is the real link, for the keyboard and for a new tab.
function CustomerCard({ card, sheet, live }: CustomerCardProps) {
  const router = useRouter();
  // The value of the open quotes, worked out where every other screen works it out: each quote's
  // lines converted into the quote's currency at its stored ČNB rates (a draft at today's),
  // then one sum per currency - never one across currencies.
  const open = sellingSum(
    card.openQuotes.map((quote) =>
      computeTotals(
        asData({ quoteStatus: quote.status, currency: quote.currency, fx: quote.fx, rates: quote.rates, sellingLines: quote.sellingLines }),
        sheet,
        live,
      ),
    ),
  );
  const fact = stageFact(card);
  const openQuotes = card.openQuotes.length ? plural(card.openQuotes.length, "open quote", "open quotes") : "No open quotes";
  const won = card.stage === "won";

  return (
    <li
      onClick={() => router.push(`/customers/${card.customerId}`)}
      className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 cursor-pointer transition-colors hover:border-indigo-300 hover:bg-indigo-50/40"
    >
      <div className="flex items-center gap-2.5">
        <span aria-hidden className="w-7 h-7 shrink-0 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center text-[11px] font-semibold text-slate-400">
          {card.companyName.slice(0, 2).toUpperCase()}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="m-0 min-w-0 truncate text-[13px]" title={card.companyName}>
              <CustomerLink customerId={card.customerId} name={card.companyName} />
            </h4>
            {card.label && <CustomerAccountTypeBadge label={card.label} />}
          </div>
          <div className="truncate text-xs text-slate-500 tabular-nums">
            {card.salesOwner || "No sales owner"} · {card.lastActivityAt ? `Last activity ${dayOf(card.lastActivityAt)}` : "No activity yet"}
          </div>
        </div>
      </div>

      {/* Always in this order, so the eye can run down a column: what put the customer on the
          stage, then what is open with it. */}
      <div className="mt-2 pt-2 border-t border-slate-100 flex flex-col gap-0.5 text-xs tabular-nums">
        {fact && <div className="text-slate-500">{fact}</div>}
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
          <span className={won || card.openQuotes.length ? "text-slate-600" : "text-slate-500"}>
            {won ? `${plural(card.shipmentCount, "shipment", "shipments")} · ${openQuotes}` : openQuotes}
          </span>
          {(open.text || open.incomplete) && (
            <span className="ml-auto inline-flex flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5">
              {open.text && <span className="font-semibold text-slate-900">{open.text}</span>}
              {open.incomplete && (
                <Tooltip title="Some of these quotes have lines that cannot be converted. Those lines are not in this sum.">
                  <Pill tone="amber">Incomplete</Pill>
                </Tooltip>
              )}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

interface StageColumnProps {
  title: string;
  cards: PipelineCard[];
  // How many customers the column holds in all, whatever part of them `cards` carries.
  total: number;
  // The cards on screen are those of the period before; the ones asked for are on their way.
  waiting: boolean;
  sheet: ExchangeRates;
  live: LivePricing;
  // "Show more": whether this column's next cards are on their way, and whether any may be asked for now.
  loadingMore: boolean;
  canShowMore: boolean;
  onShowMore: () => void;
}

// One column of the board: the customers that stand on a stage, in the order the server gives them.
function StageColumn({ title, cards, total, waiting, sheet, live, loadingMore, canShowMore, onShowMore }: StageColumnProps) {
  return (
    <SectionCard
      title={title}
      bodyClassName="p-0"
      extra={<CountChip count={waiting ? "…" : <span title={plural(total, "customer", "customers")}>{total.toLocaleString("en-US")}</span>} />}
    >
      <Spin spinning={waiting}>
        <ul className="list-none m-0 p-3 flex flex-col gap-2">
          {cards.length === 0 && <li className="text-xs text-slate-400">No customers</li>}
          {cards.map((card) => (
            <CustomerCard key={card.customerId} card={card} sheet={sheet} live={live} />
          ))}
        </ul>
      </Spin>

      {/* The column holds more customers than cards: the count above is of all of them. */}
      {cards.length < total && !waiting && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t border-slate-100">
          <span className="text-xs text-slate-500 tabular-nums">
            Showing {cards.length.toLocaleString("en-US")} of {total.toLocaleString("en-US")}
          </span>
          <ToolbarButton icon={loadingMore && <LoadingOutlined />} disabled={!canShowMore} onClick={onShowMore}>
            Show more
          </ToolbarButton>
        </div>
      )}
    </SectionCard>
  );
}

// The customer pipeline: every customer of the company in one of three columns - Prospect,
// Proposal, Won - by what its quotes and shipments say. The board only reads: a customer moves
// when a quote is sent or a shipment is created, not by anything done here. It draws the page
// frame itself, because the period of the Won column is chosen in the title row.
export function PipelineTab() {
  const [period, setPeriod] = useState<Period>("90");
  const { board, isLoading, isChangingPeriod, isError, reload, showMore, loadingMore } = useSalesPipeline(periodStart(period));
  const exchange = useCurrentExchangeRates();
  const toast = useToast();

  const more = async (stage: PipelineStage) => {
    try {
      await showMore(stage);
    } catch (err) {
      toast.error(`More customers could not be loaded - ${apiErrorMessage(err)}`);
    }
  };

  let content: ReactNode;
  if (isError) {
    // A board that could not be read is not three empty columns - and the one read before may be
    // of another period than the one chosen now.
    content = (
      <Alert
        type="error"
        showIcon
        message="The pipeline could not be loaded"
        description="Customers, quotes and shipments are read together for it - try again."
        action={
          <Button size="small" onClick={() => reload()}>
            Retry
          </Button>
        }
      />
    );
  } else if (isLoading || !board || exchange.isLoading) {
    // Drafts are priced at today's ČNB rates, so the cards wait for them.
    content = (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <Spin />
        <span className="text-sm text-slate-500">Loading the pipeline…</span>
      </div>
    );
  } else {
    const notes = notesLine(board.notes);
    content = (
      <>
        <ExchangeRatesError exchange={exchange} />

        <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] items-start gap-4">
          {COLUMNS.map(({ stage, name }) => {
            // Only the Won column depends on the period: it is the one that says which period it
            // shows, and the one that waits for another.
            const ofPeriod = stage === "won";
            return (
              <StageColumn
                key={stage}
                title={ofPeriod ? `${name} · ${PERIOD_LABELS[period]}` : name}
                cards={board.cards[stage]}
                total={board.totals[stage]}
                waiting={ofPeriod && isChangingPeriod}
                sheet={exchange.rates}
                live={exchange}
                loadingMore={loadingMore === stage}
                // One column at a time, and none while the board of another period is on its way.
                canShowMore={!isChangingPeriod && loadingMore === null}
                onShowMore={() => more(stage)}
              />
            );
          })}
        </div>

        {notes && <p className="m-0 text-xs text-slate-500 tabular-nums">{notes}.</p>}
      </>
    );
  }

  return (
    <SalesPage
      title={SALES_PAGES.pipeline.label}
      subtitle={STAGE_MEANINGS}
      extra={
        <div className="flex items-center gap-2">
          <label htmlFor={PERIOD_SELECT_ID} className="text-[13px] font-medium text-slate-600 whitespace-nowrap">
            Won in
          </label>
          <Select<Period> id={PERIOD_SELECT_ID} className="w-44" value={period} onChange={setPeriod} options={PERIOD_OPTIONS} />
        </div>
      }
    >
      {content}
    </SalesPage>
  );
}

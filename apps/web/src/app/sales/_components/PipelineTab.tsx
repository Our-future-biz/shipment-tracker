"use client";

import { useId, useState, type ChangeEvent, type ReactNode } from "react";
import Link from "next/link";
import dayjs from "dayjs";
import { Alert, Button, Input, Select, Spin, Tooltip } from "antd";
import { LoadingOutlined, SearchOutlined } from "@ant-design/icons";
import { CustomerAccountTypeBadge } from "@/app/customers/_components/CustomerAccountTypeBadge";
import { SalesOwnerText } from "@/app/customers/_components/SalesOwnerText";
import { CUSTOMER_LABELS, labelTone } from "@/app/customers/_lib/constants";
import { asData, businessDay, businessToday, computeTotals, sellingSum, type LivePricing } from "@/app/sales/_lib/salesQuote";
import type { Tone } from "@/components/Badge";
import { LINK_CLASS } from "@/components/linkClass";
import { Pill } from "@/components/Pill";
import { CountChip, PillTabs, SectionCard } from "@/components/SectionCard";
import { useDebounced } from "@/hooks/useDebounced";
import { useCurrentExchangeRates } from "@/hooks/useExchangeRates";
import { useSalesPipeline, type PipelineBoard, type PipelineCard, type PipelineStage } from "@/hooks/useSalesPipeline";
import { useUsers } from "@/hooks/useUsers";
import { apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatDate } from "@/lib/date";
import { isUnlinkedPerson, sortedUsers, userMatches } from "@/lib/people";
import type { ExchangeRates } from "@/lib/exchangeRates";
import { useToast } from "@/lib/toast";
import { SALES_PAGES } from "../_lib/tabs";
import { ExchangeRatesError } from "./ExchangeRatesError";
import { QuoteRefLink } from "./QuoteRefLink";
import { QuoteStatusPill } from "./QuoteStatusPill";
import { SalesPage } from "./SalesPage";
import { ToolbarButton } from "./ToolbarButton";
import { CARD } from "@/styles/ui";

// The columns of the board: the three stages a customer can stand on. Where a customer stands is
// the server's answer; this is only how its column is titled and the line under the title that says
// what the stage means.
const COLUMNS: { stage: PipelineStage; name: string; meaning: string }[] = [
  { stage: "prospect", name: "Prospect", meaning: "Interested, but no quotation has been sent yet." },
  { stage: "proposal", name: "Proposal", meaning: "A quotation has been sent." },
  { stage: "won", name: "Won", meaning: "The customer has placed their first shipment order." },
];

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
  // A company with no Customer role (a supplier only) is not on the board (K13).
  const ofSuppliers = [
    notes.shipmentsOfNonCustomers > 0 && plural(notes.shipmentsOfNonCustomers, "shipment", "shipments"),
    notes.quotesOfNonCustomers > 0 && plural(notes.quotesOfNonCustomers, "sent quote", "sent quotes"),
  ].filter((part) => part !== false);
  const oneOfSuppliers = notes.shipmentsOfNonCustomers + notes.quotesOfNonCustomers === 1;
  return [
    unlinked.length > 0 && `${unlinked.join(" and ")} ${one ? "has no linked customer and is not counted" : "have no linked customer and are not counted"}`,
    ofSuppliers.length > 0 &&
      `${ofSuppliers.join(" and ")} ${oneOfSuppliers ? "names a company with no Customer role and is not counted" : "name a company with no Customer role and are not counted"}`,
    undated > 0 &&
      `${plural(undated, "sent quote", "sent quotes")} ${undated === 1 ? "has no sent date and is shown by its creation date" : "have no sent date and are shown by their creation date"}`,
  ]
    .filter((part) => part !== false)
    .join(" - ");
}

// The colour of a customer's mark and name says its account type, in the tone the type's badge
// has everywhere (labelTone); the Account type filter offers those badges.
const TYPE_TONE: Record<Tone, { mark: string; name: string }> = {
  g: { mark: "bg-emerald-100 border-emerald-200 text-emerald-700", name: "text-emerald-700" },
  a: { mark: "bg-amber-100 border-amber-200 text-amber-700", name: "text-amber-700" },
  r: { mark: "bg-red-100 border-red-200 text-red-700", name: "text-red-700" },
  b: { mark: "bg-sky-100 border-sky-200 text-sky-700", name: "text-sky-700" },
  i: { mark: "bg-indigo-100 border-indigo-200 text-indigo-700", name: "text-indigo-700" },
  "": { mark: "bg-slate-100 border-slate-200 text-slate-500", name: "text-slate-800" },
};

// The Account type filter: the badges, and the customers that have no type.
const LABEL_OPTIONS = [
  ...CUSTOMER_LABELS.map((label) => ({ value: label as string, label: <CustomerAccountTypeBadge label={label} /> })),
  { value: "none", label: <span className="text-slate-500">No account type</span> },
];

// The built-in views in the title row: the customers of the signed-in user, or everybody's.
type OwnerView = "mine" | "all" | "";
const OWNER_VIEWS: readonly { key: OwnerView; label: string }[] = [
  { key: "mine", label: "My customers" },
  { key: "all", label: "All customers" },
];

// How many open quotes an opened card lists; the rest are on the customer's page.
const QUOTES_SHOWN = 5;

// When the first quote for the customer went out, as an opened card says it; null when there is
// nothing to say.
function firstQuoteFact(card: PipelineCard): string | null {
  if (card.firstQuoteSentAt) {
    // A quote that went out without anybody recording when counts from the day it was created.
    return card.firstQuoteSentAtKnown ? `Sent ${dayOf(card.firstQuoteSentAt)}` : `Created ${dayOf(card.firstQuoteSentAt)} - sent date not recorded`;
  }
  // Under Proposal a quote went out: without its day there is nothing to add.
  if (card.stage === "proposal") return null;
  return card.stage === "prospect" ? "No quote sent yet" : "No quote sent";
}

// One line of an opened card: what it is about on the left, the value on the right.
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="whitespace-nowrap text-slate-500">{label}</dt>
      <dd className="m-0 min-w-0 break-words text-slate-800">{children}</dd>
    </>
  );
}

interface CustomerCardProps {
  card: PipelineCard;
  sheet: ExchangeRates;
  live: LivePricing;
}

// What the board knows about a customer, under its opened card: how far the business with it got
// and what is open with it. Always in this order, so opened cards read alike.
function CustomerDetails({ id, card, sheet, live }: CustomerCardProps & { id: string }) {
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
  const firstQuote = firstQuoteFact(card);
  const customerHref = `/customers/${card.customerId}`;

  return (
    <div id={id} className="border-t border-slate-100 px-3 py-2.5 text-xs text-slate-700 tabular-nums">
      <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5">
        <Fact label="Last activity">{card.lastActivityAt ? dayOf(card.lastActivityAt) : <span className="text-slate-500">No activity yet</span>}</Fact>
        {firstQuote && <Fact label="First quote">{firstQuote}</Fact>}
        {card.firstShipmentAt && (
          <Fact label="First shipment">
            {/* The job number leads to the shipment; a shipment that has none yet is only dated. */}
            {card.firstJobNumber && card.firstShipmentId && (
              <>
                <Link href={`/shipments/${card.firstShipmentId}`} className={`font-semibold ${LINK_CLASS}`}>
                  {card.firstJobNumber}
                </Link>{" "}
                on{" "}
              </>
            )}
            {dayOf(card.firstShipmentAt)}
          </Fact>
        )}
        {card.shipmentCount > 0 && <Fact label="Shipments">{card.shipmentCount.toLocaleString("en-US")}</Fact>}
      </dl>

      <div className="mt-2.5 pt-2 border-t border-slate-100">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
          <span className={card.openQuotes.length ? "text-slate-800" : "text-slate-500"}>
            {card.openQuotes.length ? plural(card.openQuotes.length, "open quote", "open quotes") : "No open quotes"}
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
        {card.openQuotes.length > 0 && (
          <ul className="list-none m-0 mt-1.5 p-0 flex flex-col gap-1">
            {card.openQuotes.slice(0, QUOTES_SHOWN).map((quote) => (
              <li key={quote.quoteNumber} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <QuoteRefLink quoteNumber={quote.quoteNumber} />
                <QuoteStatusPill status={quote.status} />
                {quote.validUntil && <span className="ml-auto whitespace-nowrap text-slate-500">Valid until {formatDate(quote.validUntil)}</span>}
              </li>
            ))}
          </ul>
        )}
        {card.openQuotes.length > QUOTES_SHOWN && (
          <Link href={`${customerHref}?tab=quotes`} className={`mt-1.5 inline-block ${LINK_CLASS}`}>
            {plural(card.openQuotes.length - QUOTES_SHOWN, "more open quote", "more open quotes")}
          </Link>
        )}
      </div>

      <div className="mt-2.5 pt-2 border-t border-slate-100 text-right">
        <Link href={customerHref} className={`font-medium ${LINK_CLASS}`}>
          Open customer
        </Link>
      </div>
    </div>
  );
}

// One customer on the board, as a white card: the company's mark and name, both in the colour of
// its account type, and under the name the type's badge and whose customer it is. A click opens the card to what
// the board knows about the customer and another closes it. Each card opens on its own, so two
// customers can be read side by side; the way to the customer's page is inside.
function CustomerCard({ card, sheet, live }: CustomerCardProps) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  // The sales owner is the owner user's e-mail. The card does not carry the user, so - as a picker
  // does - an owner that is no user's e-mail (a typed name nobody was matched to) is marked.
  const { users, isLoading: usersLoading } = useUsers();
  const ownerLinked = usersLoading || !isUnlinkedPerson(card.salesOwner, users);
  const tone = TYPE_TONE[labelTone(card.label)];

  return (
    <li className={`${CARD} overflow-hidden transition-colors hover:border-indigo-300`}>
      <h4 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? detailsId : undefined}
          onClick={() => setOpen((was) => !was)}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left cursor-pointer transition-colors hover:bg-indigo-50/40 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
        >
          <span aria-hidden className={`w-7 h-7 shrink-0 rounded-md border flex items-center justify-center text-[11px] font-semibold ${tone.mark}`}>
            {card.companyName.slice(0, 2).toUpperCase()}
          </span>
          <span className="flex-1 min-w-0">
            {/* The name never wraps: it has the whole line to itself, and only a name longer than
                the card is cut - in full on hover. It starts where the text in the badge under it
                starts (the badge's own padding, px-2.5), so the two read as one column. */}
            <span className={`block truncate pl-2.5 text-[13px] font-semibold ${tone.name}`} title={card.companyName}>
              {card.companyName}
            </span>
            <span className="mt-0.5 flex items-center gap-2 text-xs font-normal text-slate-500">
              {card.label && <CustomerAccountTypeBadge label={card.label} />}
              <span className={`min-w-0 truncate ${card.label ? "" : "pl-2.5"}`}>
                {card.salesOwner.trim() ? <SalesOwnerText owner={card.salesOwner} linked={ownerLinked} /> : "No sales owner"}
              </span>
            </span>
          </span>
        </button>
      </h4>
      {open && <CustomerDetails id={detailsId} card={card} sheet={sheet} live={live} />}
    </li>
  );
}

interface StageColumnProps {
  title: string;
  // What the stage means, the first line of the column.
  meaning: string;
  // A control of the column's own in its header, before the count.
  control?: ReactNode;
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
function StageColumn({ title, meaning, control, cards, total, waiting, sheet, live, loadingMore, canShowMore, onShowMore }: StageColumnProps) {
  return (
    <SectionCard
      title={title}
      bodyClassName="p-0"
      extra={
        <>
          {control}
          <CountChip count={waiting ? "…" : <span title={plural(total, "customer", "customers")}>{total.toLocaleString("en-US")}</span>} />
        </>
      }
    >
      <p className="m-0 px-3 pt-2.5 text-xs text-slate-500">{meaning}</p>
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
// Proposal, Won - by what its quotes and shipments say. A customer is one card - its mark and
// name in the colour of its account type, the type's badge and whose customer it is - that a
// click opens. The board only reads: a customer moves when a quote is sent or a shipment is
// created, not by anything done here. Each column says what its stage means; the Won column
// chooses its period in its own header. The toolbar narrows the whole board - on the server, as
// the columns come in parts - to a name, an account type, a sales owner; the page starts on the
// signed-in user's own customers, as Follow-up does.
export function PipelineTab() {
  const [period, setPeriod] = useState<Period>("90");
  const { user } = useAuth();
  const { users, isLoading: usersLoading } = useUsers();
  const me = user?.email ?? "";
  // Until somebody picks another owner, the board is the signed-in user's: undefined = "mine".
  const [ownerPick, setOwnerPick] = useState<string | undefined>(undefined);
  const owner = ownerPick ?? me;
  const [label, setLabel] = useState("");
  const [search, setSearch] = useState("");
  const typed = useDebounced(search, 300).trim();
  const { board, isLoading, isChangingView, isError, reload, showMore, loadingMore } = useSalesPipeline(periodStart(period), { search: typed, label, owner });
  const exchange = useCurrentExchangeRates();
  const toast = useToast();

  const ownerView: OwnerView = owner === "" ? "all" : me && owner.toLowerCase() === me.toLowerCase() ? "mine" : "";
  const ownerOptions = [
    ...sortedUsers(users).map((u) => ({ value: u.email, label: u.displayName || u.email, user: u })),
    { value: "none", label: "No sales owner", user: undefined },
  ];

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
    // Drafts are priced at today's ČNB rates, so the board waits for them.
    content = (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <Spin />
        <span className="text-[13px] text-slate-500">Loading the pipeline…</span>
      </div>
    );
  } else {
    // What the board cannot place - work with no linked customer, or for a supplier only - is said under it.
    const notes = notesLine(board.notes);
    content = (
      <>
        <ExchangeRatesError exchange={exchange} />

        <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] items-start gap-4">
          {COLUMNS.map(({ stage, name, meaning }) => {
            // Only the Won column depends on the period: it is the one that chooses it, in its own
            // header. Every column waits while another period or other filters are on their way.
            const ofPeriod = stage === "won";
            return (
              <StageColumn
                key={stage}
                title={name}
                meaning={meaning}
                control={
                  ofPeriod && (
                    <Select<Period>
                      size="small"
                      className="w-32"
                      aria-label="Won in"
                      value={period}
                      onChange={setPeriod}
                      options={PERIOD_OPTIONS}
                    />
                  )
                }
                cards={board.cards[stage]}
                total={board.totals[stage]}
                waiting={isChangingView}
                sheet={exchange.rates}
                live={exchange}
                loadingMore={loadingMore === stage}
                // One column at a time, and none while another board is on its way.
                canShowMore={!isChangingView && loadingMore === null}
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
      extra={
        <div role="group" aria-label="Built-in views">
          <PillTabs<OwnerView> tabs={OWNER_VIEWS} active={ownerView} onChange={(view) => setOwnerPick(view === "mine" ? me : "")} />
        </div>
      }
    >
      {/* Toolbar: finding customers, on the right as on Quotes. */}
      <div className={`flex flex-wrap items-center justify-between gap-3 ${CARD} px-4 py-3`}>
        <div className="flex flex-wrap items-center gap-3 ml-auto">
          {/* antd gives the input width: 100% outside Tailwind's cascade layers - hence the important flag. */}
          <Input
            placeholder="Search customers…"
            aria-label="Search customers"
            prefix={<SearchOutlined className="text-slate-400" />}
            value={search}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            allowClear
            className="!w-60"
          />
          <div className="w-px h-6 bg-slate-200 shrink-0" />
          <Select<string>
            aria-label="Account type"
            placeholder="Account type"
            className="w-48"
            allowClear
            value={label || undefined}
            onChange={(value) => setLabel(value ?? "")}
            options={LABEL_OPTIONS}
          />
          <Select<string>
            aria-label="Sales owner"
            placeholder="Sales owner"
            className="w-56"
            showSearch
            allowClear
            loading={usersLoading}
            value={owner || undefined}
            onChange={(value) => setOwnerPick(value ?? "")}
            options={ownerOptions}
            filterOption={(input, option) => (option?.user ? userMatches(option.user, input) : "no sales owner".includes(input.trim().toLowerCase()))}
          />
        </div>
      </div>

      {content}
    </SalesPage>
  );
}

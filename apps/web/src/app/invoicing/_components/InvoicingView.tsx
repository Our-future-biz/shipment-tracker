"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Popover, Select } from "antd";
import { useShipmentMutations, type ShipmentItem } from "@/hooks/useShipments";
import { useShipment } from "@/hooks/useShipment";
import { useInvoiceDocList } from "@/hooks/useInvoiceDocs";
import { useInvoicing } from "@/hooks/useInvoicing";
import { AppCard } from "@/components/AppCard";
import { EMPTY_CELL } from "@/components/EmptyCell";
import { Pill } from "@/components/Pill";
import { CARD, LABEL_TEXT, LINK, PAGE_SUBTITLE, PAGE_TITLE, REF } from "@/styles/ui";
import { formatDate } from "@/lib/date";
import { StatusBadge } from "@/components/StatusBadge";
import { money } from "@/lib/money";
import { useToast } from "@/lib/toast";
import { CostsTab } from "@/app/shipments/[jobNumber]/tabs/CostsTab";
import { signed } from "@/app/shipments/[jobNumber]/tabs/costsCalc";
import { useCostsData } from "@/app/shipments/[jobNumber]/tabs/useCostsData";
import { asData } from "@/app/sales/_lib/salesQuote";
import { useSalesQuoteByRef } from "@/hooks/useSalesQuote";
import { InvoicePanel } from "./InvoicePanel";
import { BillingQueue } from "./BillingQueue";
import { invoicedLineCount } from "../_lib/lineCounts";
import { jobDuzp } from "../_lib/openInvoices";
import { profitQuoteRef, quoteVsJob, type QuoteVsJob } from "../_lib/quoteVsJob";

/** Tabs of a job, as on the shipment detail page; the default one is left out of the URL. */
const TABS = [
  { key: "invoice", label: "Invoice" },
  { key: "costs", label: "Costs Breakdown" },
  { key: "documents", label: "Invoices & Credit Notes" },
] as const;
type TabKey = (typeof TABS)[number]["key"];
const DEFAULT_TAB: TabKey = "invoice";
const isTabKey = (v: string | null): v is TabKey => TABS.some((t) => t.key === v);

const INVOICING_STATUSES = ["Not Invoiced", "Invoiced"];

function InvoicingStatusTag({ value }: { value: string }) {
  return value === "Invoiced" ? <Pill tone="green">Invoiced</Pill> : <Pill tone="red">{value || "Not Invoiced"}</Pill>;
}

interface SummaryItemProps {
  label: string;
  className?: string;
  /** The label may take two lines in a narrow column (the ports' long names) instead of running into the next fact. */
  wrapLabel?: boolean;
  children: React.ReactNode;
}

function SummaryItem({ label, className = "", wrapLabel = false, children }: SummaryItemProps) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className={`${LABEL_TEXT} ${wrapLabel ? "" : "whitespace-nowrap"}`}>{label}</div>
      <div className="mt-1 min-h-7 text-[13px] text-slate-900 flex items-center flex-wrap gap-x-2 gap-y-1 break-words">{children}</div>
    </div>
  );
}

interface ShipmentProps {
  shipment: ShipmentItem;
}

/**
 * Job facts at a glance with its two statuses: Shipment Status ("Billing" puts the job in the
 * queue) and Invoicing Status, which issuing sets automatically and which can also be changed
 * here by hand (e.g. for a job invoiced outside the app).
 */
function ShipmentSummary({ shipment, nextDuzp }: ShipmentProps & { nextDuzp: string | null }) {
  const toast = useToast();
  const { updateShipment } = useShipmentMutations();
  const [saving, setSaving] = useState(false);
  const { data } = useInvoiceDocList(shipment.id);
  // the shared invoicing query (selling rows), already loaded for the Invoice tab
  const { data: costs } = useInvoicing(shipment.id);
  // counted once both have loaded, so a fully invoiced job never flashes a red 0/N first
  const lines = costs && data ? invoicedLineCount(costs.sellingCosts, data.invoices) : null;
  const status = shipment.status ?? "";

  const handleInvoicingStatus = async (value: string) => {
    setSaving(true);
    try {
      await updateShipment({ id: shipment.id, data: { invoicingStatus: value } });
      toast.success(`Invoicing Status of ${shipment.jobNumber} set to ${value}`);
    } catch {
      toast.error("Failed to change the Invoicing Status");
    } finally {
      setSaving(false);
    }
  };

  return (
    // 11 facts on a wide screen, in columns of 9: the text facts share the width, the last three take
    // the width of their label (labels do not wrap, but the ports' may); a long Shipment Status is cut, not widened
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_fit-content(120px)_max-content_max-content] gap-x-4 gap-y-3">
      <SummaryItem label="Job">
        <Link href={`/shipments/${shipment.id}`} className={`${REF} font-semibold ${LINK}`}>
          {shipment.jobNumber}
        </Link>
      </SummaryItem>
      <SummaryItem label="Direction">{shipment.tradeDirection || EMPTY_CELL}</SummaryItem>
      <SummaryItem label="Customer">{shipment.customer || <span className="text-slate-500">Not linked</span>}</SummaryItem>
      <SummaryItem label="Port of Loading" wrapLabel>{shipment.pol || EMPTY_CELL}</SummaryItem>
      <SummaryItem label="Port of Discharge" wrapLabel>
        <span className="min-w-0">
          {shipment.pod || EMPTY_CELL}
          {/* the final destination, which the old Route column also showed */}
          {shipment.destination && shipment.destination !== shipment.pod && (
            <span className="block text-[12px] text-slate-500">Destination: {shipment.destination}</span>
          )}
        </span>
      </SummaryItem>
      {/* The tax date: of the newest open invoice once issued, else the one the Invoice tab would use */}
      <SummaryItem label="DUZP">{formatDate(jobDuzp(data?.invoices ?? [], nextDuzp)) || EMPTY_CELL}</SummaryItem>
      <SummaryItem label="Shipment Status">
        {status ? <StatusBadge status={status} className="max-w-full truncate" /> : EMPTY_CELL}
      </SummaryItem>
      <SummaryItem label="Invoicing Status">
        <Select
          size="small"
          value={shipment.invoicingStatus || "Not Invoiced"}
          onChange={(v) => void handleInvoicingStatus(v)}
          loading={saving}
          options={INVOICING_STATUSES.map((v) => ({ value: v, label: <InvoicingStatusTag value={v} /> }))}
          className="w-full max-w-[140px]"
          aria-label="Invoicing Status"
        />
      </SummaryItem>
      {/* as the queue's column: selling lines on an open invoice, of all; green once all are */}
      <SummaryItem label="Lines Invoiced">
        {lines?.total ? (
          <span
            className={`tabular-nums font-semibold ${lines.invoiced === lines.total ? "text-emerald-600" : "text-red-600"}`}
            title={`${lines.invoiced} of ${lines.total} selling lines invoiced`}
          >
            {lines.invoiced}/{lines.total}
          </span>
        ) : (
          EMPTY_CELL
        )}
      </SummaryItem>
      {/* The quote the job was priced from, and its profit against the job's: a second row on a wide screen. */}
      <QuoteProfitFacts shipment={shipment} />
    </div>
  );
}

// What a difference reads as: green above the quote, red below it.
const diffTone = (v: number) => (v > 0.004 ? "text-ok" : v < -0.004 ? "text-danger" : "text-slate-500");

/** Why the job's profit is not the quote's: the parts of the difference, each in the billing currency. */
function QuoteDifference({ cmp, jobProfit, quoteRef, currency }: { cmp: QuoteVsJob; jobProfit: number; quoteRef: string; currency: string }) {
  const row = (label: string, value: string, className = "") => (
    <div className={`flex items-baseline justify-between gap-6 ${className}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
  return (
    <div className="text-[13px] text-slate-700 min-w-[300px] flex flex-col gap-1">
      {row(`Quote ${quoteRef}, at its own rates`, money(cmp.quoteProfit))}
      {row("This job now, at its rates", money(jobProfit))}
      {row("Difference", signed(cmp.difference), `font-semibold border-t border-slate-200 pt-1 ${diffTone(cmp.difference)}`)}
      <div className="pl-3 flex flex-col gap-0.5 text-slate-500">
        {row("Exchange rates and ROE", signed(cmp.ratesAndRoe))}
        {row("Real costs against the estimates", signed(cmp.realVsEstimate))}
        {row("Rows added, changed or removed", signed(cmp.otherRows))}
      </div>
      {cmp.missingRates.length > 0 && (
        <div className="text-[12px] text-amber-700">Quote lines in {cmp.missingRates.join(", ")} have no rate on the job and are left out of the rates part.</div>
      )}
      <div className="text-[12px] text-slate-500">All in {currency}. Nothing is recalculated: the quote keeps its own figure.</div>
    </div>
  );
}

/**
 * The quote the job was priced from, and how its profit compares with the job's: the quote's own
 * figure at its own rates, the difference, and on hover what makes it up (Costs Breakdown's
 * Report compares the same quote).
 */
function QuoteProfitFacts({ shipment }: ShipmentProps) {
  const { data, billingCur, rates, ratesLoading, ratesError, totals: t } = useCostsData(shipment);
  const ref = profitQuoteRef(
    data?.billingSettings?.quoteRef,
    (data?.costs ?? []).map((c) => c.sourceQuoteNumber ?? ""),
    shipment.salesNumber,
  );
  const quote = useSalesQuoteByRef(ref);
  const quoteData = quote.data?.quote ? asData(quote.data.quote.data) : null;
  // The quote's reference as it is now: the job's copy can be from before its Freight Mode letters changed.
  const shownRef = quote.data?.quote.quoteNumber ?? ref;
  const jobProfit = t.sellTotal - t.buyTotal;
  const cmp = quoteData ? quoteVsJob(quoteData, { profit: jobProfit, rxeTotal: t.rxeTotal, billingCurrency: billingCur, rates }) : null;

  // The job's side needs its rates in the billing currency: without them its profit reads 0.
  const jobRatesReady = !ratesError && (billingCur === "CZK" || !!rates[billingCur]);

  let profit: React.ReactNode = EMPTY_CELL;
  if (ref && (quote.isLoading || !data || ratesLoading)) profit = <span className="text-slate-500">…</span>;
  else if (ref && !jobRatesReady) profit = <span className="text-slate-500">No exchange rates for the job yet</span>;
  else if (ref && !quoteData) profit = <span className="text-slate-500">The quote could not be read</span>;
  else if (ref && !cmp) profit = <span className="text-slate-500">No rate for its currency</span>;
  else if (ref && cmp) {
    profit = (
      <Popover content={<QuoteDifference cmp={cmp} jobProfit={jobProfit} quoteRef={shownRef ?? ref} currency={billingCur} />} trigger={["hover", "focus"]} placement="bottom">
        <button type="button" className="inline-flex items-baseline gap-2 bg-transparent border-0 p-0 cursor-help text-[13px] tabular-nums whitespace-nowrap">
          <strong className="text-slate-900">{money(cmp.quoteProfit)}</strong>
          <span className={`font-semibold ${diffTone(cmp.difference)}`} aria-label={`The job is ${signed(cmp.difference)} ${billingCur} against the quote`}>
            {signed(cmp.difference)} now
          </span>
        </button>
      </Popover>
    );
  }

  return (
    <>
      <SummaryItem label="Quote">
        {shownRef ? (
          <Link href={`/sales/quote/${shownRef}`} className={`${REF} font-semibold ${LINK}`}>
            {shownRef}
          </Link>
        ) : (
          EMPTY_CELL
        )}
      </SummaryItem>
      <SummaryItem label={`Quote profit (${billingCur})`} className="xl:col-span-2">
        {profit}
      </SummaryItem>
    </>
  );
}

/** The job's Buying / Selling / Profit (the Costs Breakdown totals), shown on every tab. */
function CostsTotals({ shipment }: ShipmentProps) {
  const { billingCur, totals: t } = useCostsData(shipment);
  return (
    // one block that does not squeeze; its parts wrap only if it is wider than the whole row
    <div className="ml-auto shrink-0 max-w-full whitespace-nowrap flex flex-wrap items-center gap-x-4 gap-y-1 px-2 py-2.5 text-[13px] text-slate-500 tabular-nums">
      <span>Buying <strong className="text-slate-900">{money(t.buyTotal)}</strong></span>
      <span>Selling <strong className="text-slate-900">{money(t.sellTotal)}</strong></span>
      <span>
        Profit{" "}
        <strong className={t.sellTotal - t.buyTotal >= 0 ? "text-ok" : "text-danger"}>
          {money(t.sellTotal - t.buyTotal)}
        </strong>
      </span>
      <span className="text-slate-500">{billingCur}</span>
    </div>
  );
}

interface JobTabsProps extends ShipmentProps {
  active: TabKey;
  onChange: (key: TabKey) => void;
}

/** The tab bar under the job summary, with the costs totals at its right end. */
function JobTabs({ shipment, active, onChange }: JobTabsProps) {
  const { data } = useInvoiceDocList(shipment.id);
  const docCount = data?.invoices.length;

  return (
    // wrap-reverse: on a narrow screen the totals go above the tabs, so the tabs stay the card's bottom edge
    // (in wrap-reverse items-start is the bottom, as items-end was before)
    <div className="flex items-start justify-between gap-x-4 flex-wrap-reverse px-2 border-t border-slate-100">
      <div role="tablist" aria-label="Invoicing of the job" className="flex flex-wrap shrink-0 max-w-full">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            id={`invoicing-tab-${tab.key}`}
            type="button"
            role="tab"
            aria-selected={active === tab.key}
            aria-controls="invoicing-tab-panel"
            onClick={() => onChange(tab.key)}
            // the classes of the app's tab strip (RecordTabs), which has no tab ids or counts
            className={`px-4 py-2.5 text-[13px] whitespace-nowrap cursor-pointer bg-transparent border-0 border-b-2 transition-colors ${
              active === tab.key
                ? "font-semibold text-indigo-600 border-indigo-600"
                : "font-medium text-slate-500 border-transparent hover:text-slate-900"
            }`}
          >
            {tab.label}
            {tab.key === "documents" && !!docCount && <span className="tabular-nums"> ({docCount})</span>}
          </button>
        ))}
      </div>
      <CostsTotals shipment={shipment} />
    </div>
  );
}

/**
 * Invoicing works on the same buying / selling rows as the shipment's Costs tab:
 * the Costs Breakdown tab here IS that tab, and the invoice is built from the selling rows
 * ticked for Invoice. The chosen shipment and tab are kept in the URL (?shipment=…&tab=…),
 * so the page can be linked to and survives a reload.
 */
export const InvoicingView = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedShipmentId = searchParams.get("shipment");
  // By id from the API: the shipments list only holds the newest rows, the queue spans all.
  const {
    shipment: selectedShipment,
    isLoading: shipmentLoading,
    notFound,
  } = useShipment(selectedShipmentId ?? undefined);

  const rawTab = searchParams.get("tab");
  const activeTab: TabKey = isTabKey(rawTab) ? rawTab : DEFAULT_TAB;
  // The Costs editor is mounted the first time its tab opens for a job and then kept (hidden on
  // other tabs), so its Undo and unlocked rows survive a look at the Invoice tab, as before.
  const [costsMountedFor, setCostsMountedFor] = useState<string | null>(null);
  // The DUZP the Invoice tab would use, shown on the job card (kept with the job it belongs to)
  const [nextDuzp, setNextDuzp] = useState<{ id: string; iso: string } | null>(null);
  const handleDuzp = useCallback(
    (iso: string) => selectedShipmentId && setNextDuzp({ id: selectedShipmentId, iso }),
    [selectedShipmentId],
  );
  if (activeTab === "costs" && selectedShipmentId && costsMountedFor !== selectedShipmentId) {
    setCostsMountedFor(selectedShipmentId);
  }

  const handleSelect = (id: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set("shipment", id);
    else {
      params.delete("shipment");
      // the job's tab means nothing on the queue
      params.delete("tab");
    }
    const qs = params.toString();
    // push, not replace: Back returns from a job to the queue on the same tab and filters
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const handleTab = (key: TabKey) => {
    const params = new URLSearchParams(searchParams.toString());
    if (key === DEFAULT_TAB) params.delete("tab");
    else params.set("tab", key);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  if (!selectedShipmentId) return <BillingQueue onOpen={handleSelect} />;

  return (
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1400px] mx-auto flex flex-col gap-5">
        {/* Title row: back to the queue and the job; jobs are opened from the queue, not switched here */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => handleSelect(null)}
              className={`${PAGE_SUBTITLE} p-0 border-0 bg-transparent cursor-pointer hover:text-indigo-600`}
            >
              ← Invoicing queue
            </button>
            <h1 className={PAGE_TITLE}>
              Invoicing{selectedShipment ? <span className="text-slate-400 font-semibold"> · {selectedShipment.jobNumber}</span> : null}
            </h1>
          </div>
        </div>

        {selectedShipment ? (
          <>
            {/* The job at a glance, with the tab bar along its bottom edge as on the shipment detail */}
            <section className={`${CARD} min-w-0`}>
              <div className="px-4 pt-4 pb-3">
                <ShipmentSummary shipment={selectedShipment} nextDuzp={nextDuzp?.id === selectedShipment.id ? nextDuzp.iso : null} />
              </div>
              <JobTabs shipment={selectedShipment} active={activeTab} onChange={handleTab} />
            </section>

            <div role="tabpanel" id="invoicing-tab-panel" aria-labelledby={`invoicing-tab-${activeTab}`} className="min-w-0">
              {/* key: a fresh Costs editor per shipment */}
              {costsMountedFor === selectedShipment.id && (
                <div hidden={activeTab !== "costs"}>
                  <CostsTab key={selectedShipment.id} shipment={selectedShipment} onIssueInvoice={() => handleTab("invoice")} />
                </div>
              )}
              {/* Mounted on every tab, so the DUZP, customer and note picked on the Invoice tab stay */}
              <InvoicePanel
                key={`inv-${selectedShipment.id}`}
                shipment={selectedShipment}
                section={activeTab === "costs" ? null : activeTab}
                onDuzpChange={handleDuzp}
                onOpenCosts={() => handleTab("costs")}
              />
            </div>
          </>
        ) : (
          <AppCard>
            <div className="flex items-center justify-center h-[120px] text-slate-500 text-sm">
              {shipmentLoading
                ? "Loading the shipment…"
                : notFound
                  ? "Shipment not found — go back to the Invoicing queue and open another job."
                  : "Could not load the shipment."}
            </div>
          </AppCard>
        )}
      </div>
    </div>
  );
};

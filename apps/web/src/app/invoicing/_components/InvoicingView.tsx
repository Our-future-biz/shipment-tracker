"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, Tag } from "antd";
import { useShipmentMutations, type ShipmentItem } from "@/hooks/useShipments";
import { useShipment } from "@/hooks/useShipment";
import { useInvoiceDocList } from "@/hooks/useInvoiceDocs";
import { AppCard } from "@/components/AppCard";
import { formatDate } from "@/lib/date";
import { statusLabel, statusTagColor } from "@/lib/shipmentStatus";
import { moneyCz } from "@/lib/money";
import { useToast } from "@/lib/toast";
import { CostsTab } from "@/app/shipments/[jobNumber]/tabs/CostsTab";
import { useCostsData } from "@/app/shipments/[jobNumber]/tabs/useCostsData";
import { InvoicePanel } from "./InvoicePanel";
import { BillingQueue } from "./BillingQueue";

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
  return value === "Invoiced" ? (
    <Tag color="green" bordered={false} className="!m-0">Invoiced</Tag>
  ) : (
    <Tag color="red" bordered={false} className="!m-0">{value || "Not Invoiced"}</Tag>
  );
}

interface SummaryItemProps {
  label: string;
  children: React.ReactNode;
}

function SummaryItem({ label, children }: SummaryItemProps) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-bold uppercase tracking-[.04em] text-slate-500 whitespace-nowrap">{label}</div>
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
  const open = (data?.invoices ?? []).filter((d) => d.kind === "invoice" && d.status === "issued");
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
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-x-4 gap-y-3">
      <SummaryItem label="Job">
        <Link href={`/shipments/${shipment.id}`} className="font-semibold text-indigo-600 hover:underline">
          {shipment.jobNumber}
        </Link>
      </SummaryItem>
      <SummaryItem label="Direction">{shipment.tradeDirection || "—"}</SummaryItem>
      <SummaryItem label="Customer">{shipment.customer || <span className="text-slate-500">Not linked</span>}</SummaryItem>
      <SummaryItem label="POL">{shipment.pol || "—"}</SummaryItem>
      <SummaryItem label="POD">
        <span className="min-w-0">
          {shipment.pod || "—"}
          {/* the final destination, which the old Route column also showed */}
          {shipment.destination && shipment.destination !== shipment.pod && (
            <span className="block text-[12px] text-slate-500">Destination: {shipment.destination}</span>
          )}
        </span>
      </SummaryItem>
      {/* The tax date: of the newest open invoice once issued, else the one the Invoice tab would use */}
      <SummaryItem label="DUZP">{formatDate(open.length ? open[open.length - 1]!.duzp : nextDuzp) || "—"}</SummaryItem>
      <SummaryItem label="Shipment Status">
        {status ? <Tag color={statusTagColor(status)} title={statusLabel(status)} className="!m-0 !text-[11px] max-w-full truncate">{statusLabel(status)}</Tag> : "—"}
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
    </div>
  );
}

/** The job's Buying / Selling / Profit (the Costs Breakdown totals), shown on every tab. */
function CostsTotals({ shipment }: ShipmentProps) {
  const { billingCur, totals: t } = useCostsData(shipment);
  return (
    // one block that does not squeeze; its parts wrap only if it is wider than the whole row
    <div className="ml-auto shrink-0 max-w-full whitespace-nowrap flex flex-wrap items-center gap-x-4 gap-y-1 px-2 py-2.5 text-[12.5px] text-slate-600 tabular-nums">
      <span>Buying <strong className="text-slate-900">{moneyCz(t.buyTotal)}</strong></span>
      <span>Selling <strong className="text-slate-900">{moneyCz(t.sellTotal)}</strong></span>
      <span>
        Profit{" "}
        <strong className={t.sellTotal - t.buyTotal >= 0 ? "text-ok" : "text-danger"}>
          {moneyCz(t.sellTotal - t.buyTotal)}
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
            className={`px-4 py-2.5 text-sm cursor-pointer transition-all duration-150 border-b-2 bg-transparent ${
              active === tab.key
                ? "font-semibold text-indigo-500 border-indigo-500"
                : "font-normal text-slate-400 border-transparent hover:text-slate-600"
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
              className="p-0 border-0 bg-transparent cursor-pointer text-[13px] text-slate-500 hover:text-indigo-600"
            >
              ← Invoicing queue
            </button>
            <h1 className="text-2xl font-bold text-slate-900 m-0">
              Invoicing{selectedShipment ? <span className="text-slate-400 font-semibold"> · {selectedShipment.jobNumber}</span> : null}
            </h1>
          </div>
        </div>

        {selectedShipment ? (
          <>
            {/* The job at a glance, with the tab bar along its bottom edge as on the shipment detail */}
            <section className="bg-white border border-slate-200 rounded-xl shadow-sm min-w-0">
              <div className="px-4 pt-4 pb-3">
                <ShipmentSummary shipment={selectedShipment} nextDuzp={nextDuzp?.id === selectedShipment.id ? nextDuzp.iso : null} />
              </div>
              <JobTabs shipment={selectedShipment} active={activeTab} onChange={handleTab} />
            </section>

            <div role="tabpanel" id="invoicing-tab-panel" aria-labelledby={`invoicing-tab-${activeTab}`} className="min-w-0">
              {/* key: a fresh Costs editor per shipment */}
              {costsMountedFor === selectedShipment.id && (
                <div hidden={activeTab !== "costs"}>
                  <CostsTab key={selectedShipment.id} shipment={selectedShipment} />
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

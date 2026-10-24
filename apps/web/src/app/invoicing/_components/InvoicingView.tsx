"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, Tag } from "antd";
import { useShipmentMutations, type ShipmentItem } from "@/hooks/useShipments";
import { useShipment } from "@/hooks/useShipment";
import { useInvoiceDocList } from "@/hooks/useInvoiceDocs";
import { AppCard } from "@/components/AppCard";
import { SectionCard } from "@/components/SectionCard";
import { formatDate } from "@/lib/date";
import { statusLabel, statusTagColor } from "@/lib/shipmentStatus";
import { moneyCz } from "@/lib/money";
import { useToast } from "@/lib/toast";
import { CostsTab } from "@/app/shipments/[jobNumber]/tabs/CostsTab";
import { useCostsData } from "@/app/shipments/[jobNumber]/tabs/useCostsData";
import { InvoicePanel } from "./InvoicePanel";
import { BillingQueue } from "./BillingQueue";
import { ShipmentPicker } from "./ShipmentPicker";

/** Remembered per browser: whether the Costs section is collapsed. */
const COSTS_COLLAPSED_KEY = "invoicing.costsCollapsed";

const readCollapsed = () => {
  try {
    return localStorage.getItem(COSTS_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
};

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
      <div className="text-[11px] font-bold uppercase tracking-[.04em] text-slate-500">{label}</div>
      <div className="text-[13px] text-slate-900 flex items-center flex-wrap gap-x-2 gap-y-1 break-words">{children}</div>
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
function ShipmentSummary({ shipment }: ShipmentProps) {
  const toast = useToast();
  const { updateShipment } = useShipmentMutations();
  const [saving, setSaving] = useState(false);
  const { data } = useInvoiceDocList(shipment.id);
  const open = (data?.invoices ?? []).filter((d) => d.kind === "invoice" && d.status === "issued");
  const route = [shipment.pol, shipment.pod, shipment.destination].filter(Boolean).join(" → ");
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
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-x-6 gap-y-3">
      <SummaryItem label="Job">
        <Link href={`/shipments/${shipment.id}`} className="font-semibold text-indigo-600 hover:underline">
          {shipment.jobNumber}
        </Link>
        <span className="text-slate-500">{shipment.tradeDirection}</span>
      </SummaryItem>
      <SummaryItem label="Customer">{shipment.customer || <span className="text-slate-500">Not linked</span>}</SummaryItem>
      <SummaryItem label="Route">{route || "—"}</SummaryItem>
      <SummaryItem label="ETD / ETA">
        {formatDate(shipment.estimatedDeparture) || "—"} / {formatDate(shipment.estimatedArrival) || "—"}
      </SummaryItem>
      <SummaryItem label="Shipment Status">
        {status ? <Tag color={statusTagColor(status)} className="!m-0 !text-[11px]">{statusLabel(status)}</Tag> : "—"}
      </SummaryItem>
      <SummaryItem label="Invoicing Status">
        <Select
          size="small"
          value={shipment.invoicingStatus || "Not Invoiced"}
          onChange={(v) => void handleInvoicingStatus(v)}
          loading={saving}
          options={INVOICING_STATUSES.map((v) => ({ value: v, label: <InvoicingStatusTag value={v} /> }))}
          className="w-[140px]"
          aria-label="Invoicing Status"
        />
        {open.length > 0 && (
          <span className="text-[12px] text-slate-500 tabular-nums">
            {open.length === 1 ? `${open[0]!.number} · ${moneyCz(Number(open[0]!.gross))} ${open[0]!.currency}` : `${open.length} open invoices`}
          </span>
        )}
      </SummaryItem>
    </div>
  );
}

/** The Costs section (the shipment's own Costs tab), collapsible to a one-line summary. */
function CostsSection({ shipment }: ShipmentProps) {
  // null until read after mount (localStorage does not exist during server rendering), so the
  // heavy Costs editor is not mounted and then collapsed again on every visit
  const [collapsed, setCollapsed] = useState<boolean | null>(null);
  const { billingCur, totals: t } = useCostsData(shipment);

  useEffect(() => setCollapsed(readCollapsed()), []);

  const handleToggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COSTS_COLLAPSED_KEY, c ? "0" : "1");
      } catch {
        // private mode: the choice just isn't remembered
      }
      return !c;
    });
  };

  return (
    <SectionCard
      title="Costs"
      bodyClassName="p-4 bg-slate-50/60 rounded-b-xl"
      fold={{ open: collapsed === false, onToggle: handleToggle }}
      extra={
        <span className="flex items-center gap-4 text-[12.5px] font-normal text-slate-600 tabular-nums">
          <span>Buying <strong className="text-slate-900">{moneyCz(t.buyTotal)}</strong></span>
          <span>Selling <strong className="text-slate-900">{moneyCz(t.sellTotal)}</strong></span>
          <span>
            Profit{" "}
            <strong className={t.sellTotal - t.buyTotal >= 0 ? "text-ok" : "text-danger"}>
              {moneyCz(t.sellTotal - t.buyTotal)}
            </strong>
          </span>
          <span className="text-slate-500">{billingCur}</span>
        </span>
      }
    >
      {/* key: a fresh Costs editor per shipment, so no row state carries over between shipments;
          mounted only while open, as before (the editor is heavy) */}
      {collapsed === false && <CostsTab key={shipment.id} shipment={shipment} />}
    </SectionCard>
  );
}

/**
 * Invoicing works on the same buying / selling rows as the shipment's Costs tab:
 * the Costs section here IS that tab, and the invoice is built from the selling rows
 * ticked for Invoice. The chosen shipment is kept in the URL (?shipment=…), so the
 * page can be linked to and survives a reload.
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

  const handleSelect = (id: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set("shipment", id);
    else params.delete("shipment");
    const qs = params.toString();
    // push, not replace: Back returns from a job to the queue on the same tab and filters
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  if (!selectedShipmentId) return <BillingQueue onOpen={handleSelect} />;

  return (
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1400px] mx-auto flex flex-col gap-5">
        {/* Title row as on the queue page: the job switcher sits where the tabs are there */}
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
          <ShipmentPicker
            value={selectedShipmentId}
            selected={selectedShipment}
            onChange={handleSelect}
            allowClear
            className="w-96 max-w-full"
          />
        </div>

        {selectedShipment ? (
          <>
            <SectionCard title="Job">
              <ShipmentSummary shipment={selectedShipment} />
            </SectionCard>
            <CostsSection key={`costs-${selectedShipment.id}`} shipment={selectedShipment} />
            <InvoicePanel key={`inv-${selectedShipment.id}`} shipment={selectedShipment} />
          </>
        ) : (
          <AppCard>
            <div className="flex items-center justify-center h-[120px] text-slate-500 text-sm">
              {shipmentLoading
                ? "Loading the shipment…"
                : notFound
                  ? "Shipment not found — choose another job above, or clear the selection to see the queue."
                  : "Could not load the shipment."}
            </div>
          </AppCard>
        )}
      </div>
    </div>
  );
};

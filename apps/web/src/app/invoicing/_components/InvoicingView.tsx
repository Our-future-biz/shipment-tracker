"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, Tag } from "antd";
import { DownOutlined, RightOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useShipments, type ShipmentItem } from "@/hooks/useShipments";
import { PageHeader } from "@/components/PageHeader";
import { AppCard } from "@/components/AppCard";
import { formatDate } from "@/lib/date";
import { statusLabel, statusTagColor } from "@/lib/shipmentStatus";
import { moneyCz } from "@/lib/money";
import { CostsTab } from "@/app/shipments/[jobNumber]/tabs/CostsTab";
import { useCostsData } from "@/app/shipments/[jobNumber]/tabs/useCostsData";
import { InvoicePanel } from "./InvoicePanel";
import { BillingQueue } from "./BillingQueue";

/** Remembered per browser: whether the Costs section is collapsed. */
const COSTS_COLLAPSED_KEY = "invoicing.costsCollapsed";

const readCollapsed = () => {
  try {
    return localStorage.getItem(COSTS_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
};

/** Job facts at a glance, and whether it is invoiced already. */
function ShipmentSummary({ shipment }: { shipment: ShipmentItem }) {
  const { data } = useQuery({
    queryKey: ["invoice-docs", shipment.id],
    queryFn: () => api.invoicing.invoiceDocList(shipment.id),
  });
  const docs = data?.invoices ?? [];
  const open = docs.filter((d) => d.kind === "invoice" && d.status === "issued");
  const route = [shipment.pol, shipment.pod, shipment.destination].filter(Boolean).join(" → ");
  const status = shipment.status ?? "";

  const Item = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="min-w-0">
      <div className="text-[11px] font-bold uppercase tracking-[.04em] text-slate-500">{label}</div>
      <div className="text-[13px] text-slate-900 flex items-center flex-wrap gap-x-2 gap-y-1 break-words">{children}</div>
    </div>
  );

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-x-6 gap-y-3 mt-4 pt-4 border-t border-slate-100">
      <Item label="Job">
        <Link href={`/shipments/${shipment.id}`} className="font-semibold text-indigo-600 hover:underline">
          {shipment.jobNumber}
        </Link>
      </Item>
      <Item label="Customer">{shipment.customer || <span className="text-slate-500">Not linked</span>}</Item>
      <Item label="Direction · Status">
        {shipment.tradeDirection || "—"}
        {status && <Tag color={statusTagColor(status)} className="!m-0 !text-[11px]">{statusLabel(status)}</Tag>}
      </Item>
      <Item label="Route">{route || "—"}</Item>
      <Item label="ETD / ETA">
        {formatDate(shipment.estimatedDeparture) || "—"} / {formatDate(shipment.estimatedArrival) || "—"}
      </Item>
      <Item label="Invoiced">
        {open.length === 0 ? (
          <Tag color="orange" bordered={false} className="!m-0">Not invoiced</Tag>
        ) : (
          <span className="tabular-nums">
            <Tag color="green" bordered={false} className="!m-0">{open.length === 1 ? open[0]!.number : `${open.length} invoices`}</Tag>
            {open.length === 1 && `${moneyCz(Number(open[0]!.gross))} ${open[0]!.currency}`}
          </span>
        )}
      </Item>
    </div>
  );
}

/** The Costs section (the shipment's own Costs tab), collapsible to a one-line summary. */
function CostsSection({ shipment }: { shipment: ShipmentItem }) {
  const [collapsed, setCollapsed] = useState(false);
  const { billingCur, totals: t } = useCostsData(shipment);

  // read after mount: localStorage does not exist during server rendering
  useEffect(() => setCollapsed(readCollapsed()), []);

  const toggle = () => {
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
    <section className="mb-4">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        className="w-full flex items-center gap-3 px-4 h-10 mb-2 bg-white border border-slate-200 rounded-xl cursor-pointer text-left hover:bg-slate-50"
      >
        {collapsed ? <RightOutlined className="text-slate-500 text-[11px]" /> : <DownOutlined className="text-slate-500 text-[11px]" />}
        <span className="text-[12.5px] font-bold uppercase tracking-[.05em] text-slate-700">Costs</span>
        <span className="ml-auto flex items-center gap-4 text-[12.5px] text-slate-600 tabular-nums">
          <span>Buying <strong className="text-slate-900">{moneyCz(t.buyTotal)}</strong></span>
          <span>Selling <strong className="text-slate-900">{moneyCz(t.sellTotal)}</strong></span>
          <span>
            Profit{" "}
            <strong className={t.sellTotal - t.buyTotal >= 0 ? "text-[#177245]" : "text-[#C3392B]"}>
              {moneyCz(t.sellTotal - t.buyTotal)}
            </strong>
          </span>
          <span className="text-slate-500">{billingCur}</span>
        </span>
      </button>
      {/* key: a fresh Costs editor per shipment, so no row state carries over between shipments */}
      {!collapsed && <CostsTab key={shipment.id} shipment={shipment} />}
    </section>
  );
}

/**
 * Invoicing works on the same buying / selling rows as the shipment's Costs tab:
 * the Costs section here IS that tab, and the invoice is built from the selling rows
 * ticked for Invoice. The chosen shipment is kept in the URL (?shipment=…), so the
 * page can be linked to and survives a reload.
 */
export const InvoicingView = () => {
  const { shipments } = useShipments();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedShipmentId = searchParams.get("shipment");
  const selectedShipment = shipments.find((s) => s.id === selectedShipmentId);

  const select = (id: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set("shipment", id);
    else params.delete("shipment");
    const qs = params.toString();
    // push, not replace: Back returns from a job to the "Ready to bill" queue
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <div className="bg-slate-50 min-h-full p-6">
      <div className="max-w-[1400px] mx-auto">
        <PageHeader title="Invoicing" />

        <AppCard className="mb-5">
          <Select
            placeholder="Select a shipment..."
            value={selectedShipmentId}
            onChange={select}
            allowClear
            className="w-full max-w-xl"
            showSearch
            filterOption={(input, option) => (option?.label ?? "").toLowerCase().includes(input.toLowerCase())}
            options={shipments.map((s) => ({ value: s.id, label: `${s.jobNumber} — ${s.shipper} → ${s.consignee}` }))}
            aria-label="Shipment to invoice"
          />
          {selectedShipment && <ShipmentSummary shipment={selectedShipment} />}
        </AppCard>

        {!selectedShipment ? (
          selectedShipmentId && shipments.length ? (
            <AppCard>
              <div className="flex items-center justify-center h-[120px] text-slate-500 text-sm">Shipment not found</div>
            </AppCard>
          ) : (
            <BillingQueue shipments={shipments} onOpen={select} />
          )
        ) : (
          <>
            <CostsSection key={`costs-${selectedShipment.id}`} shipment={selectedShipment} />
            <InvoicePanel key={`inv-${selectedShipment.id}`} shipment={selectedShipment} />
          </>
        )}
      </div>
    </div>
  );
};

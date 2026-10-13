"use client";

import { useMemo, useState } from "react";
import { Input, Segmented, Table, Tag, Tooltip } from "antd";
import { SearchOutlined, WarningOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import type { ShipmentItem } from "@/hooks/useShipments";
import { formatDate } from "@/lib/date";
import { moneyCz } from "@/lib/money";

type QueueItem = interfaces.BillingQueueItem;
type Filter = "to_bill" | "partly_invoiced" | "invoiced" | "all";

interface Row extends QueueItem {
  shipment: ShipmentItem | undefined;
  /** The date the job is billed by: ETD for exports, ETA otherwise */
  serviceDate: string;
}

const STATUS: Record<string, { label: string; color: string }> = {
  to_bill: { label: "To bill", color: "orange" },
  partly_invoiced: { label: "Partly invoiced", color: "gold" },
  invoiced: { label: "Invoiced", color: "green" },
};

const serviceDateOf = (s: ShipmentItem | undefined) =>
  !s ? "" : ((s.tradeDirection ?? "").toLowerCase() === "export" ? s.estimatedDeparture : s.estimatedArrival) ?? "";

/**
 * "Ready to bill": every shipment with selling rows ticked for Invoice, and how much of
 * it is on an open invoice. Opening a row selects that shipment above.
 */
export function BillingQueue({ shipments, onOpen }: { shipments: ShipmentItem[]; onOpen: (shipmentId: string) => void }) {
  const [filter, setFilter] = useState<Filter>("to_bill");
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["invoice-queue"], queryFn: () => api.invoicing.invoiceQueue() });

  const rows: Row[] = useMemo(() => {
    const byId = new Map(shipments.map((s) => [s.id, s]));
    return (data?.queue ?? []).map((q) => {
      const shipment = byId.get(q.shipmentId);
      return { ...q, shipment, serviceDate: serviceDateOf(shipment) };
    });
  }, [data?.queue, shipments]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { to_bill: 0, partly_invoiced: 0, invoiced: 0 };
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => filter === "all" || r.status === filter)
      .filter((r) => {
        if (!q) return true;
        const s = r.shipment;
        return [s?.jobNumber, s?.customer, s?.shipper, s?.consignee, ...r.invoiceNumbers].some((v) => (v ?? "").toLowerCase().includes(q));
      });
  }, [rows, filter, search]);

  const columns: ColumnsType<Row> = [
    {
      title: "Job",
      key: "job",
      width: 130,
      sorter: (a, b) => (a.shipment?.jobNumber ?? "").localeCompare(b.shipment?.jobNumber ?? ""),
      render: (_, r) => <span className="font-mono font-semibold text-indigo-600">{r.shipment?.jobNumber ?? "—"}</span>,
    },
    {
      title: "Customer",
      key: "customer",
      ellipsis: true,
      render: (_, r) =>
        r.shipment?.customer || <span className="text-slate-500">{r.shipment ? `${r.shipment.shipper} → ${r.shipment.consignee}` : "Shipment not loaded"}</span>,
    },
    { title: "Direction", key: "dir", width: 100, render: (_, r) => r.shipment?.tradeDirection || "—" },
    {
      title: "ETD / ETA",
      key: "date",
      width: 110,
      defaultSortOrder: "ascend",
      sorter: (a, b) => (a.serviceDate || "9999").localeCompare(b.serviceDate || "9999"),
      render: (_, r) => formatDate(r.serviceDate) || "—",
    },
    {
      title: "To bill",
      key: "amount",
      width: 170,
      align: "right",
      sorter: (a, b) => a.amountToBill - b.amountToBill,
      render: (_, r) =>
        r.rowsToBill === 0 ? (
          <span className="text-slate-500">—</span>
        ) : (
          <span className="tabular-nums font-medium">
            {r.missingCurrencies.length > 0 && (
              <Tooltip title={`No exchange rate for ${r.missingCurrencies.join(", ")} — those lines are not in this amount`}>
                <WarningOutlined className="text-[#9A5B00] mr-1.5" />
              </Tooltip>
            )}
            {moneyCz(r.amountToBill)} {r.billingCurrency}
            <span className="block text-[11.5px] text-slate-500 font-normal">{r.rowsToBill} line{r.rowsToBill !== 1 ? "s" : ""}</span>
          </span>
        ),
    },
    {
      title: "Invoiced",
      key: "invoiced",
      width: 220,
      render: (_, r) =>
        r.invoiceNumbers.length === 0 ? (
          <span className="text-slate-500">—</span>
        ) : (
          <span className="text-[12.5px]">
            <span className="font-mono">{r.invoiceNumbers.join(", ")}</span>
            <span className="block text-slate-500 tabular-nums">{r.invoiced.map((i) => `${moneyCz(i.gross)} ${i.currency}`).join(" + ")}</span>
          </span>
        ),
    },
    {
      title: "Status",
      key: "status",
      width: 130,
      render: (_, r) => <Tag color={STATUS[r.status]?.color} bordered={false}>{STATUS[r.status]?.label ?? r.status}</Tag>,
    },
  ];

  const option = (value: Filter, label: string) => ({
    value,
    label: value === "all" ? label : `${label} (${counts[value] ?? 0})`,
  });

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <span className="text-[12.5px] font-bold uppercase tracking-[.05em] text-slate-700">Ready to bill</span>
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[option("to_bill", "To bill"), option("partly_invoiced", "Partly invoiced"), option("invoiced", "Invoiced"), option("all", "All")]}
        />
        <Input
          allowClear
          prefix={<SearchOutlined className="text-slate-400" />}
          placeholder="Search job, customer, invoice…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="!w-72 max-w-full ml-auto"
          aria-label="Search the queue"
        />
      </div>
      <Table<Row>
        size="middle"
        rowKey="shipmentId"
        loading={isLoading}
        dataSource={shown}
        columns={columns}
        pagination={shown.length > 25 ? { pageSize: 25, showSizeChanger: false } : false}
        scroll={{ x: 900 }}
        onRow={(r) => ({ onClick: () => onOpen(r.shipmentId), className: "cursor-pointer" })}
        locale={{
          emptyText:
            filter === "to_bill"
              ? "Nothing to bill — every selling line ticked for Invoice is on an invoice."
              : "No shipments here.",
        }}
      />
      <p className="text-[12px] text-slate-500 mt-2 mb-0">
        Amounts to bill use this week&apos;s exchange rates; the invoice uses the rate of its DUZP week. Click a row to open the job.
      </p>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Alert, Input, Segmented, Table, Tag, Tooltip } from "antd";
import { SearchOutlined, WarningOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import { formatDate } from "@/lib/date";
import { moneyCz } from "@/lib/money";
import { statusLabel, statusTagColor } from "@/lib/shipmentStatus";

type Row = interfaces.BillingQueueItem;
type View = "to_bill" | "not_invoiced" | "invoiced";

/** The date a job is billed by: ETD for exports, ETA otherwise. */
const serviceDateOf = (r: Row) => ((r.tradeDirection ?? "").toLowerCase() === "export" ? r.estimatedDeparture : r.estimatedArrival) ?? "";

export function InvoicingStatusTag({ value }: { value: string }) {
  return value === "Invoiced" ? (
    <Tag color="green" bordered={false} className="!m-0">Invoiced</Tag>
  ) : (
    <Tag color="red" bordered={false} className="!m-0">{value || "Not Invoiced"}</Tag>
  );
}

/**
 * The Invoicing queue. Which jobs are listed comes from the shipment itself: "To bill" are
 * the jobs operations set to Shipment Status "Billing"; "Not invoiced" / "Invoiced" follow
 * the Invoicing Status. Opening a row selects that shipment above.
 */
export function BillingQueue({ onOpen }: { onOpen: (shipmentId: string) => void }) {
  const [view, setView] = useState<View>("to_bill");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  // search runs on the server (across all shipments), so wait until typing pauses
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isFetching } = useQuery({
    queryKey: ["invoice-queue", view, debounced],
    queryFn: () => api.invoicing.invoiceQueue({ view, ...(debounced ? { search: debounced } : {}) }),
    placeholderData: keepPreviousData,
  });
  const rows = data?.queue ?? [];
  const counts = data?.counts;

  const columns: ColumnsType<Row> = [
    {
      title: "Job",
      dataIndex: "jobNumber",
      width: 130,
      sorter: (a, b) => a.jobNumber.localeCompare(b.jobNumber),
      render: (v: string) => <span className="font-mono font-semibold text-indigo-600">{v}</span>,
    },
    {
      title: "Customer",
      key: "customer",
      ellipsis: true,
      render: (_, r) => r.customer || <span className="text-slate-500">{`${r.shipper} → ${r.consignee}`}</span>,
    },
    { title: "Direction", dataIndex: "tradeDirection", width: 95, render: (v: string) => v || "—" },
    {
      title: "ETD / ETA",
      key: "date",
      width: 105,
      defaultSortOrder: "ascend",
      sorter: (a, b) => (serviceDateOf(a) || "9999").localeCompare(serviceDateOf(b) || "9999"),
      render: (_, r) => formatDate(serviceDateOf(r)) || "—",
    },
    {
      title: "Shipment Status",
      dataIndex: "shipmentStatus",
      width: 170,
      render: (v: string) => (v ? <Tag color={statusTagColor(v)} className="!m-0">{statusLabel(v)}</Tag> : "—"),
    },
    {
      title: "To bill",
      key: "amount",
      width: 160,
      align: "right",
      sorter: (a, b) => a.amountToBill - b.amountToBill,
      render: (_, r) =>
        r.billingState === "none" ? (
          <Tooltip title="No selling costs ticked for Invoice yet — add them in the Costs section of the job">
            <span className="text-[#9A5B00] text-[12.5px]"><WarningOutlined className="mr-1" />No selling lines</span>
          </Tooltip>
        ) : r.rowsToBill === 0 ? (
          <span className="text-slate-500">—</span>
        ) : (
          <span className="tabular-nums font-medium">
            {r.missingCurrencies.length > 0 && (
              <Tooltip title={`ČNB publishes no rate for ${r.missingCurrencies.join(", ")} — those lines are not in this amount`}>
                <WarningOutlined className="text-[#9A5B00] mr-1.5" />
              </Tooltip>
            )}
            {moneyCz(r.amountToBill)} {r.billingCurrency}
            <span className="block text-[11.5px] text-slate-500 font-normal">{r.rowsToBill} line{r.rowsToBill !== 1 ? "s" : ""}</span>
          </span>
        ),
    },
    {
      title: "Invoices",
      key: "invoices",
      width: 200,
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
      title: "Invoicing Status",
      dataIndex: "invoicingStatus",
      width: 130,
      render: (v: string) => <InvoicingStatusTag value={v} />,
    },
  ];

  const label = (text: string, n: number | undefined) => (n === undefined ? text : `${text} (${n})`);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <span className="text-[12.5px] font-bold uppercase tracking-[.05em] text-slate-700">Invoicing queue</span>
        <Segmented<View>
          value={view}
          onChange={setView}
          options={[
            { value: "to_bill", label: label("To bill", counts?.toBill) },
            { value: "not_invoiced", label: label("Not invoiced", counts?.notInvoiced) },
            { value: "invoiced", label: label("Invoiced", counts?.invoiced) },
          ]}
        />
        <Input
          allowClear
          prefix={<SearchOutlined className="text-slate-400" />}
          placeholder="Search job, customer, shipper…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="!w-72 max-w-full ml-auto"
          aria-label="Search the queue"
        />
      </div>
      {data?.truncated && (
        <Alert type="info" showIcon className="mb-3" message={`Showing the first ${rows.length} jobs — use the search to narrow the list.`} />
      )}
      <Table<Row>
        size="middle"
        rowKey="shipmentId"
        loading={isFetching && !data}
        dataSource={rows}
        columns={columns}
        pagination={rows.length > 25 ? { pageSize: 25, showSizeChanger: false } : false}
        scroll={{ x: 1100 }}
        onRow={(r) => ({ onClick: () => onOpen(r.shipmentId), className: "cursor-pointer" })}
        locale={{
          emptyText:
            view === "to_bill"
              ? "No jobs to bill — a job appears here when its Shipment Status is set to Billing."
              : "No shipments here.",
        }}
      />
      <p className="text-[12px] text-slate-500 mt-2 mb-0">
        To bill = Shipment Status &quot;Billing&quot;. Issuing an invoice sets the job to Billed / Invoiced; a credit note puts it back.
        Amounts are estimates at today&apos;s ČNB rates (with the ROE % on other currencies); the invoice uses the ČNB rate of its DUZP.
      </p>
    </div>
  );
}

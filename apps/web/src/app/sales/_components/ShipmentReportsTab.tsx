"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, DatePicker, Input, Tooltip } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { formatDate, todayIso } from "@/lib/date";
import { useJobProfitReport } from "@/hooks/useJobProfitReport";
import { fmtMoney } from "@/lib/money";
import { DataTable } from "@/components/DataTable";
import { KpiTile, profitTone } from "@/components/KpiTile";
import { Pill } from "@/components/Pill";
import { StatusBadge } from "@/components/StatusBadge";
import type { interfaces } from "@/lib/api/client";
import { periodBasisLabel, provisionalText } from "../_lib/jobPeriod";
import { CARD, LABEL_TEXT, LINK, REF } from "@/styles/ui";
import { MonthBreakdownDialog } from "./MonthBreakdownDialog";

type Report = interfaces.JobProfitReport;
type Row = Report["rows"][number];
type Month = Report["months"][number];

const czk = (v: number) => fmtMoney(v, "CZK", true);
const tone = (v: number) => (v >= 0 ? "text-emerald-600" : "text-red-600");

// Job profit from Costs Breakdown, in CZK at each month's fixed ČNB average (mean of the
// month's fixing days, without the ROE %). A job falls in the month of its ATA (import) /
// ATD (export); until then of its ETA / ETD, marked provisional. A road job falls in the month it was
// delivered; until then of its planned delivery date, marked provisional.
export function ShipmentReportsTab() {
  // The default range (this year to this month) is read from the browser's clock after mount,
  // so a page rendered on the server (possibly in another month) can't disagree with it.
  const [range, setRange] = useState<[string, string] | null>(null);
  const [search, setSearch] = useState("");
  const [openMonth, setOpenMonth] = useState<string | null>(null);
  useEffect(() => {
    const thisMonth = todayIso().slice(0, 7);
    setRange((r) => r ?? [`${thisMonth.slice(0, 4)}-01`, thisMonth]);
  }, []);

  const { data, isLoading, isError } = useJobProfitReport(range);

  const rows = useMemo<Row[]>(() => {
    const term = search.trim().toLowerCase();
    return (data?.rows ?? []).filter(
      (r) => !term || r.jobNumber.toLowerCase().includes(term) || r.customer.toLowerCase().includes(term),
    );
  }, [data, search]);

  const totals = useMemo(() => {
    let revenue = 0;
    let profit = 0;
    let provisional = 0;
    for (const r of rows) {
      revenue += r.revenueCzk;
      profit += r.profitCzk;
      if (r.provisional) provisional += 1;
    }
    return { count: rows.length, revenue, profit, provisional, margin: revenue ? Math.round((profit / revenue) * 100) : 0 };
  }, [rows]);

  const unconverted = useMemo(() => [...new Set(rows.flatMap((r) => r.unconverted))].sort(), [rows]);

  const columns: ColumnsType<Row> = [
    {
      title: "Internal Reference",
      dataIndex: "jobNumber",
      render: (v: string) => <span className={REF}>{v}</span>,
    },
    { title: "Customer", dataIndex: "customer", render: (v: string) => v || <span className="text-slate-300">—</span> },
    { title: "Freight Mode", dataIndex: "freightMode", render: (v: string) => v || <span className="text-slate-300">—</span> },
    { title: "Shipment Status", dataIndex: "status", render: (v: string) => <StatusBadge status={v} /> },
    {
      title: "Period",
      key: "period",
      render: (_: unknown, r) => (
        <span className="whitespace-nowrap">
          {dayjs(`${r.month}-01`).format("MMM YYYY")}{" "}
          <span className="text-slate-400 text-[12px]">
            {periodBasisLabel(r.basis)} {formatDate(r.date)}
          </span>
          {r.provisional && (
            <Tooltip title={provisionalText(r.basis)}>
              <Pill tone="amber" className="ml-1.5">provisional</Pill>
            </Tooltip>
          )}
        </span>
      ),
    },
    { title: "Revenue (CZK)", dataIndex: "revenueCzk", align: "right", render: (v: number) => czk(v) },
    { title: "Costs (CZK)", dataIndex: "costCzk", align: "right", render: (v: number) => czk(v) },
    {
      title: "Profit (CZK)",
      dataIndex: "profitCzk",
      align: "right",
      render: (v: number, r) => (
        <span className={tone(v)}>
          {czk(v)}
          {r.unconverted.length > 0 && (
            <Tooltip title={`No ČNB average for ${r.unconverted.join(", ")} — left out`}>
              <span className="ml-1 text-warn">*</span>
            </Tooltip>
          )}
        </span>
      ),
    },
  ];

  const monthColumns: ColumnsType<Month> = [
    {
      title: "Month",
      dataIndex: "month",
      render: (v: string) => (
        <button type="button" aria-haspopup="dialog" className={`bg-transparent border-none p-0 cursor-pointer font-semibold ${LINK}`} onClick={() => setOpenMonth(v)}>
          {dayjs(`${v}-01`).format("MMMM YYYY")}
        </button>
      ),
    },
    { title: "Jobs", dataIndex: "jobs", align: "right" },
    { title: "Revenue (CZK)", dataIndex: "revenueCzk", align: "right", render: (v: number) => czk(v) },
    { title: "Costs (CZK)", dataIndex: "costCzk", align: "right", render: (v: number) => czk(v) },
    { title: "Profit (CZK)", dataIndex: "profitCzk", align: "right", render: (v: number) => <span className={tone(v)}>{czk(v)}</span> },
    {
      title: "ČNB average used",
      key: "avg",
      render: (_: unknown, m) => (
        <span className="text-slate-500 text-[13px] whitespace-nowrap">
          {m.averages.map((a) => `${a.currency} ${a.average.toFixed(3)}`).join(" · ") || "—"}
          {!m.final && <Pill tone="amber" className="ml-1.5">provisional</Pill>}
        </span>
      ),
    },
  ];

  return (
    <div>
      <span className={`block ${LABEL_TEXT} mb-3`}>Shipment Reports</span>

      <div className="grid grid-cols-4 gap-3 mb-4">
        <KpiTile label="Jobs" value={String(totals.count)} />
        <KpiTile label="Revenue" value={czk(totals.revenue)} />
        <KpiTile label="Profit" value={czk(totals.profit)} tone={profitTone(totals.profit)} />
        <KpiTile label="Margin" value={`${totals.margin}%`} />
      </div>

      <div className={`flex flex-wrap items-center gap-3 ${CARD} px-4 py-3 mb-4`}>
        <DatePicker.RangePicker
          picker="month"
          allowClear={false}
          value={range ? [dayjs(`${range[0]}-01`), dayjs(`${range[1]}-01`)] : null}
          onChange={(v) => v && v[0] && v[1] && setRange([v[0].format("YYYY-MM"), v[1].format("YYYY-MM")])}
          format="MMM YYYY"
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          prefix={<SearchOutlined className="text-slate-400" />}
          placeholder="Search by job # or customer"
          allowClear
          className="max-w-xs"
        />
        <span className="text-[13px] text-slate-500">
          CZK at each month&apos;s ČNB average (fixing days, no ROE %) · by ATA (import) / ATD (export)
          {totals.provisional > 0 && ` · ${totals.provisional} provisional (no ATA / ATD or delivery yet)`}
          {data?.undated ? ` · ${data.undated} job${data.undated === 1 ? "" : "s"} without any date not shown` : ""}
        </span>
      </div>

      {isError && <Alert type="error" showIcon className="mb-4" message="Could not load the job profit report." />}

      {unconverted.length > 0 && (
        <div className="text-[13px] text-warn-ink bg-warn-soft border border-warn/40 rounded-xl px-4 py-2.5 mb-4">
          No ČNB average for {unconverted.join(", ")} — those amounts are left out (marked *).
        </div>
      )}

      {(data?.months.length ?? 0) > 1 && (
        <div className="mb-4">
          <DataTable<Month>
            dataSource={data?.months ?? []}
            columns={monthColumns}
            rowKey="month"
            loading={isLoading}
            rowClassName="cursor-pointer"
            onRow={(m) => ({ onClick: () => setOpenMonth(m.month) })}
          />
        </div>
      )}

      <DataTable<Row>
        resizeKey="sales:shipment-reports"
        dataSource={rows}
        columns={columns}
        rowKey="shipmentId"
        loading={isLoading}
        scroll={{ x: "max-content" }}
        resetKey={`${search}|${range?.join("-") ?? ""}`}
      />

      <MonthBreakdownDialog month={openMonth} rows={data?.rows ?? []} onClose={() => setOpenMonth(null)} />
    </div>
  );
}

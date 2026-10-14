"use client";

import { useState } from "react";
import Link from "next/link";
import { Spin } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { AppGrid, type AppGridColumn } from "@/components/AppGrid";
import { useClaims, useReportSummary, useSavedReports, type Claim, type SavedReport } from "@/hooks/useWarehouseRecords";
import { formatDateTime } from "@/lib/date";
import type { interfaces } from "@/lib/api/client";
import { TERMS } from "@/app/warehouse/_lib/glossary";
import { useUrlParam } from "@/app/warehouse/_lib/useUrlParam";
import { Callout, Card, Kpi, RecordFormModal, StatusTag, SubTabs, dim, nf } from "./shared";

type Sub = "throughput" | "utilisation" | "quality" | "library";
type Top = interfaces.TopCustomer;
type Month = interfaces.MonthlySummary;
type Lane = interfaces.LaneFill;

const CLAIM_STATUSES = ["Under review", "Filed", "Open", "Claim filed", "Settled", "Settled — insurer", "Recovered", "Rejected"];
const CLAIM_COLORS: Record<string, string> = {
  Open: "orange",
  "Under review": "orange",
  Filed: "orange",
  "Claim filed": "red",
  Settled: "green",
  "Settled — insurer": "green",
  Recovered: "green",
  Rejected: "red",
};
const VERDICT_COLORS: Record<string, string> = { Healthy: "green", Acceptable: "orange", "Below target": "red" };
const REPORT_FORMATS = ["XLSX", "PDF", "CSV"];

const btnPrimary =
  "flex items-center gap-1.5 shrink-0 rounded-lg bg-indigo-600 px-3 h-8 text-[13px] font-semibold text-white hover:bg-indigo-700 transition-colors";

const SUBS = ["throughput", "utilisation", "quality", "library"] as const satisfies readonly Sub[];

export function ReportsTab() {
  const [sub, setSub] = useUrlParam<Sub>("sub", SUBS, "throughput");
  return (
    <div className="flex flex-col gap-5">
      <HealthLine />
      <SubTabs
        tabs={[
          { key: "throughput", label: "Throughput" },
          { key: "utilisation", label: "Consol Utilisation" },
          { key: "quality", label: "Quality & Claims" },
          { key: "library", label: "Report Library" },
        ]}
        active={sub}
        onChange={setSub}
      />
      {sub === "throughput" && <Throughput />}
      {sub === "utilisation" && <Utilisation />}
      {sub === "quality" && <QualityAndClaims />}
      {sub === "library" && <Library />}
    </div>
  );
}

// ---------- Health ----------

// One line on the link with Shipments and on storage: shipment updates the gate still owes
// (retrying / failed — amber or red when not zero) and the cargo in the warehouse by free time.
function HealthLine() {
  const { summary } = useReportSummary();
  if (!summary) return null;
  const u = summary.shipmentUpdates;
  const st = summary.storage;
  const tone = u.failed > 0 ? "border-red-200 bg-red-50 text-red-700" : u.pending > 0 ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-600";
  return (
    <div role="status" className={`flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl border px-4 py-2 text-xs ${tone}`}>
      <span>
        <b>Shipment updates:</b> {u.pending} pending · {u.failed} failed
        {u.oldestPendingAt ? ` · oldest pending since ${formatDateTime(u.oldestPendingAt)}` : ""}
        {u.pending + u.failed > 0 && (
          <Link href="/warehouse?tab=gatelog" className="ml-2 font-semibold underline">
            Open the Gate Log
          </Link>
        )}
      </span>
      <span className="text-slate-600">
        <b>Storage:</b> {st.inWarehouse} in the warehouse · <span className={st.expiring ? "text-amber-700" : ""}>{st.expiring} expiring ≤ 2 days</span> ·{" "}
        <span className={st.chargeable ? "text-red-600" : ""}>
          {st.chargeable} chargeable (est. CZK {nf(st.estimatedCzk)})
        </span>
      </span>
    </div>
  );
}

// ---------- Throughput ----------

function ThroughputChart({ weeks }: { weeks: interfaces.ThroughputWeek[] }) {
  const W = 520;
  const H = 190;
  const max = Math.max(1, ...weeks.flatMap((w) => [w.receivedCbm, w.dispatchedCbm]));
  const bw = W / Math.max(weeks.length, 1);
  return (
    <svg viewBox={`0 0 ${W} ${H + 26}`} className="w-full h-auto" role="img" aria-label="Volume received vs dispatched per week">
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <line key={t} x1={0} x2={W} y1={H - t * H} y2={H - t * H} stroke="#f1f5f9" />
      ))}
      {weeks.map((w, i) => {
        const h1 = (w.receivedCbm / max) * H;
        const h2 = (w.dispatchedCbm / max) * H;
        const x = i * bw;
        return (
          <g key={w.week}>
            <rect x={x + bw * 0.14} y={H - h1} width={bw * 0.32} height={h1} rx={2} fill="#6366f1">
              <title>{`${w.week} received ${w.receivedCbm} cbm`}</title>
            </rect>
            <rect x={x + bw * 0.5} y={H - h2} width={bw * 0.32} height={h2} rx={2} fill="#c7d2fe">
              <title>{`${w.week} dispatched ${w.dispatchedCbm} cbm`}</title>
            </rect>
            <text x={x + bw / 2} y={H + 16} textAnchor="middle" fontSize={10} fill="#94a3b8">
              {w.week}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Throughput() {
  const { summary, isLoading } = useReportSummary();
  if (isLoading || !summary) return <Spin className="self-center my-10" />;

  const topColumns: AppGridColumn<Top>[] = [
    { key: "customer", title: "Customer", width: 200, text: (r) => r.customer, render: (_, r) => <span className="font-medium text-slate-800">{r.customer}</span> },
    { key: "jobs", title: "Jobs", width: 80, align: "right", text: (r) => String(r.jobs), render: (_, r) => dim(r.jobs) },
    { key: "cbm", title: TERMS.volumeCbm, width: 110, align: "right", text: (r) => String(r.cbm), render: (_, r) => dim(nf(r.cbm, 1)) },
    { key: "wm", title: "w/m", width: 90, align: "right", text: (r) => String(r.wm), render: (_, r) => dim(nf(r.wm, 1)) },
    { key: "share", title: "Share", width: 90, align: "right", text: (r) => `${r.share} %`, render: (_, r) => dim(`${r.share} %`) },
  ];
  const monthColumns: AppGridColumn<Month>[] = [
    { key: "month", title: "Month", width: 130, text: (r) => r.month, render: (_, r) => <span className="font-medium text-slate-800">{r.month}{r.monthToDate ? " (MTD)" : ""}</span> },
    { key: "receipts", title: "Receipts", width: 100, align: "right", text: (r) => String(r.receipts), render: (_, r) => dim(r.receipts) },
    { key: "cbmIn", title: `${TERMS.volumeCbm} in`, width: 120, align: "right", text: (r) => String(r.cbmIn), render: (_, r) => dim(nf(r.cbmIn, 1)) },
    { key: "dispatches", title: "Dispatches", width: 110, align: "right", text: (r) => String(r.dispatches), render: (_, r) => dim(r.dispatches) },
    { key: "cbmOut", title: `${TERMS.volumeCbm} out`, width: 120, align: "right", text: (r) => String(r.cbmOut), render: (_, r) => dim(nf(r.cbmOut, 1)) },
    { key: "consolPositions", title: "Consols", width: 100, align: "right", text: (r) => String(r.consolPositions), render: (_, r) => dim(r.consolPositions) },
    { key: "containersLoaded", title: "Containers loaded", width: 150, align: "right", text: (r) => String(r.containersLoaded), render: (_, r) => dim(r.containersLoaded) },
    { key: "fclStuffed", title: "FCL stuffed", width: 110, align: "right", text: (r) => String(r.fclStuffed), render: (_, r) => dim(r.fclStuffed) },
    { key: "fclStripped", title: "FCL stripped", width: 120, align: "right", text: (r) => String(r.fclStripped), render: (_, r) => dim(r.fclStripped) },
    { key: "yardContainerDays", title: "Yard ctr-days", width: 120, align: "right", text: (r) => String(r.yardContainerDays), render: (_, r) => dim(r.yardContainerDays) },
  ];

  return (
    <>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
        <Card
          title="Volume received vs. dispatched — last 8 weeks"
          extra={
            <span className="flex gap-3">
              <span className="inline-flex items-center gap-1.5">
                <i className="inline-block w-2.5 h-2.5 rounded-sm bg-indigo-500" /> Received cbm
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="inline-block w-2.5 h-2.5 rounded-sm bg-indigo-200" /> Dispatched cbm
              </span>
            </span>
          }
        >
          <ThroughputChart weeks={summary.throughput} />
        </Card>
        <Card title="Top customers by volume — MTD" bodyClassName="p-4">
          <AppGrid<Top>
            columns={topColumns}
            rows={summary.topCustomers}
            rowKey={(r) => r.customer}
            storageKey="warehouse:report-top-customers"
            exportFilePrefix="top-customers"
            emptyText="Nothing received this month yet."
          />
        </Card>
      </div>
      <Card title="Monthly summary" bodyClassName="p-4">
        <AppGrid<Month>
          columns={monthColumns}
          rows={summary.monthly}
          rowKey={(r) => r.month}
          storageKey="warehouse:report-monthly"
          exportFilePrefix="monthly-summary"
        />
      </Card>
    </>
  );
}

// ---------- Consol utilisation ----------

function FillMeter({ value }: { value: number }) {
  const color = value >= 80 ? "bg-emerald-500" : value >= 60 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className="text-xs font-semibold tabular-nums text-slate-700">{value} %</span>
    </div>
  );
}

function Utilisation() {
  const { summary, isLoading } = useReportSummary();
  if (isLoading || !summary) return <Spin className="self-center my-10" />;

  const columns: AppGridColumn<Lane>[] = [
    { key: "lane", title: "Lane (discharge port)", width: 200, text: (r) => r.lane, render: (_, r) => <span className="font-medium text-slate-800">{r.lane}</span> },
    { key: "containers", title: "Containers", width: 110, align: "right", text: (r) => String(r.containers), render: (_, r) => dim(r.containers) },
    { key: "avgCbm", title: `Avg ${TERMS.volumeCbm.toLowerCase()}`, width: 130, align: "right", text: (r) => String(r.avgCbm), render: (_, r) => dim(nf(r.avgCbm, 1)) },
    { key: "capacityCbm", title: "Capacity", width: 100, align: "right", text: (r) => String(r.capacityCbm), render: (_, r) => dim(r.capacityCbm) },
    { key: "fill", title: "Fill rate", width: 170, text: (r) => `${r.fill} %`, render: (_, r) => <FillMeter value={r.fill} /> },
    { key: "avgPieces", title: "Avg pieces", width: 110, align: "right", text: (r) => String(r.avgPieces), render: (_, r) => dim(nf(r.avgPieces, 1)) },
    { key: "verdict", title: "Verdict", width: 130, text: (r) => r.verdict, filterOptions: Object.keys(VERDICT_COLORS), render: (_, r) => <StatusTag value={r.verdict} colors={VERDICT_COLORS} /> },
  ];

  return (
    <>
      <Card title="Consol fill rate by lane — last 90 days" extra="Target 80 % of working capacity" bodyClassName="p-4">
        <AppGrid<Lane>
          columns={columns}
          rows={summary.lanes}
          rowKey={(r) => r.lane}
          storageKey="warehouse:report-lanes"
          exportFilePrefix="consol-fill-rate"
          emptyText="No loaded containers with volume in the last 90 days."
        />
      </Card>
      <Callout title="Reading this table.">
        A lane running consistently below 70 % either needs a longer closing cycle or a smaller box. Fill is the loaded volume against the working
        capacity of the container type (20&apos; DV 31 · 40&apos; DV 66 · 40&apos; HC 76 · 45&apos; HC 84 cbm).
      </Callout>
    </>
  );
}

// ---------- Quality & claims ----------

function QualityAndClaims() {
  const { summary } = useReportSummary();
  const claims = useClaims();
  const [editing, setEditing] = useState<{ claim?: Claim } | null>(null);
  const q = summary?.quality;

  const columns: AppGridColumn<Claim>[] = [
    { key: "ref", title: "Claim", width: 130, text: (c) => c.ref, render: (_, c) => <span className="font-mono font-bold text-indigo-500">{c.ref}</span> },
    { key: "job", title: "House job", width: 160, text: (c) => c.job, render: (_, c) => (c.job ? <span className="font-mono text-slate-700">{c.job}</span> : dim("")) },
    { key: "against", title: "Against", width: 220, text: (c) => c.against, render: (_, c) => dim(c.against) },
    { key: "type", title: "Type", width: 150, text: (c) => c.type, render: (_, c) => dim(c.type) },
    { key: "value", title: "Value", width: 120, align: "right", text: (c) => c.value, render: (_, c) => dim(c.value) },
    { key: "raised", title: "Raised", width: 110, text: (c) => c.raised, render: (_, c) => dim(c.raised) },
    { key: "status", title: "Status", width: 150, text: (c) => c.status, filterOptions: CLAIM_STATUSES, render: (_, c) => <StatusTag value={c.status} colors={CLAIM_COLORS} /> },
  ];

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Kpi
          label="Damage rate YTD"
          value={q?.damageRate != null ? `${nf(q.damageRate, 2)} %` : "—"}
          sub={q ? `${q.damagedPieces} damaged of ${q.surveyedPieces} surveyed pieces` : "of lines handled"}
        />
        <Kpi label="Put-away accuracy" value="—" sub="location correct at stock take — no stock takes recorded" tone="green" />
        <Kpi label="On-time dispatch" value={q?.onTimeDispatch != null ? `${nf(q.onTimeDispatch, 1)} %` : "—"} sub="outbound dock slots completed, not overdue" />
      </div>
      <Card title="Claims register" bodyClassName="p-4">
        <AppGrid<Claim>
          searchPlaceholder="Search claim, job, party…"
          actions={
            <button className={btnPrimary} onClick={() => setEditing({})}>
              <PlusOutlined /> Claim
            </button>
          }
          columns={columns}
          rows={claims.items}
          rowKey={(c) => c.id}
          loading={claims.isLoading}
          onRowClick={(c) => setEditing({ claim: c })}
          storageKey="warehouse:claims"
          exportFilePrefix="claims-register"
          emptyText="No claims raised."
        />
      </Card>
      {editing && (
        <RecordFormModal<interfaces.WarehouseClaimInput>
          open
          title={editing.claim ? `Claim ${editing.claim.ref}` : "New claim"}
          fields={[
            { name: "job", label: "House job / position", placeholder: "WCZ… / CZ…" },
            { name: "against", label: "Against", placeholder: "Origin agent — …" },
            { name: "type", label: "Type", placeholder: "Short landed / Damage / Wet damage" },
            { name: "value", label: "Value", placeholder: "USD 1 240" },
            { name: "raised", label: "Raised", type: "date" },
            { name: "status", label: "Status", type: "select", options: CLAIM_STATUSES },
          ]}
          initial={editing.claim ?? { status: "Under review" }}
          saving={claims.isSaving}
          onCancel={() => setEditing(null)}
          onSubmit={(v) => (editing.claim ? claims.update(editing.claim.id, v) : claims.create(v))}
          onDelete={editing.claim ? () => claims.remove(editing.claim!.id) : undefined}
          okText={editing.claim ? "Save" : "Raise claim"}
        />
      )}
    </>
  );
}

// ---------- Report library ----------

function Library() {
  const reports = useSavedReports();
  const [editing, setEditing] = useState<{ report?: SavedReport } | null>(null);

  const columns: AppGridColumn<SavedReport>[] = [
    { key: "name", title: "Report", width: 240, text: (r) => r.name, render: (_, r) => <span className="font-medium text-slate-800">{r.name}</span> },
    { key: "owner", title: "Owner", width: 140, text: (r) => r.owner, render: (_, r) => dim(r.owner) },
    { key: "frequency", title: "Frequency", width: 140, text: (r) => r.frequency, render: (_, r) => dim(r.frequency) },
    { key: "format", title: "Format", width: 100, text: (r) => r.format, filterOptions: REPORT_FORMATS, render: (_, r) => <StatusTag value={r.format} colors={{}} /> },
    { key: "distribution", title: "Distribution", width: 260, text: (r) => r.distribution, render: (_, r) => dim(r.distribution) },
  ];

  return (
    <Card title="Saved reports" bodyClassName="p-4">
      <AppGrid<SavedReport>
        searchPlaceholder="Search report, owner…"
        actions={
          <button className={btnPrimary} onClick={() => setEditing({})}>
            <PlusOutlined /> New report
          </button>
        }
        columns={columns}
        rows={reports.items}
        rowKey={(r) => r.id}
        loading={reports.isLoading}
        onRowClick={(r) => setEditing({ report: r })}
        storageKey="warehouse:saved-reports"
        exportFilePrefix="report-library"
        emptyText="No saved reports yet."
      />
      {editing && (
        <RecordFormModal<interfaces.WarehouseSavedReportInput>
          open
          title={editing.report ? editing.report.name : "New report"}
          fields={[
            { name: "name", label: "Report", required: true, full: true, placeholder: "Daily stock position" },
            { name: "owner", label: "Owner", placeholder: "Warehouse / Finance / Management" },
            { name: "frequency", label: "Frequency", placeholder: "Daily 06:00" },
            { name: "format", label: "Format", type: "select", options: REPORT_FORMATS },
            { name: "distribution", label: "Distribution", full: true, placeholder: "Ops + customers on subscription" },
          ]}
          initial={editing.report ?? { format: "XLSX" }}
          saving={reports.isSaving}
          onCancel={() => setEditing(null)}
          onSubmit={(v) => (editing.report ? reports.update(editing.report.id, v) : reports.create(v))}
          onDelete={editing.report ? () => reports.remove(editing.report!.id) : undefined}
          okText={editing.report ? "Save" : "Add report"}
        />
      )}
    </Card>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { Alert, Segmented, Spin } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { AppGrid, type AppGridColumn } from "@/components/AppGrid";
import { useClaims, useSavedReports, type Claim, type SavedReport } from "@/hooks/useWarehouseRecords";
import { formatDateTime } from "@/lib/date";
import type { interfaces } from "@/lib/api/client";
import { TERMS } from "@/app/warehouse-concept/_lib/glossary";
import { useUrlParam } from "@/hooks/useUrlParam";
import { KpiCard, KpiPeriodBar, kpiTone } from "../kpi/KpiCards";
import { useKpiPeriod, useKpiReport } from "@/hooks/useKpis";
import { Callout, Card, RecordFormModal, StatusTag, SubTabs, dim, nf } from "./shared";

// Reports: KPIs worked out from the gate stamps for a period (each says how it is measured; a
// figure that cannot be measured says so), throughput, consol fill, quality and claims.

type Sub = "kpis" | "throughput" | "utilisation" | "quality" | "library";
type Top = interfaces.TopCustomer;
type Month = interfaces.MonthlySummary;
type Lane = interfaces.LaneFill;
type Report = interfaces.WarehouseKpiReport;
type Bucket = interfaces.KpiThroughputBucket;

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

const SUBS = ["kpis", "throughput", "utilisation", "quality", "library"] as const satisfies readonly Sub[];

export function ReportsTab() {
  const [sub, setSub] = useUrlParam<Sub>("sub", SUBS, "kpis");
  const period = useKpiPeriod();
  const { report, isLoading, isFetching, error } = useKpiReport(period.range);
  const periodBound = sub === "kpis" || sub === "throughput" || sub === "utilisation" || sub === "quality";
  return (
    <div className="flex flex-col gap-5">
      {report && <HealthLine report={report} />}
      <SubTabs
        tabs={[
          { key: "kpis", label: "KPIs" },
          { key: "throughput", label: "Throughput" },
          { key: "utilisation", label: "Consol Utilisation" },
          { key: "quality", label: "Quality & Claims" },
          { key: "library", label: "Report Library" },
        ]}
        active={sub}
        onChange={setSub}
      />
      {periodBound && <KpiPeriodBar preset={period.preset} range={period.range} onPreset={period.setPreset} onCustom={period.setCustom} busy={isFetching && !isLoading} />}
      {periodBound && error && <Alert type="error" showIcon message="The reports could not be worked out" description={error instanceof Error ? error.message : String(error)} />}
      {periodBound && !error && (isLoading || !report) && <Spin className="self-center my-10" />}
      {report && sub === "kpis" && <Kpis report={report} />}
      {report && sub === "throughput" && <Throughput report={report} />}
      {report && sub === "utilisation" && <Utilisation report={report} />}
      {sub === "quality" && <QualityAndClaims report={report} />}
      {sub === "library" && <Library />}
    </div>
  );
}

// ---------- Health ----------

// One line on the link with Shipments and on storage, both as they are now (not the period):
// shipment updates the gate still owes (amber / red when not zero) and the cargo by free time.
// Also on the managers' cockpit (Warehouse Concept → Managers), from its own figures.
export function HealthLine({ report }: { report: Pick<Report, "shipmentUpdates" | "storage"> }) {
  const u = report.shipmentUpdates;
  const st = report.storage;
  const tone = u.failed > 0 ? "border-red-200 bg-red-50 text-red-700" : u.pending > 0 ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-600";
  return (
    <div role="status" className={`flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl border px-4 py-2 text-xs ${tone}`}>
      <span>
        <b>Shipment updates now:</b> {u.pending} pending · {u.failed} failed
        {u.oldestPendingAt ? ` · oldest pending since ${formatDateTime(u.oldestPendingAt)}` : ""}
        {u.pending + u.failed > 0 && (
          <Link href="/warehouse-concept?tab=gatelog" className="ml-2 font-semibold underline">
            Open the Gate Log
          </Link>
        )}
      </span>
      <span className="text-slate-600">
        <b>Storage now:</b> {st.inWarehouse} in the warehouse · <span className={st.expiring ? "text-amber-700" : ""}>{st.expiring} expiring ≤ 2 days</span> ·{" "}
        <span className={st.chargeable ? "text-red-600" : ""}>
          {st.chargeable} chargeable (est. CZK {nf(st.estimatedCzk)})
        </span>
      </span>
    </div>
  );
}

// ---------- KPIs ----------

const KPI_ORDER = ["dwell", "gateToReceipt", "receiptToRelease", "throughput", "dockUtilisation", "onTime", "reweighVariance", "exceptionRate", "outboxHealth"];

function Kpis({ report }: { report: Report }) {
  const kpis = [...report.kpis].sort((a, b) => KPI_ORDER.indexOf(a.key) - KPI_ORDER.indexOf(b.key));
  const d = report.docks;
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-start">
        {kpis.map((k) => (
          <KpiCard key={k.key} kpi={k} tone={kpiTone(k)} />
        ))}
      </div>
      <Callout title="Where the figures come from.">
        Everything is worked out from the gate stamps, the stripping tally, the dock slots, the re-weighs and the exceptions — nothing is typed in. Received =
        WH receipt (inbound) or the stripping tally tick (outbound; the typed received date only without a container tally). Left = WH release, or the
        gate-out of the export container the cargo was stuffed in. Days are Prague days. Dock utilisation uses {d.docks.length} docks ({d.docks.join(", ")}),
        open {d.opensAt}–{d.closesAt}, {weekdaysText(d.workingDays)}.
      </Callout>
    </>
  );
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const weekdaysText = (days: number[]) => [...days].sort().map((n) => WEEKDAYS[n - 1] ?? "").filter(Boolean).join(", ");

// ---------- Throughput ----------

type Measure = "positions" | "pieces" | "kg" | "cbm";
const MEASURES: { value: Measure; label: string }[] = [
  { value: "positions", label: "Positions" },
  { value: "pieces", label: TERMS.pieces },
  { value: "kg", label: TERMS.weightKg },
  { value: "cbm", label: TERMS.volumeCbm },
];
const pick = (b: Bucket, m: Measure): [number, number] =>
  m === "positions" ? [b.inPositions, b.outPositions] : m === "pieces" ? [b.inPieces, b.outPieces] : m === "kg" ? [b.inKg, b.outKg] : [b.inCbm, b.outCbm];

function ThroughputChart({ buckets, measure }: { buckets: Bucket[]; measure: Measure }) {
  const W = 520;
  const H = 190;
  const max = Math.max(1, ...buckets.flatMap((b) => pick(b, measure)));
  const bw = W / Math.max(buckets.length, 1);
  const every = Math.ceil(buckets.length / 16);
  const unit = MEASURES.find((x) => x.value === measure)!.label.toLowerCase();
  return (
    <svg viewBox={`0 0 ${W} ${H + 26}`} className="w-full h-auto" role="img" aria-label={`In and out per ${buckets.length > 0 ? "period" : ""} — ${unit}`}>
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <line key={t} x1={0} x2={W} y1={H - t * H} y2={H - t * H} className="stroke-slate-100" />
      ))}
      {buckets.map((b, i) => {
        const [vin, vout] = pick(b, measure);
        const h1 = (vin / max) * H;
        const h2 = (vout / max) * H;
        const x = i * bw;
        return (
          <g key={b.key}>
            <rect x={x + bw * 0.14} y={H - h1} width={bw * 0.32} height={h1} rx={2} className="fill-indigo-500">
              <title>{`${b.label} in: ${nf(vin, measure === "cbm" ? 1 : 0)} ${unit}`}</title>
            </rect>
            <rect x={x + bw * 0.5} y={H - h2} width={bw * 0.32} height={h2} rx={2} className="fill-indigo-200">
              <title>{`${b.label} out: ${nf(vout, measure === "cbm" ? 1 : 0)} ${unit}`}</title>
            </rect>
            {i % every === 0 && (
              <text x={x + bw / 2} y={H + 16} textAnchor="middle" fontSize={10} className="fill-slate-400">
                {b.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function Throughput({ report }: { report: Report }) {
  const [measure, setMeasure] = useState<Measure>("cbm");
  const per = report.period.bucket === "day" ? "day" : "ISO week";

  const bucketColumns: AppGridColumn<Bucket>[] = [
    { key: "label", title: per === "day" ? "Day" : "Week", width: 100, text: (r) => r.label, render: (_, r) => <span className="font-medium text-slate-800">{r.label}</span> },
    { key: "inPositions", title: "Positions in", width: 110, align: "right", text: (r) => String(r.inPositions), render: (_, r) => dim(r.inPositions) },
    { key: "inPieces", title: "Pieces in", width: 100, align: "right", text: (r) => String(r.inPieces), render: (_, r) => dim(nf(r.inPieces)) },
    { key: "inKg", title: "kg in", width: 110, align: "right", text: (r) => String(r.inKg), render: (_, r) => dim(nf(r.inKg)) },
    { key: "inCbm", title: "cbm in", width: 100, align: "right", text: (r) => String(r.inCbm), render: (_, r) => dim(nf(r.inCbm, 1)) },
    { key: "outPositions", title: "Positions out", width: 120, align: "right", text: (r) => String(r.outPositions), render: (_, r) => dim(r.outPositions) },
    { key: "outPieces", title: "Pieces out", width: 100, align: "right", text: (r) => String(r.outPieces), render: (_, r) => dim(nf(r.outPieces)) },
    { key: "outKg", title: "kg out", width: 110, align: "right", text: (r) => String(r.outKg), render: (_, r) => dim(nf(r.outKg)) },
    { key: "outCbm", title: "cbm out", width: 100, align: "right", text: (r) => String(r.outCbm), render: (_, r) => dim(nf(r.outCbm, 1)) },
  ];
  const topColumns: AppGridColumn<Top>[] = [
    { key: "customer", title: "Customer", width: 200, text: (r) => r.customer, render: (_, r) => <span className="font-medium text-slate-800">{r.customer}</span> },
    { key: "jobs", title: "Positions", width: 100, align: "right", text: (r) => String(r.jobs), render: (_, r) => dim(r.jobs) },
    { key: "cbm", title: TERMS.volumeCbm, width: 110, align: "right", text: (r) => String(r.cbm), render: (_, r) => dim(nf(r.cbm, 1)) },
    { key: "wm", title: "w/m", width: 90, align: "right", text: (r) => String(r.wm), render: (_, r) => dim(nf(r.wm, 1)) },
    { key: "share", title: "Share", width: 90, align: "right", text: (r) => `${r.share} %`, render: (_, r) => dim(`${r.share} %`) },
  ];
  const monthColumns: AppGridColumn<Month>[] = [
    { key: "month", title: "Month", width: 130, text: (r) => r.month, render: (_, r) => <span className="font-medium text-slate-800">{r.month}{r.monthToDate ? " (MTD)" : ""}</span> },
    { key: "receipts", title: "Received", width: 100, align: "right", text: (r) => String(r.receipts), render: (_, r) => dim(r.receipts) },
    { key: "cbmIn", title: `${TERMS.volumeCbm} in`, width: 120, align: "right", text: (r) => String(r.cbmIn), render: (_, r) => dim(nf(r.cbmIn, 1)) },
    { key: "dispatches", title: "Left", width: 90, align: "right", text: (r) => String(r.dispatches), render: (_, r) => dim(r.dispatches) },
    { key: "cbmOut", title: `${TERMS.volumeCbm} out`, width: 120, align: "right", text: (r) => String(r.cbmOut), render: (_, r) => dim(nf(r.cbmOut, 1)) },
    { key: "consolPositions", title: "Consols", width: 100, align: "right", text: (r) => String(r.consolPositions), render: (_, r) => dim(r.consolPositions) },
    { key: "containersLoaded", title: "Containers loaded", width: 150, align: "right", text: (r) => String(r.containersLoaded), render: (_, r) => dim(r.containersLoaded) },
    { key: "fclStuffed", title: "FCL stuffed", width: 110, align: "right", text: (r) => String(r.fclStuffed), render: (_, r) => dim(r.fclStuffed) },
    { key: "fclStripped", title: "FCL stripped", width: 120, align: "right", text: (r) => String(r.fclStripped), render: (_, r) => dim(r.fclStripped) },
    { key: "yardContainerDays", title: "Yard ctr-days", width: 120, align: "right", text: (r) => String(r.yardContainerDays), render: (_, r) => dim(r.yardContainerDays) },
  ];

  return (
    <>
      <Card
        title={`In vs. out per ${per}`}
        extra={
          <span className="flex flex-wrap items-center gap-3">
            <Segmented<Measure> size="small" value={measure} onChange={setMeasure} options={MEASURES} />
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block w-2.5 h-2.5 rounded-sm bg-indigo-500" /> Received
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block w-2.5 h-2.5 rounded-sm bg-indigo-200" /> Left
            </span>
          </span>
        }
      >
        <ThroughputChart buckets={report.throughput} measure={measure} />
        <p className="m-0 mt-2 text-[11px] text-slate-500">
          <b className="text-slate-600">How it is measured:</b> in = positions received in the {per} (WH receipt / stripping tally tick); out = positions that left
          (WH release / export container gate-out). Pieces, weight and volume are the gate figures of the position.
        </p>
      </Card>
      <Card title={`Per ${per}`} bodyClassName="p-4">
        <AppGrid<Bucket> columns={bucketColumns} rows={report.throughput} rowKey={(r) => r.key} storageKey="warehouse:report-throughput" exportFilePrefix="throughput" />
      </Card>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
        <Card title="Top customers by volume received — period" bodyClassName="p-4">
          <AppGrid<Top>
            columns={topColumns}
            rows={report.topCustomers}
            rowKey={(r) => r.customer}
            storageKey="warehouse:report-top-customers"
            exportFilePrefix="top-customers"
            emptyText="Nothing received in this period."
          />
        </Card>
        <Card title="Monthly summary — last 4 months" bodyClassName="p-4">
          <AppGrid<Month>
            columns={monthColumns}
            rows={report.monthly}
            rowKey={(r) => r.month}
            storageKey="warehouse:report-monthly"
            exportFilePrefix="monthly-summary"
          />
          <p className="m-0 mt-2 text-[11px] text-slate-500">Not filtered by the period. Received and left as in the KPIs; yard container-days from the container gate-in / gate-out stamps (typed yard dates when not stamped).</p>
        </Card>
      </div>
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

function Utilisation({ report }: { report: Report }) {

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
      <Card title="Consol fill rate by lane — export containers gone out in the period" extra="Target 80 % of working capacity" bodyClassName="p-4">
        <AppGrid<Lane>
          columns={columns}
          rows={report.lanes}
          rowKey={(r) => r.lane}
          storageKey="warehouse:report-lanes"
          exportFilePrefix="consol-fill-rate"
          emptyText="No export container with volume went out in this period."
        />
      </Card>
      <Callout title="Reading this table.">
        A lane running consistently below 70 % either needs a longer closing cycle or a smaller box. <b>How it is measured:</b> export containers whose
        gate-out (stamp, else the typed yard date) falls in the period; the loaded volume is the sum of the stuffed positions&apos; gate cbm (the typed
        container cbm only when no position is stuffed in it), against the working capacity of the container type (20&apos; DV 31 · 40&apos; DV 66 ·
        40&apos; HC 76 · 45&apos; HC 84 cbm).
      </Callout>
    </>
  );
}

// ---------- Quality & claims ----------

function QualityAndClaims({ report }: { report?: Report }) {
  const claims = useClaims();
  const [editing, setEditing] = useState<{ claim?: Claim } | null>(null);
  const quality = (report?.kpis ?? []).filter((k) => ["exceptionRate", "reweighVariance", "onTime"].includes(k.key));

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
      {quality.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
          {quality.map((k) => (
            <KpiCard key={k.key} kpi={k} tone={kpiTone(k)} />
          ))}
        </div>
      )}
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
    <Card title="Saved reports" extra="Names only — not run or sent" bodyClassName="p-4">
      <p className="m-0 mb-3 text-xs text-amber-700">
        This list only keeps report names, owners and who they are meant for. Nothing here is run, built or e-mailed automatically.
      </p>
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

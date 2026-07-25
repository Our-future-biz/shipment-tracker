import { useState, useMemo, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Customer, Shipment, Invoice, Quote, Contact, Note, Document } from "@shared/schema";
import {
  ArrowLeft, Building2, ChevronRight, Search, Filter, Plus, Trash2,
  TrendingUp, DollarSign, Ship, CreditCard, FileText, MessageSquare,
  User, Upload, AlertTriangle, Check, Plane, Truck, Train, X
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, PieChart, Pie, Cell
} from "recharts";

// ── Shared tokens ─────────────────────────────────────────────────────────────
const T = {
  bg: "#F9FAFB", surface: "#FFFFFF",
  border: "#E5E7EB", borderL: "#F3F4F6",
  text: "#111827", textSub: "#374151", textMuted: "#6B7280", textLight: "#9CA3AF",
  blue: "#1D4ED8", blueL: "#EFF6FF",
  green: "#15803D", greenL: "#F0FDF4",
  red: "#B91C1C", redL: "#FEF2F2",
  amber: "#B45309", amberL: "#FFFBEB",
};

function fmt(n: number | null | undefined, currency = "EUR") {
  if (n == null) return "—";
  return new Intl.NumberFormat("cs-CZ", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}
function fmtPct(rev: number | null | undefined, profit: number | null | undefined) {
  if (!rev || rev === 0) return "—";
  return (((profit ?? 0) / rev) * 100).toFixed(1) + "%";
}
function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return d;
}

// ── Status badges ─────────────────────────────────────────────────────────────
const STATUS_MAP: Record<string, { bg: string; text: string; dot: string }> = {
  Completed:     { bg: T.greenL, text: T.green, dot: "#16A34A" },
  "In Progress": { bg: T.blueL, text: T.blue, dot: T.blue },
  Pending:       { bg: T.amberL, text: T.amber, dot: T.amber },
  Won:           { bg: T.greenL, text: T.green, dot: "#16A34A" },
  Lost:          { bg: T.redL, text: T.red, dot: T.red },
  Open:          { bg: T.amberL, text: T.amber, dot: T.amber },
  Overdue:       { bg: T.redL, text: T.red, dot: T.red },
  Paid:          { bg: T.greenL, text: T.green, dot: "#16A34A" },
};
function Badge({ s }: { s: string }) {
  const c = STATUS_MAP[s] ?? { bg: T.bg, text: T.textMuted, dot: T.textLight };
  return (
    <span style={{ background: c.bg, color: c.text, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4, display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: c.dot }} />{s}
    </span>
  );
}
function TransportIcon({ mode }: { mode: string }) {
  const s = { width: 13, height: 13 };
  if (mode === "AIR")  return <Plane {...s} style={{ color: "#0EA5E9" }} />;
  if (mode === "ROAD") return <Truck {...s} style={{ color: "#D97706" }} />;
  if (mode === "RAIL") return <Train {...s} style={{ color: "#8B5CF6" }} />;
  return <Ship {...s} style={{ color: "#0D9488" }} />;
}

// ── Page shell ────────────────────────────────────────────────────────────────
function PageShell({ customer, section, title, subtitle, children, actions }: {
  customer: Customer; section: string; title: string; subtitle?: string;
  children: React.ReactNode; actions?: React.ReactNode;
}) {
  const [, setLocation] = useLocation();
  const customerId = customer.id;

  const SECTION_ICONS: Record<string, React.ReactNode> = {
    financial: <TrendingUp style={{ width: 15, height: 15 }} />,
    credit:    <CreditCard style={{ width: 15, height: 15 }} />,
    shipments: <Ship style={{ width: 15, height: 15 }} />,
    payment:   <CreditCard style={{ width: 15, height: 15 }} />,
    quotes:    <FileText style={{ width: 15, height: 15 }} />,
    contacts:  <User style={{ width: 15, height: 15 }} />,
    documents: <Upload style={{ width: 15, height: 15 }} />,
    communication: <MessageSquare style={{ width: 15, height: 15 }} />,
  };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: "var(--font-system)" }}>
      {/* Top nav */}
      <nav style={{ background: "#fff", borderBottom: `1px solid ${T.border}`, height: 50, display: "flex", alignItems: "center", padding: "0 24px", gap: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, background: T.blue, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Building2 style={{ width: 14, height: 14, color: "#fff" }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, color: T.text, letterSpacing: "-0.02em" }}>CRM</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: T.textMuted }}>
          <button onClick={() => setLocation("/")} style={{ background: "none", border: "none", cursor: "pointer", color: T.textMuted, fontSize: 13 }}>Customers</button>
          <ChevronRight style={{ width: 12, height: 12 }} />
          <button onClick={() => setLocation(`/customers/${customerId}`)} style={{ background: "none", border: "none", cursor: "pointer", color: T.textMuted, fontSize: 13 }}>{customer.companyName}</button>
          <ChevronRight style={{ width: 12, height: 12 }} />
          <span style={{ color: T.text, fontWeight: 600 }}>{title}</span>
        </div>
      </nav>

      {/* Page header */}
      <div style={{ background: "#fff", borderBottom: `1px solid ${T.border}`, padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => setLocation(`/customers/${customerId}`)}
            style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: 5, padding: "5px 8px", cursor: "pointer", color: T.textMuted, display: "flex" }}>
            <ArrowLeft style={{ width: 14, height: 14 }} />
          </button>
          <div style={{ width: 32, height: 32, background: T.blueL, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: T.blue }}>
            {SECTION_ICONS[section] ?? <TrendingUp style={{ width: 15, height: 15 }} />}
          </div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: T.text, letterSpacing: "-0.02em", margin: "0 0 1px" }}>
              {title}
              <span style={{ fontSize: 13, fontWeight: 400, color: T.textMuted, marginLeft: 8 }}>— {customer.companyName}</span>
            </h1>
            {subtitle && <p style={{ fontSize: 12, color: T.textLight, margin: 0 }}>{subtitle}</p>}
          </div>
        </div>
        {actions && <div style={{ display: "flex", gap: 8 }}>{actions}</div>}
      </div>

      <div style={{ padding: "20px 24px", maxWidth: 1300 }}>{children}</div>
    </div>
  );
}

// ── KPI strip ─────────────────────────────────────────────────────────────────
function KpiStrip({ items }: { items: { label: string; value: string | number; color?: string; sub?: string }[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${items.length}, 1fr)`, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface, overflow: "hidden", marginBottom: 16 }}>
      {items.map((it, i) => (
        <div key={it.label} style={{ padding: "12px 16px", borderRight: i < items.length - 1 ? `1px solid ${T.border}` : "none" }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: T.textLight, marginBottom: 5 }}>{it.label}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: it.color ?? T.text, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{it.value}</div>
          {it.sub && <div style={{ fontSize: 11, color: T.textLight, marginTop: 2 }}>{it.sub}</div>}
        </div>
      ))}
    </div>
  );
}

// ── Section card ──────────────────────────────────────────────────────────────
function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, overflow: "hidden", marginBottom: 16 }}>
      <div style={{ padding: "9px 14px", background: "#F9FAFB", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: T.textMuted }}>{title}</span>
        {action}
      </div>
      <div>{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FINANCIAL SECTION
// ─────────────────────────────────────────────────────────────────────────────
function FinancialSection({ customer, shipments, invoices }: { customer: Customer; shipments: Shipment[]; invoices: Invoice[] }) {
  const rev = customer.totalRevenue ?? 0;
  const profit = customer.totalProfit ?? 0;
  const cost = Math.max(0, rev - profit);
  const avgProfit = (customer.totalShipments ?? 0) > 0 ? profit / (customer.totalShipments ?? 1) : 0;

  // Monthly breakdown from shipments
  const byMonth: Record<string, { month: string; revenue: number; cost: number; profit: number; count: number }> = {};
  shipments.forEach(s => {
    const key = new Date(s.createdAt ?? Date.now()).toISOString().slice(0, 7);
    if (!byMonth[key]) byMonth[key] = { month: key, revenue: 0, cost: 0, profit: 0, count: 0 };
    byMonth[key].revenue += s.revenue ?? 0;
    byMonth[key].cost += s.cost ?? 0;
    byMonth[key].profit += s.profit ?? 0;
    byMonth[key].count += 1;
  });
  const monthly = Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month));

  const tt = { background: "#fff", border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 12 };

  // Donut
  const donutData = rev > 0
    ? [{ name: "Profit", value: profit, color: "#15803D" }, { name: "Cost", value: cost, color: "#BFDBFE" }]
    : [{ name: "No data", value: 1, color: "#F3F4F6" }];

  return (
    <>
      <KpiStrip items={[
        { label: "Total Revenue",         value: fmt(rev),              color: T.blue },
        { label: "Total Profit",          value: fmt(profit),           color: T.green },
        { label: "Total Cost",            value: fmt(cost),             color: T.textSub },
        { label: "Margin %",              value: fmtPct(rev, profit),   color: T.textSub },
        { label: "Shipments",             value: customer.totalShipments ?? 0 },
        { label: "Avg Profit / Shipment", value: fmt(avgProfit),        color: T.amber },
      ]} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        {/* Revenue vs Profit bar chart */}
        <Card title="Revenue vs Cost vs Profit — Monthly">
          <div style={{ height: 240, padding: "12px 8px 8px" }}>
            {monthly.length === 0 ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: T.textLight, fontSize: 13 }}>No completed shipment data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.borderL} />
                  <XAxis dataKey="month" tick={{ fill: T.textMuted, fontSize: 10 }} />
                  <YAxis tickFormatter={v => fmt(v)} tick={{ fill: T.textMuted, fontSize: 10 }} width={72} />
                  <Tooltip formatter={(v: any) => fmt(v)} contentStyle={tt} />
                  <Legend wrapperStyle={{ fontSize: 11, color: T.textMuted }} />
                  <Bar dataKey="revenue" fill="#93C5FD" name="Revenue" radius={[3,3,0,0]} />
                  <Bar dataKey="cost"    fill="#E5E7EB" name="Cost"    radius={[3,3,0,0]} />
                  <Bar dataKey="profit"  fill={T.blue}  name="Profit"  radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* Profit trend line */}
        <Card title="Profit Trend">
          <div style={{ height: 240, padding: "12px 8px 8px" }}>
            {monthly.length === 0 ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: T.textLight, fontSize: 13 }}>No data</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.borderL} />
                  <XAxis dataKey="month" tick={{ fill: T.textMuted, fontSize: 10 }} />
                  <YAxis tickFormatter={v => fmt(v)} tick={{ fill: T.textMuted, fontSize: 10 }} width={72} />
                  <Tooltip formatter={(v: any) => fmt(v)} contentStyle={tt} />
                  <Line type="monotone" dataKey="profit" stroke={T.blue} strokeWidth={2} dot={{ fill: T.blue, r: 3 }} name="Profit" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* Revenue split donut */}
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 14 }}>
        <Card title="Revenue Breakdown">
          <div style={{ padding: "16px 14px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <PieChart width={160} height={160}>
              <Pie data={donutData} cx={75} cy={75} innerRadius={45} outerRadius={72} dataKey="value" strokeWidth={0}>
                {donutData.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
            </PieChart>
            <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 5 }}>
              {[
                { label: "Profit", value: profit, color: "#15803D" },
                { label: "Cost",   value: cost,   color: "#93C5FD" },
              ].map(r => (
                <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: r.color }} />
                  <span style={{ fontSize: 12, color: T.textMuted, flex: 1 }}>{r.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{fmt(r.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Shipment-level breakdown */}
        <Card title="Shipment Transactions">
          <table className="crm-table">
            <thead>
              <tr>
                <th>Job ID</th><th>Mode</th><th>Route</th><th>Status</th>
                <th className="num">Revenue</th><th className="num">Cost</th>
                <th className="num" style={{ color: T.green }}>Profit</th><th className="num">Margin</th>
              </tr>
            </thead>
            <tbody>
              {shipments.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: "center", color: T.textLight, padding: "24px 0" }}>No shipments yet</td></tr>
              ) : (
                shipments.map(s => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 700, color: T.blue, fontFamily: "monospace", fontSize: 12 }}>{s.jobId}</td>
                    <td style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}><TransportIcon mode={s.transportMode} />{s.transportMode}</td>
                    <td style={{ fontSize: 12, color: T.textSub }}>{s.pol && s.pod ? `${s.pol} → ${s.pod}` : "—"}</td>
                    <td><Badge s={s.status} /></td>
                    <td className="num" style={{ fontSize: 13, fontWeight: 600 }}>{fmt(s.revenue)}</td>
                    <td className="num" style={{ fontSize: 13 }}>{fmt(s.cost)}</td>
                    <td className="num" style={{ fontSize: 13, fontWeight: 700, color: (s.profit ?? 0) >= 0 ? T.green : T.red }}>{fmt(s.profit)}</td>
                    <td className="num" style={{ fontSize: 12, color: T.textMuted }}>{fmtPct(s.revenue, s.profit)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      </div>

      {/* Invoices */}
      <Card title={`Invoices (${invoices.length})`}>
        <table className="crm-table">
          <thead>
            <tr><th>Invoice #</th><th>Status</th><th>Issued</th><th>Due Date</th><th className="num">Amount</th></tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: "center", color: T.textLight, padding: "24px 0" }}>No invoices</td></tr>
            ) : (
              invoices.map(inv => (
                <tr key={inv.id}>
                  <td style={{ fontWeight: 600 }}>{inv.invoiceNumber}</td>
                  <td><Badge s={inv.status} /></td>
                  <td style={{ fontSize: 12, color: T.textMuted }}>{fmtDate(inv.issuedAt)}</td>
                  <td style={{ fontSize: 12, color: inv.status === "Overdue" ? T.red : T.textMuted }}>{fmtDate(inv.dueDate)}</td>
                  <td className="num" style={{ fontWeight: 700, fontSize: 13 }}>{fmt(inv.amount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CREDIT SECTION
// ─────────────────────────────────────────────────────────────────────────────
function CreditSection({ customer, invoices, patchMut }: { customer: Customer; invoices: Invoice[]; patchMut: any }) {
  const limit = customer.creditLimit ?? 50000;
  const open = invoices.filter(i => i.status === "Open").reduce((s, i) => s + (i.amount ?? 0), 0);
  const overdue = invoices.filter(i => i.status === "Overdue").reduce((s, i) => s + (i.amount ?? 0), 0);
  const outstanding = open + overdue;
  const available = Math.max(0, limit - outstanding);
  const utilization = limit > 0 ? Math.min(100, (outstanding / limit) * 100) : 0;
  const utilColor = utilization > 80 ? T.red : utilization > 50 ? T.amber : T.green;

  // Aging buckets
  const aging: Record<string, number> = { "Current": 0, "1–30 days": 0, "31–60 days": 0, "61–90 days": 0, "90+ days": 0 };
  invoices.filter(i => i.status !== "Paid").forEach(inv => {
    if (!inv.dueDate) { aging["Current"] += inv.amount ?? 0; return; }
    const days = Math.floor((Date.now() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24));
    if (days <= 0) aging["Current"] += inv.amount ?? 0;
    else if (days <= 30) aging["1–30 days"] += inv.amount ?? 0;
    else if (days <= 60) aging["31–60 days"] += inv.amount ?? 0;
    else if (days <= 90) aging["61–90 days"] += inv.amount ?? 0;
    else aging["90+ days"] += inv.amount ?? 0;
  });

  return (
    <>
      <KpiStrip items={[
        { label: "Credit Limit",    value: fmt(limit),       color: T.blue },
        { label: "Outstanding",     value: fmt(outstanding), color: outstanding > 0 ? T.amber : T.green },
        { label: "Available",       value: fmt(available),   color: available > 0 ? T.green : T.red },
        { label: "Utilization",     value: utilization.toFixed(1) + "%", color: utilColor },
        { label: "Open Invoices",   value: invoices.filter(i => i.status === "Open").length },
        { label: "Overdue Invoices",value: invoices.filter(i => i.status === "Overdue").length, color: overdue > 0 ? T.red : T.textSub },
      ]} />

      {/* Utilization bar */}
      <Card title="Credit Utilization">
        <div style={{ padding: "16px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: T.textMuted }}>Used: <strong style={{ color: T.text }}>{fmt(outstanding)}</strong></span>
            <span style={{ fontSize: 12, color: T.textMuted }}>Limit: <strong style={{ color: T.text }}>{fmt(limit)}</strong></span>
          </div>
          <div style={{ height: 14, background: T.borderL, borderRadius: 7, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${utilization}%`, background: utilColor, borderRadius: 7, transition: "width 0.5s" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
            <span style={{ fontSize: 11, color: T.textLight }}>{utilization.toFixed(1)}% utilized</span>
            <span style={{ fontSize: 11, color: T.green }}>{fmt(available)} available</span>
          </div>
          {/* Edit limit inline */}
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10, paddingTop: 12, borderTop: `1px solid ${T.borderL}` }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: T.textMuted }}>Adjust credit limit:</span>
            <input type="number" defaultValue={limit}
              onBlur={e => patchMut.mutate({ creditLimit: parseFloat(e.target.value) || 0 })}
              style={{ width: 120, padding: "5px 8px", border: `1px solid ${T.border}`, borderRadius: 5, fontSize: 14, fontWeight: 700, textAlign: "right", outline: "none" }} />
            <span style={{ fontSize: 12, color: T.textMuted }}>EUR</span>
          </div>
        </div>
      </Card>

      {/* Invoice aging */}
      <Card title="Invoice Aging Analysis">
        <div style={{ padding: "12px 14px", display: "flex", gap: 12 }}>
          {Object.entries(aging).map(([bucket, amount]) => (
            <div key={bucket} style={{ flex: 1, background: amount > 0 ? (bucket === "Current" ? T.blueL : bucket === "1–30 days" ? T.amberL : T.redL) : T.bg, border: `1px solid ${T.border}`, borderRadius: 6, padding: "10px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: T.textLight, marginBottom: 5 }}>{bucket}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: amount > 0 ? (bucket === "Current" ? T.blue : bucket === "1–30 days" ? T.amber : T.red) : T.textLight }}>{fmt(amount)}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* All invoices */}
      <Card title={`All Invoices (${invoices.length})`}>
        <table className="crm-table">
          <thead><tr><th>Invoice #</th><th>Status</th><th>Issued</th><th>Due Date</th><th className="num">Amount</th></tr></thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: "center", color: T.textLight, padding: "24px 0" }}>No invoices yet</td></tr>
            ) : (
              invoices.map(inv => (
                <tr key={inv.id}>
                  <td style={{ fontWeight: 600 }}>{inv.invoiceNumber}</td>
                  <td><Badge s={inv.status} /></td>
                  <td style={{ fontSize: 12, color: T.textMuted }}>{fmtDate(inv.issuedAt)}</td>
                  <td style={{ fontSize: 12, color: inv.status === "Overdue" ? T.red : T.textMuted }}>{fmtDate(inv.dueDate)}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{fmt(inv.amount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SHIPMENTS SECTION
// ─────────────────────────────────────────────────────────────────────────────
function ShipmentsSection({ customerId, shipments }: { customerId: number; shipments: Shipment[] }) {
  const [search, setSearch] = useState("");
  const [statusF, setStatusF] = useState("all");
  const [modeF, setModeF] = useState("all");
  const [dirF, setDirF] = useState("all");

  const filtered = useMemo(() => shipments.filter(s => {
    if (statusF !== "all" && s.status !== statusF) return false;
    if (modeF !== "all" && s.transportMode !== modeF) return false;
    if (dirF !== "all" && s.direction !== dirF) return false;
    if (search) {
      const q = search.toLowerCase();
      return [s.jobId, s.pol, s.pod, s.status].some(v => v?.toLowerCase().includes(q));
    }
    return true;
  }), [shipments, search, statusF, modeF, dirF]);

  const active = shipments.filter(s => s.status !== "Completed");
  const completed = shipments.filter(s => s.status === "Completed");
  const totalRev = shipments.reduce((s, sh) => s + (sh.revenue ?? 0), 0);
  const totalProfit = completed.reduce((s, sh) => s + (sh.profit ?? 0), 0);

  return (
    <>
      <KpiStrip items={[
        { label: "Total Shipments",  value: shipments.length },
        { label: "Active",           value: active.length,             color: T.blue },
        { label: "Completed",        value: completed.length,          color: T.green },
        { label: "Pending",          value: shipments.filter(s => s.status === "Pending").length, color: T.amber },
        { label: "Total Revenue",    value: fmt(totalRev),             color: T.blue },
        { label: "Realised Profit",  value: fmt(totalProfit),          color: T.green },
      ]} />

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 200px", maxWidth: 260 }}>
          <Search style={{ width: 13, height: 13, color: T.textLight, position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          <input className="crm-input" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search Job ID, route…" style={{ paddingLeft: 28 }} />
        </div>
        {[
          { v: statusF, set: setStatusF, opts: ["all", "In Progress", "Completed", "Pending"], label: "Status" },
          { v: modeF,   set: setModeF,   opts: ["all", "SEA", "AIR", "ROAD", "RAIL"],          label: "Mode" },
          { v: dirF,    set: setDirF,    opts: ["all", "IMPORT", "EXPORT"],                     label: "Direction" },
        ].map((f, fi) => (
          <select key={fi} className="crm-select" value={f.v} onChange={e => f.set(e.target.value)} style={{ width: 150 }}>
            {f.opts.map(o => <option key={o} value={o}>{o === "all" ? `All ${f.label}` : o}</option>)}
          </select>
        ))}
        <span style={{ fontSize: 12, color: T.textMuted, marginLeft: "auto" }}>{filtered.length} shipments</span>
      </div>

      <Card title={`Shipments (${filtered.length})`}>
        <table className="crm-table">
          <thead>
            <tr>
              <th>Job ID</th><th>Mode</th><th>Direction</th><th>Route</th>
              <th>Status</th><th>ETD</th><th>ETA</th>
              <th className="num">Revenue</th><th className="num">Cost</th>
              <th className="num" style={{ color: T.green }}>Profit</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={10} style={{ textAlign: "center", color: T.textLight, padding: "32px 0" }}>No shipments match filters</td></tr>
            ) : (
              filtered.map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 700, color: T.blue, fontFamily: "monospace", fontSize: 12 }}>{s.jobId}</td>
                  <td><span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}><TransportIcon mode={s.transportMode} />{s.transportMode}</span></td>
                  <td style={{ fontSize: 12, color: T.textSub }}>{s.direction}</td>
                  <td style={{ fontSize: 12, color: T.textSub }}>{s.pol && s.pod ? `${s.pol} → ${s.pod}` : "—"}</td>
                  <td><Badge s={s.status} /></td>
                  <td style={{ fontSize: 12, color: T.textMuted }}>{fmtDate(s.etd)}</td>
                  <td style={{ fontSize: 12, color: T.textMuted }}>{fmtDate(s.eta)}</td>
                  <td className="num" style={{ fontWeight: 600 }}>{fmt(s.revenue)}</td>
                  <td className="num" style={{ fontSize: 12 }}>{fmt(s.cost)}</td>
                  <td className="num" style={{ fontWeight: 700, color: (s.profit ?? 0) >= 0 ? T.green : T.red }}>{fmt(s.profit)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// QUOTES SECTION
// ─────────────────────────────────────────────────────────────────────────────
function QuotesSection({ customerId, quotes }: { customerId: number; quotes: Quote[] }) {
  const won = quotes.filter(q => q.status === "Won");
  const lost = quotes.filter(q => q.status === "Lost");
  const pending = quotes.filter(q => q.status === "Pending");
  const convRate = quotes.length > 0 ? Math.round((won.length / quotes.length) * 100) : 0;
  const wonRev = won.reduce((s, q) => s + (q.revenue ?? 0), 0);
  const pipelineRev = pending.reduce((s, q) => s + (q.revenue ?? 0), 0);

  return (
    <>
      <KpiStrip items={[
        { label: "Total Quotes",    value: quotes.length },
        { label: "Won",             value: won.length,          color: T.green },
        { label: "Lost",            value: lost.length,         color: T.red },
        { label: "Pending",         value: pending.length,      color: T.amber },
        { label: "Conversion Rate", value: `${convRate}%`,      color: convRate >= 50 ? T.green : T.amber },
        { label: "Won Revenue",     value: fmt(wonRev),         color: T.green },
      ]} />

      {pending.length > 0 && (
        <Card title={`Pipeline — ${pending.length} Open Quotes`} action={<span style={{ fontSize: 11, color: T.textMuted }}>Pipeline value: <strong style={{ color: T.blue }}>{fmt(pipelineRev)}</strong></span>}>
          <table className="crm-table">
            <thead><tr><th>Quote #</th><th>Valid Until</th><th className="num">Revenue</th><th>Description</th></tr></thead>
            <tbody>
              {pending.map(q => (
                <tr key={q.id}>
                  <td style={{ fontWeight: 600 }}>{q.quoteNumber}</td>
                  <td style={{ fontSize: 12, color: T.textMuted }}>{fmtDate(q.validUntil)}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{fmt(q.revenue)}</td>
                  <td style={{ fontSize: 12, color: T.textSub }}>{q.description || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card title={`All Quotes (${quotes.length})`}>
        <table className="crm-table">
          <thead><tr><th>Quote #</th><th>Status</th><th>Valid Until</th><th className="num">Revenue</th><th>Description</th></tr></thead>
          <tbody>
            {quotes.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: "center", color: T.textLight, padding: "24px 0" }}>No quotes yet</td></tr>
            ) : (
              quotes.map(q => (
                <tr key={q.id}>
                  <td style={{ fontWeight: 600 }}>{q.quoteNumber}</td>
                  <td><Badge s={q.status} /></td>
                  <td style={{ fontSize: 12, color: T.textMuted }}>{fmtDate(q.validUntil)}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{fmt(q.revenue)}</td>
                  <td style={{ fontSize: 12, color: T.textSub, maxWidth: 240 }}><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{q.description || "—"}</span></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTACTS SECTION
// ─────────────────────────────────────────────────────────────────────────────
function ContactsSection({ contacts }: { contacts: Contact[] }) {
  const byRole: Record<string, Contact[]> = {};
  contacts.forEach(c => { (byRole[c.role ?? "Other"] = byRole[c.role ?? "Other"] ?? []).push(c); });

  return (
    <>
      <KpiStrip items={[
        { label: "Total Contacts",   value: contacts.length },
        { label: "Sales",            value: contacts.filter(c => c.role === "Sales").length },
        { label: "Operations",       value: contacts.filter(c => c.role === "Operations").length },
        { label: "Finance",          value: contacts.filter(c => c.role === "Finance").length },
        { label: "Main Contact",     value: contacts.filter(c => c.isMain === 1).length > 0 ? "Set" : "Not set", color: contacts.filter(c => c.isMain === 1).length > 0 ? T.green : T.amber },
      ]} />

      <Card title={`Contact Directory (${contacts.length})`}>
        <table className="crm-table">
          <thead><tr><th>Name</th><th>Role</th><th>Email</th><th>Phone</th><th>Main</th></tr></thead>
          <tbody>
            {contacts.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: "center", color: T.textLight, padding: "24px 0" }}>No contacts added yet</td></tr>
            ) : (
              contacts.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td><span style={{ fontSize: 11, background: T.blueL, color: T.blue, padding: "1px 7px", borderRadius: 4, fontWeight: 600 }}>{c.role}</span></td>
                  <td style={{ fontSize: 12, color: T.textSub }}>{c.email || "—"}</td>
                  <td style={{ fontSize: 12, color: T.textSub }}>{c.phone || "—"}</td>
                  <td>{c.isMain === 1 ? <span style={{ fontSize: 11, background: "#FFFBEB", color: "#92400E", padding: "1px 7px", borderRadius: 4, fontWeight: 600 }}>★ Main</span> : "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENTS SECTION
// ─────────────────────────────────────────────────────────────────────────────
function DocumentsSection({ documents }: { documents: Document[] }) {
  const byType: Record<string, number> = {};
  documents.forEach(d => { byType[d.type] = (byType[d.type] ?? 0) + 1; });

  return (
    <>
      <KpiStrip items={[
        { label: "Total Documents", value: documents.length },
        ...Object.entries(byType).map(([k, v]) => ({ label: k, value: v })),
      ]} />

      <Card title={`Document Archive (${documents.length})`}>
        <table className="crm-table">
          <thead><tr><th>Name</th><th>Type</th><th>Uploaded</th><th>URL</th></tr></thead>
          <tbody>
            {documents.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: "center", color: T.textLight, padding: "24px 0" }}>No documents uploaded</td></tr>
            ) : (
              documents.map(d => (
                <tr key={d.id}>
                  <td style={{ fontWeight: 600 }}>{d.name}</td>
                  <td><span style={{ fontSize: 11, background: T.blueL, color: T.blue, padding: "1px 7px", borderRadius: 4, fontWeight: 600 }}>{d.type}</span></td>
                  <td style={{ fontSize: 12, color: T.textMuted }}>{new Date(d.uploadedAt ?? Date.now()).toLocaleDateString("cs-CZ")}</td>
                  <td style={{ fontSize: 12 }}>{d.url ? <a href={d.url} target="_blank" rel="noreferrer" style={{ color: T.blue }}>{d.url.slice(0, 40)}…</a> : "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMMUNICATION SECTION
// ─────────────────────────────────────────────────────────────────────────────
function CommunicationSection({ notes }: { notes: Note[] }) {
  const [filter, setFilter] = useState("all");
  const types = ["Note", "Email", "Call", "Follow-up"];
  const TYPE_COLORS: Record<string, string> = { Note: T.blue, Email: "#7C3AED", Call: T.green, "Follow-up": T.amber };
  const TYPE_BG: Record<string, string> = { Note: T.blueL, Email: "#F5F3FF", Call: T.greenL, "Follow-up": T.amberL };

  const filtered = filter === "all" ? notes : notes.filter(n => n.type === filter);
  const byType: Record<string, number> = {};
  notes.forEach(n => { byType[n.type] = (byType[n.type] ?? 0) + 1; });

  return (
    <>
      <KpiStrip items={[
        { label: "Total Entries", value: notes.length },
        ...types.map(t => ({ label: t, value: byType[t] ?? 0 })),
      ]} />

      {/* Type filter */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {["all", ...types].map(t => (
          <button key={t} onClick={() => setFilter(t)}
            style={{ padding: "5px 12px", border: `1px solid ${filter === t ? T.blue : T.border}`, borderRadius: 5, background: filter === t ? T.blueL : "#fff", color: filter === t ? T.blue : T.textMuted, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            {t === "all" ? "All" : t} {t !== "all" && <span style={{ color: T.textLight }}>({byType[t] ?? 0})</span>}
          </button>
        ))}
      </div>

      <Card title={`Activity Log (${filtered.length})`}>
        {filtered.length === 0 ? (
          <div style={{ padding: "32px 0", textAlign: "center", color: T.textLight, fontSize: 13 }}>No entries</div>
        ) : (
          <div>
            {[...filtered].reverse().map((n, i) => (
              <div key={n.id} style={{ display: "flex", gap: 12, padding: "12px 14px", borderBottom: i < filtered.length - 1 ? `1px solid ${T.borderL}` : "none", alignItems: "flex-start" }}>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: TYPE_BG[n.type] ?? T.blueL, color: TYPE_COLORS[n.type] ?? T.blue, whiteSpace: "nowrap", marginTop: 2 }}>{n.type}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: T.text, lineHeight: 1.5 }}>{n.content}</div>
                  <div style={{ fontSize: 11, color: T.textLight, marginTop: 3 }}>
                    {n.author && <span style={{ fontWeight: 500, marginRight: 8 }}>{n.author}</span>}
                    {new Date(n.createdAt ?? Date.now()).toLocaleDateString("cs-CZ")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT TERMS SECTION
// ─────────────────────────────────────────────────────────────────────────────
const PAYMENT_OPTIONS = ["PREPAYMENT", "7 days", "14 days", "30 days", "45 days", "60 days"];

function PaymentSection({
  pt, fpt, dpt, setPt, setFpt, setDpt, dirty,
}: {
  pt: string; fpt: string; dpt: string;
  setPt: (v: string) => void; setFpt: (v: string) => void; setDpt: (v: string) => void;
  dirty: boolean;
}) {
  const ptColor = (v: string) => v === "PREPAYMENT" ? "#DC2626" : v ? T.text : T.textLight;
  const hasPrep = pt === "PREPAYMENT" || fpt === "PREPAYMENT" || dpt === "PREPAYMENT";

  const makeRow = (label: string, val: string, setter: (v: string) => void) => {
    const isPrepayment = val === "PREPAYMENT";
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 16px", borderBottom: `1px solid ${T.borderL}` }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: T.textSub }}>{label}</span>
        <div style={{ position: "relative" }}>
          <select
            value={val}
            onChange={e => setter(e.target.value)}
            style={{
              appearance: "none", fontSize: 12, fontWeight: 700,
              padding: "4px 28px 4px 10px", borderRadius: 4, cursor: "pointer", outline: "none",
              border: isPrepayment ? "1.5px solid #DC2626" : `1px solid ${T.border}`,
              background: isPrepayment ? "#FEF2F2" : "#fff",
              color: isPrepayment ? "#DC2626" : val ? T.text : T.textLight,
              minWidth: 120,
            }}
          >
            <option value="">— Not set —</option>
            {PAYMENT_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <ChevronRight style={{ width: 9, height: 9, position: "absolute", right: 8, top: "50%", transform: "translateY(-50%) rotate(90deg)", color: isPrepayment ? "#DC2626" : T.textMuted, pointerEvents: "none" }} />
        </div>
      </div>
    );
  };

  return (
    <>
      <KpiStrip items={[
        { label: "General Terms", value: pt  || "Not set", color: ptColor(pt)  },
        { label: "Freight Terms", value: fpt || "Not set", color: ptColor(fpt) },
        { label: "Duty Terms",    value: dpt || "Not set", color: ptColor(dpt) },
      ]} />
      {dirty && (
        <div style={{ marginBottom: 12, padding: "8px 14px", background: "#FFFBEB", border: `1px solid #FCD34D`, borderRadius: 6, fontSize: 12, color: "#92400E", fontWeight: 500 }}>
          Unsaved changes — click Save to apply.
        </div>
      )}
      <Card title="Payment Terms">
        {makeRow("General Payment Terms", pt,  setPt)}
        {makeRow("Freight Payment Terms", fpt, setFpt)}
        {makeRow("Duty Payment Terms",    dpt, setDpt)}
        {hasPrep && (
          <div style={{ padding: "8px 16px", background: "#FEF2F2", borderTop: `1px solid #FECACA`, display: "flex", alignItems: "center", gap: 7 }}>
            <AlertTriangle style={{ width: 13, height: 13, color: "#DC2626", flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: "#DC2626" }}>PREPAYMENT required — payment must be received before goods are released.</span>
          </div>
        )}
      </Card>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function CustomerDetailSection() {
  const { id, section } = useParams<{ id: string; section: string }>();
  const [, setLocation] = useLocation();
  const customerId = parseInt(id ?? "0");

  // ── Payment Terms local state (lifted so Save button can live in PageShell actions) ──
  const [pt,  setPt]  = useState("");
  const [fpt, setFpt] = useState("");
  const [dpt, setDpt] = useState("");
  const [savedPt,  setSavedPt]  = useState("");
  const [savedFpt, setSavedFpt] = useState("");
  const [savedDpt, setSavedDpt] = useState("");
  const paymentDirty = pt !== savedPt || fpt !== savedFpt || dpt !== savedDpt;

  const { data: customer, isLoading: loadingC } = useQuery<Customer>({
    queryKey: ["/api/customers", customerId],
    queryFn: () => apiRequest("GET", `/api/customers/${customerId}`).then(r => r.json()),
    enabled: !!customerId,
  });
  const { data: shipments = [] } = useQuery<Shipment[]>({
    queryKey: ["/api/customers", customerId, "shipments"],
    queryFn: () => apiRequest("GET", `/api/customers/${customerId}/shipments`).then(r => r.json()),
    enabled: !!customerId,
  });
  const { data: invoices = [] } = useQuery<Invoice[]>({
    queryKey: ["/api/customers", customerId, "invoices"],
    queryFn: () => apiRequest("GET", `/api/customers/${customerId}/invoices`).then(r => r.json()),
    enabled: !!customerId,
  });
  const { data: quotes = [] } = useQuery<Quote[]>({
    queryKey: ["/api/customers", customerId, "quotes"],
    queryFn: () => apiRequest("GET", `/api/customers/${customerId}/quotes`).then(r => r.json()),
    enabled: !!customerId,
  });
  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/customers", customerId, "contacts"],
    queryFn: () => apiRequest("GET", `/api/customers/${customerId}/contacts`).then(r => r.json()),
    enabled: !!customerId,
  });
  const { data: documents = [] } = useQuery<Document[]>({
    queryKey: ["/api/customers", customerId, "documents"],
    queryFn: () => apiRequest("GET", `/api/customers/${customerId}/documents`).then(r => r.json()),
    enabled: !!customerId,
  });
  const { data: notes = [] } = useQuery<Note[]>({
    queryKey: ["/api/customers", customerId, "notes"],
    queryFn: () => apiRequest("GET", `/api/customers/${customerId}/notes`).then(r => r.json()),
    enabled: !!customerId,
  });

  const patchMut = useMutation({
    mutationFn: (data: any) => apiRequest("PATCH", `/api/customers/${customerId}`, data).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId] }); queryClient.invalidateQueries({ queryKey: ["/api/customers"] }); },
  });

  // Sync payment state from server whenever customer data loads/changes
  useEffect(() => {
    if (!customer) return;
    const newPt  = customer.paymentTerms ?? "";
    const newFpt = customer.freightPaymentTerms ?? "";
    const newDpt = customer.dutyPaymentTerms ?? "";
    setPt(newPt);   setSavedPt(newPt);
    setFpt(newFpt); setSavedFpt(newFpt);
    setDpt(newDpt); setSavedDpt(newDpt);
  }, [customer?.paymentTerms, customer?.freightPaymentTerms, customer?.dutyPaymentTerms]);

  const savePaymentTerms = () => {
    patchMut.mutate(
      { paymentTerms: pt, freightPaymentTerms: fpt, dutyPaymentTerms: dpt },
      {
        onSuccess: () => {
          setSavedPt(pt); setSavedFpt(fpt); setSavedDpt(dpt);
          // Force immediate cache refresh so CustomerCard shows fresh data on back-navigation
          queryClient.refetchQueries({ queryKey: ["/api/customers", customerId] });
          queryClient.refetchQueries({ queryKey: ["/api/customers"] });
        }
      }
    );
  };

  if (loadingC || !customer) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: T.textMuted }}>
      Loading…
    </div>
  );

  const SECTION_META: Record<string, { title: string; subtitle: string }> = {
    financial:    { title: "Financial Summary",   subtitle: "Revenue, profit, cost breakdown, monthly trends and invoice history" },
    credit:       { title: "Credit & Receivables", subtitle: "Credit limit, utilization, outstanding invoices and aging analysis" },
    shipments:    { title: "Shipments",            subtitle: "Full shipment list with filters, statuses and financial details" },
    quotes:       { title: "Quotes & Pipeline",    subtitle: "All quotations, conversion tracking and pipeline value" },
    contacts:     { title: "Contacts",             subtitle: "Full contact directory with roles and details" },
    documents:    { title: "Documents",            subtitle: "Uploaded documents, contracts and files" },
    communication:{ title: "Communication Log",    subtitle: "All notes, emails, calls and follow-ups" },
    payment:      { title: "Payment Terms",        subtitle: "Freight and duty payment conditions for this customer" },
  };

  const meta = SECTION_META[section ?? ""] ?? { title: "Detail", subtitle: "" };

  // Save button shown in PageShell header only on payment section
  const paymentActions = section === "payment" ? (
    <button
      onClick={savePaymentTerms}
      disabled={!paymentDirty || patchMut.isPending}
      style={{
        padding: "7px 18px", borderRadius: 5, fontSize: 13, fontWeight: 600, cursor: paymentDirty ? "pointer" : "default",
        border: "none",
        background: paymentDirty ? T.blue : T.border,
        color: paymentDirty ? "#fff" : T.textLight,
        transition: "background 0.15s",
        display: "flex", alignItems: "center", gap: 6,
      }}
    >
      {patchMut.isPending ? "Saving…" : "Save"}
    </button>
  ) : undefined;

  return (
    <PageShell customer={customer} section={section ?? ""} title={meta.title} subtitle={meta.subtitle} actions={paymentActions}>
      {section === "financial"      && <FinancialSection    customer={customer} shipments={shipments} invoices={invoices} />}
      {section === "credit"         && <CreditSection       customer={customer} invoices={invoices} patchMut={patchMut} />}
      {section === "shipments"      && <ShipmentsSection    customerId={customerId} shipments={shipments} />}
      {section === "quotes"         && <QuotesSection       customerId={customerId} quotes={quotes} />}
      {section === "contacts"       && <ContactsSection     contacts={contacts} />}
      {section === "documents"      && <DocumentsSection    documents={documents} />}
      {section === "communication"  && <CommunicationSection notes={notes} />}
      {section === "payment"        && <PaymentSection pt={pt} fpt={fpt} dpt={dpt} setPt={setPt} setFpt={setFpt} setDpt={setDpt} dirty={paymentDirty} />}
      {!SECTION_META[section ?? ""] && (
        <div style={{ textAlign: "center", padding: "48px 0", color: T.textMuted }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: T.text }}>Section not found</p>
          <button onClick={() => setLocation(`/customers/${customerId}`)} style={{ marginTop: 12, color: T.blue, background: "none", border: "none", cursor: "pointer", fontSize: 13 }}>← Back to Customer Card</button>
        </div>
      )}
    </PageShell>
  );
}

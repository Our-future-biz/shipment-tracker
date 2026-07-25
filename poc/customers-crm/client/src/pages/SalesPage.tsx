import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import NewQuoteModal from "./NewQuoteModal";
import {
  Building2, TrendingUp, FileText, BarChart3, Users, ShoppingCart,
  LayoutDashboard, PlusCircle, Bell, GitBranch, LineChart, Package,
  ScrollText, ChevronRight, Clock, CheckCircle, AlertCircle,
  Phone, Mail, Calendar, ClipboardList, Search, X, Eye, Download,
  User, AlignLeft, ChevronLeft, ChevronDown,
} from "lucide-react";
import NewQuoteWorkflow, { QuotePDFExport as QhPDF } from "./NewQuoteWorkflow";
import { StatusBadge, type QuoteStatus } from "./QuoteLifecycle";
import TermsPage from "./TermsPage";

const T = {
  blue:       "#1D4ED8",
  border:     "#E5E7EB",
  borderL:    "#F1F5F9",
  text:       "#0F172A",
  textSub:    "#374151",
  textMuted:  "#64748B",
  textLight:  "#9CA3AF",
  bg:         "#F8FAFC",
  sidebar:    "#1E293B",
};

// ── Reusable "Coming Soon" page ────────────────────────────────────────────────
function ComingSoonPage({ title, subtitle, icon, accentBg, accentColor }: {
  title: string; subtitle: string;
  icon: React.ReactNode; accentBg: string; accentColor: string;
}) {
  return (
    <div style={{ padding: "40px 28px" }}>
      <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 14, maxWidth: 560, padding: "36px 32px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <div style={{ width: 52, height: 52, background: accentBg, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
          <span style={{ color: accentColor }}>{icon}</span>
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.7, marginBottom: 20 }}>{subtitle}</div>
        <span style={{ display: "inline-block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.textLight, background: T.bg, border: `1px solid ${T.border}`, padding: "4px 12px", borderRadius: 20 }}>
          Coming soon
        </span>
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function DashboardPage({ onNavigate }: { onNavigate: (id: string) => void }) {
  // Each tile mirrors a sidebar item (skip dashboard itself)
  const tiles = [
    { id: "new-quote",       label: "Create new quote",   Icon: PlusCircle,     bg: "#FFFBEB", border: "#FDE68A",  iconColor: "#B45309",  desc: "Start a new sales quotation for a customer." },
    { id: "quote-history",   label: "Quote History",      Icon: ClipboardList,  bg: "#EFF6FF", border: "#BFDBFE",  iconColor: "#1D4ED8",  desc: "View all past quotes and their current status." },
    { id: "follow-up",       label: "Follow up",          Icon: Bell,           bg: "#F5F3FF", border: "#DDD6FE",  iconColor: "#5B21B6",  desc: "Manage pending follow-up tasks with customers." },
    { id: "pipeline",        label: "Pipeline",           Icon: GitBranch,      bg: "#F0FDF4", border: "#BBF7D0",  iconColor: "#15803D",  desc: "Visual sales pipeline with stages and deal tracking." },
    { id: "sales-report",    label: "Sales report",       Icon: LineChart,      bg: "#EFF6FF", border: "#BFDBFE",  iconColor: "#1D4ED8",  desc: "Revenue, margin and conversion metrics by owner." },
    { id: "shipment-report", label: "Shipment reports",   Icon: Package,        bg: "#F0FDFA", border: "#99F6E4",  iconColor: "#0D9488",  desc: "Shipment job list with status and financial details." },
    { id: "terms",           label: "Terms & Conditions", Icon: ScrollText,     bg: "#F8FAFC", border: "#E2E8F0",  iconColor: "#64748B",  desc: "Applicable shipping conditions and usage policies." },
  ];

  return (
    <div style={{ padding: "28px 28px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
        {tiles.map(tile => (
          <div
            key={tile.id}
            onClick={() => onNavigate(tile.id)}
            style={{
              background: "#fff", border: `1px solid ${T.border}`, borderRadius: 10,
              overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
              cursor: "pointer", transition: "box-shadow 0.15s, transform 0.1s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 14px rgba(0,0,0,0.10)";
              (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)";
              (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
            }}
          >
            {/* Card header — matches sidebar colour */}
            <div style={{ background: tile.bg, borderBottom: `1px solid ${tile.border}`, padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 34, height: 34, background: "#fff", borderRadius: 8, border: `1px solid ${tile.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <tile.Icon style={{ width: 16, height: 16, color: tile.iconColor }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{tile.label}</span>
            </div>
            {/* Card body */}
            <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <p style={{ fontSize: 12, color: T.textMuted, margin: 0, lineHeight: 1.6, flex: 1 }}>{tile.desc}</p>
              <ChevronRight style={{ width: 14, height: 14, color: T.textLight, flexShrink: 0 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Create New Quote: landing page ───────────────────────────────────────────
function NewQuoteLanding({ onCreateNew }: { onCreateNew: () => void }) {
  // Live quote count from DB
  const { data: quotes = [] } = useQuery<any[]>({
    queryKey: ["/api/sales-quotes"],
    queryFn: () => apiRequest("GET", "/api/sales-quotes").then(r => r.json()),
  });
  return (
    <div>
      <div style={{ padding: "20px 28px", display: "flex", alignItems: "center", gap: 14 }}>
        <button
          onClick={onCreateNew}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 22px", background: "#2563EB", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: "0 2px 8px rgba(37,99,235,0.25)", transition: "background 0.15s" }}
          onMouseEnter={e => (e.currentTarget.style.background = "#1D4ED8")}
          onMouseLeave={e => (e.currentTarget.style.background = "#2563EB")}>
          <PlusCircle style={{ width: 16, height: 16 }} /> New quote
        </button>

      </div>
    </div>
  );
}

// ── Follow Up ────────────────────────────────────────────────────────────────
function FollowUpPage({ onOpenQuote }: { onOpenQuote?: (ref: string) => void }) {
  const items = [
    { company: "RAVAK a.s.", contact: "Jan Novák", type: "Call", due: "Today", status: "overdue", note: "Follow up on pending freight quotation" },
    { company: "VP industry 4.0 s.r.o.", contact: "Luky Slavik", type: "Email", due: "Tomorrow", status: "upcoming", note: "Send updated pricing for sea freight" },
    { company: "Alza.cz a.s.", contact: "—", type: "Visit", due: "May 8", status: "upcoming", note: "Initial meeting to present CRM + services" },
    { company: "Mondi Štětí a.s.", contact: "Petra Dvořák", type: "Call", due: "May 10", status: "upcoming", note: "Discuss contract renewal terms" },
  ];
  const statusStyle: Record<string, { bg: string; color: string; label: string }> = {
    overdue:  { bg: "#FEF2F2", color: "#B91C1C", label: "Overdue" },
    upcoming: { bg: "#EFF6FF", color: "#1D4ED8", label: "Upcoming" },
    done:     { bg: "#F0FDF4", color: "#15803D", label: "Done" },
  };
  const typeIcon: Record<string, React.ReactNode> = {
    Call:  <Phone style={{ width: 13, height: 13 }} />,
    Email: <Mail style={{ width: 13, height: 13 }} />,
    Visit: <Calendar style={{ width: 13, height: 13 }} />,
  };

  const { data: allQuotes = [] } = useQuery<any[]>({
    queryKey: ["/api/sales-quotes"],
    queryFn: () => apiRequest("GET", "/api/sales-quotes").then(r => r.json()),
    refetchInterval: 15000,
  });
  const followUpQuotes = allQuotes.filter(
    (q: any) => q.quote_status === "quoted" || q.quote_status === "feedback"
  );

  const qStatusCfg: Record<string, { bg: string; color: string; dot: string; label: string }> = {
    quoted:   { bg: "#EFF6FF", color: "#1D4ED8", dot: "#2563EB", label: "Quoted" },
    feedback: { bg: "#FFFBEB", color: "#B45309", dot: "#F59E0B", label: "Feedback" },
  };

  // Days since sent
  const daysSince = (ts: number) => ts ? Math.floor((Date.now() - ts) / 86400000) : null;

  return (
    <div style={{ padding: "28px 28px", display: "flex", flexDirection: "column" as const, gap: 20 }}>

      {/* ── Pending follow-up quotes ── */}
      <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ background: "#FFFBEB", borderBottom: "1px solid #FDE68A", padding: "12px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "#B45309", display: "flex", alignItems: "center", gap: 7 }}>
            <ClipboardList style={{ width: 13, height: 13 }} /> Quotes requiring follow-up
          </div>
          <span style={{ fontSize: 11, color: "#B45309", fontWeight: 600 }}>{followUpQuotes.length} quotes</span>
        </div>
        {followUpQuotes.length === 0 ? (
          <div style={{ padding: "28px", textAlign: "center" as const, fontSize: 13, color: T.textLight }}>
            No quotes with status Quoted or Feedback
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" as const }}>
            <thead>
              <tr style={{ background: "#F8FAFC" }}>
                {["Reference", "Customer", "Origin", "Destination", "Service", "Status", "Days open", "Validity"].map(h => (
                  <th key={h} style={{ padding: "7px 14px", textAlign: "left" as const, fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: T.textLight, borderBottom: `1px solid ${T.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {followUpQuotes.map((q: any) => {
                const cfg = qStatusCfg[q.quote_status] || qStatusCfg.quoted;
                const days = daysSince(q.sent_at ? q.sent_at : q.created_at * (String(q.created_at).length <= 10 ? 1000 : 1));
                const isOld = days !== null && days >= 3;
                const validityDate = q.validity_date || null;
                const isExpired = validityDate ? new Date(validityDate) < new Date() : false;
                return (
                  <tr key={q.id}
                    onClick={() => onOpenQuote && onOpenQuote(q.reference)}
                    style={{ borderBottom: `1px solid ${T.borderL}`, cursor: onOpenQuote ? "pointer" : "default", transition: "background 0.1s" }}
                    onMouseEnter={e => { if (onOpenQuote) (e.currentTarget as HTMLElement).style.background = "#F0F9FF"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ""; }}
                  >
                    <td style={{ padding: "9px 14px", fontSize: 12, fontFamily: "monospace", fontWeight: 700, color: "#2563EB", whiteSpace: "nowrap" as const }}>{q.reference}</td>
                    <td style={{ padding: "9px 14px", fontSize: 13, fontWeight: 600, color: T.text }}>{q.customer_name || <span style={{ color: T.textLight }}>—</span>}</td>
                    <td style={{ padding: "9px 14px", fontSize: 12, color: T.textMuted }}>{q.origin || "—"}</td>
                    <td style={{ padding: "9px 14px", fontSize: 12, color: T.textMuted }}>{q.destination || "—"}</td>
                    <td style={{ padding: "9px 14px", fontSize: 12, color: T.textMuted }}>{[q.service_type, q.direction].filter(Boolean).join(" ") || "—"}</td>
                    <td style={{ padding: "9px 14px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 20, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.bg}`, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.dot, flexShrink: 0 }} />
                        {cfg.label}
                      </span>
                    </td>
                    <td style={{ padding: "9px 14px", fontSize: 12, fontWeight: isOld ? 700 : 400, color: isOld ? "#B91C1C" : T.textMuted }}>
                      {days !== null ? `${days}d` : "—"}
                      {isOld && <span style={{ marginLeft: 5, fontSize: 10, fontWeight: 700, color: "#B91C1C", background: "#FEF2F2", padding: "1px 6px", borderRadius: 10 }}>Follow up</span>}
                    </td>
                    <td style={{ padding: "9px 14px", fontSize: 12, fontWeight: isExpired ? 700 : 400, color: isExpired ? "#B91C1C" : T.textMuted }}>
                      {validityDate
                        ? <>{validityDate}{isExpired && <span style={{ marginLeft: 5, fontSize: 10, fontWeight: 700, color: "#B91C1C", background: "#FEF2F2", padding: "1px 6px", borderRadius: 10 }}>Expired</span>}</>
                        : <span style={{ color: T.textLight }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Manual follow-up tasks ── */}
      <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ background: "#F5F3FF", borderBottom: `1px solid #DDD6FE`, padding: "12px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "#5B21B6", display: "flex", alignItems: "center", gap: 7 }}>
            <Bell style={{ width: 13, height: 13 }} /> Follow Up Tasks
          </div>
          <span style={{ fontSize: 11, color: "#5B21B6", fontWeight: 600 }}>{items.length} tasks</span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" as const }}>
          <thead>
            <tr style={{ background: "#F8FAFC" }}>
              {["Company", "Contact", "Type", "Due", "Status", "Note"].map(h => (
                <th key={h} style={{ padding: "7px 14px", textAlign: "left" as const, fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: T.textLight, borderBottom: `1px solid ${T.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((row, i) => {
              const st = statusStyle[row.status];
              return (
                <tr key={i} style={{ borderBottom: `1px solid ${T.borderL}` }}>
                  <td style={{ padding: "9px 14px", fontSize: 13, fontWeight: 600, color: T.text }}>{row.company}</td>
                  <td style={{ padding: "9px 14px", fontSize: 12, color: T.textMuted }}>{row.contact}</td>
                  <td style={{ padding: "9px 14px" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: "#F8FAFC", border: `1px solid ${T.border}`, color: T.textSub }}>
                      {typeIcon[row.type]}{row.type}
                    </span>
                  </td>
                  <td style={{ padding: "9px 14px", fontSize: 12, color: T.textMuted }}>{row.due}</td>
                  <td style={{ padding: "9px 14px" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 20, background: st.bg, color: st.color }}>{st.label}</span>
                  </td>
                  <td style={{ padding: "9px 14px", fontSize: 12, color: T.textMuted }}>{row.note}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Pipeline ──────────────────────────────────────────────────────────────────
function PipelinePage() {
  const stages = [
    { label: "Prospect",  color: "#94A3B8", bg: "#F8FAFC", deals: [{ name: "AEROPARTNER a.s.", value: "5 000 €", age: "3 days" }, { name: "O2 Czech Republic", value: "12 000 €", age: "1 day" }] },
    { label: "Qualified", color: "#3B82F6", bg: "#EFF6FF", deals: [{ name: "Alza.cz a.s.", value: "8 500 €", age: "5 days" }] },
    { label: "Proposal",  color: "#F59E0B", bg: "#FFFBEB", deals: [{ name: "Mondi Štětí a.s.", value: "22 000 €", age: "2 days" }] },
    { label: "Won",       color: "#16A34A", bg: "#F0FDF4", deals: [{ name: "RAVAK a.s.", value: "7 000 €", age: "Today" }, { name: "VP industry 4.0", value: "50 000 €", age: "Yesterday" }] },
  ];
  return (
    <div style={{ padding: "28px 28px" }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${stages.length}, 1fr)`, gap: 12 }}>
        {stages.map((stage, si) => (
          <div key={si} style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
            <div style={{ background: stage.bg, borderBottom: `1px solid ${T.border}`, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: stage.color, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{stage.label}</span>
              <span style={{ fontSize: 11, fontWeight: 600, background: "#fff", border: `1px solid ${T.border}`, color: T.textMuted, padding: "1px 7px", borderRadius: 20 }}>{stage.deals.length}</span>
            </div>
            <div style={{ padding: "10px 10px", display: "flex", flexDirection: "column" as const, gap: 8 }}>
              {stage.deals.map((d, di) => (
                <div key={di} style={{ background: T.bg, border: `1px solid ${T.borderL}`, borderRadius: 7, padding: "9px 12px", cursor: "pointer" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 4 }}>{d.name}</div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: stage.color }}>{d.value}</span>
                    <span style={{ fontSize: 10, color: T.textLight }}>{d.age}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sales Report ──────────────────────────────────────────────────────────────
function SalesReportPage() {
  const rows = [
    { owner: "Luky Slavik", quotes: 12, won: 5, lost: 2, revenue: "74 000 €", margin: "18.4%", conversion: "41.7%" },
  ];
  const kpis = [
    { label: "Total Quotes",    value: "12",       color: "#1D4ED8", bg: "#EFF6FF" },
    { label: "Won Deals",       value: "5",        color: "#15803D", bg: "#F0FDF4" },
    { label: "Lost Deals",      value: "2",        color: "#B91C1C", bg: "#FEF2F2" },
    { label: "Total Revenue",   value: "74 000 €", color: "#0F172A", bg: "#F8FAFC" },
    { label: "Avg Margin",      value: "18.4%",    color: "#15803D", bg: "#F0FDF4" },
    { label: "Conversion Rate", value: "41.7%",    color: "#5B21B6", bg: "#F5F3FF" },
  ];
  return (
    <div style={{ padding: "28px 28px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 22 }}>
        {kpis.map((k, i) => (
          <div key={i} style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 10, padding: "14px 18px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: T.textLight, marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: k.color, letterSpacing: "-0.02em" }}>{k.value}</div>
          </div>
        ))}
      </div>
      <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        <div style={{ background: "#EFF6FF", borderBottom: `1px solid #BFDBFE`, padding: "12px 16px", fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "#1D4ED8", display: "flex", alignItems: "center", gap: 7 }}>
          <LineChart style={{ width: 13, height: 13 }} /> Sales by owner
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" as const }}>
          <thead>
            <tr style={{ background: "#F8FAFC" }}>
              {["Sales Owner", "Quotes", "Won", "Lost", "Revenue", "Margin", "Conversion"].map(h => (
                <th key={h} style={{ padding: "7px 14px", textAlign: "left" as const, fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: T.textLight, borderBottom: `1px solid ${T.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 600, color: T.text }}>{r.owner}</td>
                <td style={{ padding: "10px 14px", fontSize: 13, color: T.textSub, textAlign: "right" as const }}>{r.quotes}</td>
                <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 700, color: "#15803D", textAlign: "right" as const }}>{r.won}</td>
                <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 700, color: "#B91C1C", textAlign: "right" as const }}>{r.lost}</td>
                <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 700, color: T.text, textAlign: "right" as const }}>{r.revenue}</td>
                <td style={{ padding: "10px 14px", fontSize: 13, color: "#15803D", textAlign: "right" as const }}>{r.margin}</td>
                <td style={{ padding: "10px 14px", fontSize: 13, color: "#5B21B6", textAlign: "right" as const }}>{r.conversion}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Shipment Reports ──────────────────────────────────────────────────────────
function ShipmentReportsPage() {
  const rows = [
    { id: "WHCZ2026001", customer: "RAVAK a.s.",         mode: "Road",  status: "Completed",   revenue: "7 000 €", margin: "14.3%" },
    { id: "WHCZ2026002", customer: "VP industry 4.0",    mode: "Sea",   status: "In Progress", revenue: "50 000 €", margin: "20.0%" },
    { id: "WHCZ2026003", customer: "Mondi Štětí a.s.",   mode: "Air",   status: "In Progress", revenue: "0 €",      margin: "—" },
    { id: "WHCZ2026004", customer: "Alza.cz a.s.",       mode: "Road",  status: "Pending",     revenue: "0 €",      margin: "—" },
  ];
  const statusStyle: Record<string, { bg: string; color: string }> = {
    "Completed":   { bg: "#F0FDF4", color: "#15803D" },
    "In Progress": { bg: "#EFF6FF", color: "#1D4ED8" },
    "Pending":     { bg: "#FFFBEB", color: "#B45309" },
  };
  return (
    <div style={{ padding: "28px 28px" }}>
      <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        <div style={{ background: "#F0FDFA", borderBottom: `1px solid #99F6E4`, padding: "12px 16px", fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "#0D9488", display: "flex", alignItems: "center", gap: 7 }}>
          <Package style={{ width: 13, height: 13 }} /> Shipment Reports
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" as const }}>
          <thead>
            <tr style={{ background: "#F8FAFC" }}>
              {["Job #", "Customer", "Mode", "Status", "Revenue", "Margin"].map(h => (
                <th key={h} style={{ padding: "7px 14px", textAlign: "left" as const, fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: T.textLight, borderBottom: `1px solid ${T.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const st = statusStyle[r.status] ?? { bg: T.bg, color: T.textMuted };
              return (
                <tr key={i} style={{ borderBottom: `1px solid ${T.borderL}` }}>
                  <td style={{ padding: "9px 14px", fontSize: 12, fontFamily: "monospace", color: T.textMuted }}>{r.id}</td>
                  <td style={{ padding: "9px 14px", fontSize: 13, fontWeight: 600, color: T.text }}>{r.customer}</td>
                  <td style={{ padding: "9px 14px", fontSize: 12, color: T.textSub }}>{r.mode}</td>
                  <td style={{ padding: "9px 14px" }}><span style={{ fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 20, background: st.bg, color: st.color }}>{r.status}</span></td>
                  <td style={{ padding: "9px 14px", fontSize: 13, fontWeight: 700, color: T.text, textAlign: "right" as const }}>{r.revenue}</td>
                  <td style={{ padding: "9px 14px", fontSize: 12, color: "#15803D", textAlign: "right" as const }}>{r.margin}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// TermsPage is imported from ./TermsPage

// All available columns with their labels and value accessors
const ALL_COLUMNS = [
  { id: "reference",    label: "Reference",       get: (q: any) => q.reference },
  { id: "customer",     label: "Customer",         get: (q: any) => q.customer_name },
  { id: "service",      label: "Service type",     get: (q: any) => [q.service_type, q.direction].filter(Boolean).join(" ") },
  { id: "origin",       label: "Origin",           get: (q: any) => q.origin },
  { id: "destination",  label: "Destination",      get: (q: any) => q.destination },
  { id: "incoterm",     label: "Incoterm",          get: (q: any) => q.incoterm },
  { id: "ready_date",   label: "Cargo ready",       get: (q: any) => q.ready_date },
  { id: "commodity",    label: "Commodity",         get: (q: any) => q.commodity },
  { id: "packages",     label: "Packages",          get: (q: any) => q.packages },
  { id: "weight",       label: "Gross weight",      get: (q: any) => q.weight ? q.weight + " kg" : undefined },
  { id: "cbm",          label: "CBM",               get: (q: any) => q.cbm ? q.cbm + " m\u00b3" : undefined },
  { id: "method",       label: "Method",            get: (q: any) => q.method },
  { id: "created",      label: "Created",           get: (q: any) => q.created_at ? new Date(q.created_at * (String(q.created_at).length > 10 ? 1 : 1000)).toLocaleDateString("en-GB") : undefined },
  { id: "status",       label: "Status",            get: (q: any) => q.quote_status || q.status },
  { id: "shipping_terms", label: "Shipping terms", get: (q: any) => q.shipping_terms },
  { id: "validity",      label: "Validity",        get: (q: any) => q.validity_date },
  { id: "action",       label: "Action",            get: (_q: any) => null },
];
const DEFAULT_COL_IDS = ["reference", "customer", "service", "origin", "destination", "incoterm", "ready_date", "created", "status", "action"];

// ── Module-level col store (in-memory cache for the session) ───────────────────
// Source of truth is the server DB (/api/prefs/qh_cols).
let _colIds: string[] = [...DEFAULT_COL_IDS];
let _colIdsLoaded = false;

async function fetchColIds(): Promise<string[]> {
  try {
    const res = await apiRequest("GET", "/api/prefs/qh_cols");
    const data = await res.json();
    if (data.value) {
      const parsed = JSON.parse(data.value);
      if (Array.isArray(parsed) && parsed.length > 0) {
        if (!parsed.includes("action")) return [...parsed, "action"];
        return parsed;
      }
    }
  } catch {}
  return [...DEFAULT_COL_IDS];
}

function persistColIds(ids: string[]) {
  _colIds = ids;
  apiRequest("PUT", "/api/prefs/qh_cols", { value: JSON.stringify(ids) }).catch(() => {});
}

function QuoteHistoryPage({ onOpenQuote, colIds, saveColIds }: {
  onOpenQuote?: (ref: string) => void;
  colIds: string[];
  saveColIds: (ids: string[]) => void;
}) {
  const [search, setSearch] = React.useState("");
  const [showColPicker, setShowColPicker] = React.useState(false);
  const colPickerRef = React.useRef<HTMLDivElement>(null);
  const [previewQuote, setPreviewQuote] = React.useState<any>(null);
  const [colFilters, setColFilters] = React.useState<Record<string, string>>({});
  const setColFilter = (id: string, val: string) => setColFilters(prev => ({ ...prev, [id]: val }));
  const clearColFilter = (id: string) => setColFilters(prev => { const n = { ...prev }; delete n[id]; return n; });

  // ── Filter panel state
  const [showFilterPanel, setShowFilterPanel] = React.useState(false);
  const [panelFilters, setPanelFilters] = React.useState<{
    statuses: string[];
    serviceType: string;
    direction: string;
    followUp: string;
    dateFrom: string;
    dateTo: string;
  }>({ statuses: [], serviceType: "", direction: "", followUp: "", dateFrom: "", dateTo: "" });
  const [pendingPanel, setPendingPanel] = React.useState({ ...panelFilters });

  // ── Saved Views
  // ── Built-in views (not deletable)
  const BUILTIN_VIEWS = [
    { id: "open",    label: "My open quotes",  filters: { statuses: ["draft", "ready_to_send"], serviceType: "", direction: "", followUp: "", dateFrom: "", dateTo: "" } },
    { id: "fu",     label: "Follow-up today", filters: { statuses: ["quoted", "feedback"],   serviceType: "", direction: "", followUp: "overdue", dateFrom: "", dateTo: "" } },
    { id: "won",    label: "Won this month",   filters: { statuses: ["won"],  serviceType: "", direction: "", followUp: "", dateFrom: "", dateTo: "" } },
    { id: "lost",   label: "Lost this month",  filters: { statuses: ["lost"], serviceType: "", direction: "", followUp: "", dateFrom: "", dateTo: "" } },
    { id: "drafts", label: "Drafts to finish", filters: { statuses: ["draft"], serviceType: "", direction: "", followUp: "", dateFrom: "", dateTo: "" } },
  ];

  // ── Custom saved views — persisted via /api/prefs/saved_views
  const [customViews, setCustomViews] = React.useState<{ id: string; label: string; filters: typeof panelFilters }[]>([]);
  React.useEffect(() => {
    apiRequest("GET", "/api/prefs/saved_views").then(r => r.json()).then(d => {
      if (d.value) { try { setCustomViews(JSON.parse(d.value)); } catch {} }
    }).catch(() => {});
  }, []);
  const persistCustomViews = (views: typeof customViews) => {
    setCustomViews(views);
    apiRequest("PUT", "/api/prefs/saved_views", { value: JSON.stringify(views) }).catch(() => {});
  };

  const [showSavedViews, setShowSavedViews] = React.useState(false);
  const [newViewName, setNewViewName] = React.useState("");
  const [showNewViewInput, setShowNewViewInput] = React.useState(false);
  const savedViewsRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!showSavedViews) return;
    const h = (e: MouseEvent) => { if (savedViewsRef.current && !savedViewsRef.current.contains(e.target as Node)) { setShowSavedViews(false); setShowNewViewInput(false); setNewViewName(""); } };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showSavedViews]);

  // ── Bulk selection
  const [selectedIds, setSelectedIds] = React.useState<Set<number>>(new Set());
  const [showBulkMenu, setShowBulkMenu] = React.useState(false);
  const bulkMenuRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!showBulkMenu) return;
    const h = (e: MouseEvent) => { if (bulkMenuRef.current && !bulkMenuRef.current.contains(e.target as Node)) setShowBulkMenu(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showBulkMenu]);

  // ── Pagination
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 25;

  // ── Search tips
  const [showTips, setShowTips] = React.useState(false);

  // Drag-to-reorder state (col picker panel)
  const [dragIdx, setDragIdx] = React.useState<number | null>(null);
  const [dragOver, setDragOver] = React.useState<number | null>(null);
  // Drag-to-reorder state (table header)
  const [thDragIdx, setThDragIdx] = React.useState<number | null>(null);
  const [thDragOver, setThDragOver] = React.useState<number | null>(null);

  // Close picker on outside click
  React.useEffect(() => {
    if (!showColPicker) return;
    const handler = (e: MouseEvent) => {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target as Node)) setShowColPicker(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showColPicker]);

  const activeCols = colIds.map(id => ALL_COLUMNS.find(c => c.id === id)).filter(Boolean) as typeof ALL_COLUMNS;

  // Build pdfData from a DB row (matches the shape QuotePDF expects)
  const buildPdfData = (q: any) => {
    const parse = (s: string) => { try { const v = JSON.parse(s||"[]"); return Array.isArray(v)?v:[]; } catch { return []; } };
    return {
      quoteNum: q.reference,
      company: q.customer_name, contact: q.customer_contact, email: q.customer_email, phone: q.customer_phone,
      serviceType: q.service_type, direction: q.direction,
      incoterm: q.incoterm, readyDate: q.ready_date,
      origin: q.origin, dest: q.destination, pickup: q.pickup, delivery: q.delivery,
      commodity: q.commodity, packages: parse(q.packages_json), totalPkgs: q.packages, weight: q.weight, cbm: q.cbm,
      buying: q.buying_price, selling: q.selling_price, currency: q.currency || "EUR",
      buyingLines: parse(q.buying_lines_json), sellingLines: parse(q.selling_lines_json),
      shippingTermsType: q.shipping_terms, notes: q.shipping_terms_notes,
      shippingTermsIncludes: "", shippingTermsExcludes: "",
    };
  };

  const { data: quotes = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/sales-quotes"],
    queryFn: () => apiRequest("GET", "/api/sales-quotes").then(r => r.json()),
    refetchInterval: 5000,
  });

  const filtered = React.useMemo(() => {
    let rows = quotes;
    // global search — wide across all fields
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        r.reference?.toLowerCase().includes(q) ||
        r.customer_name?.toLowerCase().includes(q) ||
        r.origin?.toLowerCase().includes(q) ||
        r.destination?.toLowerCase().includes(q) ||
        r.quote_status?.toLowerCase().includes(q) ||
        r.status?.toLowerCase().includes(q) ||
        r.service_type?.toLowerCase().includes(q) ||
        r.direction?.toLowerCase().includes(q) ||
        r.incoterm?.toLowerCase().includes(q) ||
        r.commodity?.toLowerCase().includes(q) ||
        r.method?.toLowerCase().includes(q) ||
        r.shipping_terms?.toLowerCase().includes(q)
      );
    }
    // panel filters
    if (panelFilters.statuses.length > 0) {
      rows = rows.filter(r => panelFilters.statuses.includes(r.quote_status || r.status?.toLowerCase() || ""));
    }
    if (panelFilters.serviceType) {
      rows = rows.filter(r => (r.service_type || "").toLowerCase().includes(panelFilters.serviceType.toLowerCase()));
    }
    if (panelFilters.direction) {
      rows = rows.filter(r => (r.direction || "").toLowerCase() === panelFilters.direction.toLowerCase());
    }
    if (panelFilters.dateFrom) {
      rows = rows.filter(r => r.ready_date && r.ready_date >= panelFilters.dateFrom);
    }
    if (panelFilters.dateTo) {
      rows = rows.filter(r => r.ready_date && r.ready_date <= panelFilters.dateTo);
    }
    if (panelFilters.followUp === "overdue") {
      const nowMs = Date.now();
      rows = rows.filter(r => {
        if (!r.sent_at) return false;
        const days = Math.floor((nowMs - r.sent_at) / 86400000);
        return days >= 3;
      });
    }
    // per-column inline filters
    for (const [id, val] of Object.entries(colFilters)) {
      if (!val) continue;
      const col = ALL_COLUMNS.find(c => c.id === id);
      if (!col) continue;
      const v = val.toLowerCase();
      rows = rows.filter(r => {
        const cell = col.get(r);
        return cell != null && String(cell).toLowerCase().includes(v);
      });
    }
    return rows;
  }, [quotes, search, colFilters, panelFilters]);

  // Reset to page 1 when filters change
  React.useEffect(() => { setPage(1); }, [search, colFilters, panelFilters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Active filter chips (from panel)
  const activeChips = React.useMemo(() => {
    const chips: { label: string; clear: () => void }[] = [];
    if (panelFilters.statuses.length > 0)
      chips.push({ label: `Status: ${panelFilters.statuses.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(", ")}`, clear: () => setPanelFilters(p => ({ ...p, statuses: [] })) });
    if (panelFilters.serviceType)
      chips.push({ label: `Service: ${panelFilters.serviceType}`, clear: () => setPanelFilters(p => ({ ...p, serviceType: "" })) });
    if (panelFilters.direction)
      chips.push({ label: `Direction: ${panelFilters.direction}`, clear: () => setPanelFilters(p => ({ ...p, direction: "" })) });
    if (panelFilters.dateFrom || panelFilters.dateTo)
      chips.push({ label: `Date: ${panelFilters.dateFrom || ""}–${panelFilters.dateTo || ""}`, clear: () => setPanelFilters(p => ({ ...p, dateFrom: "", dateTo: "" })) });
    if (panelFilters.followUp)
      chips.push({ label: `Follow-up: ${panelFilters.followUp}`, clear: () => setPanelFilters(p => ({ ...p, followUp: "" })) });
    Object.entries(colFilters).forEach(([id, val]) => {
      if (!val) return;
      const col = ALL_COLUMNS.find(c => c.id === id);
      chips.push({ label: `${col?.label || id}: ${val}`, clear: () => clearColFilter(id) });
    });
    return chips;
  }, [panelFilters, colFilters]);

  const panelActiveCount = panelFilters.statuses.length + (panelFilters.serviceType ? 1 : 0) + (panelFilters.direction ? 1 : 0) + (panelFilters.followUp ? 1 : 0) + (panelFilters.dateFrom || panelFilters.dateTo ? 1 : 0);
  const STATUS_OPTIONS: { id: string; label: string }[] = [
    { id: "draft", label: "Draft" }, { id: "ready_to_send", label: "Ready to Send" },
    { id: "quoted", label: "Quoted" }, { id: "feedback", label: "Feedback" },
    { id: "revised", label: "Revised" }, { id: "won", label: "Won" },
    { id: "lost", label: "Lost" }, { id: "expired", label: "Expired" },
  ];

  const statusStyle: Record<string, { bg: string; color: string }> = {
    "Draft":    { bg: "#F8FAFC", color: "#64748B" },
    "Sent":     { bg: "#EFF6FF", color: "#1D4ED8" },
    "Accepted": { bg: "#F0FDF4", color: "#15803D" },
    "Declined": { bg: "#FEF2F2", color: "#B91C1C" },
    "Expired":  { bg: "#FFFBEB", color: "#B45309" },
  };

  return (
    <div style={{ padding: "28px 28px", display: "flex", flexDirection: "column" as const, gap: 0 }}>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111827", margin: 0, letterSpacing: "-0.02em" }}>Quote History</h1>
      </div>

      {/* ── Toolbar: Search + Saved Views + Filters + Columns + Actions ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" as const }}>

        {/* Global search */}
        <div style={{ position: "relative" as const, flex: 1, minWidth: 260 }}>
          <Search style={{ width: 14, height: 14, color: "#9CA3AF", position: "absolute" as const, left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" as const }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search reference, customer, status, service type, origin, destination, commodity, incoterm…"
            style={{ width: "100%", padding: "9px 36px 9px 33px", fontSize: 13, border: "1px solid #E5E7EB", borderRadius: 8, outline: "none", fontFamily: "inherit", boxSizing: "border-box" as const, background: "#fff" }}
            onFocus={e => { e.target.style.borderColor = "#1D4ED8"; setShowTips(true); }}
            onBlur={e => { e.target.style.borderColor = "#E5E7EB"; setTimeout(() => setShowTips(false), 200); }} />
          {search
            ? <button onClick={() => setSearch("")} style={{ position: "absolute" as const, right: 9, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", padding: 2, display: "flex" }}><X style={{ width: 13, height: 13 }} /></button>
            : <span style={{ position: "absolute" as const, right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: "#CBD5E1", fontWeight: 600, background: "#F8FAFC", border: "1px solid #E5E7EB", borderRadius: 4, padding: "1px 5px" }}>⌘K</span>
          }
          {/* Search tips tooltip */}
          {showTips && (
            <div style={{ position: "absolute" as const, top: "calc(100% + 6px)", left: 0, right: 0, background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.1)", zIndex: 300, padding: "14px 16px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <Search style={{ width: 11, height: 11 }} /> Search tips
              </div>
              {[
                'Search by partial words (e.g. "shang" will find Shanghai)',
                'Search multiple keywords (e.g. "air export fca")',
                'Search by reference, customer, status, commodity, incoterm, origin, destination and more',
              ].map((tip, i) => (
                <div key={i} style={{ fontSize: 11, color: "#6B7280", padding: "2px 0", display: "flex", gap: 7, alignItems: "flex-start" }}>
                  <span style={{ color: "#2563EB", marginTop: 1 }}>•</span> {tip}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Saved Views */}
        <div ref={savedViewsRef} style={{ position: "relative" as const }}>
          <button onClick={() => setShowSavedViews(v => !v)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 13px", background: showSavedViews ? "#EFF6FF" : "#fff", border: `1px solid ${showSavedViews ? "#1D4ED8" : "#E5E7EB"}`, borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, color: showSavedViews ? "#1D4ED8" : "#374151", whiteSpace: "nowrap" as const }}>
            <Bell style={{ width: 13, height: 13 }} /> Saved views
            <ChevronDown style={{ width: 12, height: 12, marginLeft: 2 }} />
          </button>
          {showSavedViews && (
            <div style={{ position: "absolute" as const, left: 0, top: "calc(100% + 6px)", background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.11)", zIndex: 300, minWidth: 220, padding: "8px 0" }}>

              {/* Built-in views */}
              {BUILTIN_VIEWS.map(v => (
                <button key={v.id} onClick={() => { setPanelFilters(v.filters); setShowSavedViews(false); }}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 500, color: "#374151", textAlign: "left" as const }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#F8FAFC")}
                  onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                  <ClipboardList style={{ width: 12, height: 12, color: "#9CA3AF", flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{v.label}</span>
                </button>
              ))}

              {/* Custom views */}
              {customViews.length > 0 && (
                <>
                  <div style={{ borderTop: "1px solid #F3F4F6", margin: "6px 0" }} />
                  <div style={{ padding: "4px 14px 2px", fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "#9CA3AF" }}>My views</div>
                  {customViews.map(v => (
                    <div key={v.id} style={{ display: "flex", alignItems: "center" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#F8FAFC")}
                      onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                      <button onClick={() => { setPanelFilters(v.filters); setShowSavedViews(false); }}
                        style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "8px 14px 8px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 500, color: "#374151", textAlign: "left" as const }}>
                        <ClipboardList style={{ width: 12, height: 12, color: "#6B7280", flexShrink: 0 }} />
                        <span style={{ flex: 1 }}>{v.label}</span>
                      </button>
                      <button
                        title="Delete view"
                        onClick={e => { e.stopPropagation(); persistCustomViews(customViews.filter(c => c.id !== v.id)); }}
                        style={{ padding: "8px 12px 8px 4px", background: "none", border: "none", cursor: "pointer", color: "#D1D5DB", display: "flex", alignItems: "center", flexShrink: 0 }}
                        onMouseEnter={e => (e.currentTarget.style.color = "#EF4444")}
                        onMouseLeave={e => (e.currentTarget.style.color = "#D1D5DB")}>
                        <X style={{ width: 12, height: 12 }} />
                      </button>
                    </div>
                  ))}
                </>
              )}

              {/* Create new view */}
              <div style={{ borderTop: "1px solid #F3F4F6", margin: "6px 0" }} />
              {!showNewViewInput ? (
                <button
                  onClick={() => setShowNewViewInput(true)}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#2563EB", textAlign: "left" as const }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#EFF6FF")}
                  onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                  + Create new view
                </button>
              ) : (
                <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column" as const, gap: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 2 }}>Save current filters as view</div>
                  <input
                    autoFocus
                    value={newViewName}
                    onChange={e => setNewViewName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && newViewName.trim()) {
                        const newView = { id: `custom_${Date.now()}`, label: newViewName.trim(), filters: { ...panelFilters } };
                        persistCustomViews([...customViews, newView]);
                        setNewViewName(""); setShowNewViewInput(false); setShowSavedViews(false);
                      }
                      if (e.key === "Escape") { setShowNewViewInput(false); setNewViewName(""); }
                    }}
                    placeholder="View name…"
                    style={{ width: "100%", padding: "6px 9px", border: "1.5px solid #1D4ED8", borderRadius: 6, fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const }}
                  />
                  <div style={{ display: "flex", gap: 5 }}>
                    <button
                      onClick={() => { setShowNewViewInput(false); setNewViewName(""); }}
                      style={{ flex: 1, padding: "5px", border: "1px solid #E5E7EB", borderRadius: 6, background: "#fff", fontSize: 11, fontWeight: 600, color: "#6B7280", cursor: "pointer" }}>
                      Cancel
                    </button>
                    <button
                      disabled={!newViewName.trim()}
                      onClick={() => {
                        if (!newViewName.trim()) return;
                        const newView = { id: `custom_${Date.now()}`, label: newViewName.trim(), filters: { ...panelFilters } };
                        persistCustomViews([...customViews, newView]);
                        setNewViewName(""); setShowNewViewInput(false); setShowSavedViews(false);
                      }}
                      style={{ flex: 1, padding: "5px", border: "none", borderRadius: 6, background: newViewName.trim() ? "#1D4ED8" : "#E5E7EB", fontSize: 11, fontWeight: 700, color: newViewName.trim() ? "#fff" : "#9CA3AF", cursor: newViewName.trim() ? "pointer" : "default" }}>
                      Save
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Filters button */}
        <button onClick={() => { setPendingPanel({ ...panelFilters }); setShowFilterPanel(v => !v); }}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 13px", background: showFilterPanel || panelActiveCount > 0 ? "#EFF6FF" : "#fff", border: `1px solid ${showFilterPanel || panelActiveCount > 0 ? "#1D4ED8" : "#E5E7EB"}`, borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, color: showFilterPanel || panelActiveCount > 0 ? "#1D4ED8" : "#374151", whiteSpace: "nowrap" as const }}>
          <AlignLeft style={{ width: 13, height: 13 }} /> Filters
          {panelActiveCount > 0 && <span style={{ background: "#1D4ED8", color: "#fff", fontSize: 10, fontWeight: 800, borderRadius: 10, padding: "1px 6px", marginLeft: 2 }}>{panelActiveCount}</span>}
        </button>

        {activeChips.length > 0 && (
          <button onClick={() => { setPanelFilters({ statuses: [], serviceType: "", direction: "", followUp: "", dateFrom: "", dateTo: "" }); setColFilters({}); }}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "9px 13px", background: "#fff", border: "1px solid #E5E7EB", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#6B7280", whiteSpace: "nowrap" as const }}>
            <X style={{ width: 12, height: 12 }} /> Clear all
          </button>
        )}

        <div style={{ flex: 1 }} />

        {/* Column picker */}
        <div ref={colPickerRef} style={{ position: "relative" as const }}>
            <button
              onClick={() => setShowColPicker(v => !v)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", background: showColPicker ? "#EFF6FF" : "#fff", border: `1px solid ${showColPicker ? "#1D4ED8" : "#E5E7EB"}`, borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, color: showColPicker ? "#1D4ED8" : "#374151" }}>
              <BarChart3 style={{ width: 14, height: 14 }} />
              Columns
              <span style={{ background: "#1D4ED8", color: "#fff", fontSize: 10, fontWeight: 800, borderRadius: 10, padding: "1px 6px", marginLeft: 2 }}>{colIds.length}</span>
            </button>

            {showColPicker && (
              <div style={{ position: "absolute" as const, right: 0, top: "calc(100% + 6px)", background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 200, width: 280, padding: "16px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>Choose & reorder columns</span>
                  <button onClick={() => saveColIds(DEFAULT_COL_IDS)} style={{ fontSize: 11, color: "#9CA3AF", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Reset</button>
                </div>

                {/* Active columns (draggable) */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: "#9CA3AF", marginBottom: 6 }}>Active — drag to reorder</div>
                  {colIds.map((id, idx) => {
                    const col = ALL_COLUMNS.find(c => c.id === id);
                    if (!col) return null;
                    return (
                      <div key={id}
                        draggable
                        onDragStart={() => setDragIdx(idx)}
                        onDragOver={e => { e.preventDefault(); setDragOver(idx); }}
                        onDrop={() => {
                          if (dragIdx === null || dragIdx === idx) return;
                          const next = [...colIds];
                          const [moved] = next.splice(dragIdx, 1);
                          next.splice(idx, 0, moved);
                          saveColIds(next);
                          setDragIdx(null); setDragOver(null);
                        }}
                        onDragEnd={() => { setDragIdx(null); setDragOver(null); }}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", marginBottom: 2, borderRadius: 7, background: dragOver === idx ? "#EFF6FF" : "#F8FAFC", border: `1px solid ${dragOver === idx ? "#BFDBFE" : "#F3F4F6"}`, cursor: "grab" }}>
                        <span style={{ color: "#9CA3AF", fontSize: 14, lineHeight: 1, cursor: "grab" }}>&#8942;&#8942;</span>
                        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "#111827" }}>{col.label}</span>
                        <button onClick={() => saveColIds(colIds.filter(c => c !== id))}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", padding: 2, display: "flex", borderRadius: 4 }}
                          onMouseEnter={e => (e.currentTarget.style.color = "#EF4444")}
                          onMouseLeave={e => (e.currentTarget.style.color = "#9CA3AF")}>
                          <X style={{ width: 12, height: 12 }} />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Inactive columns */}
                {ALL_COLUMNS.filter(c => !colIds.includes(c.id)).length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: "#9CA3AF", marginBottom: 6 }}>Add column</div>
                    {ALL_COLUMNS.filter(c => !colIds.includes(c.id)).map(col => (
                      <button key={col.id}
                        onClick={() => saveColIds([...colIds, col.id])}
                        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "6px 8px", marginBottom: 2, borderRadius: 7, background: "none", border: "1px dashed #E5E7EB", cursor: "pointer", textAlign: "left" as const }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "#1D4ED8"; (e.currentTarget as HTMLElement).style.background = "#EFF6FF"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#E5E7EB"; (e.currentTarget as HTMLElement).style.background = "none"; }}>
                        <span style={{ fontSize: 14, color: "#9CA3AF" }}>+</span>
                        <span style={{ fontSize: 12, color: "#374151" }}>{col.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Export button */}
          <div style={{ position: "relative" as const }}>
            <button
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 13px", background: "#fff", border: "1px solid #E5E7EB", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#374151" }}
              onClick={() => {
                const headers = activeCols.filter(c => c.id !== "action").map(c => c.label).join(",");
                const rows = filtered.map(q =>
                  activeCols.filter(c => c.id !== "action").map(c => {
                    const v = c.get(q);
                    return v != null ? `"${String(v).replace(/"/g, '""')}"` : "";
                  }).join(",")
                ).join("\n");
                const blob = new Blob([headers + "\n" + rows], { type: "text/csv" });
                const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
                a.download = `quotes-${new Date().toISOString().slice(0,10)}.csv`; a.click();
              }}>
              <Download style={{ width: 13, height: 13 }} /> Export
              <ChevronDown style={{ width: 11, height: 11 }} />
            </button>
          </div>

          {/* Actions button */}
          <div ref={bulkMenuRef} style={{ position: "relative" as const }}>
            <button onClick={() => setShowBulkMenu(v => !v)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", background: "#2563EB", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#fff" }}>
              Actions <ChevronDown style={{ width: 11, height: 11 }} />
            </button>
            {showBulkMenu && (
              <div style={{ position: "absolute" as const, right: 0, top: "calc(100% + 5px)", background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 300, minWidth: 200, padding: "6px 0" }}>
                {[
                  { icon: <User style={{ width: 12, height: 12 }} />, label: "Assign owner" },
                  { icon: <AlignLeft style={{ width: 12, height: 12 }} />, label: "Change status" },
                  { icon: <Calendar style={{ width: 12, height: 12 }} />, label: "Set follow-up date" },
                  { icon: <Bell style={{ width: 12, height: 12 }} />, label: "Add note" },
                ].map(a => (
                  <button key={a.label}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#374151", textAlign: "left" as const }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#F8FAFC")}
                    onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                    {a.icon} {a.label}
                  </button>
                ))}
                <div style={{ borderTop: "1px solid #FEE2E2", margin: "4px 0" }} />
                <button style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#DC2626", textAlign: "left" as const }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#FEF2F2")}
                  onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                  <X style={{ width: 12, height: 12 }} /> Mark as lost
                </button>
              </div>
            )}
          </div>

      </div>

      {/* ── Active filter chips bar ── */}
      {activeChips.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, padding: "8px 0", borderBottom: "1px solid #F1F5F9", flexWrap: "nowrap" as const, overflowX: "auto" as const }}>
          {/* Chips */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, flexWrap: "wrap" as const }}>
            {activeChips.map((chip, i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 500, padding: "4px 10px", borderRadius: 6, background: "#F3F4F6", color: "#374151", border: "1px solid #E5E7EB", whiteSpace: "nowrap" as const }}>
                {chip.label}
                <button type="button" onClick={chip.clear} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", padding: 0, display: "flex", alignItems: "center", lineHeight: 1 }}>
                  <X style={{ width: 10, height: 10 }} />
                </button>
              </span>
            ))}
            <button onClick={() => { setPanelFilters({ statuses: [], serviceType: "", direction: "", followUp: "", dateFrom: "", dateTo: "" }); setColFilters({}); }}
              style={{ fontSize: 12, fontWeight: 600, color: "#2563EB", background: "none", border: "none", padding: "0 4px", cursor: "pointer", whiteSpace: "nowrap" as const }}>
              Clear all
            </button>
          </div>
          {/* Right side */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <button style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "#374151", background: "none", border: "1px solid #E5E7EB", borderRadius: 7, padding: "5px 10px", cursor: "pointer" }}>
              <Bell style={{ width: 11, height: 11 }} /> Save this view
            </button>
          </div>
        </div>
      )}

      {/* ── Layout: Filter panel + Table ── */}
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>

        {/* ── Filter Panel (left side) ── */}
        {showFilterPanel && (() => {
          const pendingCount = pendingPanel.statuses.length
            + (pendingPanel.serviceType ? 1 : 0)
            + (pendingPanel.direction ? 1 : 0)
            + (pendingPanel.followUp ? 1 : 0)
            + (pendingPanel.dateFrom || pendingPanel.dateTo ? 1 : 0);
          const selStyle = { width: "100%", padding: "9px 12px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none", background: "#fff", color: "#111827", cursor: "pointer", appearance: "none" as const, WebkitAppearance: "none" as const };
          const labelStyle = { fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 8, display: "block" };
          const fieldWrap = { display: "flex", flexDirection: "column" as const, gap: 0 };
          return (
          <div style={{ width: 260, flexShrink: 0, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.07)", display: "flex", flexDirection: "column" as const, overflow: "hidden" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px 12px" }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>Filters</span>
              <button onClick={() => setShowFilterPanel(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#2563EB", fontSize: 13, fontWeight: 600, padding: 0 }}>Hide</button>
            </div>

            <div style={{ flex: 1, overflowY: "auto" as const, padding: "0 18px", display: "flex", flexDirection: "column" as const, gap: 18 }}>

              {/* Status */}
              <div style={fieldWrap}>
                <label style={labelStyle}>Status</label>
                <div style={{ position: "relative" as const }}>
                  <select
                    value={pendingPanel.statuses[0] || ""}
                    onChange={e => setPendingPanel(p => ({ ...p, statuses: e.target.value ? [e.target.value] : [] }))}
                    style={{ ...selStyle, color: pendingPanel.statuses.length ? "#111827" : "#9CA3AF" }}>
                    <option value="">Select status…</option>
                    {STATUS_OPTIONS.map(s => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                  <ChevronDown style={{ width: 13, height: 13, color: "#9CA3AF", position: "absolute" as const, right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" as const }} />
                </div>
              </div>

              {/* Date */}
              <div style={fieldWrap}>
                <label style={labelStyle}>Date</label>
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
                  <div style={{ position: "relative" as const }}>
                    <select value={pendingPanel.dateFrom} onChange={e => setPendingPanel(p => ({ ...p, dateFrom: e.target.value }))}
                      style={selStyle}>
                      <option value="">Next follow-up date</option>
                      <option value="today">Today</option>
                      <option value="week">This week</option>
                      <option value="month">This month</option>
                    </select>
                    <ChevronDown style={{ width: 13, height: 13, color: "#9CA3AF", position: "absolute" as const, right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" as const }} />
                  </div>
                  <div style={{ position: "relative" as const }}>
                    <select value={pendingPanel.followUp} onChange={e => setPendingPanel(p => ({ ...p, followUp: e.target.value }))}
                      style={selStyle}>
                      <option value="">Overdue</option>
                      <option value="overdue">Overdue (≥3 days)</option>
                      <option value="overdue7">Overdue (≥7 days)</option>
                    </select>
                    <ChevronDown style={{ width: 13, height: 13, color: "#9CA3AF", position: "absolute" as const, right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" as const }} />
                  </div>
                </div>
              </div>

              {/* Sales Owner */}
              <div style={fieldWrap}>
                <label style={labelStyle}>Sales Owner</label>
                <div style={{ position: "relative" as const }}>
                  <select style={selStyle} defaultValue="me">
                    <option value="me">Me</option>
                    <option value="all">All</option>
                  </select>
                  <ChevronDown style={{ width: 13, height: 13, color: "#9CA3AF", position: "absolute" as const, right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" as const }} />
                </div>
              </div>

              {/* Service Type */}
              <div style={fieldWrap}>
                <label style={labelStyle}>Service Type</label>
                <div style={{ position: "relative" as const }}>
                  <select value={pendingPanel.serviceType} onChange={e => setPendingPanel(p => ({ ...p, serviceType: e.target.value }))}
                    style={{ ...selStyle, color: pendingPanel.serviceType ? "#111827" : "#9CA3AF" }}>
                    <option value="">Select service type</option>
                    {[...new Set(quotes.map((q: any) => q.service_type).filter(Boolean))].sort().map((v: any) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                  <ChevronDown style={{ width: 13, height: 13, color: "#9CA3AF", position: "absolute" as const, right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" as const }} />
                </div>
              </div>

              {/* Direction */}
              <div style={fieldWrap}>
                <label style={labelStyle}>Direction</label>
                <div style={{ position: "relative" as const }}>
                  <select value={pendingPanel.direction} onChange={e => setPendingPanel(p => ({ ...p, direction: e.target.value }))}
                    style={selStyle}>
                    <option value="">All</option>
                    <option value="Import">Import</option>
                    <option value="Export">Export</option>
                  </select>
                  <ChevronDown style={{ width: 13, height: 13, color: "#9CA3AF", position: "absolute" as const, right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" as const }} />
                </div>
              </div>

              {/* Customer Type */}
              <div style={fieldWrap}>
                <label style={labelStyle}>Customer Type</label>
                <div style={{ position: "relative" as const }}>
                  <select style={{ ...selStyle, color: "#9CA3AF" }}>
                    <option value="">Select customer type</option>
                    <option value="key_account">Key Account</option>
                    <option value="standard">Standard</option>
                  </select>
                  <ChevronDown style={{ width: 13, height: 13, color: "#9CA3AF", position: "absolute" as const, right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" as const }} />
                </div>
              </div>

              {/* Follow-up (standalone) */}
              <div style={{ ...fieldWrap, marginBottom: 4 }}>
                <label style={labelStyle}>Follow-up</label>
                <div style={{ position: "relative" as const }}>
                  <select style={{ ...selStyle, color: "#9CA3AF" }}>
                    <option value="">Select follow-up</option>
                    <option value="today">Today</option>
                    <option value="overdue">Overdue</option>
                    <option value="upcoming">Upcoming</option>
                  </select>
                  <ChevronDown style={{ width: 13, height: 13, color: "#9CA3AF", position: "absolute" as const, right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" as const }} />
                </div>
              </div>

            </div>

            {/* Footer buttons */}
            <div style={{ padding: "14px 18px", borderTop: "1px solid #F1F5F9", display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={() => { setPendingPanel({ statuses: [], serviceType: "", direction: "", followUp: "", dateFrom: "", dateTo: "" }); setShowFilterPanel(false); }}
                style={{ flex: 1, padding: "10px", border: "1px solid #E2E8F0", borderRadius: 8, background: "#fff", fontSize: 13, fontWeight: 600, color: "#374151", cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={() => { setPanelFilters({ ...pendingPanel }); setShowFilterPanel(false); }}
                style={{ flex: 2, padding: "10px 14px", border: "none", borderRadius: 8, background: "#2563EB", fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                Apply filters
                {pendingCount > 0 && (
                  <span style={{ background: "rgba(255,255,255,0.25)", borderRadius: 20, padding: "1px 8px", fontSize: 12, fontWeight: 800 }}>{pendingCount}</span>
                )}
              </button>
            </div>
          </div>
          );
        })()}

        {/* ── Table panel ── */}
      <div style={{ flex: 1, background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        {/* Table header bar */}
        <div style={{ background: "#FFFBEB", borderBottom: "1px solid #FDE68A", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "#B45309", display: "flex", alignItems: "center", gap: 7 }}>
            <ClipboardList style={{ width: 13, height: 13 }} /> Quote History
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {selectedIds.size > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, color: "#2563EB" }}>{selectedIds.size} selected</span>
            )}
            <span style={{ fontSize: 11, fontWeight: 600, color: "#B45309" }}>
              Showing {Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} quote{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {isLoading ? (
          <div style={{ padding: "32px", textAlign: "center" as const, color: "#9CA3AF", fontSize: 13 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "48px 24px", textAlign: "center" as const }}>
            <Search style={{ width: 32, height: 32, color: "#CBD5E1", margin: "0 auto 12px", display: "block" }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 4 }}>
              {quotes.length === 0 ? "No quotes yet" : "No matching quotes"}
            </div>
            <div style={{ fontSize: 12, color: "#9CA3AF" }}>
              {quotes.length === 0 ? "Create your first quotation using + Create new." : `No results for "${search}"`}
            </div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" as const }}>
            <table style={{ width: "100%", borderCollapse: "collapse" as const, minWidth: activeCols.length * 120 }}>
              <thead>
                <tr style={{ background: "#F8FAFC" }}>
                  {/* Checkbox column */}
                  <th style={{ padding: "8px 8px 8px 14px", borderBottom: "1px solid #E5E7EB", width: 32 }}>
                    <input type="checkbox"
                      checked={paginated.length > 0 && paginated.every((q: any) => selectedIds.has(q.id))}
                      onChange={e => {
                        if (e.target.checked) setSelectedIds(new Set([...selectedIds, ...paginated.map((q: any) => q.id)]));
                        else setSelectedIds(new Set([...selectedIds].filter(id => !paginated.some((q: any) => q.id === id))));
                      }}
                      style={{ cursor: "pointer", accentColor: "#1D4ED8" }}
                    />
                  </th>
                  {/* Validity dot column — fixed, always shown */}
                  <th style={{ padding: "8px 6px", borderBottom: "1px solid #E5E7EB", width: 28, textAlign: "center" as const, fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: "#9CA3AF" }} title="Quote validity status">
                    ●
                  </th>
                  {activeCols.map((col, idx) => (
                    <th key={col.id}
                      draggable
                      onDragStart={() => setThDragIdx(idx)}
                      onDragOver={e => { e.preventDefault(); setThDragOver(idx); }}
                      onDrop={() => {
                        if (thDragIdx === null || thDragIdx === idx) { setThDragIdx(null); setThDragOver(null); return; }
                        const next = [...colIds];
                        const [moved] = next.splice(thDragIdx, 1);
                        next.splice(idx, 0, moved);
                        saveColIds(next);
                        setThDragIdx(null); setThDragOver(null);
                      }}
                      onDragEnd={() => { setThDragIdx(null); setThDragOver(null); }}
                      style={{ padding: "8px 14px", textAlign: col.id === "action" ? "right" as const : "left" as const, fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: thDragOver === idx ? "#1D4ED8" : "#9CA3AF", borderBottom: "1px solid #E5E7EB", whiteSpace: "nowrap" as const, cursor: "grab", userSelect: "none" as const, background: thDragOver === idx ? "#EFF6FF" : "#F8FAFC", transition: "background 0.1s, color 0.1s", ...(col.id === "action" ? { width: 80 } : {}) }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <span style={{ color: thDragOver === idx ? "#1D4ED8" : "#D1D5DB", fontSize: 10, lineHeight: 1 }}>⠿</span>
                        {col.label}
                        {colFilters[col.id] && (
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#2563EB", flexShrink: 0 }} />
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
                {/* ── Filter row ── */}
                <tr style={{ background: "#F1F5F9" }}>
                  <td style={{ padding: "4px 8px", borderBottom: "1px solid #E5E7EB" }} />
                  {/* Validity dot — no filter */}
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #E5E7EB" }} />
                  {activeCols.map(col => {
                    if (col.id === "action") return <td key={col.id} style={{ padding: "4px 8px", borderBottom: "1px solid #E5E7EB" }} />;
                    // Collect unique non-null values for dropdown columns
                    const isDropdown = ["status", "service", "method", "incoterm", "shipping_terms"].includes(col.id);
                    const uniqueVals = isDropdown
                      ? [...new Set(quotes.map(q => col.get(q)).filter(Boolean) as string[])].sort()
                      : null;
                    const active = !!colFilters[col.id];
                    return (
                      <td key={col.id} style={{ padding: "4px 6px", borderBottom: "1px solid #E5E7EB" }}>
                        <div style={{ position: "relative" as const }}>
                          {isDropdown && uniqueVals ? (
                            <select
                              value={colFilters[col.id] || ""}
                              onChange={e => e.target.value ? setColFilter(col.id, e.target.value) : clearColFilter(col.id)}
                              style={{ width: "100%", padding: "4px 22px 4px 7px", fontSize: 11, border: `1px solid ${active ? "#2563EB" : "#E5E7EB"}`, borderRadius: 5, outline: "none", background: active ? "#EFF6FF" : "#fff", color: active ? "#1D4ED8" : "#374151", fontFamily: "inherit", cursor: "pointer", appearance: "none" as const, WebkitAppearance: "none" as const }}
                            >
                              <option value="">All</option>
                              {uniqueVals.map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={colFilters[col.id] || ""}
                              onChange={e => e.target.value ? setColFilter(col.id, e.target.value) : clearColFilter(col.id)}
                              placeholder="Filter…"
                              style={{ width: "100%", padding: "4px 22px 4px 7px", fontSize: 11, border: `1px solid ${active ? "#2563EB" : "#E5E7EB"}`, borderRadius: 5, outline: "none", background: active ? "#EFF6FF" : "#fff", color: active ? "#1D4ED8" : "#374151", fontFamily: "inherit", boxSizing: "border-box" as const }}
                              onFocus={e => e.target.style.borderColor = "#2563EB"}
                              onBlur={e => e.target.style.borderColor = colFilters[col.id] ? "#2563EB" : "#E5E7EB"}
                            />
                          )}
                          {active && (
                            <button
                              type="button"
                              onClick={() => clearColFilter(col.id)}
                              style={{ position: "absolute" as const, right: 4, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#2563EB", padding: 0, display: "flex", alignItems: "center" }}
                            >
                              <X style={{ width: 10, height: 10 }} />
                            </button>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {paginated.map((q: any) => {
                  const st = statusStyle[q.status] ?? { bg: "#F8FAFC", color: "#64748B" };
                  const isSelected = selectedIds.has(q.id);
                  return (
                    <tr key={q.id}
                      onClick={() => onOpenQuote?.(q.reference)}
                      style={{ borderBottom: "1px solid #F1F5F9", cursor: "pointer", transition: "background 0.1s", background: isSelected ? "#EFF6FF" : undefined }}
                      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "#F8FAFC"; }}
                      onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                      {/* Checkbox */}
                      <td style={{ padding: "8px 8px 8px 14px" }} onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={isSelected}
                          onChange={e => { const s = new Set(selectedIds); e.target.checked ? s.add(q.id) : s.delete(q.id); setSelectedIds(s); }}
                          style={{ cursor: "pointer", accentColor: "#1D4ED8" }} />
                      </td>
                      {/* Validity dot */}
                      {(() => {
                        const vd = q.validity_date;
                        const hasDate = !!vd;
                        const expired = hasDate && new Date(vd) < new Date();
                        const dotColor = !hasDate ? "#D1D5DB" : expired ? "#EF4444" : "#22C55E";
                        const dotTitle = !hasDate ? "No validity date set" : expired ? `Expired: ${vd}` : `Valid until: ${vd}`;
                        return (
                          <td style={{ padding: "0 6px", textAlign: "center" as const, width: 28 }}>
                            <span
                              title={dotTitle}
                              style={{
                                display: "inline-block",
                                width: 10, height: 10,
                                borderRadius: "50%",
                                background: dotColor,
                                flexShrink: 0,
                                cursor: "default",
                                boxShadow: hasDate ? `0 0 0 2px ${expired ? "#FEE2E2" : "#DCFCE7"}` : undefined,
                              }}
                            />
                          </td>
                        );
                      })()}
                      {activeCols.map(col => {
                        const val = col.get(q);
                        if (col.id === "action") return (
                          <td key={col.id} style={{ padding: "8px 14px", textAlign: "right" as const }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                              {/* Eye — preview */}
                              <button
                                type="button" title="Preview PDF"
                                onClick={e => { e.stopPropagation(); setPreviewQuote(q); }}
                                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 7, background: "none", border: "1px solid #E5E7EB", cursor: "pointer", color: "#64748B" }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background="#EFF6FF"; (e.currentTarget as HTMLElement).style.borderColor="#1D4ED8"; (e.currentTarget as HTMLElement).style.color="#1D4ED8"; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background="none"; (e.currentTarget as HTMLElement).style.borderColor="#E5E7EB"; (e.currentTarget as HTMLElement).style.color="#64748B"; }}>
                                <Eye style={{ width: 13, height: 13 }} />
                              </button>
                              {/* Download — print dialog */}
                              <button
                                type="button" title="Download PDF"
                                onClick={e => {
                                  e.stopPropagation();
                                  const el = document.getElementById(`qh-pdf-${q.id}`);
                                  if (!el) { setPreviewQuote(q); return; }
                                  const win = window.open("", "_blank", "width=900,height=700");
                                  if (!win) return;
                                  win.document.write(`<!DOCTYPE html><html><head><title>${q.reference}</title><style>body{margin:0;font-family:'Inter',-apple-system,sans-serif;background:#fff}@media print{@page{margin:12mm;size:A4}}</style></head><body>${el.innerHTML}</body></html>`);
                                  win.document.close(); win.focus(); setTimeout(()=>win.print(),400);
                                }}
                                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 7, background: "none", border: "1px solid #E5E7EB", cursor: "pointer", color: "#64748B" }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background="#EFF6FF"; (e.currentTarget as HTMLElement).style.borderColor="#1D4ED8"; (e.currentTarget as HTMLElement).style.color="#1D4ED8"; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background="none"; (e.currentTarget as HTMLElement).style.borderColor="#E5E7EB"; (e.currentTarget as HTMLElement).style.color="#64748B"; }}>
                                <Download style={{ width: 13, height: 13 }} />
                              </button>
                              {/* Hidden PDF render for download */}
                              <div id={`qh-pdf-${q.id}`} style={{ display: "none" }}>
                                <QhPDF q={buildPdfData(q)} />
                              </div>
                            </div>
                          </td>
                        );
                        if (col.id === "reference") return (
                          <td key={col.id} style={{ padding: "10px 14px", fontSize: 12, fontFamily: "monospace", color: "#2563EB", fontWeight: 700, whiteSpace: "nowrap" as const }}>{val}</td>
                        );
                        if (col.id === "status") return (
                          <td key={col.id} style={{ padding: "10px 14px" }}>
                            {val
                              ? <StatusBadge status={val as QuoteStatus} />
                              : <span style={{ color: "#CBD5E1" }}>—</span>}
                          </td>
                        );
                        if (col.id === "customer") return (
                          <td key={col.id} style={{ padding: "10px 14px", fontSize: 13, color: "#0F172A", fontWeight: val ? 600 : 400 }}>
                            {val || <span style={{ color: "#CBD5E1" }}>Not set</span>}
                          </td>
                        );
                        return (
                          <td key={col.id} style={{ padding: "10px 14px", fontSize: 12, color: val ? "#374151" : "#CBD5E1", whiteSpace: "nowrap" as const }}>{val || "—"}</td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div style={{ padding: "12px 18px", borderTop: "1px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: "#6B7280" }}>
              Showing {Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} results
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                style={{ padding: "5px 9px", border: "1px solid #E5E7EB", borderRadius: 7, background: "#fff", cursor: page === 1 ? "default" : "pointer", color: page === 1 ? "#CBD5E1" : "#374151", display: "flex", alignItems: "center" }}>
                <ChevronLeft style={{ width: 13, height: 13 }} />
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                const p = i + Math.max(1, page - 3);
                if (p > totalPages) return null;
                return (
                  <button key={p} onClick={() => setPage(p)}
                    style={{ padding: "5px 10px", border: `1px solid ${p === page ? "#1D4ED8" : "#E5E7EB"}`, borderRadius: 7, background: p === page ? "#1D4ED8" : "#fff", color: p === page ? "#fff" : "#374151", cursor: "pointer", fontSize: 12, fontWeight: p === page ? 700 : 500, minWidth: 32 }}>
                    {p}
                  </button>
                );
              })}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                style={{ padding: "5px 9px", border: "1px solid #E5E7EB", borderRadius: 7, background: "#fff", cursor: page === totalPages ? "default" : "pointer", color: page === totalPages ? "#CBD5E1" : "#374151", display: "flex", alignItems: "center" }}>
                <ChevronRight style={{ width: 13, height: 13 }} />
              </button>
              <span style={{ fontSize: 12, color: "#9CA3AF", marginLeft: 8 }}>Rows per page:</span>
              <select value={PAGE_SIZE} style={{ border: "1px solid #E5E7EB", borderRadius: 6, padding: "4px 6px", fontSize: 12, fontFamily: "inherit" }} disabled>
                <option>25</option>
              </select>
            </div>
          </div>
        )}
      </div>
      </div>

      {/* Preview modal */}
      {previewQuote && (
        <div style={{ position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 999, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 24px", overflowY: "auto" as const }}
          onClick={() => setPreviewQuote(null)}>
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 860, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", overflow: "hidden" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding: "16px 22px", borderBottom: "1px solid #E5E7EB", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>{previewQuote.reference}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button type="button"
                  onClick={() => {
                    const el = document.getElementById(`qh-modal-pdf`);
                    if (!el) return;
                    const win = window.open("", "_blank", "width=900,height=700");
                    if (!win) return;
                    win.document.write(`<!DOCTYPE html><html><head><title>${previewQuote.reference}</title><style>body{margin:0;font-family:'Inter',-apple-system,sans-serif;background:#fff}@media print{@page{margin:12mm;size:A4}}</style></head><body>${el.innerHTML}</body></html>`);
                    win.document.close(); win.focus(); setTimeout(()=>win.print(),400);
                  }}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "#1D4ED8", border: "none", borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff" }}>
                  <Download style={{ width: 13, height: 13 }} /> Download PDF
                </button>
                <button onClick={() => setPreviewQuote(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", padding: 4 }}>
                  <X style={{ width: 18, height: 18 }} />
                </button>
              </div>
            </div>
            <div style={{ padding: 22 }}>
              <div id="qh-modal-pdf">
                <QhPDF q={buildPdfData(previewQuote)} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── NAV ITEMS ─────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: "dashboard",       label: "Dashboard",          icon: LayoutDashboard },
  { id: "new-quote",       label: "Create new quote",   icon: PlusCircle },
  { id: "quote-history",   label: "Quote History",      icon: ClipboardList },
  { id: "follow-up",       label: "Follow up",          icon: Bell },
  { id: "pipeline",        label: "Pipeline",           icon: GitBranch },
  { id: "sales-report",    label: "Sales report",       icon: LineChart },
  { id: "shipment-report", label: "Shipment reports",   icon: Package },
  { id: "terms",           label: "Terms & Conditions", icon: ScrollText },
];
const NAV_BOTTOM: typeof NAV_ITEMS = [];

const SIGNED_IN_USER = "Luky Slavik";

// ── SidebarItem must live OUTSIDE SalesPage to keep a stable component reference ──
// Defining it inside SalesPage causes React to see a new type on every render
// and unmount/remount the entire content area, wiping all child state.
const SidebarItem = React.memo(function SidebarItem({
  item, active, onClick,
}: { item: { id: string; label: string; icon: React.ComponentType<any> }; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10,
        padding: "9px 18px",
        background: active ? "rgba(37,99,235,0.18)" : "none",
        border: "none",
        borderLeft: active ? "3px solid #3B82F6" : "3px solid transparent",
        cursor: "pointer", textAlign: "left" as const,
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = "none"; }}
    >
      <Icon style={{ width: 15, height: 15, color: active ? "#93C5FD" : "#94A3B8", flexShrink: 0 }} />
      <span style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? "#E2E8F0" : "#94A3B8" }}>
        {item.label}
      </span>
    </button>
  );
});

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function SalesPage() {
  const [, setLocation] = useLocation();
  const [activeNav, setActiveNav] = useState("dashboard");

  // Quote workflow state
  const [showModal, setShowModal] = useState(false);
  const [showQuoteWorkflow, setShowQuoteWorkflow] = useState(false);
  const [activeQuoteNum, setActiveQuoteNum] = useState("");

  // ── Column picker — loads from server DB on mount, saves on every change ──
  const [colIds, setColIds] = useState<string[]>(() => _colIds);

  React.useEffect(() => {
    if (_colIdsLoaded) return; // already fetched this session
    fetchColIds().then(ids => {
      _colIds = ids;
      _colIdsLoaded = true;
      setColIds([...ids]);
    });
  }, []);

  const saveColIds = React.useCallback((ids: string[]) => {
    persistColIds(ids);   // updates _colIds + fires PUT to server
    setColIds([...ids]);  // trigger re-render
  }, []);

  // Expose a global hook so NewQuoteWorkflow can open a new quote after duplication
  React.useEffect(() => {
    (window as any).__openQuote = (ref: string) => {
      setActiveQuoteNum(ref);
      setShowQuoteWorkflow(true);
      setActiveNav("new-quote");
    };
    return () => { delete (window as any).__openQuote; };
  }, []);

  const handleModalConfirm = (ref: string, _method: string) => {
    setActiveQuoteNum(ref);
    setShowModal(false);
    setShowQuoteWorkflow(true);
  };

  // Smart nav handler: clicking "Create new quote" while a quote is open
  // returns to the landing page instead of opening another workflow
  const handleNav = (id: string) => {
    if (id === "new-quote" && showQuoteWorkflow) {
      // Close the current workflow — data is already auto-saved
      setShowQuoteWorkflow(false);
    }
    setActiveNav(id);
  };

  const renderContent = () => {
    switch (activeNav) {
      case "dashboard":       return <DashboardPage onNavigate={setActiveNav} />;
      case "quote-history":   return <QuoteHistoryPage colIds={colIds} saveColIds={saveColIds} onOpenQuote={(ref) => { setActiveQuoteNum(ref); setShowQuoteWorkflow(true); setActiveNav("new-quote"); }} />;
      case "follow-up":       return <FollowUpPage onOpenQuote={(ref) => { setActiveQuoteNum(ref); setShowQuoteWorkflow(true); setActiveNav("new-quote"); }} />;
      case "pipeline":        return <PipelinePage />;
      case "sales-report":    return <SalesReportPage />;
      case "shipment-report": return <ShipmentReportsPage />;
      case "terms":           return <TermsPage />;
      default:                return <DashboardPage onNavigate={setActiveNav} />;
    }
  };

  const allItems = [...NAV_ITEMS, ...NAV_BOTTOM];
  const activeLabel = allItems.find(n => n.id === activeNav)?.label ?? "Sales";

  return (
    <div style={{ height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column", fontFamily: "'Inter', -apple-system, sans-serif" }}>

      {/* Top nav */}
      <nav style={{ background: "#fff", borderBottom: `1px solid ${T.border}`, height: 50, display: "flex", alignItems: "center", padding: "0 24px", gap: 24, flexShrink: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, background: T.blue, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Building2 style={{ width: 14, height: 14, color: "#fff" }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, color: T.text, letterSpacing: "-0.02em" }}>CRM</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", height: "100%", gap: 2 }}>
          <div style={{ height: "100%", display: "flex", alignItems: "center", padding: "0 14px", borderBottom: "2px solid transparent", cursor: "pointer" }}
            onClick={() => setLocation("/")}>
            <span style={{ fontSize: 13, fontWeight: 500, color: T.textMuted }}>Customer database</span>
          </div>
          <div style={{ height: "100%", display: "flex", alignItems: "center", padding: "0 14px", borderBottom: `2px solid ${T.blue}` }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.blue }}>Sales</span>
          </div>
        </div>
      </nav>

      {/* Body */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>

        {/* Sidebar */}
        <aside style={{
          width: 220, flexShrink: 0, background: T.sidebar,
          display: "flex", flexDirection: "column",
          overflowY: "auto",
        }}>
          <div style={{ padding: "18px 18px 10px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#64748B" }}>Sales</div>
          {/* Main nav items */}
          <div style={{ flex: 1 }}>
            {NAV_ITEMS.map(item => <SidebarItem key={item.id} item={item} active={activeNav === item.id} onClick={() => handleNav(item.id)} />)}
          </div>
          {/* Account footer */}
          <div style={{ borderTop: "1px solid #334155", padding: "12px 16px", display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#2563EB", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>LS</span>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#E2E8F0", lineHeight: 1.2 }}>{SIGNED_IN_USER}</div>
              <div style={{ fontSize: 10, color: "#64748B", marginTop: 1 }}>Sales Manager</div>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main style={{ flex: 1, background: T.bg, overflowY: "auto" }}>
          {/* new-quote: workflow or landing */}
          {activeNav === "new-quote" ? (
            showQuoteWorkflow
              ? <NewQuoteWorkflow
                  key={activeQuoteNum}
                  onBack={() => { setShowQuoteWorkflow(false); }}
                  quoteNum={activeQuoteNum}
                  onSwitchQuote={(ref) => { setActiveQuoteNum(ref); }}
                />
              : <>
                  <div style={{ background: "#fff", borderBottom: `1px solid ${T.border}`, padding: "13px 28px" }}>
                    <h1 style={{ fontSize: 20, fontWeight: 700, color: T.text, letterSpacing: "-0.02em", margin: 0 }}>{activeLabel}</h1>
                  </div>
                  <NewQuoteLanding onCreateNew={() => setShowModal(true)} />
                </>
          ) : (
            <>
              <div style={{ background: "#fff", borderBottom: `1px solid ${T.border}`, padding: "13px 28px" }}>
                <h1 style={{ fontSize: 20, fontWeight: 700, color: T.text, letterSpacing: "-0.02em", margin: 0 }}>{activeLabel}</h1>
              </div>
              {renderContent()}
            </>
          )}
        </main>
      </div>
      {/* New Quote Modal */}
      {showModal && (
        <NewQuoteModal
          onConfirm={handleModalConfirm}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

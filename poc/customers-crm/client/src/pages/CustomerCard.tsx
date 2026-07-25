import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Customer, Contact, Shipment, Quote, Invoice, Document, Note } from "@shared/schema";
import {
  ArrowLeft, Building2, Globe, User, TrendingUp, FileText, MessageSquare,
  DollarSign, Ship, Plus, Trash2, Phone, Mail, Star, Check, AlertTriangle,
  Loader2, BarChart3, Calendar, CreditCard, Upload, ChevronRight, Plane, Truck, Train
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine, PieChart, Pie, Cell
} from "recharts";

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg:        "#F9FAFB",
  surface:   "#FFFFFF",
  border:    "#E5E7EB",
  borderL:   "#F3F4F6",
  text:      "#111827",   // primary text — near black
  textSub:   "#374151",   // secondary text — dark grey
  textMuted: "#6B7280",   // muted — medium grey
  textLight: "#9CA3AF",   // light — labels, captions
  blue:      "#1D4ED8",   // accent blue (deeper for better contrast)
  blueL:     "#EFF6FF",
  green:     "#15803D",   // positive — darker for contrast
  greenL:    "#F0FDF4",
  red:       "#B91C1C",   // negative — darker for contrast
  redL:      "#FEF2F2",
  amber:     "#B45309",
  amberL:    "#FFFBEB",
  violet:    "#5B21B6",
  // Typography sizes
  txXS:      11,   // captions, table column headers
  txSM:      12,   // secondary text, meta
  txBase:    13,   // body, table cells
  txMD:      14,   // labels, card content
  txLG:      15,   // card titles
  txXL:      16,   // section headers
  txKPI:     20,   // KPI values
  txBig:     22,   // large KPI
  txPage:    22,   // page title
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined) {
  if (!n && n !== 0) return "—";
  return new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}
function fmtPct(revenue: number | null | undefined, profit: number | null | undefined) {
  if (!revenue || revenue === 0) return "—";
  return (((profit ?? 0) / revenue) * 100).toFixed(1) + "%";
}

// ── Segment config (single source of truth) ────────────────────────────────
export const CUSTOMER_SEGMENTS = [
  { value: "KEY ACCOUNT",     bg: "#FEF3C7", text: "#92400E", border: "#FCD34D" },
  { value: "PROSPECT",        bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE" },
  { value: "TARGET CUSTOMER", bg: "#F5F3FF", text: "#5B21B6", border: "#DDD6FE" },
  { value: "STANDARD",        bg: "#F9FAFB", text: "#374151", border: "#E5E7EB" },
  { value: "RISK",            bg: "#FEF2F2", text: "#B91C1C", border: "#FECACA" },
];
function getSegment(v: string | null | undefined) {
  return CUSTOMER_SEGMENTS.find(s => s.value === v) ?? CUSTOMER_SEGMENTS.find(s => s.value === "PROSPECT")!;
}
function SegBadge({ value }: { value: string | null | undefined }) {
  const s = getSegment(value);
  return <span style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}`, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{value ?? "PROSPECT"}</span>;
}

const STATUS_MAP: Record<string, { bg: string; text: string; dot: string }> = {
  Active:        { bg: "#F0FDF4", text: "#15803D", dot: "#16A34A" },
  Prospect:      { bg: "#EFF6FF", text: "#1D4ED8", dot: "#2563EB" },
  Inactive:      { bg: "#F9FAFB", text: "#6B7280", dot: "#9CA3AF" },
  "In Progress": { bg: "#EFF6FF", text: "#1D4ED8", dot: "#2563EB" },
  Completed:     { bg: "#F0FDF4", text: "#15803D", dot: "#16A34A" },
  Pending:       { bg: "#FFFBEB", text: "#92400E", dot: "#D97706" },
  Won:           { bg: "#F0FDF4", text: "#15803D", dot: "#16A34A" },
  Lost:          { bg: "#FEF2F2", text: "#B91C1C", dot: "#DC2626" },
  Open:          { bg: "#FFFBEB", text: "#92400E", dot: "#D97706" },
  Overdue:       { bg: "#FEF2F2", text: "#B91C1C", dot: "#DC2626" },
  Paid:          { bg: "#F0FDF4", text: "#15803D", dot: "#16A34A" },
};
function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? STATUS_MAP.Inactive;
  return (
    <span style={{ background: s.bg, color: s.text, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4, display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.dot, flexShrink: 0 }} />
      {status}
    </span>
  );
}

const SYSTEM_USERS = ["Luky Slavik"];

// ── NACE / LegalForm helpers ──────────────────────────────────────────────────
const NACE_MAP: Record<string, { label: string; cargo: string; risk: "Low" | "Medium" | "High" }> = {
  "01": { label: "Agriculture", cargo: "Agricultural products", risk: "Low" },
  "10": { label: "Food manufacturing", cargo: "Food / Perishables", risk: "Low" },
  "20": { label: "Chemicals", cargo: "Chemicals / Hazmat", risk: "High" },
  "21": { label: "Pharmaceuticals", cargo: "Pharma / Temp-controlled", risk: "Medium" },
  "24": { label: "Basic metals", cargo: "Steel / Metals", risk: "Medium" },
  "25": { label: "Fabricated metal products", cargo: "Metal parts", risk: "Low" },
  "26": { label: "Electronics / ICT", cargo: "Electronics / Hi-tech", risk: "Medium" },
  "28": { label: "Machinery", cargo: "Industrial machinery", risk: "Low" },
  "29": { label: "Automotive", cargo: "Vehicles / Auto parts", risk: "Medium" },
  "46": { label: "Wholesale trade", cargo: "Mixed goods", risk: "Low" },
  "47": { label: "Retail trade", cargo: "Consumer goods", risk: "Low" },
  "49": { label: "Land transport", cargo: "Logistics services", risk: "Low" },
  "52": { label: "Warehousing / Logistics", cargo: "Logistics services", risk: "Low" },
  "62": { label: "IT / Software", cargo: "Electronics / Equipment", risk: "Low" },
  "64": { label: "Financial services", cargo: "Documents", risk: "Low" },
  "23": { label: "Non-metallic minerals", cargo: "Stone / Glass / Ceramics", risk: "Low" },
  "G":  { label: "Wholesale & Retail trade", cargo: "Mixed goods", risk: "Low" },
};
const LEGAL_FORM_MAP: Record<string, string> = {
  "121": "Akciová společnost (a.s.)", "122": "Akciová společnost (a.s.)",
  "112": "Společnost s r.o. / Sdružení firem",
  "211": "Státní podnik", "212": "Státní podnik",
  "301": "Spolek", "321": "Nadace",
  "501": "Obec",
};
function legalFormText(code: string): string {
  if (!code) return "—";
  if (LEGAL_FORM_MAP[code]) return LEGAL_FORM_MAP[code];
  const num = code.replace(/\D/g, "");
  if (LEGAL_FORM_MAP[num]) return LEGAL_FORM_MAP[num];
  return code;
}
function parseNaceCodes(nace: string): string[] {
  if (!nace) return [];
  return nace.split(",").map(s => s.trim()).filter(Boolean);
}
function getNaceInfo(codes: string[]) {
  const results = codes.map(code => {
    const key2 = code.slice(0, 2); const key1 = code.slice(0, 1);
    const e = NACE_MAP[code] || NACE_MAP[key2] || NACE_MAP[key1];
    return e ? { ...e, code } : null;
  }).filter(Boolean) as ({ label: string; cargo: string; risk: "Low" | "Medium" | "High"; code: string })[];
  return { primary: results[0] ?? null, secondary: results.slice(1) };
}
function calcCompanyAge(regDate: string): { years: number; label: string } {
  if (!regDate) return { years: 0, label: "—" };
  const years = Math.floor((Date.now() - new Date(regDate).getTime()) / (1000 * 60 * 60 * 24 * 365.25));
  if (years < 0) return { years: 0, label: "—" };
  if (years === 0) return { years: 0, label: "< 1 year" };
  return { years, label: `${years} years` };
}
function calcRisk(status: string, regDate: string, naceInfo: ReturnType<typeof getNaceInfo>): { level: "Low" | "Medium" | "High"; reasons: string[] } {
  const reasons: string[] = [];
  let level: "Low" | "Medium" | "High" = "Low";
  const age = calcCompanyAge(regDate);
  if (status && !status.toLowerCase().includes("active")) { reasons.push("Registry status: " + status); level = "High"; }
  if (age.years < 2 && regDate) { reasons.push("New company (< 2 years)"); if (level === "Low") level = "Medium"; }
  if (naceInfo.primary?.risk === "High") { reasons.push("High-risk industry"); level = "High"; }
  else if (naceInfo.primary?.risk === "Medium" && level === "Low") level = "Medium";
  return { level, reasons };
}

// ── Small reusable primitives ─────────────────────────────────────────────────
function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
      <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: T.textMuted }}>{title}</span>
      {action}
    </div>
  );
}

function KpiRow({ items, cols }: { items: { label: string; value: string | number; sub?: string; color?: string }[]; cols?: number }) {
  const n = cols ?? items.length;
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${n}, 1fr)`, gap: 0, border: `1px solid ${T.border}`, borderRadius: 6, overflow: "hidden", background: T.surface }}>
      {items.map((it, i) => (
        <div key={it.label} style={{ padding: "12px 16px", borderRight: i < items.length - 1 ? `1px solid ${T.border}` : "none" }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: T.textLight, marginBottom: 5 }}>{it.label}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: it.color ?? T.text, lineHeight: 1.15, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{it.value}</div>
          {it.sub && <div style={{ fontSize: 11, color: T.textLight, marginTop: 2 }}>{it.sub}</div>}
        </div>
      ))}
    </div>
  );
}

function InfoRow({ label, value, mono, strong }: { label: string; value: React.ReactNode; mono?: boolean; strong?: boolean }) {
  return (
    <div className="info-row">
      <div className="info-label">{label}</div>
      <div className={`info-value${strong ? " strong" : ""}${mono ? " mono" : ""}`}>{value}</div>
    </div>
  );
}

// Drill-down "View →" button  
function ViewBtn({ href }: { href: string }) {
  return (
    <a href={href}
      onClick={e => e.stopPropagation()}
      style={{ fontSize: 11, fontWeight: 600, color: T.blue, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 3 }}>
      View →
    </a>
  );
}

function Btn({ children, onClick, variant = "primary", size = "sm", disabled }: any) {
  const cls = variant === "primary" ? "btn btn-primary" : variant === "outline" ? "btn btn-outline" : variant === "danger" ? "btn btn-danger" : "btn btn-ghost";
  const sizeCls = size === "xs" ? " btn-sm" : "";
  return <button className={cls + sizeCls} onClick={onClick} disabled={disabled} style={{ opacity: disabled ? 0.6 : 1, cursor: disabled ? "not-allowed" : "pointer" }}>{children}</button>;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="field-label">{children}</label>;
}

function FormInput({ value, onChange, placeholder, type = "text" }: any) {
  return <input className="crm-input" type={type} value={value} onChange={onChange} placeholder={placeholder} />;
}

function TransportIcon({ mode }: { mode: string }) {
  const s = { width: 13, height: 13 };
  if (mode === "AIR")  return <Plane {...s} style={{ color: "#0EA5E9" }} />;
  if (mode === "ROAD") return <Truck {...s} style={{ color: "#F59E0B" }} />;
  if (mode === "RAIL") return <Train {...s} style={{ color: "#8B5CF6" }} />;
  return <Ship {...s} style={{ color: "#0D9488" }} />;
}

// ── Modal wrapper ─────────────────────────────────────────────────────────────
function Modal({ open, onClose, title, children, width = 520 }: any) {
  if (!open) return null;
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1000 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", background: "#fff", border: `1px solid ${T.border}`, borderRadius: 8, width, maxHeight: "88vh", overflow: "auto", zIndex: 1001, boxShadow: "0 4px 24px rgba(0,0,0,0.12)" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.text, letterSpacing: "-0.01em" }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: T.textMuted, padding: 4, fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ padding: 18 }}>{children}</div>
      </div>
    </>
  );
}

// ── Contacts Tab ──────────────────────────────────────────────────────────────
function ContactsTab({ customerId, viewHref }: { customerId: number; viewHref?: string }) {
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", role: "Operations", isMain: 0 });
  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/customers", customerId, "contacts"],
    queryFn: () => apiRequest("GET", `/api/customers/${customerId}/contacts`).then(r => r.json()),
  });
  const addMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/customers/${customerId}/contacts`, form).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "contacts"] }); setShowAdd(false); setForm({ name: "", email: "", phone: "", role: "Operations", isMain: 0 }); toast({ title: "Contact added" }); },
  });
  const delMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/contacts/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "contacts"] }),
  });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div>
      <SectionHeader title={`Contacts (${contacts.length})`} action={
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {viewHref && <a href={viewHref} style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", textDecoration: "none" }}>View all →</a>}
        <Btn onClick={() => setShowAdd(true)}><Plus style={{ width: 12, height: 12 }} /> Add Contact</Btn>
      </div>} />
      {contacts.length === 0 ? (
        <div style={{ padding: "32px 0", textAlign: "center", color: T.textLight, fontSize: 13 }}>No contacts added yet</div>
      ) : (
        <table className="crm-table">
          <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Main</th><th></th></tr></thead>
          <tbody>
            {contacts.map(c => (
              <tr key={c.id} data-testid={`card-contact-${c.id}`}>
                <td><span style={{ fontWeight: 600, color: T.text }}>{c.name}</span></td>
                <td style={{ color: T.textSub }}>{c.email || "—"}</td>
                <td style={{ color: T.textSub }}>{c.phone || "—"}</td>
                <td><span style={{ fontSize: 11, background: T.blueL, color: T.blue, padding: "1px 7px", borderRadius: 4, fontWeight: 600 }}>{c.role}</span></td>
                <td>{c.isMain === 1 ? <span style={{ fontSize: 11, background: "#FFFBEB", color: "#92400E", padding: "1px 7px", borderRadius: 4, fontWeight: 600 }}>★ Main</span> : "—"}</td>
                <td><button onClick={() => delMut.mutate(c.id!)} style={{ background: "none", border: "none", cursor: "pointer", color: T.textLight, padding: 4 }}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Contact" width={480}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "span 2" }}><FieldLabel>Name *</FieldLabel><FormInput value={form.name} onChange={(e: any) => set("name", e.target.value)} placeholder="Full name" /></div>
          <div><FieldLabel>Email</FieldLabel><FormInput value={form.email} onChange={(e: any) => set("email", e.target.value)} placeholder="email@company.com" /></div>
          <div><FieldLabel>Phone</FieldLabel><FormInput value={form.phone} onChange={(e: any) => set("phone", e.target.value)} placeholder="+420 …" /></div>
          <div><FieldLabel>Role</FieldLabel>
            <select value={form.role} onChange={e => set("role", e.target.value)} style={{ width: "100%", padding: "7px 10px", border: `1px solid ${T.border}`, borderRadius: 5, fontSize: 13 }}>
              <option>Sales</option><option>Operations</option><option>Finance</option>
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 20 }}>
            <input type="checkbox" id="main" checked={form.isMain === 1} onChange={e => set("isMain", e.target.checked ? 1 : 0)} />
            <label htmlFor="main" style={{ fontSize: 13, color: T.textSub }}>Main contact</label>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <Btn variant="outline" onClick={() => setShowAdd(false)}>Cancel</Btn>
          <Btn onClick={() => addMut.mutate()} disabled={!form.name || addMut.isPending}>Add Contact</Btn>
        </div>
      </Modal>
    </div>
  );
}

// ── Shipments Tab ─────────────────────────────────────────────────────────────
function ShipmentsTab({ customerId, viewHref }: { customerId: number; viewHref?: string }) {
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ jobId: "", transportMode: "SEA", direction: "IMPORT", pol: "", pod: "", status: "In Progress", eta: "", etd: "", revenue: 0, cost: 0 });
  const { data: shipments = [] } = useQuery<Shipment[]>({
    queryKey: ["/api/customers", customerId, "shipments"],
    queryFn: () => apiRequest("GET", `/api/customers/${customerId}/shipments`).then(r => r.json()),
  });
  const addMut = useMutation({
    mutationFn: () => {
      const profit = (form.revenue ?? 0) - (form.cost ?? 0);
      return apiRequest("POST", `/api/customers/${customerId}/shipments`, { ...form, profit }).then(r => r.json());
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "shipments"] }); queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId] }); queryClient.invalidateQueries({ queryKey: ["/api/customers"] }); setShowAdd(false); toast({ title: "Shipment added" }); },
  });
  const delMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/shipments/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "shipments"] }); queryClient.invalidateQueries({ queryKey: ["/api/customers"] }); },
  });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div>
      <SectionHeader title={`Shipments (${shipments.length})`} action={<Btn onClick={() => setShowAdd(true)}><Plus style={{ width: 12, height: 12 }} /> Add Shipment</Btn>} />
      {shipments.length === 0 ? (
        <div style={{ padding: "32px 0", textAlign: "center", color: T.textLight, fontSize: 13 }}>No shipments linked yet</div>
      ) : (
        <table className="crm-table">
          <thead><tr><th>Job ID</th><th>Mode</th><th>Direction</th><th>Route</th><th>Status</th><th>ETA/ETD</th><th style={{ textAlign: "right" }}>Revenue</th><th style={{ textAlign: "right" }}>Profit</th><th></th></tr></thead>
          <tbody>
            {shipments.map(s => (
              <tr key={s.id}>
                <td><span style={{ fontWeight: 700, color: T.blue, fontFamily: "monospace", fontSize: 12 }}>{s.jobId}</span></td>
                <td><span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}><TransportIcon mode={s.transportMode} />{s.transportMode}</span></td>
                <td style={{ fontSize: 12, color: T.textSub }}>{s.direction}</td>
                <td style={{ fontSize: 12, color: T.textSub }}>{s.pol && s.pod ? `${s.pol} → ${s.pod}` : "—"}</td>
                <td><StatusBadge status={s.status} /></td>
                <td style={{ fontSize: 12, color: T.textMuted }}>{s.eta || s.etd || "—"}</td>
                <td style={{ textAlign: "right", fontWeight: 600, fontSize: 13 }}>{fmt(s.revenue)}</td>
                <td style={{ textAlign: "right", fontWeight: 600, fontSize: 13, color: (s.profit ?? 0) >= 0 ? T.green : T.red }}>{fmt(s.profit)}</td>
                <td><button onClick={() => delMut.mutate(s.id!)} style={{ background: "none", border: "none", cursor: "pointer", color: T.textLight, padding: 4 }}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Shipment" width={560}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "span 2" }}><FieldLabel>Job ID *</FieldLabel><FormInput value={form.jobId} onChange={(e: any) => set("jobId", e.target.value)} /></div>
          {[["Mode","transportMode",[["SEA","SEA"],["AIR","AIR"],["ROAD","ROAD"],["RAIL","RAIL"]]],["Direction","direction",[["IMPORT","IMPORT"],["EXPORT","EXPORT"]]],["Status","status",[["In Progress","In Progress"],["Completed","Completed"],["Pending","Pending"]]]].map(([label, key, opts]) => (
            <div key={key as string}><FieldLabel>{label as string}</FieldLabel>
              <select value={(form as any)[key as string]} onChange={e => set(key as string, e.target.value)} style={{ width: "100%", padding: "7px 10px", border: `1px solid ${T.border}`, borderRadius: 5, fontSize: 13 }}>
                {(opts as string[][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          ))}
          <div><FieldLabel>POL</FieldLabel><FormInput value={form.pol} onChange={(e: any) => set("pol", e.target.value)} placeholder="e.g. CNSHA" /></div>
          <div><FieldLabel>POD</FieldLabel><FormInput value={form.pod} onChange={(e: any) => set("pod", e.target.value)} placeholder="e.g. DEHAM" /></div>
          <div><FieldLabel>ETD</FieldLabel><FormInput type="date" value={form.etd} onChange={(e: any) => set("etd", e.target.value)} /></div>
          <div><FieldLabel>ETA</FieldLabel><FormInput type="date" value={form.eta} onChange={(e: any) => set("eta", e.target.value)} /></div>
          <div><FieldLabel>Revenue (€)</FieldLabel><FormInput type="number" value={form.revenue} onChange={(e: any) => set("revenue", parseFloat(e.target.value)||0)} /></div>
          <div><FieldLabel>Cost (€)</FieldLabel><FormInput type="number" value={form.cost} onChange={(e: any) => set("cost", parseFloat(e.target.value)||0)} /></div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <Btn variant="outline" onClick={() => setShowAdd(false)}>Cancel</Btn>
          <Btn onClick={() => addMut.mutate()} disabled={!form.jobId || addMut.isPending}>Add Shipment</Btn>
        </div>
      </Modal>
    </div>
  );
}

// ── Quotes Tab ────────────────────────────────────────────────────────────────
function QuotesTab({ customerId, viewHref }: { customerId: number; viewHref?: string }) {
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ quoteNumber: "", status: "Pending", validUntil: "", revenue: 0, description: "" });
  const { data: quotes = [] } = useQuery<Quote[]>({
    queryKey: ["/api/customers", customerId, "quotes"],
    queryFn: () => apiRequest("GET", `/api/customers/${customerId}/quotes`).then(r => r.json()),
  });
  const addMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/customers/${customerId}/quotes`, form).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "quotes"] }); setShowAdd(false); toast({ title: "Quote added" }); },
  });
  const patchMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => apiRequest("PATCH", `/api/quotes/${id}`, { status }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "quotes"] }),
  });
  const won = quotes.filter(q => q.status === "Won").length;
  const conv = quotes.length > 0 ? Math.round((won / quotes.length) * 100) : 0;
  return (
    <div>
      <SectionHeader title={`Quotes (${quotes.length})`} action={
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {quotes.length > 0 && <span style={{ fontSize: 12, color: T.textMuted }}>Conv: <strong style={{ color: T.green }}>{conv}%</strong></span>}
          {viewHref && <a href={viewHref} style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", textDecoration: "none" }}>View all →</a>}
          <Btn onClick={() => setShowAdd(true)}><Plus style={{ width: 12, height: 12 }} /> Add Quote</Btn>
        </div>
      } />
      {quotes.length === 0 ? (
        <div style={{ padding: "32px 0", textAlign: "center", color: T.textLight, fontSize: 13 }}>No quotations yet</div>
      ) : (
        <table className="crm-table">
          <thead><tr><th>Quote #</th><th>Status</th><th>Valid Until</th><th style={{ textAlign: "right" }}>Revenue</th><th>Description</th><th></th></tr></thead>
          <tbody>
            {quotes.map(q => (
              <tr key={q.id}>
                <td style={{ fontWeight: 600 }}>{q.quoteNumber}</td>
                <td><StatusBadge status={q.status} /></td>
                <td style={{ fontSize: 12, color: T.textMuted }}>{q.validUntil || "—"}</td>
                <td style={{ textAlign: "right", fontWeight: 600 }}>{fmt(q.revenue)}</td>
                <td style={{ color: T.textSub, fontSize: 12, maxWidth: 200 }}><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{q.description || "—"}</span></td>
                <td>
                  {q.status === "Pending" && (
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => patchMut.mutate({ id: q.id!, status: "Won" })} style={{ fontSize: 11, color: T.green, background: T.greenL, border: `1px solid #BBF7D0`, borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontWeight: 600 }}>Won</button>
                      <button onClick={() => patchMut.mutate({ id: q.id!, status: "Lost" })} style={{ fontSize: 11, color: T.red, background: T.redL, border: `1px solid #FECACA`, borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontWeight: 600 }}>Lost</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Quote" width={480}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "span 2" }}><FieldLabel>Quote Number *</FieldLabel><FormInput value={form.quoteNumber} onChange={(e: any) => setForm(f => ({ ...f, quoteNumber: e.target.value }))} /></div>
          <div><FieldLabel>Status</FieldLabel>
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={{ width: "100%", padding: "7px 10px", border: `1px solid ${T.border}`, borderRadius: 5, fontSize: 13 }}>
              <option>Pending</option><option>Won</option><option>Lost</option>
            </select>
          </div>
          <div><FieldLabel>Valid Until</FieldLabel><FormInput type="date" value={form.validUntil} onChange={(e: any) => setForm(f => ({ ...f, validUntil: e.target.value }))} /></div>
          <div style={{ gridColumn: "span 2" }}><FieldLabel>Revenue (€)</FieldLabel><FormInput type="number" value={form.revenue} onChange={(e: any) => setForm(f => ({ ...f, revenue: parseFloat(e.target.value)||0 }))} /></div>
          <div style={{ gridColumn: "span 2" }}><FieldLabel>Description</FieldLabel><FormInput value={form.description} onChange={(e: any) => setForm(f => ({ ...f, description: e.target.value }))} /></div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <Btn variant="outline" onClick={() => setShowAdd(false)}>Cancel</Btn>
          <Btn onClick={() => addMut.mutate()} disabled={!form.quoteNumber || addMut.isPending}>Add Quote</Btn>
        </div>
      </Modal>
    </div>
  );
}

// ── Finance Tab ───────────────────────────────────────────────────────────────
function FinanceTab({ customerId, customer, viewHref, creditHref }: { customerId: number; customer: Customer; viewHref?: string; creditHref?: string }) {
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ invoiceNumber: "", amount: 0, dueDate: "", status: "Open", issuedAt: "" });
  const { data: invoices = [] } = useQuery<Invoice[]>({
    queryKey: ["/api/customers", customerId, "invoices"],
    queryFn: () => apiRequest("GET", `/api/customers/${customerId}/invoices`).then(r => r.json()),
  });
  const addMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/customers/${customerId}/invoices`, form).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "invoices"] }); setShowAdd(false); toast({ title: "Invoice added" }); },
  });
  const patchMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => apiRequest("PATCH", `/api/invoices/${id}`, { status }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "invoices"] }),
  });
  const totalOpen = invoices.filter(i => i.status === "Open").reduce((s, i) => s + (i.amount ?? 0), 0);
  const totalOverdue = invoices.filter(i => i.status === "Overdue").reduce((s, i) => s + (i.amount ?? 0), 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <KpiRow items={[
        { label: "Open invoices", value: fmt(totalOpen) },
        { label: "Overdue", value: fmt(totalOverdue), color: totalOverdue > 0 ? T.red : undefined, sub: totalOverdue > 0 ? "Action needed" : "" },
        { label: "Credit Limit", value: fmt(customer.creditLimit) },
        { label: "Total Turnover", value: fmt(customer.totalRevenue) },
      ]} />
      <div>
        <SectionHeader title={`Invoices (${invoices.length})`} action={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {viewHref && <a href={viewHref} style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", textDecoration: "none" }}>View all →</a>}
            <Btn onClick={() => setShowAdd(true)}><Plus style={{ width: 12, height: 12 }} /> Add Invoice</Btn>
          </div>} />
        {invoices.length === 0 ? (
          <div style={{ padding: "32px 0", textAlign: "center", color: T.textLight, fontSize: 13 }}>No invoices yet</div>
        ) : (
          <table className="crm-table">
            <thead><tr><th>Invoice #</th><th>Status</th><th style={{ textAlign: "right" }}>Amount</th><th>Issued</th><th>Due Date</th><th></th></tr></thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id}>
                  <td style={{ fontWeight: 600 }}>{inv.invoiceNumber}</td>
                  <td><StatusBadge status={inv.status} /></td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>{fmt(inv.amount)}</td>
                  <td style={{ fontSize: 12, color: T.textMuted }}>{inv.issuedAt || "—"}</td>
                  <td style={{ fontSize: 12, color: inv.status === "Overdue" ? T.red : T.textMuted }}>{inv.dueDate || "—"}</td>
                  <td>{inv.status !== "Paid" && <button onClick={() => patchMut.mutate({ id: inv.id!, status: "Paid" })} style={{ fontSize: 11, color: T.green, background: T.greenL, border: `1px solid #BBF7D0`, borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontWeight: 600 }}>Mark paid</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Invoice" width={480}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "span 2" }}><FieldLabel>Invoice Number *</FieldLabel><FormInput value={form.invoiceNumber} onChange={(e: any) => setForm(f => ({ ...f, invoiceNumber: e.target.value }))} /></div>
          <div><FieldLabel>Amount (€)</FieldLabel><FormInput type="number" value={form.amount} onChange={(e: any) => setForm(f => ({ ...f, amount: parseFloat(e.target.value)||0 }))} /></div>
          <div><FieldLabel>Status</FieldLabel>
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={{ width: "100%", padding: "7px 10px", border: `1px solid ${T.border}`, borderRadius: 5, fontSize: 13 }}>
              <option>Open</option><option>Overdue</option><option>Paid</option>
            </select>
          </div>
          <div><FieldLabel>Issued</FieldLabel><FormInput type="date" value={form.issuedAt} onChange={(e: any) => setForm(f => ({ ...f, issuedAt: e.target.value }))} /></div>
          <div><FieldLabel>Due Date</FieldLabel><FormInput type="date" value={form.dueDate} onChange={(e: any) => setForm(f => ({ ...f, dueDate: e.target.value }))} /></div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <Btn variant="outline" onClick={() => setShowAdd(false)}>Cancel</Btn>
          <Btn onClick={() => addMut.mutate()} disabled={!form.invoiceNumber || addMut.isPending}>Add Invoice</Btn>
        </div>
      </Modal>
    </div>
  );
}

// ── Documents Tab ─────────────────────────────────────────────────────────────
function DocumentsTab({ customerId, viewHref }: { customerId: number; viewHref?: string }) {
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [docType, setDocType] = useState("Contract");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const { data: docs = [] } = useQuery<Document[]>({
    queryKey: ["/api/customers", customerId, "documents"],
    queryFn: () => apiRequest("GET", `/api/customers/${customerId}/documents`).then(r => r.json()),
  });

  const uploadMut = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error("No file selected");
      const fd = new FormData();
      fd.append("file", selectedFile);
      fd.append("name", selectedFile.name);
      fd.append("type", docType);
      const res = await fetch(`/api/customers/${customerId}/documents/upload`, { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "documents"] });
      setShowAdd(false); setSelectedFile(null); setDocType("Contract");
      toast({ title: "Document uploaded" });
    },
    onError: () => toast({ title: "Upload failed", variant: "destructive" }),
  });

  const delMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/documents/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "documents"] }),
  });

  const DOC_TYPES = ["Contract", "NDA", "Power of attorney", "Customs", "Other"];

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) setSelectedFile(f);
  };

  const resetModal = () => { setShowAdd(false); setSelectedFile(null); setDocType("Contract"); setDragging(false); };

  return (
    <div>
      <SectionHeader title={`Documents (${docs.length})`} action={
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {viewHref && <a href={viewHref} style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", textDecoration: "none" }}>View all →</a>}
          <Btn onClick={() => setShowAdd(true)}><Upload style={{ width: 12, height: 12 }} /> Add Document</Btn>
        </div>} />
      {docs.length === 0 ? (
        <div style={{ padding: "32px 0", textAlign: "center", color: T.textLight, fontSize: 13 }}>No documents uploaded</div>
      ) : (
        <table className="crm-table">
          <thead><tr><th>Name</th><th>Type</th><th>Uploaded</th><th></th></tr></thead>
          <tbody>
            {docs.map(d => (
              <tr key={d.id}>
                <td style={{ fontWeight: 600, color: T.text }}>
                  {d.url ? (
                    <a href={d.url} target="_blank" rel="noreferrer" style={{ color: T.blue, textDecoration: "none", fontWeight: 600 }}>{d.name}</a>
                  ) : d.name}
                </td>
                <td><span style={{ fontSize: 11, background: T.blueL, color: T.blue, padding: "1px 7px", borderRadius: 4, fontWeight: 600 }}>{d.type}</span></td>
                <td style={{ fontSize: 12, color: T.textMuted }}>{new Date(d.uploadedAt ?? Date.now()).toLocaleDateString("cs-CZ")}</td>
                <td><button onClick={() => delMut.mutate(d.id!)} style={{ background: "none", border: "none", cursor: "pointer", color: T.textLight, padding: 4 }}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal open={showAdd} onClose={resetModal} title="Add Document" width={460}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Document type */}
          <div>
            <FieldLabel>Type</FieldLabel>
            <select value={docType} onChange={e => setDocType(e.target.value)}
              style={{ width: "100%", padding: "7px 10px", border: `1px solid ${T.border}`, borderRadius: 5, fontSize: 13 }}>
              {DOC_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>

          {/* Drag & Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? T.blue : selectedFile ? "#22C55E" : T.border}`,
              borderRadius: 8,
              padding: "24px 16px",
              textAlign: "center",
              cursor: "pointer",
              background: dragging ? T.blueL : selectedFile ? "#F0FDF4" : "#FAFAFA",
              transition: "all 0.15s",
            }}
          >
            <input ref={fileInputRef} type="file" style={{ display: "none" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) setSelectedFile(f); }} />
            {selectedFile ? (
              <>
                <div style={{ fontSize: 24, marginBottom: 4 }}>&#10003;</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#15803D" }}>{selectedFile.name}</div>
                <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>({(selectedFile.size / 1024).toFixed(0)} KB) — click to change</div>
              </>
            ) : (
              <>
                <Upload style={{ width: 24, height: 24, color: T.textLight, margin: "0 auto 8px", display: "block" }} />
                <div style={{ fontSize: 13, fontWeight: 600, color: T.textSub }}>Drop file here or click to browse</div>
                <div style={{ fontSize: 11, color: T.textLight, marginTop: 3 }}>PDF, Word, Excel, images — max 50 MB</div>
              </>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <Btn variant="outline" onClick={resetModal}>Cancel</Btn>
          <Btn onClick={() => uploadMut.mutate()} disabled={!selectedFile || uploadMut.isPending}>
            {uploadMut.isPending ? "Uploading…" : "Upload"}
          </Btn>
        </div>
      </Modal>
    </div>
  );
}

// ── Communication Tab ─────────────────────────────────────────────────────────
function CommunicationTab({ customerId, viewHref }: { customerId: number; viewHref?: string }) {
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ type: "Note", content: "", author: "" });
  const { data: notes = [] } = useQuery<Note[]>({
    queryKey: ["/api/customers", customerId, "notes"],
    queryFn: () => apiRequest("GET", `/api/customers/${customerId}/notes`).then(r => r.json()),
  });
  const addMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/customers/${customerId}/notes`, form).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "notes"] }); setShowAdd(false); setForm({ type: "Note", content: "", author: "" }); toast({ title: "Note added" }); },
  });
  const delMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/notes/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "notes"] }),
  });
  const TYPE_COLORS: Record<string, string> = { Note: T.blue, Email: T.violet, Call: T.green, "Follow-up": T.amber };
  const TYPE_BG: Record<string, string> = { Note: T.blueL, Email: "#F5F3FF", Call: T.greenL, "Follow-up": T.amberL };
  return (
    <div>
      <SectionHeader title={`Activity Log (${notes.length})`} action={
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {viewHref && <a href={viewHref} style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", textDecoration: "none" }}>View all →</a>}
        <Btn onClick={() => setShowAdd(true)}><Plus style={{ width: 12, height: 12 }} /> Add Entry</Btn>
      </div>} />
      {notes.length === 0 ? (
        <div style={{ padding: "32px 0", textAlign: "center", color: T.textLight, fontSize: 13 }}>No activity logged yet</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {[...notes].reverse().map((n, i) => (
            <div key={n.id} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: i < notes.length - 1 ? `1px solid ${T.borderL}` : "none", alignItems: "flex-start" }}>
              <div style={{ marginTop: 2 }}>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: TYPE_BG[n.type] ?? T.blueL, color: TYPE_COLORS[n.type] ?? T.blue }}>{n.type}</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: T.text, lineHeight: 1.5 }}>{n.content}</div>
                <div style={{ fontSize: 11, color: T.textLight, marginTop: 3 }}>
                  {n.author && <span style={{ fontWeight: 500, marginRight: 8 }}>{n.author}</span>}
                  {new Date(n.createdAt ?? Date.now()).toLocaleDateString("cs-CZ")}
                </div>
              </div>
              <button onClick={() => delMut.mutate(n.id!)} style={{ background: "none", border: "none", cursor: "pointer", color: T.textLight, padding: 4 }}>✕</button>
            </div>
          ))}
        </div>
      )}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Activity Entry" width={480}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div><FieldLabel>Type</FieldLabel>
            <select className="crm-select" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={{ width: "100%" }}>
              <option>Note</option><option>Email</option><option>Call</option><option>Follow-up</option>
            </select>
          </div>
          <div><FieldLabel>Author</FieldLabel><FormInput value={form.author} onChange={(e: any) => setForm(f => ({ ...f, author: e.target.value }))} placeholder="Your name" /></div>
          <div><FieldLabel>Content *</FieldLabel>
            <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} rows={4} placeholder="Enter note, email summary, call log…"
              style={{ width: "100%", padding: "7px 10px", border: `1px solid ${T.border}`, borderRadius: 5, fontSize: 13, resize: "vertical", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <Btn variant="outline" onClick={() => setShowAdd(false)}>Cancel</Btn>
          <Btn onClick={() => addMut.mutate()} disabled={!form.content || addMut.isPending}>Add</Btn>
        </div>
      </Modal>
    </div>
  );
}
// ── Last Activity Panel ──────────────────────────────────────────────────────
const ACTIVITY_TYPES = ["Call", "Email", "Visit"] as const;
const ACTIVITY_COLORS: Record<string, { bg: string; text: string }> = {
  Call:  { bg: "#F0FDF4", text: "#15803D" },
  Email: { bg: "#EFF6FF", text: "#1D4ED8" },
  Visit: { bg: "#F5F3FF", text: "#5B21B6" },
};

function LastActivityPanel({ customerId }: { customerId: number }) {
  const { toast } = useToast();
  const [open, setOpen]       = useState(false);
  const [type, setType]       = useState<string>("Call");
  const [comment, setComment] = useState("");

  const { data: notes = [] } = useQuery<Note[]>({
    queryKey: ["/api/customers", customerId, "notes"],
    queryFn: () => apiRequest("GET", `/api/customers/${customerId}/notes`).then(r => r.json()),
  });

  const addMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/customers/${customerId}/notes`, {
      type, content: comment, author: "",
    }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "notes"] });
      setOpen(false); setComment(""); setType("Call");
      toast({ title: "Activity saved" });
    },
  });

  // Only show Call / Email / Visit activities
  const activities = [...notes]
    .filter(n => ACTIVITY_TYPES.includes(n.type as any))
    .reverse()
    .slice(0, 8);

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div className="section-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>Last Activity</span>
        <button
          onClick={() => setOpen(o => !o)}
          style={{ background: open ? T.blue : "none", border: open ? "none" : `1px solid ${T.border}`, color: open ? "#fff" : T.textMuted, borderRadius: 4, width: 20, height: 20, cursor: "pointer", fontSize: 15, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: 700 }}
          title="Add activity"
        >+</button>
      </div>

      {/* Inline add form */}
      {open && (
        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${T.border}`, background: "#F9FAFB", display: "flex", flexDirection: "column", gap: 7 }}>
          {/* Type selector */}
          <div style={{ display: "flex", gap: 5 }}>
            {ACTIVITY_TYPES.map(t => (
              <button key={t} onClick={() => setType(t)}
                style={{
                  flex: 1, padding: "4px 0", fontSize: 11, fontWeight: 600, borderRadius: 4, cursor: "pointer",
                  border: `1px solid ${type === t ? ACTIVITY_COLORS[t].text : T.border}`,
                  background: type === t ? ACTIVITY_COLORS[t].bg : "#fff",
                  color: type === t ? ACTIVITY_COLORS[t].text : T.textMuted,
                }}>{t}</button>
            ))}
          </div>
          {/* Comment */}
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Add a comment…"
            rows={2}
            style={{ width: "100%", padding: "5px 8px", fontSize: 12, border: `1px solid ${T.border}`, borderRadius: 4, resize: "none", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
          />
          {/* Actions */}
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button onClick={() => { setOpen(false); setComment(""); }}
              style={{ fontSize: 11, padding: "3px 10px", borderRadius: 4, border: `1px solid ${T.border}`, background: "#fff", color: T.textMuted, cursor: "pointer" }}>Cancel</button>
            <button onClick={() => addMut.mutate()}
              disabled={!comment.trim() || addMut.isPending}
              style={{ fontSize: 11, padding: "3px 10px", borderRadius: 4, border: "none", background: comment.trim() ? T.blue : T.border, color: comment.trim() ? "#fff" : T.textLight, cursor: comment.trim() ? "pointer" : "default", fontWeight: 600 }}>Save</button>
          </div>
        </div>
      )}

      {/* Activity list */}
      <div style={{ padding: "4px 12px 8px", flex: 1 }}>
        {activities.length === 0 ? (
          <div style={{ fontSize: 11, color: T.textLight, padding: "8px 0", textAlign: "center" }}>No activities yet</div>
        ) : activities.map((n, i) => {
          const c = ACTIVITY_COLORS[n.type] ?? ACTIVITY_COLORS.Call;
          return (
            <div key={n.id} style={{ padding: "5px 0", borderBottom: i < activities.length - 1 ? `1px solid ${T.borderL}` : "none", display: "flex", alignItems: "flex-start", gap: 7 }}>
              <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: c.bg, color: c.text, flexShrink: 0, marginTop: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>{n.type}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: T.text, lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{n.content}</div>
                <div style={{ fontSize: 10, color: T.textLight, marginTop: 1 }}>{new Date((n.createdAt ?? Date.now()) * (String(n.createdAt).length > 10 ? 1 : 1000)).toLocaleDateString("cs-CZ")}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Customer Card ─────────────────────────────────────────────────────────────
export default function CustomerCard() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const customerId = parseInt(id ?? "0");
  const [activeTab, setActiveTab] = useState("overview");
  const [editingStatus, setEditingStatus] = useState(false);
  const [showLogoMenu, setShowLogoMenu] = useState(false);
  const [logoFetching, setLogoFetching] = useState(false);
  const [websiteInput, setWebsiteInput] = useState("");
  const [showWebsiteInput, setShowWebsiteInput] = useState(false);

  const { data: customer, isLoading } = useQuery<Customer>({
    queryKey: ["/api/customers", customerId],
    queryFn: () => apiRequest("GET", `/api/customers/${customerId}`).then(r => r.json()),
    enabled: !!customerId,
  });
  const { data: shipments = [] } = useQuery<Shipment[]>({
    queryKey: ["/api/customers", customerId, "shipments"],
    queryFn: () => apiRequest("GET", `/api/customers/${customerId}/shipments`).then(r => r.json()),
    enabled: !!customerId,
  });
  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/customers", customerId, "contacts"],
    queryFn: () => apiRequest("GET", `/api/customers/${customerId}/contacts`).then(r => r.json()),
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

  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteMut = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/customers/${customerId}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/customers"] }); setLocation("/"); toast({ title: "Customer deleted" }); },
  });

  const fetchLogoMut = useMutation({
    mutationFn: (website: string) => apiRequest("POST", `/api/customers/${customerId}/logo/fetch`, { website }).then(r => r.json()),
    onSuccess: (data) => {
      if (data.ok) { queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId] }); toast({ title: "Logo updated" }); }
      else toast({ title: data.error ?? "Logo not found", variant: "destructive" });
      setLogoFetching(false); setShowWebsiteInput(false); setWebsiteInput("");
    },
    onError: () => { toast({ title: "Failed to fetch logo", variant: "destructive" }); setLogoFetching(false); },
  });

  const deleteLogoMut = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/customers/${customerId}/logo`).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId] }); toast({ title: "Logo removed" }); },
  });

  const uploadLogoRef = typeof document !== "undefined" ? (window as any).__uploadRef ?? ((window as any).__uploadRef = { current: null }) : { current: null };

  const handleUploadLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ["image/png","image/jpeg","image/webp","image/svg+xml"];
    if (!allowed.includes(file.type)) { toast({ title: "Only PNG, JPG, WebP, SVG allowed", variant: "destructive" }); return; }
    if (file.size > 2 * 1024 * 1024) { toast({ title: "File too large (max 2MB)", variant: "destructive" }); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      apiRequest("POST", `/api/customers/${customerId}/logo/upload`, { dataUrl, filename: file.name })
        .then(r => r.json()).then(data => {
          if (data.ok) { queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId] }); toast({ title: "Logo uploaded" }); }
          else toast({ title: data.error ?? "Upload failed", variant: "destructive" });
        });
    };
    reader.readAsDataURL(file);
    if (e.target) e.target.value = "";
  };

  if (isLoading) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}><Loader2 style={{ width: 24, height: 24, color: T.blue, animation: "spin 1s linear infinite" }} /></div>;
  if (!customer) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}><p>Customer not found</p><button onClick={() => setLocation("/")} style={{ color: T.blue, cursor: "pointer", background: "none", border: "none" }}>← Back</button></div>;

  const avgProfit = (customer.totalShipments ?? 0) > 0 ? (customer.totalProfit ?? 0) / (customer.totalShipments ?? 1) : 0;
  const activeShipments = shipments.filter(s => s.status !== "Completed").length;

  // Analysis
  const naceCodes = parseNaceCodes(customer.nace ?? "");
  const naceInfo = getNaceInfo(naceCodes);
  const age = calcCompanyAge(customer.registrationDate ?? "");
  const risk = calcRisk(customer.companyStatus ?? "", customer.registrationDate ?? "", naceInfo);
  const isActive = !customer.companyStatus || customer.companyStatus.toLowerCase().includes("active");
  const isNewCo = age.years < 2 && !!customer.registrationDate;
  const seg = getSegment(customer.label);

  const TABS = [
    { id: "overview",       label: "Overview" },
    { id: "contacts",       label: "Contacts" },
    { id: "shipments",      label: "Shipments" },
    { id: "quotes",         label: "Quotes" },
    { id: "finance",        label: "Finance" },
    { id: "documents",      label: "Documents" },
    { id: "communication",  label: "Communication" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: "'Inter', -apple-system, sans-serif" }}>

      {/* ────────────────────────────────────────────────
          ROW 1 — Nav bar
      ──────────────────────────────────────────────── */}
      <div style={{ background: "#fff", borderBottom: `1px solid ${T.border}`, padding: "0 24px", display: "flex", alignItems: "center", height: 48, gap: 10 }}>
        {/* Logo + CRM label */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 30, height: 30, background: T.blue, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Building2 style={{ width: 16, height: 16, color: "#fff" }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", letterSpacing: "-0.02em" }}>CRM</span>
        </div>
        {/* Separator */}
        <div style={{ width: 1, height: 18, background: T.border, margin: "0 4px" }} />
        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#64748B" }}>
          <button onClick={() => setLocation("/")} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748B", fontSize: 13, padding: 0, fontWeight: 400 }}>Customer database</button>
          <span style={{ color: "#CBD5E1", fontSize: 14 }}>›</span>
          <span style={{ color: "#0F172A", fontWeight: 500, fontSize: 13 }}>{customer.companyName}</span>
        </div>
        {/* Delete button — far right */}
        <div style={{ marginLeft: "auto" }}>
          {confirmDelete ? (
            <div style={{ display: "flex", alignItems: "center", gap: 7, background: "#FEF2F2", border: "1.5px solid #FECACA", borderRadius: 8, padding: "5px 12px" }}>
              <Trash2 style={{ width: 13, height: 13, color: "#DC2626" }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: "#DC2626" }}>Delete account?</span>
              <button onClick={() => deleteMut.mutate()} disabled={deleteMut.isPending}
                style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 5, border: "none", background: "#DC2626", color: "#fff", cursor: "pointer", marginLeft: 4 }}>Yes</button>
              <button onClick={() => setConfirmDelete(false)}
                style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 5, border: "1px solid #FCA5A5", background: "#fff", color: "#6B7280", cursor: "pointer" }}>No</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)}
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, padding: "6px 14px", borderRadius: 8, border: "1.5px solid #FECACA", background: "#fff", color: "#DC2626", cursor: "pointer" }}>
              <Trash2 style={{ width: 14, height: 14 }} />
              Delete account
            </button>
          )}
        </div>
      </div>

      {/* ────────────────────────────────────────────────
          ROW 2 — Company identity bar
      ──────────────────────────────────────────────── */}
      <div style={{ background: "#fff", borderBottom: `1px solid ${T.border}`, padding: "14px 24px 0" }}>
        {/* Identity row */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
          {/* Back arrow */}
          <button onClick={() => setLocation("/")}
            style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: `1px solid ${T.border}`, borderRadius: 7, cursor: "pointer", color: "#64748B", flexShrink: 0 }}>
            <ArrowLeft style={{ width: 15, height: 15 }} />
          </button>
            {/* Avatar / Logo — click to manage logo */}
            <div style={{ position: "relative" }}>
              <button onClick={() => setShowLogoMenu(v => !v)} title="Manage logo"
                style={{ width: 46, height: 46, borderRadius: 10, border: `1.5px solid ${T.border}`, background: "#EFF6FF", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, flexShrink: 0 }}>
                {customer.logoPath ? (
                  <img src={customer.logoPath} alt={customer.companyName} style={{ width: "100%", height: "100%", objectFit: "contain", padding: 3 }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                ) : (
                  <span style={{ fontSize: 18, fontWeight: 800, color: T.blue, letterSpacing: "-0.02em" }}>{customer.companyName.charAt(0).toUpperCase()}</span>
                )}
              </button>
              {showLogoMenu && (
                <>
                  <div onClick={() => setShowLogoMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 200 }} />
                  <div style={{ position: "absolute", top: 52, left: 0, background: "#fff", border: `1px solid ${T.border}`, borderRadius: 8, width: 210, boxShadow: "0 4px 16px rgba(0,0,0,0.10)", zIndex: 201, overflow: "hidden" }}>
                    <div style={{ padding: "7px 12px", borderBottom: `1px solid ${T.borderL}`, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: T.textLight }}>Company Logo</div>
                    {!showWebsiteInput ? (
                      <button onClick={() => { setWebsiteInput(customer.companyWebsite ?? ""); setShowWebsiteInput(true); }}
                        style={{ width: "100%", padding: "9px 12px", background: "none", border: "none", textAlign: "left", fontSize: 13, cursor: "pointer", color: T.textSub, display: "flex", alignItems: "center", gap: 8 }}>
                        🔄 Fetch from website
                      </button>
                    ) : (
                      <div style={{ padding: "8px 10px", borderBottom: `1px solid ${T.borderL}` }}>
                        <input className="crm-input" value={websiteInput} onChange={e => setWebsiteInput(e.target.value)} placeholder="company.cz" style={{ marginBottom: 6, fontSize: 12 }} autoFocus />
                        <div style={{ display: "flex", gap: 5 }}>
                          <button className="btn btn-outline btn-sm" onClick={() => { setShowWebsiteInput(false); setShowLogoMenu(false); }} style={{ flex: 1 }}>Cancel</button>
                          <button className="btn btn-primary btn-sm" disabled={!websiteInput || fetchLogoMut.isPending}
                            onClick={() => { setLogoFetching(true); setShowLogoMenu(false); fetchLogoMut.mutate(websiteInput); }} style={{ flex: 1 }}>{fetchLogoMut.isPending ? "…" : "Fetch"}</button>
                        </div>
                      </div>
                    )}
                    <label style={{ width: "100%", padding: "9px 12px", background: "none", border: "none", textAlign: "left", fontSize: 13, cursor: "pointer", color: T.textSub, display: "flex", alignItems: "center", gap: 8 }}>
                      <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => { handleUploadLogo(e); setShowLogoMenu(false); }} />
                      📁 Upload manually
                    </label>
                    {customer.logoPath && (
                      <button onClick={() => { deleteLogoMut.mutate(); setShowLogoMenu(false); }}
                        style={{ width: "100%", padding: "9px 12px", background: "none", border: "none", borderTop: `1px solid ${T.borderL}`, textAlign: "left", fontSize: 13, cursor: "pointer", color: "#B91C1C", display: "flex", alignItems: "center", gap: 8 }}>
                        🗑 Remove logo
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Company name + badges + sub-line */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Row: name + badges */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0F172A", margin: 0, letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>{customer.companyName}</h1>

                {/* KEY ACCOUNT badge — amber outline with star */}
                {customer.label && customer.label !== "STANDARD" && (() => {
                  const seg = getSegment(customer.label);
                  return (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, border: `1.5px solid ${seg.border}`, background: seg.bg, color: seg.text, letterSpacing: "0.03em", whiteSpace: "nowrap" }}>
                      {seg.value === "KEY ACCOUNT" && <span style={{ fontSize: 11 }}>★</span>}
                      {seg.value}
                    </span>
                  );
                })()}

                {/* PROSPECT / ACTIVE / INACTIVE status badge — outlined pill */}
                {(() => {
                  const st = STATUS_MAP[customer.status] ?? STATUS_MAP.Inactive;
                  return (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, border: `1.5px solid ${st.dot}`, background: "#fff", color: st.text, letterSpacing: "0.02em", whiteSpace: "nowrap" }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: st.dot, display: "inline-block" }} />
                      {customer.status?.toUpperCase() || "PROSPECT"}
                    </span>
                  );
                })()}

                {/* ACTIVE registry status — green outline */}
                {(() => {
                  const isAct = !customer.companyStatus || customer.companyStatus.toLowerCase().includes("active");
                  return (
                    <span style={{ display: "inline-flex", alignItems: "center", fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, border: `1.5px solid ${isAct ? "#16A34A" : "#B91C1C"}`, background: "#fff", color: isAct ? "#15803D" : "#B91C1C", letterSpacing: "0.02em", whiteSpace: "nowrap" }}>
                      {isAct ? "ACTIVE" : "INACTIVE"}
                    </span>
                  );
                })()}
              </div>

              {/* Sub-line: IČO | DIČ | 🇨🇿 CZ | 👤 Sales owner */}
              <div style={{ display: "flex", alignItems: "center", gap: 0, marginTop: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: "#64748B", fontFamily: "monospace" }}>IČO:&nbsp;<span style={{ color: "#0F172A", fontWeight: 500 }}>{customer.ico}</span></span>
                <span style={{ margin: "0 10px", color: "#CBD5E1" }}>|</span>
                <span style={{ fontSize: 12, color: "#64748B", fontFamily: "monospace" }}>DIČ:&nbsp;<span style={{ color: "#0F172A", fontWeight: 500 }}>{customer.dic || "—"}</span></span>
                <span style={{ margin: "0 10px", color: "#CBD5E1" }}>|</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#0F172A", fontWeight: 500 }}>
                  <span style={{ fontSize: 14 }}>🇨🇿</span>
                  {customer.country || "CZ"}
                </span>
                <span style={{ margin: "0 10px", color: "#CBD5E1" }}>|</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "#0F172A" }}>
                  <User style={{ width: 13, height: 13, color: "#64748B" }} />
                  <select value={customer.salesOwner || "__"} onChange={e => patchMut.mutate({ salesOwner: e.target.value === "__" ? "" : e.target.value })}
                    data-testid="select-sales-owner"
                    style={{ appearance: "none", fontSize: 12, padding: "0 4px", border: "none", background: "transparent", color: customer.salesOwner ? "#0F172A" : "#94A3B8", cursor: "pointer", outline: "none", fontWeight: 500, fontFamily: "inherit" }}>
                    <option value="__">Unassigned</option>
                    {SYSTEM_USERS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </span>
              </div>
            </div>
          </div>

        {/* ROW 3 — Info strip */}
        <div style={{ background: "#F8FAFC", borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}`, padding: "7px 24px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, borderRadius: "50%", border: "1.5px solid #94A3B8", color: "#64748B", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>i</span>
          <span style={{ fontSize: 12, color: "#475569", fontWeight: 400 }}>
            New customer
            <span style={{ margin: "0 8px", color: "#CBD5E1" }}>•</span>
            No activity
            <span style={{ margin: "0 8px", color: "#CBD5E1" }}>•</span>
            Requires onboarding
          </span>
        </div>

        {/* ROW 4 — Tabs */}
        <div style={{ background: "#fff", padding: "0 24px", display: "flex", gap: 0 }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} data-testid={`tab-${tab.id}`}
              style={{ padding: "12px 16px", border: "none", borderBottom: activeTab === tab.id ? `2px solid ${T.blue}` : "2px solid transparent", background: "none", cursor: "pointer", fontSize: 13, fontWeight: activeTab === tab.id ? 600 : 400, color: activeTab === tab.id ? T.blue : "#64748B", marginBottom: -1, whiteSpace: "nowrap" }}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ── */}
      <div style={{ padding: "20px 24px", maxWidth: 1400 }}>

        {/* ── Overview ── */}
        {activeTab === "overview" && (() => {
          const revenue        = customer.totalRevenue ?? 0;
          const profit         = customer.totalProfit  ?? 0;
          const cost           = Math.max(0, revenue - profit);
          const donutData      = revenue > 0
            ? [{ name: "Profit", value: profit, color: "#15803D" }, { name: "Cost", value: cost, color: "#BFDBFE" }]
            : [{ name: "No data", value: 1, color: "#F3F4F6" }];
          const isActive       = !customer.companyStatus || customer.companyStatus.toLowerCase().includes("active");
          const activeShipments = shipments.filter(s => s.status !== "Completed").length;
          const completedShipments = shipments.filter(s => s.status === "Completed").length;
          const seg            = getSegment(customer.label);
          const statusSt       = STATUS_MAP[customer.status] ?? STATUS_MAP.Inactive;

          // Payment term rows
          const ptRows = [
            { label: "General", val: customer.paymentTerms        || "" },
            { label: "Freight", val: customer.freightPaymentTerms || "" },
            { label: "Duty",    val: customer.dutyPaymentTerms    || "" },
          ];

          // Shared card header helper (pastel)
          const CardHead = ({ icon, title, href, bg, iconColor }: { icon: React.ReactNode; title: string; href?: string; bg: string; iconColor: string }) => (
            <div style={{ background: bg, borderBottom: `1px solid ${T.border}`, borderRadius: "8px 8px 0 0", padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ color: iconColor, display: "flex", alignItems: "center" }}>{icon}</span>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#374151" }}>{title}</span>
              </div>
              {href && (
                <a href={href} onClick={e => { e.preventDefault(); setLocation(href.replace(/^#/, "")); }}
                  style={{ fontSize: 11, fontWeight: 600, color: iconColor, textDecoration: "none" }}>View →</a>
              )}
            </div>
          );

          const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
            <div style={{ display: "flex", alignItems: "flex-start", padding: "5px 12px", borderBottom: `1px solid #F1F5F9` }}>
              <span style={{ width: 130, flexShrink: 0, fontSize: 11, fontWeight: 500, color: "#64748B", paddingTop: 1 }}>{label}</span>
              <span style={{ fontSize: 12, color: "#0F172A", flex: 1 }}>{value}</span>
            </div>
          );

          return (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, alignItems: "start" }}>

              {/* ════ LEFT COLUMN: Customer Profile ════ */}
              <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                <CardHead
                  icon={<User style={{ width: 13, height: 13 }} />}
                  title="Customer Profile"
                  href={`#/customers/${customerId}/profile`}
                  bg="#EFF6FF"
                  iconColor="#1D4ED8"
                />
                {/* Company name row */}
                <div style={{ padding: "8px 12px 5px", borderBottom: "1px solid #F1F5F9" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", letterSpacing: "-0.01em" }}>{customer.companyName}</div>
                </div>
                {/* Static info rows */}
                <Row label="Registered address" value={customer.registeredAddress || "—"} />
                <Row label="City / Country" value={[customer.city, customer.country].filter(Boolean).join(", ") || "—"} />
                <Row label="IČO" value={<span style={{ fontFamily: "monospace" }}>{customer.ico}</span>} />
                <Row label="VAT ID (DIČ)" value={<span style={{ fontFamily: "monospace" }}>{customer.dic || "—"}</span>} />
                <Row label="Legal form" value={legalFormText(customer.legalForm ?? "")} />
                <Row label="Registry status" value={
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: isActive ? "#16A34A" : "#B91C1C", display: "inline-block" }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: isActive ? "#15803D" : "#B91C1C" }}>{customer.companyStatus || "Active"}</span>
                  </span>
                } />
                {/* Account Type dropdown */}
                <div style={{ display: "flex", alignItems: "center", padding: "5px 12px", borderBottom: "1px solid #F1F5F9" }}>
                  <span style={{ width: 130, flexShrink: 0, fontSize: 11, fontWeight: 500, color: "#64748B" }}>Account Type</span>
                  <div style={{ position: "relative", flex: 1 }}>
                    <select value={customer.label || "PROSPECT"} onChange={e => patchMut.mutate({ label: e.target.value })}
                      style={{ appearance: "none", width: "100%", background: seg.bg, color: seg.text, border: `1px solid ${seg.border}`, fontSize: 11, fontWeight: 700, padding: "2px 20px 2px 7px", borderRadius: 4, letterSpacing: "0.04em", cursor: "pointer", outline: "none" }}>
                      {CUSTOMER_SEGMENTS.map(s => <option key={s.value} value={s.value}>{s.value}</option>)}
                    </select>
                    <ChevronRight style={{ width: 9, height: 9, position: "absolute", right: 5, top: "50%", transform: "translateY(-50%) rotate(90deg)", color: seg.text, pointerEvents: "none" }} />
                  </div>
                </div>
                {/* CRM Status dropdown */}
                <div style={{ display: "flex", alignItems: "center", padding: "5px 12px", borderBottom: "1px solid #F1F5F9" }}>
                  <span style={{ width: 130, flexShrink: 0, fontSize: 11, fontWeight: 500, color: "#64748B" }}>CRM Status</span>
                  <select value={customer.status} onChange={e => patchMut.mutate({ status: e.target.value })}
                    style={{ appearance: "none", fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 4, cursor: "pointer", outline: "none", border: `1px solid ${statusSt.dot}`, background: statusSt.bg, color: statusSt.text }}>
                    <option>Active</option><option>Prospect</option><option>Inactive</option>
                  </select>
                </div>
                {/* Sales owner dropdown */}
                <div style={{ display: "flex", alignItems: "center", padding: "5px 12px", borderBottom: "1px solid #F1F5F9" }}>
                  <span style={{ width: 130, flexShrink: 0, fontSize: 11, fontWeight: 500, color: "#64748B" }}>Sales owner</span>
                  <select value={customer.salesOwner || "__"} onChange={e => patchMut.mutate({ salesOwner: e.target.value === "__" ? "" : e.target.value })}
                    style={{ appearance: "none", fontSize: 12, padding: "1px 6px", border: `1px solid ${T.border}`, borderRadius: 4, background: "#fff", color: customer.salesOwner ? "#374151" : "#9CA3AF", cursor: "pointer", outline: "none" }}>
                    <option value="__">Unassigned</option>
                    {SYSTEM_USERS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                {/* Website */}
                <div style={{ display: "flex", alignItems: "center", padding: "5px 12px" }}>
                  <span style={{ width: 130, flexShrink: 0, fontSize: 11, fontWeight: 500, color: "#64748B" }}>Website</span>
                  {customer.companyWebsite ? (
                    <a href={customer.companyWebsite.startsWith("http") ? customer.companyWebsite : `https://${customer.companyWebsite}`}
                      target="_blank" rel="noreferrer"
                      style={{ fontSize: 12, color: "#1D4ED8", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {customer.companyWebsite}
                    </a>
                  ) : (
                    <input className="crm-input" value={customer.companyWebsite ?? ""}
                      onChange={e => patchMut.mutate({ companyWebsite: e.target.value })}
                      placeholder="Not set"
                      style={{ fontSize: 12, padding: "2px 7px", flex: 1 }} />
                  )}
                </div>
              </div>

              {/* ════ MIDDLE COLUMN ════ */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

                {/* 1) Financial Summary */}
                <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", cursor: "pointer" }}
                  onClick={() => setLocation(`/customers/${customerId}/section/financial`)}>
                  <CardHead icon={<TrendingUp style={{ width: 13, height: 13 }} />} title="Financial Summary"
                    href={`#/customers/${customerId}/section/financial`} bg="#F0FDF4" iconColor="#15803D" />
                  <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ flexShrink: 0, textAlign: "center" }}>
                      <PieChart width={72} height={72}>
                        <Pie data={donutData} cx={31} cy={31} innerRadius={22} outerRadius={34} dataKey="value" strokeWidth={0}>
                          {donutData.map((e, i) => <Cell key={i} fill={e.color} />)}
                        </Pie>
                      </PieChart>
                      <div style={{ fontSize: 9, fontWeight: 600, color: "#94A3B8", marginTop: -4 }}>
                        {revenue > 0 ? fmtPct(revenue, profit) : "No data"}
                      </div>
                    </div>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
                      {[
                        { label: "Revenue",   value: fmt(revenue),                          color: "#1D4ED8" },
                        { label: "Profit",    value: fmt(profit),                           color: "#15803D" },
                        { label: "Margin",    value: fmtPct(revenue, profit),               color: "#64748B" },
                        { label: "Shipments", value: String(customer.totalShipments ?? 0),  color: "#0D9488" },
                      ].map(item => (
                        <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 5, height: 5, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
                          <span style={{ fontSize: 11, color: "#64748B", flex: 1 }}>{item.label}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#0F172A", fontVariantNumeric: "tabular-nums" }}>{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 2) Payment Terms */}
                <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", cursor: "pointer" }}
                  onClick={() => setLocation(`/customers/${customerId}/section/payment`)}>
                  <CardHead icon={<CreditCard style={{ width: 13, height: 13 }} />} title="Payment Terms"
                    href={`#/customers/${customerId}/section/payment`} bg="#FEF2F2" iconColor="#B91C1C" />
                  <div style={{ padding: "6px 0 4px" }}>
                    {ptRows.map(r => {
                      const isp = r.val === "PREPAYMENT";
                      return (
                        <div key={r.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 12px", borderBottom: "1px solid #F1F5F9" }}>
                          <span style={{ fontSize: 11, color: "#64748B", fontWeight: 500 }}>{r.label}</span>
                          {r.val ? (
                            <span style={{ fontSize: 11, fontWeight: 700, color: isp ? "#fff" : "#0F172A", background: isp ? "#DC2626" : "#F8FAFC", border: `1px solid ${isp ? "#DC2626" : "#E2E8F0"}`, padding: "1px 8px", borderRadius: 4 }}>{r.val}</span>
                          ) : (
                            <span style={{ fontSize: 11, color: "#CBD5E1", fontStyle: "italic" }}>Not set</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 3) Shipments History */}
                <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", cursor: "pointer" }}
                  onClick={() => setLocation(`/customers/${customerId}/section/shipments`)}>
                  <CardHead icon={<Ship style={{ width: 13, height: 13 }} />} title="Shipments History"
                    href={`#/customers/${customerId}/section/shipments`} bg="#EFF6FF" iconColor="#1D4ED8" />
                  <div style={{ padding: "8px 0 4px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 12px", borderBottom: "1px solid #F1F5F9" }}>
                      <span style={{ fontSize: 11, color: "#64748B", fontWeight: 500 }}>In progress</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: activeShipments > 0 ? "#1D4ED8" : "#CBD5E1" }}>{activeShipments} <span style={{ fontSize: 11, fontWeight: 500, color: "#94A3B8" }}>jobs</span></span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 12px" }}>
                      <span style={{ fontSize: 11, color: "#64748B", fontWeight: 500 }}>Completed</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: completedShipments > 0 ? "#15803D" : "#CBD5E1" }}>{completedShipments} <span style={{ fontSize: 11, fontWeight: 500, color: "#94A3B8" }}>jobs</span></span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ════ RIGHT COLUMN ════ */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

                {/* 1) Next Step */}
                {(() => {
                  const steps = [
                    { done: contacts.length > 0,      icon: "👤", text: "Add contacts",      sub: contacts.length > 0 ? `${contacts.length} contact${contacts.length > 1 ? "s" : ""} added` : "Add at least one contact" },
                    { done: (customer.creditLimit ?? 0) > 0, icon: "💳", text: "Set credit limit", sub: (customer.creditLimit ?? 0) > 0 ? `${fmt(customer.creditLimit)} limit` : "Credit limit not defined" },
                    { done: notes.length > 0,          icon: "📞", text: "Follow-up client",  sub: notes.length > 0 ? "Activity logged" : "No activity yet" },
                  ];
                  return (
                    <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                      <CardHead icon={<Check style={{ width: 13, height: 13 }} />} title="Next Step" bg="#FFF7ED" iconColor="#C2410C" />
                      <div style={{ padding: "6px 0 4px" }}>
                        {steps.map((step, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "7px 12px", borderBottom: i < steps.length - 1 ? "1px solid #F1F5F9" : "none" }}>
                            <span style={{ fontSize: 14, lineHeight: 1, marginTop: 1, flexShrink: 0 }}>{step.icon}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                {step.done && <Check style={{ width: 11, height: 11, color: "#15803D", flexShrink: 0 }} />}
                                <span style={{ fontSize: 12, fontWeight: 600, color: step.done ? "#15803D" : "#0F172A", textDecoration: step.done ? "line-through" : "none", opacity: step.done ? 0.7 : 1 }}>{step.text}</span>
                              </div>
                              <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>{step.sub}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* 2) Last Interaction */}
                {(() => {
                  const activityNotes = [...notes]
                    .filter(n => ["Call", "Email", "Visit", "Note", "Follow-up"].includes(n.type))
                    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
                  const last = activityNotes[0];
                  const daysAgo = last ? Math.floor((Date.now() - (last.createdAt ?? 0) * (String(last.createdAt).length > 10 ? 1 : 1000)) / (1000 * 60 * 60 * 24)) : null;
                  return (
                    <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                      <CardHead icon={<Calendar style={{ width: 13, height: 13 }} />} title="Last Interaction" bg="#F5F3FF" iconColor="#5B21B6" />
                      <div style={{ padding: "10px 12px" }}>
                        {last ? (
                          <>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>
                              {daysAgo === 0 ? "Today" : daysAgo === 1 ? "Yesterday" : `${daysAgo} days ago`}
                              <span style={{ fontWeight: 400, color: "#64748B" }}> — {last.type}</span>
                            </div>
                            <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4, lineHeight: 1.4,
                              overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any }}>
                              {last.content}
                            </div>
                            {last.author && <div style={{ fontSize: 10, color: "#CBD5E1", marginTop: 4 }}>by {last.author}</div>}
                          </>
                        ) : (
                          <div style={{ fontSize: 12, color: "#CBD5E1", fontStyle: "italic" }}>No activity recorded yet</div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* 3) Quick Actions */}
                {(() => {
                  const actions = [
                    { icon: <Upload style={{ width: 13, height: 13 }} />, label: "Add document",  onClick: () => setActiveTab("documents") },
                    { icon: <User   style={{ width: 13, height: 13 }} />, label: "Add contact",   onClick: () => setActiveTab("contacts") },
                    { icon: <MessageSquare style={{ width: 13, height: 13 }} />, label: "Add note", onClick: () => setActiveTab("communication") },
                  ];
                  return (
                    <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                      <CardHead icon={<Plus style={{ width: 13, height: 13 }} />} title="Quick Actions" bg="#F8FAFC" iconColor="#475569" />
                      <div style={{ padding: "4px 0" }}>
                        {actions.map((a, i) => (
                          <button key={i} onClick={a.onClick}
                            style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "none", border: "none", borderBottom: i < actions.length - 1 ? "1px solid #F1F5F9" : "none", cursor: "pointer", textAlign: "left", fontSize: 12, fontWeight: 500, color: "#374151", transition: "background 0.1s" }}
                            onMouseEnter={e => (e.currentTarget.style.background = "#F8FAFC")}
                            onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                            <span style={{ color: "#64748B" }}>{a.icon}</span>
                            + {a.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          );
        })()}

        {activeTab === "contacts"      && <ContactsTab customerId={customerId} viewHref={`#/customers/${customerId}/section/contacts`} />}
        {activeTab === "shipments"     && <ShipmentsTab customerId={customerId} viewHref={`#/customers/${customerId}/section/shipments`} />}
        {activeTab === "quotes"        && <QuotesTab customerId={customerId} viewHref={`#/customers/${customerId}/section/quotes`} />}
        {activeTab === "finance"       && <FinanceTab customerId={customerId} customer={customer} viewHref={`#/customers/${customerId}/section/financial`} creditHref={`#/customers/${customerId}/section/credit`} />}
        {activeTab === "documents"     && <DocumentsTab customerId={customerId} viewHref={`#/customers/${customerId}/section/documents`} />}
        {activeTab === "communication" && <CommunicationTab customerId={customerId} viewHref={`#/customers/${customerId}/section/communication`} />}
      </div>
    </div>
  );
}

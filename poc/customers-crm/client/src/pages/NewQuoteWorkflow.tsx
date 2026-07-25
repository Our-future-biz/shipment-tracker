import React, { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ArrowLeft, ChevronDown, ChevronUp, Check, X,
  Download, Mail, Eye, FileText, Copy, Package, PenLine,
  Plane, Ship, Train, Truck, ArrowRight, Plus, Trash2,
  AlertTriangle, Send, Search, Upload, Loader2, User, Phone,
  MapPin, DollarSign, BarChart3, Bell, FileUp, ClipboardCopy, Zap,
} from "lucide-react";
import {
  QuoteStatusDropdown, StatusTimelinePanel, LifecycleFlowBar, StatusBadge,
  type QuoteStatus,
} from "./QuoteLifecycle";

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  blue:      "#2563EB",
  blueL:     "#EFF6FF",
  blueBd:    "#BFDBFE",
  navy:      "#1E293B",
  text:      "#0F172A",
  textSub:   "#374151",
  textMuted: "#6B7280",
  textLight: "#9CA3AF",
  border:    "#E2E8F0",
  borderL:   "#F1F5F9",
  bg:        "#F8FAFC",
  surface:   "#FFFFFF",
  green:     "#16A34A",
  greenL:    "#F0FDF4",
  greenBd:   "#BBF7D0",
  red:       "#DC2626",
  redL:      "#FEF2F2",
  amber:     "#B45309",
  amberL:    "#FFFBEB",
};

// ─── Shared field components ──────────────────────────────────────────────────
const Lbl = ({ text, req }: { text: string; req?: boolean }) => (
  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: C.textMuted, marginBottom: 5 }}>
    {text}{req && <span style={{ color: C.red, marginLeft: 3 }}>*</span>}
  </div>
);

const Inp = ({ value, onChange, placeholder, type = "text", disabled }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; disabled?: boolean;
}) => (
  <input type={type} value={value} onChange={e => onChange(e.target.value)}
    placeholder={placeholder} disabled={disabled}
    style={{ width: "100%", padding: "9px 11px", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 7, outline: "none", background: disabled ? C.bg : C.surface, color: C.text, fontFamily: "inherit", boxSizing: "border-box" as const, transition: "border-color 0.15s" }}
    onFocus={e => !disabled && (e.target.style.borderColor = C.blue)}
    onBlur={e => (e.target.style.borderColor = C.border)} />
);

const Sel = ({ value, onChange, opts, placeholder }: {
  value: string; onChange: (v: string) => void; opts: string[]; placeholder?: string;
}) => (
  <select value={value} onChange={e => onChange(e.target.value)}
    style={{ width: "100%", padding: "9px 11px", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 7, outline: "none", background: C.surface, color: value ? C.text : C.textLight, fontFamily: "inherit", appearance: "none", cursor: "pointer", boxSizing: "border-box" as const }}>
    {placeholder && <option value="">{placeholder}</option>}
    {opts.map(o => <option key={o} value={o}>{o}</option>)}
  </select>
);

const Row = ({ cols, children }: { cols?: number; children: React.ReactNode }) => (
  <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols ?? 2}, 1fr)`, gap: 14 }}>
    {children}
  </div>
);

const Toggle = ({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 11px", border: `1px solid ${C.border}`, borderRadius: 7, background: C.surface }}>
    <span style={{ fontSize: 13, color: C.textSub }}>{label}</span>
    <button type="button" onClick={() => onChange(!value)}
      style={{ width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer", background: value ? C.blue : "#CBD5E1", position: "relative" as const, padding: 0, transition: "background 0.2s", flexShrink: 0 }}>
      <span style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", position: "absolute" as const, top: 3, left: value ? 21 : 3, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
    </button>
  </div>
);

const SectionField = ({ label, children, req }: { label: string; children: React.ReactNode; req?: boolean }) => (
  <div><Lbl text={label} req={req} />{children}</div>
);

// ─── Modal wrapper ────────────────────────────────────────────────────────────
const Modal = ({ open, onClose, title, width = 540, children, extra }: {
  open: boolean; onClose: () => void; title: string; width?: number; children: React.ReactNode; extra?: React.ReactNode;
}) => {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 999, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 24px", overflowY: "auto" }}>
      <div style={{ background: C.surface, borderRadius: 12, width: "100%", maxWidth: width, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", overflow: "hidden" }}>
        <div style={{ padding: "16px 22px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{title}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {extra}
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.textLight, padding: 4 }}><X style={{ width: 18, height: 18 }} /></button>
          </div>
        </div>
        <div style={{ padding: "22px" }}>{children}</div>
      </div>
    </div>
  );
};

const Btn = ({ children, onClick, variant = "outline", disabled }: {
  children: React.ReactNode; onClick?: () => void; variant?: "primary" | "outline" | "ghost"; disabled?: boolean;
}) => (
  <button type="button" onClick={onClick} disabled={disabled}
    style={{
      display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: disabled ? "default" : "pointer", border: "none",
      background: variant === "primary" ? C.blue : variant === "outline" ? C.surface : "none",
      color: variant === "primary" ? "#fff" : C.textSub,
      border2: variant === "outline" ? `1px solid ${C.border}` : "none",
      ...(variant === "outline" ? { border: `1px solid ${C.border}` } : {}),
      opacity: disabled ? 0.5 : 1, transition: "opacity 0.15s",
    } as any}>
    {children}
  </button>
);

// ─── Accordion section ────────────────────────────────────────────────────────
type SectionStatus = "empty" | "in-progress" | "completed";

// ─── Customer picker section ─────────────────────────────────────────────────────
function CustomerSection({ customer, setCustomer, onNext }: {
  customer: { company: string; contact: string; email: string; phone: string };
  setCustomer: (fn: (p: any) => any) => void;
  onNext: () => void;
}) {
  const [search, setSearch] = useState("");
  const [dropOpen, setDropOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef  = useRef<HTMLDivElement>(null);
  // Tracks whether we already restored state from DB so we don’t repeat it
  const restoredRef = useRef(false);
  // Tracks whether the current selectedId came from a fresh interactive pick
  // (vs a DB restore) so we don’t overwrite saved contact data on restore
  const freshPickRef = useRef(false);

  // Fetch all customers from the CRM database
  const { data: crmCustomers = [] } = useQuery<any[]>({
    queryKey: ["/api/customers"],
    queryFn: () => apiRequest("GET", "/api/customers").then(r => r.json()),
  });

  // Restore search input + selectedId when returning to a saved quote.
  // Fires once crmCustomers list is loaded and customer.company is already set.
  useEffect(() => {
    if (restoredRef.current) return;       // only once
    if (!customer.company) return;         // nothing saved yet
    if (crmCustomers.length === 0) return; // list not ready yet
    restoredRef.current = true;
    const match = crmCustomers.find((c: any) =>
      c.companyName.toLowerCase() === customer.company.toLowerCase()
    );
    if (match) {
      setSearch(match.companyName);
      setSelectedId(match.id);             // restores blue border + green chip
      // freshPickRef stays false — contacts hook won’t overwrite saved data
    } else {
      setSearch(customer.company);         // manual entry fallback
    }
  }, [customer.company, crmCustomers]);

  // Fetch contacts for selected customer
  const { data: contacts = [] } = useQuery<any[]>({
    queryKey: ["/api/customers", selectedId, "contacts"],
    queryFn: () => apiRequest("GET", `/api/customers/${selectedId}/contacts`).then(r => r.json()),
    enabled: !!selectedId,
  });

  // Auto-fill contact fields only on a fresh interactive pick, NOT on DB restore
  useEffect(() => {
    if (!freshPickRef.current) return;
    if (!selectedId || contacts.length === 0) return;
    const main = contacts.find((c: any) => c.isMain) || contacts[0];
    setCustomer(p => ({
      ...p,
      contact: main.name || "",
      email:   main.email || "",
      phone:   main.phone || "",
    }));
  }, [contacts, selectedId]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = crmCustomers.filter(c =>
    !search.trim() ||
    c.companyName.toLowerCase().includes(search.toLowerCase()) ||
    c.ico?.includes(search) ||
    c.city?.toLowerCase().includes(search.toLowerCase())
  );

  const selectCustomer = (c: any) => {
    freshPickRef.current = true;  // mark as interactive pick — contacts will auto-fill
    restoredRef.current  = true;  // prevent restore from running again
    setSelectedId(c.id);
    setCustomer(p => ({ ...p, company: c.companyName, contact: "", email: "", phone: "" }));
    setSearch(c.companyName);
    setDropOpen(false);
  };

  const clearCustomer = () => {
    freshPickRef.current = false;
    restoredRef.current  = false; // allow restore again if user picks new company
    setSelectedId(null);
    setSearch("");
    setCustomer(() => ({ company: "", contact: "", email: "", phone: "" }));
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const segBadge: Record<string, { bg: string; color: string }> = {
    "KEY ACCOUNT":    { bg: "#FEF3C7", color: "#B45309" },
    "PROSPECT":       { bg: C.blueL,   color: C.blue },
    "STANDARD":       { bg: C.bg,      color: C.textMuted },
    "TARGET CUSTOMER":{ bg: "#F5F3FF", color: "#5B21B6" },
    "RISK":           { bg: C.redL,    color: C.red },
  };

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: 14 }}>

      {/* Company search field */}
      <div ref={dropRef}>
        <Lbl text="Customer" req />
        <div style={{ position: "relative" as const }}>
          {/* Search input */}
          <div style={{ position: "relative" as const }}>
            <Search style={{ width: 14, height: 14, color: C.textLight, position: "absolute" as const, left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
            <input
              ref={inputRef}
              value={search}
              onChange={e => { setSearch(e.target.value); setDropOpen(true); if (!e.target.value) { setSelectedId(null); setCustomer(() => ({ company: "", contact: "", email: "", phone: "" })); } }}
              onFocus={() => { if (search.trim()) setDropOpen(true); }}
              placeholder="Search customer database…"
              style={{ width: "100%", padding: "9px 36px 9px 32px", fontSize: 13, border: `1.5px solid ${selectedId ? C.blue : C.border}`, borderRadius: 7, outline: "none", fontFamily: "inherit", boxSizing: "border-box" as const, background: C.surface, color: C.text }}
            />
            {selectedId && (
              <button type="button" onClick={clearCustomer}
                style={{ position: "absolute" as const, right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: C.textLight, padding: 3, display: "flex" }}>
                <X style={{ width: 13, height: 13 }} />
              </button>
            )}
          </div>

          {/* Dropdown list */}
          {dropOpen && (
            <div style={{ position: "absolute" as const, top: "calc(100% + 4px)", left: 0, right: 0, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 9, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 100, overflow: "hidden", maxHeight: 280, overflowY: "auto" as const }}>
              {/* All customers header */}
              <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.borderL}`, fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: C.textLight, background: C.bg }}>
                Customer database &nbsp;·&nbsp; {filtered.length} result{filtered.length !== 1 ? "s" : ""}
              </div>
              {filtered.length === 0 ? (
                <div style={{ padding: "16px 14px", fontSize: 13, color: C.textLight, textAlign: "center" as const }}>No customers found</div>
              ) : filtered.map((c: any) => {
                const badge = segBadge[c.label] ?? segBadge["STANDARD"];
                const isSelected = c.id === selectedId;
                return (
                  <button type="button" key={c.id}
                    onClick={() => selectCustomer(c)}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: isSelected ? C.blueL : "none", border: "none", borderBottom: `1px solid ${C.borderL}`, cursor: "pointer", textAlign: "left" as const, transition: "background 0.1s" }}
                    onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = C.bg; }}
                    onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "none"; }}>
                    {/* Avatar */}
                    <div style={{ width: 30, height: 30, borderRadius: 7, background: C.blueL, border: `1px solid ${C.blueBd}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: C.blue }}>{c.companyName.charAt(0)}</span>
                    </div>
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }}>{c.companyName}</div>
                      <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>
                        IČO: {c.ico} &nbsp;·&nbsp; {c.city || c.country || ""}
                      </div>
                    </div>
                    {/* Label badge */}
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: badge.bg, color: badge.color, whiteSpace: "nowrap" as const, flexShrink: 0 }}>
                      {c.label || "STANDARD"}
                    </span>
                    {isSelected && <Check style={{ width: 13, height: 13, color: C.blue, flexShrink: 0 }} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected customer confirmation chip */}
        {selectedId && (
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 7, padding: "6px 10px", background: C.greenL, border: `1px solid ${C.greenBd}`, borderRadius: 7 }}>
            <Check style={{ width: 12, height: 12, color: C.green, flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: C.green }}>{customer.company}</span>
            <span style={{ fontSize: 11, color: "#4ADE80", marginLeft: 2 }}>loaded from CRM database</span>
          </div>
        )}
      </div>

      {/* Contact fields — always visible, auto-filled on selection */}
      <Row cols={2}>
        <SectionField label="Contact person">
          <Inp value={customer.contact} onChange={v => setCustomer(p => ({ ...p, contact: v }))} placeholder="Full name" />
        </SectionField>
        <SectionField label="Email">
          <Inp type="email" value={customer.email} onChange={v => setCustomer(p => ({ ...p, email: v }))} placeholder="email@company.com" />
        </SectionField>
      </Row>
      <Row cols={2}>
        <SectionField label="Phone">
          <Inp value={customer.phone} onChange={v => setCustomer(p => ({ ...p, phone: v }))} placeholder="+420 000 000 000" />
        </SectionField>
        <div />
      </Row>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
        <Btn variant="outline" onClick={onNext}>Save & continue <ArrowRight style={{ width: 13, height: 13 }} /></Btn>
      </div>
    </div>
  );
}

const AccordionSection = ({ num, title, subtitle, status, open, onToggle, children, headerExtra }: {
  num: number; title: string; subtitle: string; status: SectionStatus;
  open: boolean; onToggle: () => void; children: React.ReactNode;
  headerExtra?: React.ReactNode;
}) => {
  const statusBadge = status === "completed"
    ? { bg: C.greenL, color: C.green, border: C.greenBd, label: "Completed" }
    : status === "in-progress"
    ? { bg: C.blueL, color: C.blue, border: C.blueBd, label: "In progress" }
    : { bg: C.bg, color: C.textLight, border: C.border, label: "Not completed" };

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", marginBottom: 10 }}>
      <button type="button" onClick={onToggle}
        style={{ width: "100%", display: "flex", alignItems: "center", padding: "16px 20px", background: "none", border: "none", cursor: "pointer", textAlign: "left" as const }}
        onMouseEnter={e => (e.currentTarget.style.background = C.bg)}
        onMouseLeave={e => (e.currentTarget.style.background = "none")}>
        {/* Number circle */}
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: status === "completed" ? C.green : status === "in-progress" ? C.blue : "#E2E8F0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginRight: 14 }}>
          {status === "completed"
            ? <Check style={{ width: 14, height: 14, color: "#fff" }} />
            : <span style={{ fontSize: 13, fontWeight: 700, color: status === "in-progress" ? "#fff" : C.textLight }}>{num}</span>
          }
        </div>
        {/* Title + subtitle */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{title}</div>
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>{subtitle}</div>
        </div>
        {/* Status badge + optional header extra + chevron */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: statusBadge.bg, color: statusBadge.color, border: `1px solid ${statusBadge.border}` }}>
            {statusBadge.label}
          </span>
          {headerExtra && (
            <div onClick={e => e.stopPropagation()} style={{ display: "flex", alignItems: "center" }}>
              {headerExtra}
            </div>
          )}
          {open ? <ChevronUp style={{ width: 16, height: 16, color: C.textLight }} /> : <ChevronDown style={{ width: 16, height: 16, color: C.textLight }} />}
        </div>
      </button>
      {/* Animated content */}
      <div style={{ maxHeight: open ? "2000px" : "0", overflow: "hidden", transition: "max-height 0.35s ease" }}>
        <div style={{ padding: "0 20px 22px" }}>
          <div style={{ height: 1, background: C.borderL, marginBottom: 18 }} />
          {children}
        </div>
      </div>
    </div>
  );
};

// ─── Quick action card ────────────────────────────────────────────────────────
const QuickCard = ({ icon, title, onClick }: {
  icon: React.ReactNode; title: string; desc?: string; onClick: () => void;
}) => (
  <button type="button" onClick={onClick}
    style={{ flex: 1, minWidth: 0, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", cursor: "pointer", textAlign: "left" as const, display: "flex", alignItems: "center", gap: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.04)", transition: "box-shadow 0.15s, border-color 0.15s" }}
    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 12px rgba(0,0,0,0.09)"; (e.currentTarget as HTMLElement).style.borderColor = C.blue; }}
    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)"; (e.currentTarget as HTMLElement).style.borderColor = C.border; }}>
    <div style={{ width: 32, height: 32, background: C.blueL, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <span style={{ color: C.blue }}>{icon}</span>
    </div>
    <div style={{ fontSize: 12, fontWeight: 700, color: C.text, flex: 1, minWidth: 0 }}>{title}</div>
    <ArrowRight style={{ width: 13, height: 13, color: C.textLight, flexShrink: 0 }} />
  </button>
);

// ─── Cargo package line ───────────────────────────────────────────────────────
interface PkgLine { qty: string; packType: string; length: string; width: string; height: string; weight: string; stackable: string; }
const emptyPkg = (): PkgLine => ({ qty: "", packType: "", length: "", width: "", height: "", weight: "", stackable: "" });
const PACK_TYPES = ["Pallets", "Colli", "Cartons", "Boxes", "Wooden boxes"];

// ─── Cost line types ──────────────────────────────────────────────────────────
interface BuyingLine { id: string; type: string; description: string; supplier: string; currency: string; amount: string; value: string; editing: boolean; }
interface SellingLine { id: string; type: string; description: string; currency: string; amount: string; value: string; editing: boolean; }
const COST_TYPES = ["Ocean freight","Air freight","Rail freight","Road freight","Documentation","THC Origin","THC Destination","Customs clearance","Handling","Delivery","Pickup","Insurance","Inspection","Storage","Demurrage","Other"];
const mkBuying = (): BuyingLine => ({ id: Math.random().toString(36).slice(2), type: "", description: "", supplier: "", currency: "USD", amount: "", value: "", editing: true });
const mkSelling = (): SellingLine => ({ id: Math.random().toString(36).slice(2), type: "", description: "", currency: "USD", amount: "", value: "", editing: true });

// ─── Preview PDF modal ────────────────────────────────────────────────────────
export const QuotePDFExport = ({ q }: { q: any }) => <QuotePDF q={q} />;
const QuotePDF = ({ q }: { q: any; mode?: string }) => {
  const F = { sans: "'Inter',-apple-system,sans-serif" };
  const date = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const qnum = q.quoteNum || q.reference || "";
  const svcTag = [q.serviceType || q.service_type, q.direction].filter(Boolean).join(" ");
  const sellingLines: any[] = Array.isArray(q.sellingLines) ? q.sellingLines : [];
  const buyingLines:  any[] = Array.isArray(q.buyingLines)  ? q.buyingLines  : [];
  const totalSelling = sellingLines.reduce((s: number, l: any) => s + (parseFloat(l.amount) || 0), 0);
  const totalBuying  = buyingLines.reduce((s: number,  l: any) => s + (parseFloat(l.amount) || 0), 0);
  const profit = totalSelling - totalBuying;
  const margin = totalSelling > 0 ? ((profit / totalSelling) * 100).toFixed(1) : "0.0";
  const cur = sellingLines[0]?.currency || buyingLines[0]?.currency || q.currency || "EUR";
  const pkgLines: any[] = Array.isArray(q.packages) ? q.packages : [];
  const totalPkgs    = pkgLines.reduce((s: number, p: any) => s + (parseInt(p.qty) || 0), 0);
  const totalWeight  = pkgLines.reduce((s: number, p: any) => s + (parseFloat(p.weight)||0)*(parseInt(p.qty)||1), 0);
  const totalCBM     = pkgLines.reduce((s: number, p: any) => {
    const qq = parseInt(p.qty)||1;
    return s + qq*(parseFloat(p.length)||0)*(parseFloat(p.width)||0)*(parseFloat(p.height)||0)/1000000;
  }, 0);
  const BL="#1D4ED8"; const DK="#0F172A"; const LT="#64748B"; const XL="#94A3B8";
  const BD="#E2E8F0"; const BG="#F8FAFC"; const GR="#16A34A";

  const Sec = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.14em", color: BL, marginBottom: 8, paddingBottom: 5, borderBottom: `2px solid ${BL}`, fontFamily: F.sans }}>{title}</div>
      {children}
    </div>
  );
  const LV = ({ label, value }: { label: string; value?: string }) => value ? (
    <div style={{ display: "flex", gap: 6, marginBottom: 3 }}>
      <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: XL, width: 72, flexShrink: 0, fontFamily: F.sans, paddingTop: 1 }}>{label}</span>
      <span style={{ fontSize: 11, color: DK, fontFamily: F.sans, fontWeight: 500 }}>{value}</span>
    </div>
  ) : null;

  return (
    <div style={{ fontFamily: F.sans, background: "#fff", maxWidth: 740, margin: "0 auto" }}>
      {/* ─ Header ─ */}
      <div style={{ background: DK, padding: "22px 32px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          {svcTag && <div style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.18em", color: BL, marginBottom: 6 }}>{svcTag}</div>}
          <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em", lineHeight: 1 }}>FREIGHT QUOTATION</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: BL, letterSpacing: "0.04em", marginBottom: 2 }}>{qnum}</div>
          <div style={{ fontSize: 10, color: "#94A3B8" }}>Issued {date}</div>
          <div style={{ fontSize: 10, color: "#64748B", marginTop: 5 }}>Luky Slavik · Sales Manager</div>
        </div>
      </div>

      {/* ─ Body ─ */}
      <div style={{ padding: "26px 32px" }}>

        {/* Client + Routing */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 22 }}>
          <Sec title="Prepared for">
            <div style={{ fontSize: 15, fontWeight: 800, color: DK, marginBottom: 4 }}>{q.company || q.customer_name || "—"}</div>
            {(q.contact||q.customer_contact) && <div style={{ fontSize: 11, color: LT, marginBottom: 2 }}>{q.contact||q.customer_contact}</div>}
            {(q.email||q.customer_email)     && <div style={{ fontSize: 11, color: XL }}>{q.email||q.customer_email}</div>}
            {(q.phone||q.customer_phone)     && <div style={{ fontSize: 11, color: XL, marginTop: 2 }}>{q.phone||q.customer_phone}</div>}
          </Sec>
          <Sec title="Shipment routing">
            <div style={{ fontSize: 15, fontWeight: 800, color: DK, marginBottom: 6 }}>
              {q.origin||"—"} <span style={{ color: BL, margin: "0 4px" }}>→</span> {q.dest||q.destination||"—"}
            </div>
            <LV label="Service"  value={svcTag||undefined} />
            <LV label="Incoterm" value={q.incoterm} />
            <LV label="Ready"    value={q.readyDate||q.ready_date} />
            {q.pickup   && <LV label="Pickup"   value={q.pickup} />}
            {q.delivery && <LV label="Delivery" value={q.delivery} />}
          </Sec>
        </div>

        {/* Cargo */}
        <Sec title="Cargo details">
          <table style={{ width: "100%", borderCollapse: "collapse" as const, fontSize: 11 }}>
            <thead>
              <tr style={{ background: BG }}>
                {["Commodity","Packing","Qty","L×W×H (cm)","Weight/pc","Total weight","CBM"].map(h => (
                  <th key={h} style={{ padding: "7px 9px", textAlign: "left" as const, fontSize: 9, fontWeight: 800, color: XL, textTransform: "uppercase" as const, letterSpacing: "0.07em", borderBottom: `1px solid ${BD}`, whiteSpace: "nowrap" as const }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pkgLines.length > 0 ? pkgLines.map((p: any, i: number) => {
                const qq2=parseInt(p.qty)||0; const pw=parseFloat(p.weight)||0;
                const pl=parseFloat(p.length)||0; const pw2=parseFloat(p.width)||0; const ph=parseFloat(p.height)||0;
                const cbmL = qq2*pl*pw2*ph/1000000;
                return (
                  <tr key={i} style={{ borderBottom: `1px solid ${BD}`, background: i%2?BG:"#fff" }}>
                    <td style={{ padding: "7px 9px", fontWeight: 600, color: DK }}>{q.commodity||"—"}</td>
                    <td style={{ padding: "7px 9px", color: LT }}>{p.packType||"—"}</td>
                    <td style={{ padding: "7px 9px", fontWeight: 700, color: DK }}>{p.qty||"—"}</td>
                    <td style={{ padding: "7px 9px", color: LT }}>{pl&&pw2&&ph?`${pl}×${pw2}×${ph}`:"—"}</td>
                    <td style={{ padding: "7px 9px", color: LT }}>{pw?`${pw} kg`:"—"}</td>
                    <td style={{ padding: "7px 9px", fontWeight: 600, color: DK }}>{pw&&qq2?`${(pw*qq2).toFixed(1)} kg`:"—"}</td>
                    <td style={{ padding: "7px 9px", color: LT }}>{cbmL>0?`${cbmL.toFixed(3)} m³`:"—"}</td>
                  </tr>
                );
              }) : (
                <tr style={{ borderBottom: `1px solid ${BD}` }}>
                  <td style={{ padding: "7px 9px", fontWeight: 600, color: DK }}>{q.commodity||"—"}</td>
                  <td style={{ padding: "7px 9px", color: LT }}>—</td>
                  <td style={{ padding: "7px 9px", color: DK }}>{q.totalPkgs||q.packages||"—"}</td>
                  <td style={{ padding: "7px 9px", color: LT }}>—</td>
                  <td style={{ padding: "7px 9px", color: LT }}>—</td>
                  <td style={{ padding: "7px 9px", color: DK }}>{q.totalWeight||q.weight?`${q.totalWeight||q.weight} kg`:"—"}</td>
                  <td style={{ padding: "7px 9px", color: LT }}>{q.totalCBM||q.cbm?`${q.totalCBM||q.cbm} m³`:"—"}</td>
                </tr>
              )}
            </tbody>
            {totalPkgs>0 && (
              <tfoot>
                <tr style={{ background: "#EFF6FF", borderTop: `1.5px solid ${BL}` }}>
                  <td colSpan={2} style={{ padding: "6px 9px", fontSize: 9, fontWeight: 800, color: BL, textTransform: "uppercase" as const, letterSpacing: "0.07em" }}>TOTALS</td>
                  <td style={{ padding: "6px 9px", fontWeight: 800, color: DK }}>{totalPkgs}</td>
                  <td /><td />
                  <td style={{ padding: "6px 9px", fontWeight: 800, color: DK }}>{totalWeight>0?`${totalWeight.toFixed(1)} kg`:"—"}</td>
                  <td style={{ padding: "6px 9px", fontWeight: 800, color: DK }}>{totalCBM>0?`${totalCBM.toFixed(3)} m³`:"—"}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </Sec>

        {/* Selling lines */}
        {sellingLines.length > 0 && (
          <Sec title="Rate offer — selling costs">
            <table style={{ width: "100%", borderCollapse: "collapse" as const, fontSize: 11 }}>
              <thead>
                <tr style={{ background: BG }}>
                  {["Service","Description","Currency","Amount"].map(h => (
                    <th key={h} style={{ padding: "7px 9px", textAlign: "left" as const, fontSize: 9, fontWeight: 800, color: XL, textTransform: "uppercase" as const, letterSpacing: "0.07em", borderBottom: `1px solid ${BD}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sellingLines.map((l: any, i: number) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${BD}`, background: i%2?BG:"#fff" }}>
                    <td style={{ padding: "7px 9px", fontWeight: 600, color: DK }}>{l.type||"—"}</td>
                    <td style={{ padding: "7px 9px", color: LT }}>{l.description||"—"}</td>
                    <td style={{ padding: "7px 9px", color: LT }}>{l.currency||cur}</td>
                    <td style={{ padding: "7px 9px", fontWeight: 700, color: DK, textAlign: "right" as const }}>{parseFloat(l.amount||"0").toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: BL }}>
                  <td colSpan={3} style={{ padding: "9px 9px", fontSize: 11, fontWeight: 800, color: "#fff", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Total</td>
                  <td style={{ padding: "9px 9px", fontSize: 14, fontWeight: 900, color: "#fff", textAlign: "right" as const }}>{totalSelling.toFixed(2)} {cur}</td>
                </tr>
              </tfoot>
            </table>
            {/* Profit and margin intentionally omitted — client-facing document */}
          </Sec>
        )}

        {/* Fallback simple price */}
        {sellingLines.length === 0 && (q.selling||q.selling_price) && (
          <Sec title="Rate offer">
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 14px", background: BL, borderRadius: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>Total selling price</span>
              <span style={{ fontSize: 14, fontWeight: 900, color: "#fff" }}>{q.selling||q.selling_price} {cur}</span>
            </div>
          </Sec>
        )}

        {/* Shipping conditions */}
        {(q.shippingTermsIncludes || q.shippingTermsExcludes || q.notes || q.shipping_terms_notes) && (
          <Sec title={`Shipping conditions${q.shippingTermsType ? " — "+q.shippingTermsType : ""}`}>
            <div style={{ display: "grid", gridTemplateColumns: q.shippingTermsIncludes && q.shippingTermsExcludes ? "1fr 1fr" : "1fr", gap: 12 }}>
              {q.shippingTermsIncludes && (
                <div style={{ border: "1px solid #86EFAC", borderRadius: 7, overflow: "hidden" }}>
                  <div style={{ background: "#F0FDF4", padding: "6px 10px", fontSize: 9, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "#15803D" }}>Includes</div>
                  <div style={{ padding: "8px 10px", fontSize: 10, color: LT, lineHeight: 1.7, whiteSpace: "pre-wrap" as const }}>{q.shippingTermsIncludes}</div>
                </div>
              )}
              {q.shippingTermsExcludes && (
                <div style={{ border: "1px solid #FECACA", borderRadius: 7, overflow: "hidden" }}>
                  <div style={{ background: "#FEF2F2", padding: "6px 10px", fontSize: 9, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "#DC2626" }}>Excludes</div>
                  <div style={{ padding: "8px 10px", fontSize: 10, color: LT, lineHeight: 1.7, whiteSpace: "pre-wrap" as const }}>{q.shippingTermsExcludes}</div>
                </div>
              )}
              {(q.notes||q.shipping_terms_notes) && !q.shippingTermsIncludes && (
                <div style={{ padding: "8px 10px", background: BG, borderRadius: 7, border: `1px solid ${BD}`, fontSize: 10, color: LT, lineHeight: 1.7, whiteSpace: "pre-wrap" as const }}>
                  {q.notes||q.shipping_terms_notes}
                </div>
              )}
            </div>
          </Sec>
        )}

        {/* Footer */}
        <div style={{ paddingTop: 14, borderTop: `1px solid ${BD}`, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 9, color: XL }}>Validity: 14 days from issue · Subject to space &amp; rate availability</div>
            <div style={{ fontSize: 9, color: XL, marginTop: 2 }}>All prices are indicative and subject to final confirmation</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: DK }}>Luky Slavik</div>
            <div style={{ fontSize: 9, color: LT }}>Sales Manager · Freight CRM</div>
          </div>
        </div>

      </div>
    </div>
  );
};
// ─── TRANSPORT SELECTION ──────────────────────────────────────────────────────
const MODES = [
  { id: "air",  label: "Air Freight",  Icon: Plane,  photo: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800&auto=format&fit=crop&q=80", hint: "Fast & reliable — door to door in 2–5 days" },
  { id: "sea",  label: "Sea Freight",  Icon: Ship,   photo: "/msc-irene.jpg", hint: "Cost-effective — FCL & LCL available" },
  { id: "rail", label: "Rail Freight", Icon: Train,  photo: "https://images.unsplash.com/photo-1474487548417-781cb71495f3?w=800&auto=format&fit=crop&q=80", hint: "Europe–Asia corridor — eco-friendly" },
  { id: "road", label: "Road Freight", Icon: Truck,  photo: "https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=800&auto=format&fit=crop&q=80", hint: "Flexible — FTL & LTL across Europe" },
];

const INCOTERMS = ["EXW","FCA","CPT","CIP","DAP","DPU","DDP","FAS","FOB","CFR","CIF"];
const CURRENCIES = ["EUR","USD","CZK","GBP","CHF"];
const SURCHARGE_TYPES = ["FSC – Fuel surcharge","SSC – Security surcharge","Handling","Customs clearance","Delivery","Insurance"];

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
// ─── Inline editable T&C panel (inside quote workflow) ───────────────────────────────────────
function TermConditionEditor({ term, onSaved }: { term: any; onSaved?: () => void }) {
  const [includes, setIncludes] = React.useState(term.includes || "");
  const [excludes, setExcludes] = React.useState(term.excludes || "");
  const [saveState, setSaveState] = React.useState<"idle" | "saving" | "saved">("idle");
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync if term changes (different type selected)
  React.useEffect(() => {
    setIncludes(term.includes || "");
    setExcludes(term.excludes || "");
    setSaveState("idle");
  }, [term.id]);

  const save = React.useCallback((patch: { includes?: string; excludes?: string }) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState("saving");
    saveTimer.current = setTimeout(() => {
      apiRequest("PATCH", `/api/terms-conditions/${term.id}`, patch)
        .then(() => { setSaveState("saved"); onSaved?.(); setTimeout(() => setSaveState("idle"), 2000); })
        .catch(() => setSaveState("idle"));
    }, 600);
  }, [term.id]);

  const borderGreen = "#86EFAC";
  const borderRed   = "#FECACA";

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: 10, marginTop: 4 }}>
      {/* Save indicator */}
      {saveState !== "idle" && (
        <div style={{ fontSize: 11, color: saveState === "saved" ? C.green : C.textLight, display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
          {saveState === "saving" ? "Saving…" : <><Check style={{ width: 11, height: 11 }} /> Saved to T&amp;C</>}
        </div>
      )}

      {/* Rate offer includes */}
      <div style={{ border: `1px solid ${borderGreen}`, borderRadius: 9, overflow: "hidden" }}>
        <div style={{ padding: "8px 14px", background: C.greenL, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.green, flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "#15803D", textTransform: "uppercase" as const, letterSpacing: "0.07em" }}>Rate offer includes</span>
        </div>
        <textarea
          value={includes}
          onChange={e => { setIncludes(e.target.value); save({ includes: e.target.value, excludes }); }}
          placeholder="Enter what is included in the rate offer…"
          rows={6}
          style={{ width: "100%", padding: "10px 14px", fontSize: 12, border: "none", outline: "none", resize: "vertical" as const, fontFamily: "inherit", boxSizing: "border-box" as const, color: C.text, background: C.surface, lineHeight: 1.7 }}
        />
      </div>

      {/* Rate offer excludes */}
      <div style={{ border: `1px solid ${borderRed}`, borderRadius: 9, overflow: "hidden" }}>
        <div style={{ padding: "8px 14px", background: "#FEF2F2", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.red, flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "#DC2626", textTransform: "uppercase" as const, letterSpacing: "0.07em" }}>Rate offer excludes</span>
        </div>
        <textarea
          value={excludes}
          onChange={e => { setExcludes(e.target.value); save({ includes, excludes: e.target.value }); }}
          placeholder="Enter what is excluded from the rate offer…"
          rows={6}
          style={{ width: "100%", padding: "10px 14px", fontSize: 12, border: "none", outline: "none", resize: "vertical" as const, fontFamily: "inherit", boxSizing: "border-box" as const, color: C.text, background: C.surface, lineHeight: 1.7 }}
        />
      </div>
    </div>
  );
}

export default function NewQuoteWorkflow({ onBack, quoteNum: quoteNumProp, onSwitchQuote }: { onBack?: () => void; quoteNum?: string; onSwitchQuote?: (ref: string) => void } = {}) {
  // No transport pre-selection — go straight to the form
  const selectedMode = MODES[0]; // Generic stub; mode label/icon not shown in UI

  // Use prop if provided (passed from SalesPage), otherwise generate locally
  // Quote number is always passed from the parent (SalesPage → NewQuoteSection → here)
  const quoteNum = quoteNumProp || "";

  // Accordion open state
  const [openSec, setOpenSec] = useState<number | null>(null);
  // customerKey: bumping this remounts CustomerSection, forcing fresh CRM lookup
  const [customerKey, setCustomerKey] = useState(0);

  // ── Form state ──
  const [customer, setCustomer] = useState({ company: "", contact: "", email: "", phone: "" });
  const [shipment, setShipment] = useState({ direction: "Export", incoterm: "", readyDate: "", serviceType: "" });
  const [routing, setRouting]   = useState({ origin: "", dest: "", pickup: "", delivery: "", transit: "" });
  const [validityDate, setValidityDate] = useState("");
  const [cargo, setCargo]       = useState({
    commodity: "", stackable: false, dangerous: false,
    packages: [emptyPkg()] as PkgLine[],
  });
  const [pricing, setPricing] = useState({ buying: "", selling: "", currency: "EUR", additionalCosts: "", validUntil: "" });
  const [surcharges, setSurcharges] = useState<{ type: string; amount: string }[]>([]);
  const [shippingTerms, setShippingTerms] = useState({ termsType: "", notes: "" });
  const [buyingLines, setBuyingLines] = useState<BuyingLine[]>([]);
  const [sellingLines, setSellingLines] = useState<SellingLine[]>([]);

  // ── DB record for this quote (fetch by reference) ──
  const { data: dbQuote } = useQuery<any>({
    queryKey: ["/api/sales-quotes", quoteNum],
    queryFn: () => apiRequest("GET", "/api/sales-quotes").then(r => r.json()).then((list: any[]) => list.find(q => q.reference === quoteNum) ?? null),
    enabled: !!quoteNum,
    staleTime: 60000,
  });

  // ── Auto-save debounce ──
  // Use a ref for dbId so autoSave always sees the latest value without
  // needing to be recreated (avoids stale closure on useCallback).
  const dbIdRef = useRef<number | null>(null);
  useEffect(() => { dbIdRef.current = dbQuote?.id ?? null; }, [dbQuote]);

  // ── Quote lifecycle state (derived from DB, locally overridable) ──
  const [quoteStatus, setQuoteStatus] = useState<QuoteStatus>("draft");
  const [quoteTimeline, setQuoteTimeline] = useState<any[]>([]);
  const [quoteValidityDays, setQuoteValidityDays] = useState(15);
  const [quoteSentAt, setQuoteSentAt] = useState<number | null>(null);
  const [quoteWinProb, setQuoteWinProb] = useState(10);
  const [quoteLostReason, setQuoteLostReason] = useState("");
  const [quoteSubstatus, setQuoteSubstatus] = useState("");

  useEffect(() => {
    if (!dbQuote) return;
    setQuoteStatus((dbQuote.quote_status as QuoteStatus) || "draft");
    try { setQuoteTimeline(JSON.parse(dbQuote.status_timeline_json || "[]")); } catch { setQuoteTimeline([]); }
    setQuoteValidityDays(dbQuote.validity_days ?? 15);
    setQuoteSentAt(dbQuote.sent_at ?? null);
    setQuoteWinProb(dbQuote.win_probability ?? 10);
    setQuoteLostReason(dbQuote.lost_reason ?? "");
    setQuoteSubstatus(dbQuote.substatus ?? "");
  }, [dbQuote]);

  function handleStatusChange(newStatus: QuoteStatus, row: any) {
    setQuoteStatus(newStatus);
    try { setQuoteTimeline(JSON.parse(row.status_timeline_json || "[]")); } catch {}
    setQuoteValidityDays(row.validity_days ?? 15);
    setQuoteSentAt(row.sent_at ?? null);
    setQuoteWinProb(row.win_probability ?? 10);
    setQuoteLostReason(row.lost_reason ?? "");
    setQuoteSubstatus(row.substatus ?? "");
  }

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestPatchRef = useRef<Record<string, any>>({});

  const doSave = useCallback((patch: Record<string, any>) => {
    const id = dbIdRef.current;
    if (!id) return;
    apiRequest("PATCH", `/api/sales-quotes/${id}`, patch)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/sales-quotes"] });
        setSaveState("saved");
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSaveState("idle"), 2000);
      })
      .catch(() => setSaveState("idle"));
  }, []);

  const autoSave = useCallback((patch: Record<string, any>) => {
    if (!dbIdRef.current) return;
    latestPatchRef.current = { ...latestPatchRef.current, ...patch };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState("saving");
    saveTimer.current = setTimeout(() => doSave(latestPatchRef.current), 600);
  }, [doSave]);

  // Pre-fill form from DB once data arrives
  // ‘prefilled’ = DB record has loaded and state has been hydrated.
  // We set it to true as soon as dbQuote resolves (even if empty) so that
  // subsequent user input is immediately eligible for autoSave.
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    if (!dbQuote || prefilled) return;
    setPrefilled(true);

    // If this quote already has data, start with all accordions collapsed
    // so completed sections don’t re-expand on every re-open
    const hasExistingData = !!(dbQuote.customer_name || dbQuote.origin || dbQuote.commodity || dbQuote.incoterm);
    if (hasExistingData) {
      setOpenSec(null);
    }

    // Customer
    if (dbQuote.customer_name || dbQuote.customer_email || dbQuote.customer_contact || dbQuote.customer_phone) {
      setCustomer({ company: dbQuote.customer_name || "", contact: dbQuote.customer_contact || "", email: dbQuote.customer_email || "", phone: dbQuote.customer_phone || "" });
    }
    // Shipment
    if (dbQuote.direction || dbQuote.incoterm || dbQuote.ready_date || dbQuote.service_type) {
      setShipment({ direction: dbQuote.direction || "Export", incoterm: dbQuote.incoterm || "", readyDate: dbQuote.ready_date || "", serviceType: dbQuote.service_type || "" });
    }
    // Routing (always restore so transit is never lost)
    setRouting({ origin: dbQuote.origin || "", dest: dbQuote.destination || "", pickup: dbQuote.pickup || "", delivery: dbQuote.delivery || "", transit: dbQuote.transit || "" });
    setValidityDate(dbQuote.validity_date || "");
    // Cargo — restore full packages array from JSON if available, fall back to legacy
    const savedPkgs = (() => {
      try { const p = JSON.parse(dbQuote.packages_json || "[]"); return Array.isArray(p) && p.length > 0 ? p : null; } catch { return null; }
    })();
    setCargo(c => ({
      ...c,
      commodity: dbQuote.commodity || c.commodity,
      stackable:  !!dbQuote.stackable,
      dangerous:  !!dbQuote.dangerous,
      packages: savedPkgs ?? (dbQuote.packages ? [{ qty: dbQuote.packages, length: "", width: "", height: "", weight: dbQuote.weight || "" }] : c.packages),
    }));
    // Pricing
    if (dbQuote.buying_price || dbQuote.selling_price || dbQuote.currency) {
      setPricing({ buying: dbQuote.buying_price || "", selling: dbQuote.selling_price || "", currency: dbQuote.currency || "EUR", additionalCosts: dbQuote.additional_costs || "", validUntil: "" });
    }
    // Buying lines
    const savedBuying = (() => {
      try { const b = JSON.parse(dbQuote.buying_lines_json || "[]"); return Array.isArray(b) ? b : []; } catch { return []; }
    })();
    if (savedBuying.length > 0) setBuyingLines(savedBuying);
    // Selling lines
    const savedSelling = (() => {
      try { const s = JSON.parse(dbQuote.selling_lines_json || "[]"); return Array.isArray(s) ? s : []; } catch { return []; }
    })();
    if (savedSelling.length > 0) setSellingLines(savedSelling);
    // Shipping terms
    if (dbQuote.shipping_terms || dbQuote.shipping_terms_notes) {
      setShippingTerms({ termsType: dbQuote.shipping_terms || "", notes: dbQuote.shipping_terms_notes || "" });
    }
  }, [dbQuote, prefilled]);

  // Flush immediately on unmount (navigation away)
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const id = dbIdRef.current;
      if (id && Object.keys(latestPatchRef.current).length > 0) {
        apiRequest("PATCH", `/api/sales-quotes/${id}`, latestPatchRef.current).catch(() => {});
      }
    };
  }, []);

  // Watch each section and auto-save on change
  useEffect(() => {
    if (!prefilled) return;
    autoSave({ customer_name: customer.company, customer_contact: customer.contact, customer_email: customer.email, customer_phone: customer.phone });
  }, [customer, prefilled]);

  useEffect(() => {
    if (!prefilled) return;
    autoSave({ direction: shipment.direction, incoterm: shipment.incoterm, ready_date: shipment.readyDate, service_type: shipment.serviceType });
  }, [shipment, prefilled]);

  useEffect(() => {
    if (!prefilled) return;
    autoSave({ origin: routing.origin, destination: routing.dest, pickup: routing.pickup, delivery: routing.delivery, transit: routing.transit });
  }, [routing, prefilled]);

  useEffect(() => {
    if (!prefilled) return;
    // Compute totals inline to avoid stale closure on derived values
    const pkgs = cargo.packages;
    const tPkgs = pkgs.reduce((s, p) => s + (parseInt(p.qty) || 0), 0);
    const tWeight = pkgs.reduce((s, p) => s + (parseFloat(p.weight) || 0) * (parseInt(p.qty) || 1), 0);
    const tCBM = pkgs.reduce((s, p) => {
      const q = parseInt(p.qty) || 1;
      return s + q * (parseFloat(p.length)||0) * (parseFloat(p.width)||0) * (parseFloat(p.height)||0) / 1000000;
    }, 0);
    autoSave({
      packages_json: JSON.stringify(pkgs),
      commodity: cargo.commodity,
      packages: String(tPkgs || ""),
      weight: tWeight > 0 ? tWeight.toFixed(1) : "",
      cbm: tCBM > 0 ? tCBM.toFixed(3) : "",
      stackable: cargo.stackable ? 1 : 0,
      dangerous: cargo.dangerous ? 1 : 0,
    });
  }, [cargo, prefilled]);

  useEffect(() => {
    if (!prefilled) return;
    autoSave({ buying_price: pricing.buying, selling_price: pricing.selling, currency: pricing.currency, additional_costs: pricing.additionalCosts });
  }, [pricing, prefilled]);

  useEffect(() => {
    if (!prefilled) return;
    autoSave({ buying_lines_json: JSON.stringify(buyingLines) });
  }, [buyingLines, prefilled]);

  useEffect(() => {
    if (!prefilled) return;
    autoSave({ selling_lines_json: JSON.stringify(sellingLines) });
  }, [sellingLines, prefilled]);

  useEffect(() => {
    if (!prefilled) return;
    autoSave({ shipping_terms: shippingTerms.termsType, shipping_terms_notes: shippingTerms.notes, validity_date: validityDate });
  }, [shippingTerms, validityDate, prefilled]);

  const [quickActionOpen, setQuickActionOpen] = useState(false);
  const quickActionRef = useRef<HTMLDivElement>(null);
  // Close dropdown on outside click
  useEffect(() => {
    if (!quickActionOpen) return;
    const handler = (e: MouseEvent) => {
      if (quickActionRef.current && !quickActionRef.current.contains(e.target as Node)) {
        setQuickActionOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [quickActionOpen]);

  // ── Modals ──
  const [modal, setModal] = useState<"import" | "copyQuote" | "copyShipment" | "copyPricing" | "duplicateQuote" | "preview" | "email" | null>(null);
  // Which quote reference is currently being previewed (defaults to current quote)
  const [previewRef, setPreviewRef] = useState<string>("");

  // Duplicate quote section selection
  const DUPE_SECTIONS = [
    { id: "customer",  label: "Customer details" },
    { id: "shipment",  label: "Shipment details" },
    { id: "routing",   label: "Routing" },
    { id: "cargo",     label: "Cargo details" },
    { id: "pricing",   label: "Pricing" },
    { id: "shipping",  label: "Shipping terms" },
  ] as const;
  type DupeSection = typeof DUPE_SECTIONS[number]["id"];
  const [dupeSections, setDupeSections] = useState<Set<DupeSection>>(new Set(DUPE_SECTIONS.map(s => s.id)));
  const [dupeSourceRef, setDupeSourceRef] = useState("");
  const [dupeSearch, setDupeSearch] = useState("");
  const [dupeSelectedQ, setDupeSelectedQ] = useState<any>(null);
  const [dupeMode, setDupeMode] = useState<"current" | "old" | null>(null);

  // Snapshot of the current quote's state as a plain object (same shape as DB row)
  const currentQuoteSnapshot = () => ({
    customer_name:        customer.company,
    customer_contact:     customer.contact,
    customer_email:       customer.email,
    customer_phone:       customer.phone,
    direction:            shipment.direction,
    service_type:         shipment.serviceType,
    incoterm:             shipment.incoterm,
    ready_date:           shipment.readyDate,
    origin:               routing.origin,
    destination:          routing.dest,
    pickup:               routing.pickup,
    delivery:             routing.delivery,
    transit:              routing.transit,
    commodity:            cargo.commodity,
    stackable:            cargo.stackable ? 1 : 0,
    dangerous:            cargo.dangerous ? 1 : 0,
    packages_json:        JSON.stringify(cargo.packages),
    buying_lines_json:    JSON.stringify(buyingLines),
    selling_lines_json:   JSON.stringify(sellingLines),
    shipping_terms:       shippingTerms.termsType,
    shipping_terms_notes: shippingTerms.notes,
    reference:            quoteNum + " (current)",
  });

  const [dupeCreating, setDupeCreating] = useState(false);
  const [dupeError, setDupeError] = useState("");

  const applyDuplicate = async (sourceQ: any, sections: Set<DupeSection>) => {
    setDupeCreating(true);
    setDupeError("");
    try {
      // Build the data payload — only include sections that were selected
      const data: Record<string, any> = { method: "duplicate" };

      if (sections.has("customer")) {
        data.customer_name    = sourceQ.customer_name    || "";
        data.customer_contact = sourceQ.customer_contact || "";
        data.customer_email   = sourceQ.customer_email   || "";
        data.customer_phone   = sourceQ.customer_phone   || "";
      }
      if (sections.has("shipment")) {
        data.direction    = sourceQ.direction   || "";
        data.service_type = sourceQ.service_type || "";
        data.incoterm     = sourceQ.incoterm     || "";
        data.ready_date   = sourceQ.ready_date   || "";
      }
      if (sections.has("routing")) {
        data.origin      = sourceQ.origin      || "";
        data.destination = sourceQ.destination || "";
        data.pickup      = sourceQ.pickup      || "";
        data.delivery    = sourceQ.delivery    || "";
        data.transit     = sourceQ.transit     || "";
      }
      if (sections.has("cargo")) {
        data.commodity    = sourceQ.commodity    || "";
        data.stackable    = sourceQ.stackable    ?? 0;
        data.dangerous    = sourceQ.dangerous    ?? 0;
        data.packages_json = sourceQ.packages_json || "[]";
        data.packages     = sourceQ.packages     || "";
        data.weight       = sourceQ.weight       || "";
        data.cbm          = sourceQ.cbm          || "";
      }
      if (sections.has("pricing")) {
        data.buying_lines_json  = sourceQ.buying_lines_json  || "[]";
        data.selling_lines_json = sourceQ.selling_lines_json || "[]";
      }
      if (sections.has("shipping")) {
        data.shipping_terms       = sourceQ.shipping_terms       || "";
        data.shipping_terms_notes = sourceQ.shipping_terms_notes || "";
      }

      // Always use the ROOT reference (strip any -N suffix) so duplicates are
      // always siblings: QCZ...037, QCZ...037-2, QCZ...037-3 — never QCZ...037-2-2
      const rootRef = quoteNum.replace(/-\d+$/, "");
      const resp = await apiRequest("POST", "/api/sales-quotes/duplicate", {
        baseRef: rootRef,
        data,
      });
      if (!resp.ok) {
        const e = await resp.json();
        throw new Error(e.error || "Failed to create duplicate");
      }
      const newQuote = await resp.json();
      queryClient.invalidateQueries({ queryKey: ["/api/sales-quotes"] });

      // Close modal and navigate to the new quote
      setModal(null);
      setDupeSearch("");
      setDupeSelectedQ(null);
      setDupeMode(null);
      // Open the new quote via the parent's onOpenQuote handler if available
      if (onBack) {
        // We're inside SalesPage — call back to open the new quote
        // Use a small timeout so the modal fully closes first
        setTimeout(() => {
          if ((window as any).__openQuote) (window as any).__openQuote(newQuote.reference);
        }, 100);
      }
    } catch (err: any) {
      setDupeError(err.message || "Error creating duplicate");
    } finally {
      setDupeCreating(false);
    }
  };
  const [emailTo, setEmailTo]   = useState("");
  const [emailCC, setEmailCC]   = useState("");
  const [emailMsg, setEmailMsg] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [importText, setImportText] = useState("");
  const [importParsing, setImportParsing] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [copySearch, setCopySearch] = useState("");

  // ── Auto-calculations ──
  const totalPkgs = cargo.packages.reduce((s, p) => s + (parseInt(p.qty) || 0), 0);
  const totalWeight = cargo.packages.reduce((s, p) => s + (parseFloat(p.weight) || 0) * (parseInt(p.qty) || 1), 0);
  const totalCBM = cargo.packages.reduce((s, p) => {
    const qty = parseInt(p.qty) || 1;
    return s + qty * (parseFloat(p.length) || 0) * (parseFloat(p.width) || 0) * (parseFloat(p.height) || 0) / 1000000;
  }, 0);
  const volWeight = totalCBM * 1000000 / 6000; // Air formula
  const chargeableWeight = Math.max(totalWeight, volWeight);
  // Cost breakdown totals
  const totalBuying = buyingLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const totalSelling = sellingLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  // Use breakdown totals if lines exist, otherwise fall back to legacy single fields
  const effectiveBuying = buyingLines.length > 0 ? totalBuying : parseFloat(pricing.buying || "0");
  const effectiveSelling = sellingLines.length > 0 ? totalSelling : parseFloat(pricing.selling || "0");
  const profit = effectiveSelling - effectiveBuying;
  const margin = effectiveSelling > 0
    ? ((profit / effectiveSelling) * 100).toFixed(1) : "0.0";
  const totalSurcharges = surcharges.reduce((s, sc) => s + (parseFloat(sc.amount) || 0), 0);

  // ── Section status ──
  const sStatus = useCallback((sec: number): SectionStatus => {
    if (sec === 1) return customer.company ? "completed" : customer.email || customer.contact ? "in-progress" : "empty";
    if (sec === 2) return shipment.direction && shipment.incoterm && shipment.readyDate && shipment.serviceType ? "completed" : shipment.incoterm || shipment.readyDate || shipment.serviceType ? "in-progress" : "empty";
    if (sec === 3) return routing.origin && routing.dest ? "completed" : routing.origin || routing.dest ? "in-progress" : "empty";
    if (sec === 4) return cargo.commodity && totalPkgs > 0 ? "completed" : cargo.commodity || totalPkgs > 0 ? "in-progress" : "empty";
    if (sec === 5) {
      const hasBuying = buyingLines.length > 0 || !!pricing.buying;
      const hasSelling = sellingLines.length > 0 || !!pricing.selling;
      return hasBuying && hasSelling ? "completed" : hasBuying || hasSelling ? "in-progress" : "empty";
    }
    if (sec === 6) return shippingTerms.termsType ? "completed" : "empty";
    return "empty";
  }, [customer, shipment, routing, cargo, pricing, totalPkgs, shippingTerms, buyingLines, sellingLines]);

  const toggleSec = (n: number) => setOpenSec(prev => prev === n ? null : n);

  // ── Import inquiry parsing — real text extraction ──
  const parseImport = () => {
    setImportParsing(true);
    setTimeout(() => {
      setImportParsing(false);
      const t = importText;

      const find = (patterns: RegExp[]): string => {
        for (const p of patterns) { const m = t.match(p); if (m?.[1]) return m[1].trim(); }
        return "";
      };

      // ── STEP 1: Extract dates FIRST so they can’t bleed into other fields ──
      // Matches: "cargo ready date 15.05", "ready: 2026-05-15", "readiness 15/05/26" etc.
      const dateMatch =
        t.match(/(?:cargo\s*ready(?:\s*date)?|ready\s*date|readiness\s*date|ready)[^\n]{0,30}?(\d{4}[\-\/]\d{1,2}[\-\/]\d{1,2})/i) ||
        t.match(/(?:cargo\s*ready(?:\s*date)?|ready\s*date|readiness\s*date|ready)[^\n]{0,30}?(\d{1,2}[\.\/\-]\d{1,2}[\.\/\-]\d{2,4})/i) ||
        t.match(/(\d{4}-\d{2}-\d{2})/);  // ISO fallback only — not partial dates
      let readyDate = "";
      if (dateMatch?.[1]) {
        const raw = dateMatch[1];
        const parts = raw.split(/[.\/\-]/);
        if (parts.length === 3) {
          if (parts[0].length === 4) {
            readyDate = `${parts[0]}-${parts[1].padStart(2,"0")}-${parts[2].padStart(2,"0")}`;
          } else if (parts[2].length === 4) {
            readyDate = `${parts[2]}-${parts[1].padStart(2,"0")}-${parts[0].padStart(2,"0")}`;
          } else {
            const y = parseInt(parts[2]) + (parseInt(parts[2]) < 50 ? 2000 : 1900);
            readyDate = `${y}-${parts[1].padStart(2,"0")}-${parts[0].padStart(2,"0")}`;
          }
        }
      }

      // Remove the date context from the text before extracting commodity
      // (prevents "ready date 15.05" being captured as commodity)
      const tNoDates = t.replace(
        /(?:cargo\s*ready(?:\s*date)?|ready\s*date|readiness\s*date)[^\n]*/gi,
        ""
      );

      // ── STEP 2: Company / Customer ──
      const company = find([
        /(?:customer|client|shipper|consignee|company)[:\s]+([^\n,;]+)/i,
        /^([A-Z][\w\s\.]+(?:s\.r\.o\.|a\.s\.|GmbH|Ltd|LLC|Inc|Corp|Co\.))/m,
      ]);

      // ── STEP 3: Contact / email / phone ──
      const contact = find([/(?:contact|attn|attention|person)[:\s]+([^\n,<]+)/i]);
      const emailM = t.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
      const email = emailM ? emailM[0] : "";
      const phone = find([/(?:phone|tel|mob(?:ile)?)[:\s]+([+\d\s()\-]{7,})/i]);

      // ── STEP 4: Service type ──
      // Match compound phrases first (AIR IMPORT, FCL EXPORT etc.), then bare words
      const svcDirMatch = t.match(/\b(AIR|SEA|OCEAN|ROAD|RAIL|FCL|LCL)\s+(IMPORT|EXPORT)\b/i);
      const svcMatch    = !svcDirMatch ? t.match(/\b(AIR|SEA|OCEAN|ROAD|RAIL|FCL|LCL)\b/i) : null;
      let serviceType = "";
      if (svcDirMatch) {
        const s = svcDirMatch[1].toUpperCase();
        if (s === "AIR") serviceType = "AIR";
        else if (["SEA","OCEAN","FCL","LCL"].includes(s)) serviceType = "SEA";
        else if (s === "ROAD") serviceType = "ROAD";
        else if (s === "RAIL") serviceType = "RAIL";
      } else if (svcMatch) {
        const s = svcMatch[1].toUpperCase();
        if (s === "AIR") serviceType = "AIR";
        else if (["SEA","OCEAN","FCL","LCL"].includes(s)) serviceType = "SEA";
        else if (s === "ROAD") serviceType = "ROAD";
        else if (s === "RAIL") serviceType = "RAIL";
      }

      // ── STEP 5: Direction (prefer compound match from above) ──
      let direction = "";
      if (svcDirMatch) {
        direction = svcDirMatch[2].charAt(0).toUpperCase() + svcDirMatch[2].slice(1).toLowerCase();
      } else {
        const dirM = t.match(/\b(import|export)\b/i);
        if (dirM) direction = dirM[1].charAt(0).toUpperCase() + dirM[1].slice(1).toLowerCase();
      }

      // ── STEP 6: Origin / Destination ──
      const origin = find([
        /(?:origin|from|pol|place\s+of\s+loading|loading\s+port|departure)[:\s]+([^\n,\-\u2192>]+)/i,
        /([A-Z][\w\s,]+)\s*(?:\u2192|->)\s*[A-Z]/,
      ]).replace(/[\u2192>]/g,"").trim();

      const dest = find([
        /(?:destination|to|pod|place\s+of\s+unloading|discharge\s+port|arrival|delivery)[:\s]+([^\n,\-\u2192>]+)/i,
        /(?:\u2192|->|\bto\b\s+)([A-Z][\w\s,]+)/i,
      ]).replace(/[\u2192>]/g,"").trim();

      // ── STEP 7: Incoterm ──
      const INCO = ["EXW","FCA","FAS","FOB","CFR","CIF","CPT","CIP","DAP","DPU","DDP"];
      let incoterm = "";
      // Try labelled first
      const incoLabelM = tNoDates.match(/(?:incoterm|terms?)[:\s]+([A-Z]{3})\b/i);
      if (incoLabelM && INCO.includes(incoLabelM[1].toUpperCase())) {
        incoterm = incoLabelM[1].toUpperCase();
      } else {
        for (const inc of INCO) { if (new RegExp(`\\b${inc}\\b`).test(t)) { incoterm = inc; break; } }
      }

      // ── STEP 8: Commodity (use date-stripped text) ──
      const commodity = find([
        /(?:commodity|goods|cargo\s+description|cargo|product|item)[:\s]+([^\n,;\d][^\n,;]{1,80})/i,
      ]).replace(/\d{1,2}[\.\/]\d{1,2}.*$/,"").trim(); // strip any trailing date fragments

      // ── STEP 9: Weight ──
      const weightM = t.match(/(\d+(?:[,.]\d+)?)\s*(?:kg|kgs|kilogram)/i);
      const weight = weightM ? weightM[1].replace(",",".") : "";

      // ── STEP 10: CBM ──
      const cbmM = t.match(/(\d+(?:[,.]\d+)?)\s*(?:cbm|m3|m\u00b3)/i);
      const cbm = cbmM ? cbmM[1].replace(",",".") : "";

      // ── STEP 11: Pieces / packages ──
      const pkgsM =
        t.match(/(?:pieces?|pcs|qty|quantity|count|loading\s+pieces?|number\s+of[^:]{0,10})[:\s]+(\d+)/i) ||
        t.match(/(\d+)\s*(?:pkg|pkgs|pcs|pieces?|pallets?|cartons?|boxes?|ctns?|colli)\b/i) ||
        t.match(/(?:packages?|units?)[:\s]+(\d+)/i);
      const pkgs = pkgsM ? pkgsM[1] : "";

      // ── STEP 12: Packing type ──
      const packTypeM = t.match(/\b(pallets?|cartons?|boxes?|colli|wooden\s+boxes?|crates?|drums?|bags?)\b/i);
      let packType = "";
      if (packTypeM) {
        const pt = packTypeM[1].toLowerCase();
        if (/pallet/.test(pt)) packType = "Pallets";
        else if (/carton/.test(pt)) packType = "Cartons";
        else if (/wooden\s+box|crate/.test(pt)) packType = "Wooden boxes";
        else if (/box/.test(pt)) packType = "Boxes";
        else if (/colli/.test(pt)) packType = "Colli";
      }

      // ── STEP 13: Dimensions LxWxH ──
      const dimM = t.match(/(\d+(?:[,.]\d+)?)\s*[xX\u00d7]\s*(\d+(?:[,.]\d+)?)\s*[xX\u00d7]\s*(\d+(?:[,.]\d+)?)/);

      setImportResult({
        company, contact, email, phone,
        serviceType, direction,
        origin, dest,
        incoterm, readyDate,
        commodity,
        weight, cbm,
        pkgs, packType,
        dimL: dimM?.[1] || "", dimW: dimM?.[2] || "", dimH: dimM?.[3] || "",
      });
    }, 400);
  };

  const applyImport = () => {
    if (!importResult) return;
    // Apply customer — bump customerKey to force CustomerSection to remount
    // so the CRM restore useEffect runs fresh and fetches contact details
    if (importResult.company) {
      setCustomer(p => ({
        ...p,
        company:  importResult.company,
        contact:  importResult.contact || p.contact,
        email:    importResult.email   || p.email,
        phone:    importResult.phone   || p.phone,
      }));
      setCustomerKey(k => k + 1); // force CustomerSection remount → triggers CRM lookup
    }
    // Shipment details
    setShipment(p => ({
      ...p,
      direction:   importResult.direction   || p.direction,
      serviceType: importResult.serviceType || p.serviceType,
      incoterm:    importResult.incoterm    || p.incoterm,
      readyDate:   importResult.readyDate   || p.readyDate,
    }));
    // Routing
    if (importResult.origin || importResult.dest)
      setRouting(p => ({ ...p, origin: importResult.origin || p.origin, dest: importResult.dest || p.dest }));
    // Cargo
    const hasCargo = importResult.commodity || importResult.pkgs || importResult.weight || importResult.dimL;
    if (hasCargo)
      setCargo(p => ({
        ...p,
        commodity: importResult.commodity || p.commodity,
        packages: importResult.pkgs || importResult.weight || importResult.dimL
          ? [{
              qty:      importResult.pkgs  || "1",
              packType: importResult.packType || "",
              length:   importResult.dimL  || "",
              width:    importResult.dimW  || "",
              height:   importResult.dimH  || "",
              weight:   importResult.weight || "",
              stackable: "",
            }]
          : p.packages,
      }));
    setModal(null); setImportResult(null); setImportText("");
    setOpenSec(null);
  };

  // ── Copy from quote — fetch real quotes ──
  const { data: allQuotes = [] } = useQuery<any[]>({
    queryKey: ["/api/sales-quotes"],
    queryFn: () => apiRequest("GET", "/api/sales-quotes").then(r => r.json()),
    staleTime: 0,  // always fresh — ensures new duplicates appear in linked tabs immediately
  });

  // ── Linked quotes (same base reference family) ──
  // Base ref = strip any trailing "-N" suffix (e.g. QCZ...-2 → QCZ...)
  const baseRef = quoteNum.replace(/-\d+$/, "");
  const linkedQuotes: any[] = allQuotes
    .filter((q: any) => {
      const qBase = q.reference.replace(/-\d+$/, "");
      return qBase === baseRef;
    })
    .sort((a: any, b: any) => {
      // Sort: base first, then -2, -3...
      const numA = parseInt(a.reference.match(/-(\d+)$/)?.[1] || "1");
      const numB = parseInt(b.reference.match(/-(\d+)$/)?.[1] || "1");
      return numA - numB;
    });

  // ── Terms & Conditions lookup ──
  // staleTime: 0 ensures the list always reflects the latest entries from T&C module
  const { data: allTerms = [] } = useQuery<any[]>({
    queryKey: ["/api/terms-conditions"],
    queryFn: () => apiRequest("GET", "/api/terms-conditions").then(r => r.json()),
    staleTime: 0,
  });
  // Dynamically pulled from the Terms & Conditions database — always in sync
  const SHIPPING_TERMS_OPTS = allTerms.length > 0
    ? allTerms.map((t: any) => t.name)
    : ["AIR IMPORT", "AIR EXPORT", "FCL IMPORT", "FCL EXPORT", "LCL IMPORT", "LCL EXPORT"];
  const matchedTerm = allTerms.find((t: any) =>
    t.name.toLowerCase() === shippingTerms.termsType.toLowerCase()
  ) ?? null;

  // ── Copy from shipment — fetch real shipments ──
  const { data: allShipments = [] } = useQuery<any[]>({
    queryKey: ["/api/shipments"],
    queryFn: () => apiRequest("GET", "/api/shipments").then(r => r.json()),
    staleTime: 30000,
  });

  const copyFromQuote = (q: any) => {
    if (q.customer_name) setCustomer({ company: q.customer_name || "", contact: q.customer_contact || "", email: q.customer_email || "", phone: q.customer_phone || "" });
    setShipment(p => ({ ...p, direction: q.direction || p.direction, incoterm: q.incoterm || p.incoterm, readyDate: q.ready_date || p.readyDate, serviceType: q.service_type || p.serviceType }));
    setRouting(p => ({ ...p, origin: q.origin || p.origin, dest: q.destination || p.dest, pickup: q.pickup || p.pickup, delivery: q.delivery || p.delivery, transit: q.transit || p.transit }));
    const savedPkgs = (() => { try { const p = JSON.parse(q.packages_json || "[]"); return Array.isArray(p) && p.length > 0 ? p : null; } catch { return null; } })();
    if (savedPkgs || q.commodity) setCargo(p => ({ ...p, commodity: q.commodity || p.commodity, packages: savedPkgs || p.packages }));
    const savedBuying = (() => { try { const b = JSON.parse(q.buying_lines_json || "[]"); return Array.isArray(b) && b.length > 0 ? b : null; } catch { return null; } })();
    const savedSelling = (() => { try { const s = JSON.parse(q.selling_lines_json || "[]"); return Array.isArray(s) && s.length > 0 ? s : null; } catch { return null; } })();
    if (savedBuying) setBuyingLines(savedBuying.map((l: any) => ({ ...l, id: Math.random().toString(36).slice(2) })));
    if (savedSelling) setSellingLines(savedSelling.map((l: any) => ({ ...l, id: Math.random().toString(36).slice(2) })));
    if (q.shipping_terms) setShippingTerms({ termsType: q.shipping_terms || "", notes: q.shipping_terms_notes || "" });
    setModal(null); setCopySearch(""); setOpenSec(null);
  };

  const copyPricingFromQuote = (q: any) => {
    const savedBuying = (() => { try { const b = JSON.parse(q.buying_lines_json || "[]"); return Array.isArray(b) && b.length > 0 ? b : null; } catch { return null; } })();
    const savedSelling = (() => { try { const s = JSON.parse(q.selling_lines_json || "[]"); return Array.isArray(s) && s.length > 0 ? s : null; } catch { return null; } })();
    if (savedBuying) setBuyingLines(savedBuying.map((l: any) => ({ ...l, id: Math.random().toString(36).slice(2) })));
    if (savedSelling) setSellingLines(savedSelling.map((l: any) => ({ ...l, id: Math.random().toString(36).slice(2) })));
    setModal(null); setCopySearch("");
  };

  const copyFromShipment = (s: any) => {
    if (s.customerName || s.customer_name) setCustomer(p => ({ ...p, company: s.customerName || s.customer_name || p.company }));
    setShipment(p => ({ ...p, direction: s.direction || s.type || p.direction, incoterm: s.incoterm || p.incoterm }));
    setRouting(p => ({ ...p, origin: s.origin || s.pol || p.origin, dest: s.destination || s.pod || p.dest }));
    if (s.commodity || s.description) setCargo(p => ({ ...p, commodity: s.commodity || s.description || p.commodity }));
    setModal(null); setCopySearch(""); setOpenSec(null);
  };

  // ── Quoted package helpers ──
  const addPkg = () => setCargo(c => ({ ...c, packages: [...c.packages, emptyPkg()] }));
  const removePkg = (i: number) => setCargo(c => ({ ...c, packages: c.packages.filter((_, idx) => idx !== i) }));
  const setPkg = (i: number, field: keyof PkgLine, val: string) =>
    setCargo(c => ({ ...c, packages: c.packages.map((p, idx) => idx === i ? { ...p, [field]: val } : p) }));

  // ─── Transport selection screen ───────────────────────────────────────────
  // ─── Summary object for preview ───────────────────────────────────────────
  // Look up T&C includes/excludes for the selected shipping terms type
  const activeTerm = allTerms.find((t: any) => t.name.toLowerCase() === shippingTerms.termsType.toLowerCase()) ?? null;

  const summaryQ = {
    quoteNum,
    company: customer.company, contact: customer.contact, email: customer.email, phone: customer.phone,
    serviceType: shipment.serviceType, direction: shipment.direction,
    incoterm: shipment.incoterm, readyDate: shipment.readyDate,
    origin: routing.origin, dest: routing.dest, pickup: routing.pickup, delivery: routing.delivery,
    commodity: cargo.commodity,
    packages: cargo.packages,                                  // full array for PDF table
    totalPkgs: totalPkgs || undefined,
    totalWeight: totalWeight > 0 ? totalWeight.toFixed(1) : undefined,
    totalCBM: totalCBM > 0 ? totalCBM.toFixed(3) : undefined,
    chargeableWeight: chargeableWeight > 0 ? chargeableWeight.toFixed(1) : undefined,
    buying: pricing.buying, selling: pricing.selling, currency: pricing.currency,
    additionalCosts: pricing.additionalCosts,
    buyingLines,   sellingLines,                               // full cost breakdown
    shippingTermsType:     shippingTerms.termsType,
    shippingTermsIncludes: activeTerm?.includes || "",
    shippingTermsExcludes: activeTerm?.excludes || "",
    notes: shippingTerms.notes,
  };

  // ─── Main quotation page ──────────────────────────────────────────────────
  return (
    <>
      {/* ── Quote reference banner ── sticky — always visible while scrolling */}
      {quoteNum && (
        <div style={{ position: "sticky" as const, top: 0, zIndex: 100, background: C.surface, borderBottom: `2px solid ${C.blue}`, padding: "12px 28px", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 2px 12px rgba(37,99,235,0.12)" }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: C.blueL, border: `1.5px solid ${C.blueBd}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <FileText style={{ width: 20, height: 20, color: C.blue }} />
          </div>
          <div>
            {(shipment.serviceType || shipment.direction) ? (
              <div style={{ fontSize: 11, fontWeight: 700, color: C.blue, opacity: 0.75, marginBottom: 2, letterSpacing: "0.1em", textTransform: "uppercase" as const }}>
                {[shipment.serviceType, shipment.direction].filter(Boolean).join(" ")}
              </div>
            ) : (
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: C.textMuted, marginBottom: 2 }}>Quote No.</div>
            )}
            <div style={{ fontSize: 22, fontWeight: 800, color: C.blue, letterSpacing: "-0.01em", lineHeight: 1 }}>{quoteNum}</div>
          </div>

          {/* Lifecycle flow bar inline in topbar */}
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 12px" }}>
            <LifecycleFlowBar currentStatus={quoteStatus} compact />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>

            {/* Preview PDF icon */}
            <button type="button" title="Preview PDF"
              onClick={() => { setPreviewRef(quoteNum); setModal("preview"); }}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 8, background: "none", border: `1px solid ${C.border}`, cursor: "pointer", color: C.textSub }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = C.blueL; (e.currentTarget as HTMLElement).style.borderColor = C.blue; (e.currentTarget as HTMLElement).style.color = C.blue; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "none"; (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.color = C.textSub; }}>
              <Eye style={{ width: 15, height: 15 }} />
            </button>

            {/* Download PDF icon */}
            <button type="button" title="Download PDF"
              onClick={() => {
                // Build PDF in a hidden iframe and trigger print immediately — no modal
                const el = document.getElementById("quote-pdf-content");
                const html = el ? el.innerHTML : "<p>No content</p>";
                const win = window.open("", "_blank", "width=900,height=700");
                if (!win) return;
                win.document.write(`<!DOCTYPE html><html><head><title>${quoteNum}</title><style>
                  body { margin: 0; font-family: 'Inter', -apple-system, sans-serif; background: #fff; }
                  @media print { @page { margin: 12mm; size: A4; } body { margin: 0; } }
                </style></head><body>${html}</body></html>`);
                win.document.close();
                win.focus();
                setTimeout(() => { win.print(); }, 400);
              }}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 8, background: "none", border: `1px solid ${C.border}`, cursor: "pointer", color: C.textSub }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = C.blueL; (e.currentTarget as HTMLElement).style.borderColor = C.blue; (e.currentTarget as HTMLElement).style.color = C.blue; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "none"; (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.color = C.textSub; }}>
              <Download style={{ width: 15, height: 15 }} />
            </button>

            {/* Quick action dropdown */}
            <div ref={quickActionRef} style={{ position: "relative" as const }}>
              <button
                type="button"
                onClick={() => setQuickActionOpen(o => !o)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: C.blue, border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff", letterSpacing: "0.02em" }}>
                <Zap style={{ width: 13, height: 13 }} />
                Quick action
                <ChevronDown style={{ width: 12, height: 12, transform: quickActionOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
              </button>
              {quickActionOpen && (
                <div style={{ position: "absolute" as const, top: "calc(100% + 6px)", right: 0, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.13)", zIndex: 200, minWidth: 210, overflow: "hidden" }}>
                  {[
                    { icon: <FileUp style={{ width: 14, height: 14 }} />,    label: "Import inquiry data",   action: () => { setModal("import");             setQuickActionOpen(false); } },
                    { icon: <Copy  style={{ width: 14, height: 14 }} />,     label: "Copy from quote",       action: () => { setCopySearch(""); setModal("copyQuote");   setQuickActionOpen(false); } },
                    { icon: <Package style={{ width: 14, height: 14 }} />,   label: "Copy from shipment",   action: () => { setCopySearch(""); setModal("copyShipment"); setQuickActionOpen(false); } },
                    { icon: <ClipboardCopy style={{ width: 14, height: 14 }} />, label: "Duplicate quote", action: () => { setDupeSearch(""); setDupeSelectedQ(null); setDupeMode(null); setDupeSections(new Set(DUPE_SECTIONS.map(s => s.id))); setModal("duplicateQuote"); setQuickActionOpen(false); } },
                  ].map((item, i, arr) => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={item.action}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "none", border: "none", borderBottom: i < arr.length - 1 ? `1px solid ${C.borderL}` : "none", cursor: "pointer", textAlign: "left" as const, fontSize: 13, fontWeight: 500, color: C.text }}
                      onMouseEnter={e => (e.currentTarget.style.background = C.blueL)}
                      onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                      <span style={{ color: C.blue, display: "flex" }}>{item.icon}</span>
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <QuoteStatusDropdown
              quoteId={dbIdRef.current}
              quoteRef={quoteNum}
              currentStatus={quoteStatus}
              validityDays={quoteValidityDays}
              onStatusChange={handleStatusChange}
            />
          </div>
        </div>
      )}

      {/* ── Linked quotes tab bar ── sticky below banner, only shown when family exists */}
      {linkedQuotes.length > 1 && (
        <div style={{
          position: "sticky" as const,
          top: 68,
          zIndex: 99,
          background: C.surface,
          borderBottom: `1px solid ${C.border}`,
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
          padding: "0 28px",
          display: "flex",
          alignItems: "center",
          gap: 2,
          overflowX: "auto" as const,
        }}>
          {linkedQuotes.map((q: any) => {
            const isCurrent = q.reference === quoteNum;
            const label = q.reference;
            const svcDir = [q.service_type, q.direction].filter(Boolean).join(" ");
            return (
              <button
                key={q.reference}
                type="button"
                onClick={() => {
                  if (!isCurrent) {
                    if (saveTimer.current) clearTimeout(saveTimer.current);
                    const id = dbIdRef.current;
                    if (id && Object.keys(latestPatchRef.current).length > 0) {
                      apiRequest("PATCH", `/api/sales-quotes/${id}`, latestPatchRef.current).catch(() => {});
                      latestPatchRef.current = {};
                    }
                    if (onSwitchQuote) onSwitchQuote(q.reference);
                    else if ((window as any).__openQuote) (window as any).__openQuote(q.reference);
                  }
                }}
                style={{
                  flexShrink: 0,
                  display: "flex",
                  flexDirection: "column" as const,
                  alignItems: "flex-start",
                  padding: "10px 18px",
                  background: "none",
                  border: "none",
                  borderBottom: isCurrent ? `2.5px solid ${C.blue}` : "2.5px solid transparent",
                  cursor: isCurrent ? "default" : "pointer",
                  marginBottom: "-1px",
                  transition: "border-color 0.12s",
                }}
                onMouseEnter={e => { if (!isCurrent) (e.currentTarget.style.borderBottomColor = C.blueBd); }}
                onMouseLeave={e => { if (!isCurrent) (e.currentTarget.style.borderBottomColor = "transparent"); }}
              >
                {svcDir && (
                  <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: isCurrent ? C.blue : C.textMuted, marginBottom: 1 }}>
                    {svcDir}
                  </span>
                )}
                <span style={{ fontSize: 12, fontWeight: isCurrent ? 800 : 600, color: isCurrent ? C.blue : C.textSub, letterSpacing: "0.01em" }}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      )}

    <div style={{ background: C.bg, padding: "24px 28px 48px" }}>
      {/* ── Two-column layout: form (left) + sidebar (right) ── */}
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>

        {/* Left: form column */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Quick Actions block hidden — actions available in sticky banner dropdown */}
          <div style={{ display: "none" }}>
            <div style={{ display: "flex", gap: 12 }}>
              <QuickCard icon={<FileUp style={{ width: 17, height: 17 }} />} title="Import inquiry data" desc="Extract from text, email, PDF, packing list or invoice" onClick={() => setModal("import")} />
              <QuickCard icon={<ClipboardCopy style={{ width: 17, height: 17 }} />} title="Copy from quote" desc="Copy data from an existing quote" onClick={() => setModal("copyQuote")} />
              <QuickCard icon={<Copy style={{ width: 17, height: 17 }} />} title="Copy from shipment" desc="Copy data from an existing shipment" onClick={() => setModal("copyShipment")} />
              <QuickCard icon={<PenLine style={{ width: 17, height: 17 }} />} title="Manual entry" desc="Start with an empty form" onClick={() => setOpenSec(1)} />
            </div>
          </div>

          {/* ── Accordions ── */}

          {/* 1 — Customer */}
          <AccordionSection num={1} title="Customer details" subtitle="Information about your customer and contact person" status={sStatus(1)} open={openSec === 1} onToggle={() => toggleSec(1)}>
            <CustomerSection key={customerKey} customer={customer} setCustomer={setCustomer} onNext={() => toggleSec(2)} />
          </AccordionSection>

          {/* 2 — Shipment */}
          <AccordionSection num={2} title="Shipment details" subtitle="Basic information about the shipment" status={sStatus(2)} open={openSec === 2} onToggle={() => toggleSec(2)}>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 14 }}>
              <Row cols={4}>
                <SectionField label="Service type" req>
                  <Sel value={shipment.serviceType} onChange={v => setShipment(p => ({ ...p, serviceType: v }))} opts={["AIR", "SEA", "RAIL", "ROAD"]} placeholder="— Select —" />
                </SectionField>
                <SectionField label="Direction" req>
                  <Sel value={shipment.direction} onChange={v => setShipment(p => ({ ...p, direction: v }))} opts={["Import", "Export"]} />
                </SectionField>
                <SectionField label="Incoterm" req>
                  <Sel value={shipment.incoterm} onChange={v => setShipment(p => ({ ...p, incoterm: v }))} opts={INCOTERMS} placeholder="— Select —" />
                </SectionField>
                <SectionField label="Cargo ready date" req>
                  <Inp type="date" value={shipment.readyDate} onChange={v => setShipment(p => ({ ...p, readyDate: v }))} />
                </SectionField>
              </Row>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
                <Btn variant="outline" onClick={() => toggleSec(3)}>Save & continue <ArrowRight style={{ width: 13, height: 13 }} /></Btn>
              </div>
            </div>
          </AccordionSection>

          {/* 3 — Routing */}
          <AccordionSection num={3} title="Routing" subtitle="Origin, destination and addresses" status={sStatus(3)} open={openSec === 3} onToggle={() => toggleSec(3)}>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 14 }}>
              <Row cols={2}>
                <SectionField label="Origin (POL / Airport)" req><Inp value={routing.origin} onChange={v => setRouting(p => ({ ...p, origin: v }))} placeholder="e.g. Prague, CZ" /></SectionField>
                <SectionField label="Destination (POD / Airport)" req><Inp value={routing.dest} onChange={v => setRouting(p => ({ ...p, dest: v }))} placeholder="e.g. Rotterdam, NL" /></SectionField>
              </Row>
              <Row cols={2}>
                <SectionField label="Pickup address"><Inp value={routing.pickup} onChange={v => setRouting(p => ({ ...p, pickup: v }))} placeholder="Full street address" /></SectionField>
                <SectionField label="Delivery address"><Inp value={routing.delivery} onChange={v => setRouting(p => ({ ...p, delivery: v }))} placeholder="Full street address" /></SectionField>
              </Row>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
                <Btn variant="outline" onClick={() => toggleSec(4)}>Save & continue <ArrowRight style={{ width: 13, height: 13 }} /></Btn>
              </div>
            </div>
          </AccordionSection>

          {/* 4 — Cargo */}
          <AccordionSection num={4} title="Cargo details" subtitle="Information about cargo, packages and dimensions" status={sStatus(4)} open={openSec === 4} onToggle={() => toggleSec(4)}>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 14 }}>
              <SectionField label="Commodity" req><Inp value={cargo.commodity} onChange={v => setCargo(p => ({ ...p, commodity: v }))} placeholder="e.g. Industrial machinery, Electronics" /></SectionField>

              {/* Package lines */}
              <div>
                <Lbl text="Packages & dimensions" />
                <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "50px 110px 1fr 1fr 1fr 1fr 110px 32px", gap: 0, background: C.bg, padding: "7px 12px", borderBottom: `1px solid ${C.borderL}` }}>
                    {["Qty", "Packing type", "L (cm)", "W (cm)", "H (cm)", "Weight (kg)", "Stackable", ""].map(h => (
                      <div key={h} style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: C.textLight }}>{h}</div>
                    ))}
                  </div>
                  {cargo.packages.map((p, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "50px 110px 1fr 1fr 1fr 1fr 110px 32px", gap: 1, padding: "6px 12px", borderBottom: `1px solid ${C.borderL}`, background: C.surface, alignItems: "center" }}>
                      {/* QTY */}
                      <input type="number" value={p.qty} onChange={e => setPkg(i, "qty", e.target.value)}
                        placeholder="0" style={{ padding: "6px 8px", fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 5, outline: "none", width: "100%", boxSizing: "border-box" as const, fontFamily: "inherit" }} />
                      {/* Packing type */}
                      <select value={p.packType} onChange={e => setPkg(i, "packType", e.target.value)}
                        style={{ padding: "6px 7px", fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 5, outline: "none", width: "100%", background: C.surface, fontFamily: "inherit", color: p.packType ? C.text : C.textLight, cursor: "pointer" }}>
                        <option value="">— Type —</option>
                        {PACK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      {/* L / W / H / Weight */}
                      {(["length", "width", "height", "weight"] as (keyof PkgLine)[]).map(f => (
                        <input key={f} type="number" value={p[f]} onChange={e => setPkg(i, f, e.target.value)}
                          placeholder="0" style={{ padding: "6px 8px", fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 5, outline: "none", width: "100%", boxSizing: "border-box" as const, fontFamily: "inherit" }} />
                      ))}
                      {/* Stackable */}
                      <select value={p.stackable} onChange={e => setPkg(i, "stackable", e.target.value)}
                        style={{ padding: "6px 7px", fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 5, outline: "none", width: "100%", background: C.surface, fontFamily: "inherit", color: p.stackable ? C.text : C.textLight, cursor: "pointer" }}>
                        <option value="">— Select —</option>
                        <option value="Stackable">Stackable</option>
                        <option value="Non-stackable">Non-stackable</option>
                      </select>
                      <button type="button" onClick={() => removePkg(i)} disabled={cargo.packages.length === 1}
                        style={{ background: "none", border: "none", cursor: cargo.packages.length > 1 ? "pointer" : "default", color: C.textLight, padding: 4, display: "flex" }}>
                        <Trash2 style={{ width: 13, height: 13 }} />
                      </button>
                    </div>
                  ))}
                  <div style={{ padding: "8px 12px", background: C.bg }}>
                    <button type="button" onClick={addPkg}
                      style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: C.blue, fontSize: 12, fontWeight: 600, padding: 0 }}>
                      <Plus style={{ width: 13, height: 13 }} /> Add package line
                    </button>
                  </div>
                </div>
                {/* Auto-calculated totals */}
                {(totalPkgs > 0 || totalWeight > 0) && (
                  <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" as const }}>
                    {[
                      { label: "Total packages", value: totalPkgs.toString() },
                      { label: "Gross weight", value: totalWeight.toFixed(1) + " kg" },
                      { label: "Volume (CBM)", value: totalCBM.toFixed(3) + " m³" },
                      { label: "Vol. weight (÷6000)", value: volWeight.toFixed(1) + " kg", blue: true },
                      { label: "Chargeable weight", value: chargeableWeight.toFixed(1) + " kg", bold: true },
                    ].map(item => (
                      <div key={item.label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 12px" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: C.textLight, marginBottom: 2 }}>{item.label}</div>
                        <div style={{ fontSize: 13, fontWeight: (item as any).bold ? 700 : 600, color: (item as any).blue ? C.blue : C.text }}>{item.value}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Row cols={2}>
                <Toggle value={cargo.stackable} onChange={v => setCargo(p => ({ ...p, stackable: v }))} label="Non-stackable" />
                <Toggle value={cargo.dangerous} onChange={v => setCargo(p => ({ ...p, dangerous: v }))} label="Dangerous goods (IMDG / IATA)" />
              </Row>
              {cargo.dangerous && (
                <div style={{ background: C.amberL, border: "1px solid #FDE68A", borderRadius: 7, padding: "9px 13px", display: "flex", gap: 8 }}>
                  <AlertTriangle style={{ width: 14, height: 14, color: C.amber, flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: 12, color: "#78350F" }}>Dangerous goods require UN number, class, packing group and an SDS. Please attach full DG declaration.</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
                <Btn variant="outline" onClick={() => toggleSec(5)}>Save & continue <ArrowRight style={{ width: 13, height: 13 }} /></Btn>
              </div>
            </div>
          </AccordionSection>

          {/* 5 — Pricing */}
          <AccordionSection num={5} title="Pricing" subtitle="Buying & selling cost breakdown with margin calculation" status={sStatus(5)} open={openSec === 5} onToggle={() => toggleSec(5)}>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 20 }}>

              {/* ── BUYING COSTS ── */}
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, background: C.blueL, border: `1px solid ${C.blueBd}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <DollarSign style={{ width: 13, height: 13, color: C.blue }} />
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Buying costs</span>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {buyingLines.length > 0 && (
                      <button type="button"
                        onClick={() => setSellingLines(buyingLines.map(l => ({ id: Math.random().toString(36).slice(2), type: l.type, description: l.description, currency: l.currency, amount: l.amount, value: l.value, editing: false })))}
                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 13px", background: C.surface, border: `1px solid ${C.green}`, borderRadius: 7, fontSize: 12, fontWeight: 600, color: C.green, cursor: "pointer" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = C.greenL; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = C.surface; }}>
                        <Copy style={{ width: 12, height: 12 }} /> Copy to selling
                      </button>
                    )}
                    <button type="button"
                      onClick={() => { setCopySearch(""); setModal("copyPricing"); }}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 13px", background: C.surface, border: `1px solid ${C.blue}`, borderRadius: 7, fontSize: 12, fontWeight: 600, color: C.blue, cursor: "pointer" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = C.blueL; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = C.surface; }}>
                      <ClipboardCopy style={{ width: 12, height: 12 }} /> Copy from quote
                    </button>
                    <button type="button"
                      onClick={() => setBuyingLines(l => [...l, mkBuying()])}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 13px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 12, fontWeight: 600, color: C.textSub, cursor: "pointer" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.blue; (e.currentTarget as HTMLElement).style.color = C.blue; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.color = C.textSub; }}>
                      <Plus style={{ width: 12, height: 12 }} /> Add buying cost
                    </button>
                  </div>
                </div>
                {/* Column headers */}
                <div style={{ display: "grid", gridTemplateColumns: "150px 1fr 130px 80px 100px 100px 56px", gap: 0, padding: "7px 16px", background: "#F8FAFC", borderBottom: `1px solid ${C.borderL}` }}>
                  {["Type","Description","Supplier","Currency","Amount","Value","Actions"].map(h => (
                    <div key={h} style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: C.textMuted }}>{h}</div>
                  ))}
                </div>
                {/* Rows */}
                {buyingLines.length === 0 ? (
                  <div style={{ padding: "20px 16px", textAlign: "center" as const, fontSize: 12, color: C.textLight }}>
                    No buying costs added yet. Click “+ Add buying cost” to start.
                  </div>
                ) : buyingLines.map((line, i) => (
                  <div key={line.id} style={{ display: "grid", gridTemplateColumns: "150px 1fr 130px 80px 100px 100px 56px", gap: 0, padding: "6px 16px", borderBottom: `1px solid ${C.borderL}`, background: C.surface, alignItems: "center" }}>
                    {/* Type */}
                    <div style={{ paddingRight: 8 }}>
                      <select value={line.type} onChange={e => setBuyingLines(l => l.map((x,j) => j===i ? {...x, type: e.target.value} : x))}
                        style={{ width: "100%", padding: "5px 7px", fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 5, outline: "none", background: C.surface, fontFamily: "inherit", color: line.type ? C.text : C.textLight, cursor: "pointer" }}>
                        <option value="">— Select —</option>
                        {COST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    {/* Description */}
                    <div style={{ paddingRight: 8 }}>
                      <input value={line.description} onChange={e => setBuyingLines(l => l.map((x,j) => j===i ? {...x, description: e.target.value} : x))}
                        placeholder="Description"
                        style={{ width: "100%", padding: "5px 7px", fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 5, outline: "none", fontFamily: "inherit", boxSizing: "border-box" as const, color: C.text }}
                        onFocus={e => e.target.style.borderColor = C.blue}
                        onBlur={e => e.target.style.borderColor = C.border} />
                    </div>
                    {/* Supplier */}
                    <div style={{ paddingRight: 8 }}>
                      <input value={line.supplier} onChange={e => setBuyingLines(l => l.map((x,j) => j===i ? {...x, supplier: e.target.value} : x))}
                        placeholder="Supplier"
                        style={{ width: "100%", padding: "5px 7px", fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 5, outline: "none", fontFamily: "inherit", boxSizing: "border-box" as const, color: C.text }}
                        onFocus={e => e.target.style.borderColor = C.blue}
                        onBlur={e => e.target.style.borderColor = C.border} />
                    </div>
                    {/* Currency */}
                    <div style={{ paddingRight: 8 }}>
                      <select value={line.currency} onChange={e => setBuyingLines(l => l.map((x,j) => j===i ? {...x, currency: e.target.value} : x))}
                        style={{ width: "100%", padding: "5px 7px", fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 5, outline: "none", background: C.surface, fontFamily: "inherit", color: C.text, cursor: "pointer" }}>
                        {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    {/* Amount */}
                    <div style={{ paddingRight: 8 }}>
                      <input type="number" value={line.amount} onChange={e => setBuyingLines(l => l.map((x,j) => j===i ? {...x, amount: e.target.value} : x))}
                        placeholder="0.00"
                        style={{ width: "100%", padding: "5px 7px", fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 5, outline: "none", fontFamily: "inherit", boxSizing: "border-box" as const, color: C.text, textAlign: "right" as const }}
                        onFocus={e => e.target.style.borderColor = C.blue}
                        onBlur={e => e.target.style.borderColor = C.border} />
                    </div>
                    {/* Value */}
                    <div style={{ paddingRight: 8 }}>
                      <input type="number" value={line.value} onChange={e => setBuyingLines(l => l.map((x,j) => j===i ? {...x, value: e.target.value} : x))}
                        placeholder="0.00"
                        style={{ width: "100%", padding: "5px 7px", fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 5, outline: "none", fontFamily: "inherit", boxSizing: "border-box" as const, color: C.text, textAlign: "right" as const }}
                        onFocus={e => e.target.style.borderColor = C.blue}
                        onBlur={e => e.target.style.borderColor = C.border} />
                    </div>
                    {/* Actions */}
                    <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                      <button type="button" onClick={() => setBuyingLines(l => l.filter((_,j) => j!==i))}
                        style={{ background: "none", border: "none", cursor: "pointer", color: C.textLight, padding: 4, display: "flex", borderRadius: 4 }}
                        onMouseEnter={e => (e.currentTarget.style.color = C.red)}
                        onMouseLeave={e => (e.currentTarget.style.color = C.textLight)}>
                        <Trash2 style={{ width: 13, height: 13 }} />
                      </button>
                    </div>
                  </div>
                ))}
                {/* Total row */}
                {buyingLines.length > 0 && (
                  <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 16, padding: "10px 16px", background: C.bg, borderTop: `1px solid ${C.border}` }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.textSub, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Total buying costs</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: C.text, minWidth: 110, textAlign: "right" as const }}>{totalBuying.toFixed(2)} {buyingLines[0]?.currency || "USD"}</span>
                  </div>
                )}
              </div>

              {/* ── SELLING COSTS ── */}
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, background: C.greenL, border: `1px solid ${C.greenBd}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <BarChart3 style={{ width: 13, height: 13, color: C.green }} />
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Selling costs</span>
                  </div>
                  <button type="button"
                    onClick={() => setSellingLines(l => [...l, mkSelling()])}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 13px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 12, fontWeight: 600, color: C.textSub, cursor: "pointer" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.green; (e.currentTarget as HTMLElement).style.color = C.green; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.color = C.textSub; }}>
                    <Plus style={{ width: 12, height: 12 }} /> Add selling cost
                  </button>
                </div>
                {/* Column headers */}
                <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 80px 100px 100px 56px", gap: 0, padding: "7px 16px", background: "#F8FAFC", borderBottom: `1px solid ${C.borderL}` }}>
                  {["Type","Description","Currency","Amount","Value","Actions"].map(h => (
                    <div key={h} style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: C.textMuted }}>{h}</div>
                  ))}
                </div>
                {/* Rows */}
                {sellingLines.length === 0 ? (
                  <div style={{ padding: "20px 16px", textAlign: "center" as const, fontSize: 12, color: C.textLight }}>
                    No selling costs added yet. Click “+ Add selling cost” to start.
                  </div>
                ) : sellingLines.map((line, i) => (
                  <div key={line.id} style={{ display: "grid", gridTemplateColumns: "160px 1fr 80px 100px 100px 56px", gap: 0, padding: "6px 16px", borderBottom: `1px solid ${C.borderL}`, background: C.surface, alignItems: "center" }}>
                    {/* Type */}
                    <div style={{ paddingRight: 8 }}>
                      <select value={line.type} onChange={e => setSellingLines(l => l.map((x,j) => j===i ? {...x, type: e.target.value} : x))}
                        style={{ width: "100%", padding: "5px 7px", fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 5, outline: "none", background: C.surface, fontFamily: "inherit", color: line.type ? C.text : C.textLight, cursor: "pointer" }}>
                        <option value="">— Select —</option>
                        {COST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    {/* Description */}
                    <div style={{ paddingRight: 8 }}>
                      <input value={line.description} onChange={e => setSellingLines(l => l.map((x,j) => j===i ? {...x, description: e.target.value} : x))}
                        placeholder="Description"
                        style={{ width: "100%", padding: "5px 7px", fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 5, outline: "none", fontFamily: "inherit", boxSizing: "border-box" as const, color: C.text }}
                        onFocus={e => e.target.style.borderColor = C.blue}
                        onBlur={e => e.target.style.borderColor = C.border} />
                    </div>
                    {/* Currency */}
                    <div style={{ paddingRight: 8 }}>
                      <select value={line.currency} onChange={e => setSellingLines(l => l.map((x,j) => j===i ? {...x, currency: e.target.value} : x))}
                        style={{ width: "100%", padding: "5px 7px", fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 5, outline: "none", background: C.surface, fontFamily: "inherit", color: C.text, cursor: "pointer" }}>
                        {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    {/* Amount */}
                    <div style={{ paddingRight: 8 }}>
                      <input type="number" value={line.amount} onChange={e => setSellingLines(l => l.map((x,j) => j===i ? {...x, amount: e.target.value} : x))}
                        placeholder="0.00"
                        style={{ width: "100%", padding: "5px 7px", fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 5, outline: "none", fontFamily: "inherit", boxSizing: "border-box" as const, color: C.text, textAlign: "right" as const }}
                        onFocus={e => e.target.style.borderColor = C.blue}
                        onBlur={e => e.target.style.borderColor = C.border} />
                    </div>
                    {/* Value */}
                    <div style={{ paddingRight: 8 }}>
                      <input type="number" value={line.value} onChange={e => setSellingLines(l => l.map((x,j) => j===i ? {...x, value: e.target.value} : x))}
                        placeholder="0.00"
                        style={{ width: "100%", padding: "5px 7px", fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 5, outline: "none", fontFamily: "inherit", boxSizing: "border-box" as const, color: C.text, textAlign: "right" as const }}
                        onFocus={e => e.target.style.borderColor = C.blue}
                        onBlur={e => e.target.style.borderColor = C.border} />
                    </div>
                    {/* Actions */}
                    <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                      <button type="button" onClick={() => setSellingLines(l => l.filter((_,j) => j!==i))}
                        style={{ background: "none", border: "none", cursor: "pointer", color: C.textLight, padding: 4, display: "flex", borderRadius: 4 }}
                        onMouseEnter={e => (e.currentTarget.style.color = C.red)}
                        onMouseLeave={e => (e.currentTarget.style.color = C.textLight)}>
                        <Trash2 style={{ width: 13, height: 13 }} />
                      </button>
                    </div>
                  </div>
                ))}
                {/* Total row */}
                {sellingLines.length > 0 && (
                  <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 16, padding: "10px 16px", background: C.bg, borderTop: `1px solid ${C.border}` }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.textSub, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Total selling costs</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: C.text, minWidth: 110, textAlign: "right" as const }}>{totalSelling.toFixed(2)} {sellingLines[0]?.currency || "USD"}</span>
                  </div>
                )}
              </div>

              {/* ── SUMMARY BAR ── */}
              {(buyingLines.length > 0 || sellingLines.length > 0) && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1px 1fr 1px 1fr", border: `1px solid ${C.border}`, borderRadius: 9, overflow: "hidden", background: C.surface }}>
                  {/* Buying costs */}
                  <div style={{ padding: "12px 16px", textAlign: "center" as const }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.07em", marginBottom: 4 }}>Buying costs</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{totalBuying.toFixed(2)} {buyingLines[0]?.currency || "USD"}</div>
                  </div>
                  <div style={{ background: C.border }} />
                  {/* Selling costs */}
                  <div style={{ padding: "12px 16px", textAlign: "center" as const }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.07em", marginBottom: 4 }}>Selling costs</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: C.green }}>{totalSelling.toFixed(2)} {sellingLines[0]?.currency || "USD"}</div>
                  </div>
                  <div style={{ background: C.border }} />
                  {/* Profit */}
                  <div style={{ padding: "12px 16px", textAlign: "center" as const }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.07em", marginBottom: 4 }}>Profit</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: profit >= 0 ? C.green : C.red }}>
                      {profit.toFixed(2)} {(sellingLines[0] || buyingLines[0])?.currency || "USD"}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: parseFloat(margin) >= 15 ? C.green : parseFloat(margin) >= 5 ? C.amber : C.red, marginTop: 2 }}>
                      Margin: {margin}%
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
                <Btn variant="outline" onClick={() => toggleSec(6)}>Save & continue <ArrowRight style={{ width: 13, height: 13 }} /></Btn>
              </div>
            </div>
          </AccordionSection>

          {/* 6 — Shipping Terms */}
          <AccordionSection num={6} title="Shipping terms" subtitle="Define the shipping terms and conditions for this shipment" status={sStatus(6)} open={openSec === 6} onToggle={() => toggleSec(6)}>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 14 }}>
              <Row cols={2}>
                <SectionField label="Shipping terms type" req>
                  <Sel
                    value={shippingTerms.termsType}
                    onChange={v => setShippingTerms(p => ({ ...p, termsType: v }))}
                    opts={SHIPPING_TERMS_OPTS}
                    placeholder="— Select type —"
                  />
                </SectionField>
                <SectionField label="Validity">
                  <div style={{ position: "relative" as const }}>
                    <input
                      type="date"
                      value={validityDate}
                      onChange={e => setValidityDate(e.target.value)}
                      style={{ width: "100%", padding: "9px 11px", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 7, outline: "none", background: C.surface, color: validityDate ? C.text : C.textLight, fontFamily: "inherit", boxSizing: "border-box" as const, cursor: "pointer" }}
                      onFocus={e => e.target.style.borderColor = C.blue}
                      onBlur={e => e.target.style.borderColor = C.border}
                    />
                  </div>
                </SectionField>
              </Row>
              {/* T&C linked editable panels */}
              {matchedTerm && (
                <TermConditionEditor
                  term={matchedTerm}
                  onSaved={() => queryClient.invalidateQueries({ queryKey: ["/api/terms-conditions"] })}
                />
              )}

              <SectionField label="Additional shipping conditions / notes">
                <textarea
                  value={shippingTerms.notes}
                  onChange={e => setShippingTerms(p => ({ ...p, notes: e.target.value }))}
                  placeholder="e.g. Special handling instructions, port restrictions, customs notes…"
                  rows={3}
                  style={{ width: "100%", padding: "9px 11px", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 7, outline: "none", resize: "vertical" as const, fontFamily: "inherit", boxSizing: "border-box" as const, color: C.text, background: C.surface }}
                />
              </SectionField>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
                <Btn variant="outline" onClick={() => setOpenSec(null)}>Save & continue <ArrowRight style={{ width: 13, height: 13 }} /></Btn>
              </div>
            </div>
          </AccordionSection>


        </div>{/* end left form column */}

        {/* ── Sticky right sidebar ── */}
        <div style={{ width: 300, flexShrink: 0, position: "sticky" as const, top: 24, alignSelf: "flex-start", maxHeight: "calc(100vh - 40px)", overflowY: "auto" as const, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "20px 18px", display: "flex", flexDirection: "column" as const, gap: 0, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>

          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Quotation preview</span>
          </div>

          {/* Preview rows helper */}
          {[
            { heading: "Customer", rows: [
              { label: "Company", value: customer.company },
              { label: "Contact", value: customer.contact },
              { label: "Email",   value: customer.email },
              { label: "Phone",   value: customer.phone },
            ]},
            { heading: "Routing", rows: [
              { label: "Service",         value: shipment.serviceType },
              { label: "Origin",          value: routing.origin },
              { label: "Destination",     value: routing.dest },
              { label: "Incoterm",        value: shipment.incoterm },
              { label: "Cargo ready",     value: shipment.readyDate },
            ]},
            { heading: "Cargo", rows: [
              { label: "Commodity",           value: cargo.commodity },
              { label: "Packages",            value: totalPkgs > 0 ? String(totalPkgs) : undefined },
              { label: "Gross weight",        value: totalWeight > 0 ? totalWeight.toFixed(1) + " kg" : undefined },
              { label: "CBM",                 value: totalCBM > 0 ? totalCBM.toFixed(3) + " m³" : undefined },
              { label: "Chargeable weight",   value: chargeableWeight > 0 ? chargeableWeight.toFixed(1) + " kg" : undefined },
            ]},

          ].map(section => (
            <div key={section.heading} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 6 }}>{section.heading}</div>
              {section.rows.map(r => (
                <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${C.borderL}` }}>
                  <span style={{ fontSize: 11, color: C.textMuted }}>{r.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 500, color: r.value ? C.text : C.textLight }}>{r.value || "—"}</span>
                </div>
              ))}
            </div>
          ))}

          {/* Pricing summary — live from breakdown lines */}
          {(() => {
            const cur = sellingLines[0]?.currency || buyingLines[0]?.currency || pricing.currency || "EUR";
            const hasBuy  = totalBuying  > 0 || buyingLines.length  > 0;
            const hasSell = totalSelling > 0 || sellingLines.length > 0;
            const rows = [
              { label: "Buying costs",  value: `${totalBuying.toFixed(2)} ${cur}`,  show: true },
              { label: "Selling costs", value: `${totalSelling.toFixed(2)} ${cur}`, show: true, green: hasSell },
              { label: "Profit",        value: `${profit.toFixed(2)} ${cur}`,       show: true, green: profit > 0, red: profit < 0 },

            ];
            return (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 6 }}>Pricing summary</div>
                {rows.map(r => (
                  <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.borderL}` }}>
                    <span style={{ fontSize: 11, color: C.textMuted }}>{r.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700,
                      color: (r as any).green ? C.green : (r as any).red ? C.red : (r as any).amber ? C.amber : C.text }}>
                      {r.show ? r.value : <span style={{ color: C.textLight }}>0.00 {cur}</span>}
                    </span>
                  </div>
                ))}
              </div>
            );
          })()}


          {/* Shipping terms + validity */}
          {(shippingTerms.termsType || validityDate) && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 6 }}>Shipping terms</div>
              {shippingTerms.termsType && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${C.borderL}` }}>
                  <span style={{ fontSize: 11, color: C.textMuted }}>Type</span>
                  <span style={{ fontSize: 11, fontWeight: 500, color: C.text }}>{shippingTerms.termsType}</span>
                </div>
              )}
              {validityDate && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${C.borderL}` }}>
                  <span style={{ fontSize: 11, color: C.textMuted }}>Validity</span>
                  <span style={{ fontSize: 11, fontWeight: 500, color: C.text }}>{validityDate}</span>
                </div>
              )}
            </div>
          )}



        </div>{/* end sidebar */}
      </div>{/* end two-column row */}
    </div>{/* end padded wrapper */}

    {/* Hidden PDF render — always in DOM so download button can access it without opening modal */}
    <div id="quote-pdf-content" style={{ position: "fixed" as const, left: "-9999px", top: 0, width: 780, background: "#fff", pointerEvents: "none" as const, zIndex: -1 }}>
      <QuotePDF q={summaryQ} />
    </div>

      {/* ─── MODALS ─────────────────────────────────────────────────────────── */}

      {/* Import inquiry */}
      <Modal open={modal === "import"} onClose={() => { setModal(null); setImportResult(null); setImportText(""); }} title="Import inquiry data" width={580}>
        {!importResult ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", fontSize: 12, color: C.textMuted }}>
              Paste email text, or upload a PDF, packing list or invoice. The system will extract all available shipment details automatically.
            </div>
            <div>
              <Lbl text="Paste text or email content" />
              <textarea value={importText} onChange={e => setImportText(e.target.value)} rows={6}
                placeholder="Paste email text, inquiry details or any shipment information here…"
                style={{ width: "100%", padding: "9px 11px", fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 7, outline: "none", resize: "vertical" as const, fontFamily: "inherit", boxSizing: "border-box" as const }} />
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", border: `1px solid ${C.border}`, borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: 500, color: C.textSub, background: C.surface }}>
                <Upload style={{ width: 14, height: 14 }} /> Upload file (PDF, Excel, Word)
                <input type="file" accept=".pdf,.xlsx,.xls,.docx,.doc,.txt,.csv" style={{ display: "none" }}
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = ev => {
                      const text = ev.target?.result as string;
                      setImportText(prev => prev ? prev + "\n\n" + text : text);
                    };
                    reader.readAsText(file);
                  }} />
              </label>
              <span style={{ fontSize: 12, color: C.textLight }}>or drag & drop here</span>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Btn variant="outline" onClick={() => setModal(null)}>Cancel</Btn>
              <button type="button" onClick={parseImport} disabled={!importText.trim() && true}
                style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", background: C.blue, color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                {importParsing ? <><Loader2 style={{ width: 14, height: 14 }} /> Extracting…</> : "Extract data"}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: C.greenL, border: `1px solid ${C.greenBd}`, borderRadius: 7, padding: "9px 13px", display: "flex", gap: 7, alignItems: "center" }}>
              <Check style={{ width: 14, height: 14, color: C.green }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: C.green }}>Data extracted successfully. Review before applying.</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {[
                { label: "Company",      value: importResult.company },
                { label: "Contact",      value: importResult.contact },
                { label: "Email",        value: importResult.email },
                { label: "Phone",        value: importResult.phone },
                { label: "Service",      value: importResult.serviceType },
                { label: "Direction",    value: importResult.direction },
                { label: "Origin",       value: importResult.origin },
                { label: "Destination",  value: importResult.dest },
                { label: "Incoterm",     value: importResult.incoterm },
                { label: "Cargo ready",  value: importResult.readyDate },
                { label: "Commodity",    value: importResult.commodity },
                { label: "Weight (kg)",  value: importResult.weight },
                { label: "CBM",          value: importResult.cbm },
                { label: "Packages",     value: importResult.pkgs },
                { label: "Packing type", value: importResult.packType },
                { label: "Dimensions",   value: importResult.dimL ? `${importResult.dimL}×${importResult.dimW}×${importResult.dimH} cm` : "" },
              ].filter(r => r.value).map(r => (
                <div key={r.label} style={{ display: "flex", gap: 12, padding: "5px 10px", background: C.bg, borderRadius: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: C.textMuted, width: 110, flexShrink: 0 }}>{r.label}</span>
                  <span style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>{r.value}</span>
                </div>
              ))}
              {Object.values(importResult).every(v => !v) && (
                <div style={{ padding: "12px", textAlign: "center" as const, fontSize: 12, color: C.textLight }}>
                  No data could be extracted. Try adding labels like "Customer:", "Origin:", "Incoterm:", "Cargo ready date:" to your text.
                </div>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Btn variant="outline" onClick={() => setImportResult(null)}>Re-extract</Btn>
              <button type="button" onClick={applyImport}
                style={{ padding: "9px 18px", background: C.blue, color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Apply to form
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Copy from quote */}
      <Modal open={modal === "copyQuote"} onClose={() => { setModal(null); setCopySearch(""); }} title="Copy from quote" width={520}>
        {(() => {
          const filteredQuotes = allQuotes.filter((q: any) =>
            q.reference !== quoteNum &&
            (!copySearch ||
              q.reference?.toLowerCase().includes(copySearch.toLowerCase()) ||
              q.customer_name?.toLowerCase().includes(copySearch.toLowerCase()) ||
              q.origin?.toLowerCase().includes(copySearch.toLowerCase()) ||
              q.destination?.toLowerCase().includes(copySearch.toLowerCase()))
          );
          return (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}>
              <div style={{ position: "relative" as const }}>
                <Search style={{ width: 14, height: 14, color: C.textLight, position: "absolute" as const, left: 10, top: "50%", transform: "translateY(-50%)" }} />
                <input value={copySearch} onChange={e => setCopySearch(e.target.value)}
                  placeholder="Search by reference, customer, origin, destination…"
                  style={{ width: "100%", padding: "9px 11px 9px 32px", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 7, outline: "none", fontFamily: "inherit", boxSizing: "border-box" as const }} />
              </div>
              <div style={{ maxHeight: 360, overflowY: "auto" as const, border: `1px solid ${C.border}`, borderRadius: 8, background: C.surface }}>
                {filteredQuotes.length === 0 ? (
                  <div style={{ padding: "24px 16px", textAlign: "center" as const, fontSize: 13, color: C.textLight }}>
                    {allQuotes.length === 0 ? "No quotes in database yet." : "No matching quotes."}
                  </div>
                ) : filteredQuotes.map((q: any) => (
                  <button type="button" key={q.id} onClick={() => copyFromQuote(q)}
                    style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", background: "none", border: "none", borderBottom: `1px solid ${C.borderL}`, cursor: "pointer", textAlign: "left" as const }}
                    onMouseEnter={e => (e.currentTarget.style.background = C.blueL)}
                    onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.blue }}>{q.reference}</div>
                      <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                        {q.customer_name || "(no customer)"}{q.origin && q.destination ? ` · ${q.origin} → ${q.destination}` : ""}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" as const, flexShrink: 0, marginLeft: 12 }}>
                      {q.service_type && <div style={{ fontSize: 11, fontWeight: 700, color: C.blue }}>{q.service_type}</div>}
                      <div style={{ fontSize: 11, color: C.textLight }}>{new Date(q.created_at).toLocaleDateString()}</div>
                    </div>
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 12, color: C.textMuted }}>All fields including pricing will be copied. The reference number of this quote stays unique.</div>
            </div>
          );
        })()}
      </Modal>

      {/* Copy from shipment */}
      <Modal open={modal === "copyShipment"} onClose={() => { setModal(null); setCopySearch(""); }} title="Copy from shipment" width={520}>
        {(() => {
          const filteredShipments = allShipments.filter((s: any) =>
            !copySearch ||
            s.trackingNumber?.toLowerCase().includes(copySearch.toLowerCase()) ||
            s.shipper?.toLowerCase().includes(copySearch.toLowerCase()) ||
            s.consignee?.toLowerCase().includes(copySearch.toLowerCase()) ||
            s.origin?.toLowerCase().includes(copySearch.toLowerCase()) ||
            s.destination?.toLowerCase().includes(copySearch.toLowerCase())
          );
          return (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}>
              <div style={{ position: "relative" as const }}>
                <Search style={{ width: 14, height: 14, color: C.textLight, position: "absolute" as const, left: 10, top: "50%", transform: "translateY(-50%)" }} />
                <input value={copySearch} onChange={e => setCopySearch(e.target.value)}
                  placeholder="Search by tracking number, shipper, consignee, route…"
                  style={{ width: "100%", padding: "9px 11px 9px 32px", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 7, outline: "none", fontFamily: "inherit", boxSizing: "border-box" as const }} />
              </div>
              <div style={{ maxHeight: 360, overflowY: "auto" as const, border: `1px solid ${C.border}`, borderRadius: 8, background: C.surface }}>
                {filteredShipments.length === 0 ? (
                  <div style={{ padding: "24px 16px", textAlign: "center" as const, fontSize: 13, color: C.textLight }}>
                    {allShipments.length === 0 ? "No shipments found in database." : "No matching shipments."}
                  </div>
                ) : filteredShipments.map((s: any) => (
                  <button type="button" key={s.id} onClick={() => copyFromShipment(s)}
                    style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", background: "none", border: "none", borderBottom: `1px solid ${C.borderL}`, cursor: "pointer", textAlign: "left" as const }}
                    onMouseEnter={e => (e.currentTarget.style.background = C.blueL)}
                    onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{s.trackingNumber || s.id}</div>
                      <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                        {s.shipper || s.consignee || ""}{s.origin && s.destination ? ` · ${s.origin} → ${s.destination}` : ""}
                      </div>
                    </div>
                    {s.mode && <span style={{ fontSize: 11, color: C.blue, fontWeight: 600, flexShrink: 0 }}>{s.mode}</span>}
                  </button>
                ))}
              </div>
              <div style={{ background: C.amberL, border: "1px solid #FDE68A", borderRadius: 7, padding: "8px 12px", fontSize: 12, color: "#78350F" }}>
                Pricing will not be copied. You can add pricing after selecting a shipment.
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Copy pricing from quote */}
      <Modal open={modal === "copyPricing"} onClose={() => { setModal(null); setCopySearch(""); }} title="Copy pricing from quote" width={540}>
        {(() => {
          const filteredPricing = allQuotes.filter((q: any) =>
            q.reference !== quoteNum &&
            (q.buying_lines_json !== "[]" || q.selling_lines_json !== "[]") &&
            (!copySearch ||
              q.reference?.toLowerCase().includes(copySearch.toLowerCase()) ||
              q.customer_name?.toLowerCase().includes(copySearch.toLowerCase()))
          );
          return (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}>
              <div style={{ background: C.blueL, border: `1px solid ${C.blueBd}`, borderRadius: 8, padding: "10px 14px", fontSize: 12, color: C.blue, fontWeight: 500 }}>
                Select a quote to copy its buying <strong>and</strong> selling cost lines into this quote. Your current cost lines will be replaced.
              </div>
              <div style={{ position: "relative" as const }}>
                <Search style={{ width: 14, height: 14, color: C.textLight, position: "absolute" as const, left: 10, top: "50%", transform: "translateY(-50%)" }} />
                <input value={copySearch} onChange={e => setCopySearch(e.target.value)}
                  placeholder="Search by reference or customer…"
                  style={{ width: "100%", padding: "9px 11px 9px 32px", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 7, outline: "none", fontFamily: "inherit", boxSizing: "border-box" as const }} />
              </div>
              <div style={{ maxHeight: 380, overflowY: "auto" as const, border: `1px solid ${C.border}`, borderRadius: 8, background: C.surface }}>
                {filteredPricing.length === 0 ? (
                  <div style={{ padding: "24px 16px", textAlign: "center" as const, fontSize: 13, color: C.textLight }}>
                    {allQuotes.filter((q: any) => q.buying_lines_json !== "[]" || q.selling_lines_json !== "[]").length === 0
                      ? "No quotes with pricing found yet."
                      : "No matching quotes."}
                  </div>
                ) : filteredPricing.map((q: any) => {
                  const bLines = (() => { try { return JSON.parse(q.buying_lines_json || "[]"); } catch { return []; } })();
                  const sLines = (() => { try { return JSON.parse(q.selling_lines_json || "[]"); } catch { return []; } })();
                  const bTotal = bLines.reduce((s: number, l: any) => s + (parseFloat(l.amount) || 0), 0);
                  const sTotal = sLines.reduce((s: number, l: any) => s + (parseFloat(l.amount) || 0), 0);
                  return (
                    <button type="button" key={q.id} onClick={() => copyPricingFromQuote(q)}
                      style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "none", border: "none", borderBottom: `1px solid ${C.borderL}`, cursor: "pointer", textAlign: "left" as const }}
                      onMouseEnter={e => (e.currentTarget.style.background = C.blueL)}
                      onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.blue }}>{q.reference}</div>
                        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{q.customer_name || "(no customer)"}</div>
                      </div>
                      <div style={{ textAlign: "right" as const, flexShrink: 0, marginLeft: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: C.textSub }}>
                          {bLines.length > 0 && <span style={{ marginRight: 8 }}>{bLines.length} buying{bTotal > 0 ? ` · ${bTotal.toFixed(0)}` : ""}</span>}
                          {sLines.length > 0 && <span>{sLines.length} selling{sTotal > 0 ? ` · ${sTotal.toFixed(0)}` : ""}</span>}
                        </div>
                        <div style={{ fontSize: 10, color: C.textLight, marginTop: 2 }}>{new Date(q.created_at).toLocaleDateString()}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Duplicate Quote modal */}
      <Modal open={modal === "duplicateQuote"} onClose={() => { setModal(null); setDupeSearch(""); setDupeSelectedQ(null); setDupeMode(null); }} title="Duplicate quote" width={520}>
        {/* ─ Step 3: Section picker (active for both modes) */}
        {(dupeMode === "current" || dupeSelectedQ) ? (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 16 }}>
            {/* Source label */}
            <div style={{ background: C.blueL, border: `1px solid ${C.blueBd}`, borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
              <ClipboardCopy style={{ width: 13, height: 13, color: C.blue, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: C.blue }}>
                {dupeMode === "current"
                  ? <><strong>Current quote</strong> — {quoteNum}</>
                  : <><strong>From:</strong> {dupeSelectedQ.reference} · {dupeSelectedQ.customer_name || "(no customer)"}</>
                }
              </span>
            </div>

            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Which sections do you want to copy?</div>

            <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
              {DUPE_SECTIONS.map(sec => (
                <label key={sec.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", border: `1.5px solid ${dupeSections.has(sec.id) ? C.blue : C.border}`, borderRadius: 9, cursor: "pointer", background: dupeSections.has(sec.id) ? C.blueL : C.surface, transition: "all 0.1s" }}>
                  <input type="checkbox" checked={dupeSections.has(sec.id)}
                    onChange={e => {
                      const next = new Set(dupeSections);
                      if (e.target.checked) next.add(sec.id as DupeSection); else next.delete(sec.id as DupeSection);
                      setDupeSections(next);
                    }}
                    style={{ width: 15, height: 15, accentColor: C.blue, cursor: "pointer" }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 600, color: dupeSections.has(sec.id) ? C.blue : C.text }}>{sec.label}</span>
                </label>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "space-between", paddingTop: 4 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => setDupeSections(new Set(DUPE_SECTIONS.map(s => s.id as DupeSection)))}
                  style={{ padding: "7px 13px", background: "none", border: `1px solid ${C.border}`, borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: 600, color: C.textSub }}>
                  Select all
                </button>
                <button type="button" onClick={() => setDupeSections(new Set())}
                  style={{ padding: "7px 13px", background: "none", border: `1px solid ${C.border}`, borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: 600, color: C.textSub }}>
                  Clear
                </button>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => { if (dupeMode === "current") setDupeMode(null); else setDupeSelectedQ(null); }}
                  disabled={dupeCreating}
                  style={{ padding: "7px 13px", background: "none", border: `1px solid ${C.border}`, borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: 600, color: C.textSub }}>
                  ← Back
                </button>
                <button type="button"
                  disabled={dupeSections.size === 0 || dupeCreating}
                  onClick={() => applyDuplicate(dupeMode === "current" ? currentQuoteSnapshot() : dupeSelectedQ, dupeSections)}
                  style={{ padding: "8px 24px", background: dupeSections.size > 0 && !dupeCreating ? C.blue : C.textLight, border: "none", borderRadius: 7, cursor: dupeSections.size > 0 && !dupeCreating ? "pointer" : "default", fontSize: 13, fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: 6 }}>
                  {dupeCreating ? (
                    <><Loader2 style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} /> Creating…</>
                  ) : (
                    <><Plus style={{ width: 13, height: 13 }} /> Create{dupeSections.size < DUPE_SECTIONS.length ? ` (${dupeSections.size} sections)` : ""}</>
                  )}
                </button>
              </div>
            </div>
            {dupeError && (
              <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 7, padding: "8px 12px", fontSize: 12, color: C.red }}>
                {dupeError}
              </div>
            )}
          </div>

        ) : dupeMode === "old" ? (
          /* ─ Step 2: Quote list (old mode) */
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}>
            <div style={{ fontSize: 13, color: C.textMuted }}>Select a previous quote to copy from.</div>
            <div style={{ position: "relative" as const }}>
              <Search style={{ width: 14, height: 14, color: C.textLight, position: "absolute" as const, left: 10, top: "50%", transform: "translateY(-50%)" }} />
              <input value={dupeSearch} onChange={e => setDupeSearch(e.target.value)}
                placeholder="Search by reference or customer…" autoFocus
                style={{ width: "100%", padding: "9px 11px 9px 32px", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 7, outline: "none", fontFamily: "inherit", boxSizing: "border-box" as const }} />
            </div>
            <div style={{ maxHeight: 340, overflowY: "auto" as const, border: `1px solid ${C.border}`, borderRadius: 8, background: C.surface }}>
              {allQuotes.filter((q: any) =>
                q.reference !== quoteNum &&
                (!dupeSearch || q.reference?.toLowerCase().includes(dupeSearch.toLowerCase()) || q.customer_name?.toLowerCase().includes(dupeSearch.toLowerCase()))
              ).length === 0 ? (
                <div style={{ padding: "24px 16px", textAlign: "center" as const, fontSize: 13, color: C.textLight }}>
                  {allQuotes.length <= 1 ? "No other quotes found." : "No matching quotes."}
                </div>
              ) : allQuotes.filter((q: any) =>
                q.reference !== quoteNum &&
                (!dupeSearch || q.reference?.toLowerCase().includes(dupeSearch.toLowerCase()) || q.customer_name?.toLowerCase().includes(dupeSearch.toLowerCase()))
              ).map((q: any) => (
                <button type="button" key={q.id}
                  onClick={() => { setDupeSelectedQ(q); setDupeSections(new Set(DUPE_SECTIONS.map(s => s.id as DupeSection))); }}
                  style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "none", border: "none", borderBottom: `1px solid ${C.borderL}`, cursor: "pointer", textAlign: "left" as const }}
                  onMouseEnter={e => (e.currentTarget.style.background = C.blueL)}
                  onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.blue }}>{q.reference}</div>
                    <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                      {q.customer_name || "(no customer)"}{(q.service_type || q.direction) ? ` · ${[q.service_type, q.direction].filter(Boolean).join(" ")}` : ""}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: C.textLight, flexShrink: 0, marginLeft: 12 }}>{new Date(q.created_at).toLocaleDateString()}</div>
                </button>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <button type="button" onClick={() => setDupeMode(null)}
                style={{ padding: "7px 13px", background: "none", border: `1px solid ${C.border}`, borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: 600, color: C.textSub }}>
                ← Back
              </button>
            </div>
          </div>

        ) : (
          /* ─ Step 1: Mode picker */
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 14 }}>
            <div style={{ fontSize: 13, color: C.textMuted }}>Choose which quote you want to duplicate data from.</div>
            <button type="button"
              onClick={() => { setDupeMode("current"); setDupeSections(new Set(DUPE_SECTIONS.map(s => s.id as DupeSection))); }}
              style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 18px", background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 10, cursor: "pointer", textAlign: "left" as const }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.blue; (e.currentTarget as HTMLElement).style.background = C.blueL; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.background = C.surface; }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: C.blueL, border: `1px solid ${C.blueBd}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <FileText style={{ width: 18, height: 18, color: C.blue }} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Duplicate from current quote</div>
                <div style={{ fontSize: 12, color: C.textMuted, marginTop: 3 }}>Copy sections from <strong style={{ color: C.blue }}>{quoteNum}</strong> into a new quote</div>
              </div>
              <ArrowRight style={{ width: 16, height: 16, color: C.textLight, marginLeft: "auto", flexShrink: 0 }} />
            </button>

            <button type="button"
              onClick={() => { setDupeMode("old"); setDupeSearch(""); setDupeSelectedQ(null); }}
              style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 18px", background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 10, cursor: "pointer", textAlign: "left" as const }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.blue; (e.currentTarget as HTMLElement).style.background = C.blueL; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.background = C.surface; }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "#F1F5F9", border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Search style={{ width: 18, height: 18, color: C.textSub }} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Duplicate from old quote</div>
                <div style={{ fontSize: 12, color: C.textMuted, marginTop: 3 }}>Search and pick any existing quote from history</div>
              </div>
              <ArrowRight style={{ width: 16, height: 16, color: C.textLight, marginLeft: "auto", flexShrink: 0 }} />
            </button>
          </div>
        )}
      </Modal>

      {/* Preview PDF modal */}
      <Modal open={modal === "preview"} onClose={() => setModal(null)} title={previewRef || quoteNum} width={820}
        extra={(
          <button
            type="button"
            onClick={() => {
              // Open PDF content in a new window and trigger print/save dialog
              const el = document.getElementById("quote-pdf-content");
              if (!el) return;
              const win = window.open("", "_blank", "width=900,height=700");
              if (!win) return;
              win.document.write(`<!DOCTYPE html><html><head><title>${previewRef || quoteNum}</title><style>
                body { margin: 0; font-family: 'Inter', -apple-system, sans-serif; background: #fff; }
                @media print { @page { margin: 12mm; size: A4; } }
              </style></head><body>${el.innerHTML}</body></html>`);
              win.document.close();
              win.focus();
              setTimeout(() => { win.print(); }, 400);
            }}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: C.blue, border: "none", borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff" }}>
            <Download style={{ width: 13, height: 13 }} /> Download PDF
          </button>
        )}
      >
        {/* Linked quote tabs — switching stays inside preview, never navigates away */}
        {linkedQuotes.length > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: 2, marginBottom: 16, borderBottom: `1px solid ${C.border}`, paddingBottom: 0, flexWrap: "wrap" as const }}>
            {linkedQuotes.map((q: any) => {
              const isActive = (previewRef || quoteNum) === q.reference;
              const svcDir = [q.service_type, q.direction].filter(Boolean).join(" ");
              return (
                <button key={q.reference} type="button"
                  onClick={() => { if (!isActive) setPreviewRef(q.reference); }}
                  style={{
                    display: "flex", flexDirection: "column" as const, alignItems: "flex-start",
                    padding: "8px 16px", background: "none", border: "none",
                    borderBottom: isActive ? `2.5px solid ${C.blue}` : "2.5px solid transparent",
                    cursor: isActive ? "default" : "pointer",
                    marginBottom: "-1px", transition: "border-color 0.12s",
                  }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget.style.borderBottomColor = C.blueBd); }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget.style.borderBottomColor = "transparent"); }}>
                  {svcDir && (
                    <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: isActive ? C.blue : C.textMuted, marginBottom: 1 }}>
                      {svcDir}
                    </span>
                  )}
                  <span style={{ fontSize: 12, fontWeight: isActive ? 800 : 600, color: isActive ? C.blue : C.textSub }}>
                    {q.reference}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {/* Build PDF data from whichever tab is active in the preview */}
        {(() => {
          const activeRef = previewRef || quoteNum;
          const previewQ = allQuotes.find((q: any) => q.reference === activeRef) ?? null;
          const pdfData = previewQ ? (() => {
            const parsedPkgs     = (() => { try { const p = JSON.parse(previewQ.packages_json  || "[]"); return Array.isArray(p) ? p : []; } catch { return []; } })();
            const parsedBuying   = (() => { try { const b = JSON.parse(previewQ.buying_lines_json  || "[]"); return Array.isArray(b) ? b : []; } catch { return []; } })();
            const parsedSelling  = (() => { try { const s = JSON.parse(previewQ.selling_lines_json || "[]"); return Array.isArray(s) ? s : []; } catch { return []; } })();
            // Look up T&C for this quote's shipping terms type
            const tc = allTerms.find((t: any) => t.name.toLowerCase() === (previewQ.shipping_terms || "").toLowerCase()) ?? null;
            return {
              quoteNum:  previewQ.reference,
              company:   previewQ.customer_name,
              contact:   previewQ.customer_contact,
              email:     previewQ.customer_email,
              phone:     previewQ.customer_phone,
              serviceType: previewQ.service_type,
              direction: previewQ.direction,
              incoterm:  previewQ.incoterm,
              origin:    previewQ.origin,
              dest:      previewQ.destination,
              readyDate: previewQ.ready_date,
              pickup:    previewQ.pickup,
              delivery:  previewQ.delivery,
              commodity: previewQ.commodity,
              packages:  parsedPkgs,
              totalPkgs: previewQ.packages,
              weight:    previewQ.weight,
              cbm:       previewQ.cbm,
              buying:    previewQ.buying_price,
              selling:   previewQ.selling_price,
              currency:  previewQ.currency || "EUR",
              additionalCosts: previewQ.additional_costs,
              buyingLines:  parsedBuying,
              sellingLines: parsedSelling,
              shippingTermsType:     previewQ.shipping_terms,
              shippingTermsIncludes: tc?.includes || "",
              shippingTermsExcludes: tc?.excludes || "",
              notes: previewQ.shipping_terms_notes,
            };
          })() : summaryQ;
          return <div id="quote-pdf-content"><QuotePDF q={pdfData} /></div>;
        })()}
      </Modal>

      {/* Send email modal */}
      <Modal open={modal === "email"} onClose={() => { setModal(null); setEmailSent(false); }} title="Send quotation by email" width={540}>
        {emailSent ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 0", gap: 12 }}>
            <div style={{ width: 52, height: 52, background: C.greenL, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Check style={{ width: 24, height: 24, color: C.green }} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Quotation sent successfully</div>
            <div style={{ fontSize: 13, color: C.textMuted }}>Quote {quoteNum} has been sent to <strong>{emailTo}</strong></div>
            <button type="button" onClick={() => { setModal(null); setEmailSent(false); }}
              style={{ padding: "9px 22px", background: C.blue, color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 8 }}>
              Done
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <Lbl text="To" req />
              <Inp type="email" value={emailTo} onChange={setEmailTo} placeholder="recipient@company.com" />
            </div>
            <div>
              <Lbl text="CC" />
              <Inp type="email" value={emailCC} onChange={setEmailCC} placeholder="cc@company.com" />
            </div>
            <div>
              <Lbl text="Message" />
              <textarea value={emailMsg} onChange={e => setEmailMsg(e.target.value)} rows={5}
                placeholder={`Dear ${customer.contact || "Sir/Madam"},\n\nPlease find attached our freight quotation ${quoteNum}.\n\nKind regards,\nLuky Slavik`}
                style={{ width: "100%", padding: "9px 11px", fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 7, outline: "none", resize: "vertical" as const, fontFamily: "inherit", boxSizing: "border-box" as const }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: C.bg, borderRadius: 7, border: `1px solid ${C.border}` }}>
              <FileText style={{ width: 14, height: 14, color: C.textMuted }} />
              <span style={{ fontSize: 12, color: C.textMuted }}>Attached: {quoteNum}.pdf</span>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Btn variant="outline" onClick={() => setModal(null)}>Cancel</Btn>
              <button type="button" onClick={() => setEmailSent(true)} disabled={!emailTo.trim()}
                style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", background: emailTo.trim() ? C.blue : C.border, color: emailTo.trim() ? "#fff" : C.textLight, border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: emailTo.trim() ? "pointer" : "default" }}>
                <Send style={{ width: 14, height: 14 }} /> Send quotation
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

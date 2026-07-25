import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Customer } from "@shared/schema";
import {
  Search, Plus, Building2, Loader2, AlertCircle, CheckCircle2, X,
  Users, UserCheck, UserPlus, Star, AlertTriangle,
  Upload, Download, Settings, ScrollText,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// ── Sidebar config ────────────────────────────────────────────────────────────
const SIDEBAR_ITEMS = [
  { id: "all",       label: "All Customers",  icon: Users },
  { id: "active",    label: "Active",          icon: UserCheck },
  { id: "prospects", label: "Prospects",       icon: UserPlus },
  { id: "key",       label: "Key Accounts",    icon: Star },
  { id: "risk",      label: "At Risk",         icon: AlertTriangle },
];
const SIDEBAR_BOTTOM: typeof SIDEBAR_ITEMS = [];
const SIGNED_IN_USER = "Luky Slavik";

const SIDEBAR_BG = "#1E293B";

function SidebarBtn({ item, active, onClick }: { item: { id: string; label: string; icon: any }; active: boolean; onClick: () => void }) {
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
      <span style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? "#E2E8F0" : "#94A3B8" }}>{item.label}</span>
    </button>
  );
}

// ── Formatters ───────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined) {
  if (!n && n !== 0) return "—";
  return new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}
function fmtPct(rev: number | null | undefined, profit: number | null | undefined) {
  if (!rev || rev === 0) return "—";
  return (((profit ?? 0) / rev) * 100).toFixed(1) + "%";
}

// ── Segment config ────────────────────────────────────────────────────────────
const SEG: Record<string, { bg: string; color: string; border: string }> = {
  "KEY ACCOUNT":     { bg: "#FEF3C7", color: "#92400E", border: "#FCD34D" },
  "PROSPECT":        { bg: "#EFF6FF", color: "#1D4ED8", border: "#BFDBFE" },
  "TARGET CUSTOMER": { bg: "#F5F3FF", color: "#5B21B6", border: "#DDD6FE" },
  "STANDARD":        { bg: "#F9FAFB", color: "#374151", border: "#E5E7EB" },
  "RISK":            { bg: "#FEF2F2", color: "#B91C1C", border: "#FECACA" },
};
function SegBadge({ v }: { v: string }) {
  const c = SEG[v] ?? SEG["PROSPECT"];
  return (
    <span className="badge" style={{ background: c.bg, color: c.color, borderColor: c.border }}>{v}</span>
  );
}

const STATUS: Record<string, { dot: string; color: string }> = {
  Active:   { dot: "#16A34A", color: "#15803D" },
  Prospect: { dot: "#2563EB", color: "#1E40AF" },
  Inactive: { dot: "#9CA3AF", color: "#6B7280" },
};
function StatusCell({ s }: { s: string }) {
  const c = STATUS[s] ?? STATUS.Inactive;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 500, color: c.color }}>
      <span className="status-dot" style={{ background: c.dot }} />{s}
    </span>
  );
}

// ── ARES Add Customer Modal ───────────────────────────────────────────────────
function AddCustomerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [ico, setIco] = useState("");
  const [step, setStep] = useState<"input" | "loading" | "preview" | "error">("input");
  const [aresData, setAresData] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [creating, setCreating] = useState(false);

  const reset = () => { setIco(""); setStep("input"); setAresData(null); setErrorMsg(""); };
  const handleClose = () => { reset(); onClose(); };

  const lookup = async () => {
    const v = ico.replace(/\s/g, "").trim();
    if (!/^\d{8}$/.test(v)) { setErrorMsg("IČO must be exactly 8 digits"); setStep("error"); return; }
    setStep("loading");
    try {
      const res = await apiRequest("GET", `/api/ares/${v}`);
      const data = await res.json();
      if (data.error) { setErrorMsg(data.error); setStep("error"); return; }
      setAresData(data); setStep("preview");
    } catch { setErrorMsg("Company not found in ARES registry"); setStep("error"); }
  };

  const create = async () => {
    if (!aresData) return;
    setCreating(true);
    try {
      const res = await apiRequest("POST", "/api/customers", { ...aresData, status: "Prospect", salesOwner: "", label: "PROSPECT" });
      const data = await res.json();
      if (data.error === "duplicate") {
        toast({ title: "Customer already exists" });
        setLocation(`/customers/${data.customer.id}`);
        handleClose(); return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({ title: "Customer created" });
      setLocation(`/customers/${data.id}`);
      handleClose();
    } catch { toast({ title: "Error creating customer", variant: "destructive" }); }
    finally { setCreating(false); }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 8, maxWidth: 520, padding: 0, overflow: "hidden" }}>
        {/* Modal header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #E5E7EB" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111827", letterSpacing: "-0.01em", margin: 0 }}>Add New Customer</h2>
          <p style={{ fontSize: 12, color: "#6B7280", marginTop: 3 }}>Enter an IČO to automatically fetch company data from the Czech ARES registry</p>
        </div>

        <div style={{ padding: 20 }}>
          {step === "input" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label className="field-label">IČO — Company ID (8 digits)</label>
                <input className="crm-input" data-testid="input-ico" value={ico}
                  onChange={e => setIco(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  onKeyDown={e => e.key === "Enter" && lookup()}
                  placeholder="e.g. 27082440"
                  style={{ fontFamily: "'SF Mono', 'Fira Code', monospace", fontSize: 18, letterSpacing: "0.2em", fontWeight: 600, textAlign: "center" }}
                  maxLength={8} autoFocus />
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="btn btn-outline" onClick={handleClose}>Cancel</button>
                <button className="btn btn-primary" onClick={lookup} disabled={ico.length !== 8} data-testid="button-lookup-ares">
                  Look up in ARES
                </button>
              </div>
            </div>
          )}

          {step === "loading" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "28px 0" }}>
              <Loader2 style={{ width: 26, height: 26, color: "#2563EB", animation: "spin 1s linear infinite" }} />
              <span style={{ fontSize: 13, color: "#6B7280" }}>Fetching from ARES registry…</span>
            </div>
          )}

          {step === "error" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", gap: 10, padding: "11px 14px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 6 }}>
                <AlertCircle style={{ width: 15, height: 15, color: "#DC2626", flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#B91C1C" }}>Company not found in registry</p>
                  <p style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{errorMsg}</p>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="btn btn-outline" onClick={handleClose}>Cancel</button>
                <button className="btn btn-outline" onClick={() => { setStep("input"); setErrorMsg(""); }}>Try again</button>
              </div>
            </div>
          )}

          {step === "preview" && aresData && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", gap: 8, padding: "9px 12px", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 5, alignItems: "center" }}>
                <CheckCircle2 style={{ width: 14, height: 14, color: "#16A34A", flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: "#15803D", fontWeight: 600 }}>Company found in ARES registry</span>
              </div>
              <div className="panel">
                {[
                  ["Company name", aresData.companyName, true],
                  ["IČO", aresData.ico, false, true],
                  ["DIČ", aresData.dic || "—", false, true],
                  ["Registered address", aresData.registeredAddress],
                  ["Legal form", aresData.legalForm || "—"],
                  ["Status", aresData.companyStatus || "—"],
                  ["Registration date", aresData.registrationDate || "—"],
                ].map(([k, v, bold, mono], i, arr) => (
                  <div key={k as string} style={{ display: "flex", borderBottom: i < arr.length - 1 ? "1px solid #F3F4F6" : "none" }}>
                    <div style={{ width: 140, flexShrink: 0, padding: "8px 12px", background: "#F9FAFB", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "#6B7280", display: "flex", alignItems: "center" }}>{k as string}</div>
                    <div style={{ padding: "8px 12px", fontSize: bold ? 14 : 13, fontWeight: bold ? 700 : mono ? 500 : 400, color: "#111827", fontFamily: mono ? "monospace" : undefined }}>{v as string}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="btn btn-outline" onClick={() => { setStep("input"); setAresData(null); }}>Back</button>
                <button className="btn btn-primary" onClick={create} disabled={creating} data-testid="button-confirm-create">
                  {creating ? <Loader2 style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} /> : null}
                  Confirm & Create Customer
                </button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Customer List ─────────────────────────────────────────────────────────────
export default function CustomerList() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [sortBy, setSortBy] = useState("createdAt");
  const [addOpen, setAddOpen] = useState(false);
  const [debSearch, setDebSearch] = useState("");
  const [activeSection, setActiveSection] = useState("all");

  const handleSearch = (val: string) => {
    setSearch(val);
    clearTimeout((window as any).__st);
    (window as any).__st = setTimeout(() => setDebSearch(val), 250);
  };

  const params = new URLSearchParams();
  if (debSearch) params.set("search", debSearch);
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (countryFilter !== "all") params.set("country", countryFilter);
  if (sortBy) params.set("sortBy", sortBy);

  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers", debSearch, statusFilter, countryFilter, sortBy],
    queryFn: () => apiRequest("GET", `/api/customers?${params}`).then(r => r.json()),
  });

  const countries = [...new Set(customers.map(c => c.country).filter(Boolean))].sort();

  // Sidebar section filter applied on top of existing filters
  const sectionFiltered = customers.filter(c => {
    if (activeSection === "active")    return c.status === "Active";
    if (activeSection === "prospects") return c.status === "Prospect";
    if (activeSection === "key")       return c.label === "KEY ACCOUNT";
    if (activeSection === "risk")      return c.label === "RISK";
    return true; // "all"
  });

  // Section label for page title
  const sectionLabel = [...SIDEBAR_ITEMS, ...SIDEBAR_BOTTOM].find(s => s.id === activeSection)?.label ?? "Customers";

  // All current sections show the table (no more non-table items in this sidebar)
  const showTable = true;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "var(--font-system)" }}>

      {/* ── Top nav ── */}
      <nav style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", height: 50, display: "flex", alignItems: "center", padding: "0 24px", gap: 24, flexShrink: 0, position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, background: "#1D4ED8", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Building2 style={{ width: 14, height: 14, color: "#fff" }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#111827", letterSpacing: "-0.02em" }}>CRM</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", height: "100%", gap: 2 }}>
          <div style={{ height: "100%", display: "flex", alignItems: "center", padding: "0 14px", borderBottom: "2px solid #1D4ED8" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#1D4ED8" }}>Customer database</span>
          </div>
          <div style={{ height: "100%", display: "flex", alignItems: "center", padding: "0 14px", borderBottom: "2px solid transparent", cursor: "pointer" }}
            onClick={() => setLocation("/sales")}>
            <span style={{ fontSize: 13, fontWeight: 500, color: "#6B7280" }}>Sales</span>
          </div>
        </div>
      </nav>

      {/* ── Body: sidebar + content ── */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>

        {/* Sidebar */}
        <aside style={{
          width: 220, flexShrink: 0, background: SIDEBAR_BG,
          display: "flex", flexDirection: "column",
          position: "sticky", top: 50, height: "calc(100vh - 50px)", overflowY: "auto",
        }}>
          <div style={{ padding: "18px 18px 10px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#64748B" }}>Customers</div>
          <div style={{ flex: 1 }}>
            {SIDEBAR_ITEMS.map(item => (
              <SidebarBtn key={item.id} item={item} active={activeSection === item.id}
                onClick={() => setActiveSection(item.id)} />
            ))}
          </div>
          {/* Account footer */}
          <div style={{ margin: "0 0 0", borderTop: "1px solid #334155", padding: "12px 16px", display: "flex", alignItems: "center", gap: 9 }}>
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
        <main style={{ flex: 1, background: "var(--color-bg)", overflowY: "auto", display: "flex", flexDirection: "column" }}>

      {/* ── Page header ── */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "13px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#111827", letterSpacing: "-0.02em", margin: "0 0 2px" }}>{sectionLabel}</h1>
          <p style={{ fontSize: 12, fontWeight: 400, color: "#9CA3AF", margin: 0 }}>
            Central client database · <strong style={{ color: "#374151", fontWeight: 600 }}>{sectionFiltered.length}</strong> records
          </p>
        </div>
        {showTable && (
          <button className="btn btn-primary" onClick={() => setAddOpen(true)} data-testid="button-add-customer" style={{ padding: "8px 16px", fontSize: 13 }}>
            <Plus style={{ width: 14, height: 14 }} /> Add Customer
          </button>
        )}
      </div>

      {showTable ? (
        <>
      {/* ── Toolbar ── */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "10px 24px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", flexShrink: 0 }}>
        <div style={{ position: "relative", flex: "1 1 200px", maxWidth: 280 }}>
          <Search style={{ width: 13, height: 13, color: "#9CA3AF", position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          <input className="crm-input" data-testid="input-search" value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Search name, IČO, VAT ID…"
            style={{ paddingLeft: 30, paddingRight: search ? 28 : 10 }}
          />
          {search && (
            <button onClick={() => { setSearch(""); setDebSearch(""); }}
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}>
              <X style={{ width: 12, height: 12, color: "#9CA3AF" }} />
            </button>
          )}
        </div>

        <select className="crm-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width: 140 }}>
          <option value="all">All statuses</option>
          <option value="Active">Active</option>
          <option value="Prospect">Prospect</option>
          <option value="Inactive">Inactive</option>
        </select>

        <select className="crm-select" value={countryFilter} onChange={e => setCountryFilter(e.target.value)} style={{ width: 140 }}>
          <option value="all">All countries</option>
          {countries.map(c => <option key={c} value={c!}>{c}</option>)}
        </select>

        <select className="crm-select" value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ width: 180 }}>
          <option value="createdAt">Sort: Recently added</option>
          <option value="revenue">Sort: Revenue ↓</option>
          <option value="margin">Sort: Margin % ↓</option>
          <option value="lastActivity">Sort: Last activity</option>
        </select>
      </div>

      {/* ── Table ── */}
      <div style={{ padding: "16px 24px" }}>
        <div className="panel">
          <table className="crm-table">
            <thead>
              <tr>
                <th style={{ width: "28%" }}>Customer</th>
                <th>IČO</th>
                <th>Country</th>
                <th>Sales Owner</th>
                <th>Account Type</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {[200, 80, 50, 100, 90, 70].map((w, j) => (
                      <td key={j}><div style={{ height: 12, width: w, background: "#F3F4F6", borderRadius: 3 }} /></td>
                    ))}
                  </tr>
                ))
              ) : sectionFiltered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "52px 0", color: "#9CA3AF" }}>
                    <Building2 style={{ width: 28, height: 28, margin: "0 auto 8px", opacity: 0.25, display: "block" }} />
                    <p style={{ fontSize: 14, fontWeight: 600, color: "#374151", margin: "0 0 4px" }}>
                      {debSearch || statusFilter !== "all" ? "No customers match your filters" : "No customers yet"}
                    </p>
                    <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>
                      {debSearch || statusFilter !== "all" ? "Try adjusting your search" : "Click Add Customer to get started"}
                    </p>
                  </td>
                </tr>
              ) : (
                sectionFiltered.map(c => (
                  <tr key={c.id} data-testid={`row-customer-${c.id}`} style={{ cursor: "pointer" }}
                    onClick={() => setLocation(`/customers/${c.id}`)}>
                    {/* Customer name */}
                    <td style={{ padding: "5px 10px" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", letterSpacing: "-0.01em" }}>{c.companyName}</div>
                    </td>
                    <td className="mono">{c.ico}</td>
                    <td style={{ fontSize: 13, color: "#374151" }}>{c.country || "—"}</td>
                    <td style={{ fontSize: 13, color: c.salesOwner ? "#374151" : "#D1D5DB" }}>{c.salesOwner || "—"}</td>
                    <td><SegBadge v={c.label ?? "PROSPECT"} /></td>
                    <td><StatusCell s={c.status} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer count */}
        {!isLoading && sectionFiltered.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 12, color: "#9CA3AF", textAlign: "right" }}>
            Showing <strong style={{ color: "#374151" }}>{sectionFiltered.length}</strong> customer{sectionFiltered.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>
        </>
      ) : (
        /* Placeholder for non-table sections */
        <div style={{ padding: "40px 28px" }}>
          <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, maxWidth: 480, padding: "32px 28px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>{sectionLabel}</div>
            <div style={{ fontSize: 13, color: "#64748B", lineHeight: 1.7 }}>This section is under construction and will be available soon.</div>
            <span style={{ display: "inline-block", marginTop: 14, fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "#9CA3AF", background: "#F8FAFC", border: "1px solid #E5E7EB", padding: "3px 10px", borderRadius: 20 }}>Coming soon</span>
          </div>
        </div>
      )}

      <AddCustomerModal open={addOpen} onClose={() => setAddOpen(false)} />
        </main>
      </div>
    </div>
  );
}

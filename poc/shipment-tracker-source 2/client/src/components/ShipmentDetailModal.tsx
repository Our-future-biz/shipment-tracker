import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Check,
  Upload,
  FileText,
  File,
  Trash2,
  MapPin,
  Ship,
  Package,
  Anchor,
  Maximize2,
  Minimize2,
  ExternalLink,
  SplitSquareHorizontal,
  Plus,
  DollarSign,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { ShipmentWarehouseTab } from "./ShipmentWarehouseTab";
import { useAuth } from "@/lib/auth-context";

// ─── Task lists (Import / Export) ───────────────────────────────

const IMPORT_TASKS = [
  { key: "imp_booking_to_agent", label: "Booking to agent" },
  { key: "imp_booking_confirmed", label: "Booking confirmed" },
  { key: "imp_cargo_readiness", label: "Cargo readiness confirmed" },
  { key: "imp_cargo_shipped", label: "Cargo shipped" },
  { key: "imp_pre_alert", label: "Pre-Alert received" },
  { key: "imp_arrival_notice", label: "Arrival notice sent" },
  { key: "imp_paperwork_received", label: "Paperwork received" },
  { key: "imp_paperwork_customs", label: "Paperwork provide to customs" },
  { key: "imp_cargo_released", label: "Cargo released for further transport" },
  { key: "imp_booked_transport", label: "Booked for further transport" },
  { key: "imp_departed_port", label: "Cargo departured from port" },
  { key: "imp_arrived_hub", label: "Cargo arrived to HUB" },
  { key: "imp_customs_cleared", label: "Cargo customs cleared" },
  { key: "imp_delivered", label: "Delivered" },
  { key: "imp_billed", label: "Billed" },
] as const;

const EXPORT_TASKS = [
  { key: "exp_cargo_readiness", label: "Cargo readiness checked with customer" },
  { key: "exp_booked_line", label: "Booked with shipping line" },
  { key: "exp_booking_received", label: "Booking received" },
  { key: "exp_pre_carriage", label: "Pre-carriage booked" },
  { key: "exp_paperwork_customer", label: "Paperwork received from customer" },
  { key: "exp_draft_sent", label: "Draft sent to customer" },
  { key: "exp_vgm_filed", label: "VGM filed" },
  { key: "exp_si_filed", label: "Shipping Instructions filed" },
  { key: "exp_ams_filed", label: "AMS filed (only for US related cargo)" },
  { key: "exp_zapp_issued", label: "Zapp issued" },
  { key: "exp_zapp_released", label: "Zapp released" },
  { key: "exp_billed", label: "Billed" },
  { key: "exp_bl_provided", label: "Bill Of Lading provided to customer" },
] as const;

// Legacy aliases
const TASK_LIST_GROUP1 = IMPORT_TASKS;
const TASK_LIST_GROUP2 = EXPORT_TASKS;

const ALL_TASK_KEYS = [
  ...IMPORT_TASKS.map((t) => t.key),
  ...EXPORT_TASKS.map((t) => t.key),
];

const MILESTONE_STEPS = [
  "Booking confirmed",
  "Cargo ready",
  "In transit",
  "Arrived at POD",
  "Customs clearance",
  "Delivered",
];

function getStatusStep(status: string): number {
  const s = status.trim().toUpperCase();
  if (s === "BOOKING CONFIRMATION PENDING") return 0;
  if (s === "ALL DONE - WAITING TO BE SHIPPED") return 1;
  if (s.startsWith("ODPLULO")) return 3;
  if (s === "DELIVERY DATE PENDING FROM CUSTOMER") return 4;
  if (s === "VYFA") return 6;
  return 0;
}

function getStatusBadgeColor(status: string): string {
  const s = status.trim().toUpperCase();
  if (s === "VYFA") return "var(--brand-green)";
  if (s === "DELIVERY DATE PENDING FROM CUSTOMER") return "#EAB308";
  if (s.startsWith("ODPLULO")) return "#F97316";
  if (s === "ALL DONE - WAITING TO BE SHIPPED") return "var(--brand-blue)";
  if (s === "BOOKING CONFIRMATION PENDING") return "var(--brand-red)";
  return "#6B7280";
}

// ─── Types ──────────────────────────────────────────────────────

interface AttachmentFile {
  id: string;
  name: string;
  size: number;
  type: string;
  addedAt?: string;
}

interface TaskState {
  completed: boolean;
  completedAt?: string;
  completedBy?: string; // user email
}

// ─── Costs types ────────────────────────────────────────────────

const COST_CATEGORIES = [
  { key: "freight", label: "Freight" },
  { key: "collection", label: "Collection/Delivery" },
  { key: "locals", label: "Locals" },
  { key: "others", label: "Others" },
  { key: "insurance", label: "Insurance" },
  { key: "customs", label: "Customs clearance" },
] as const;

const CURRENCIES = ["CZK", "USD", "EUR", "GBP", "CNY"] as const;
type Currency = (typeof CURRENCIES)[number];

interface CostRow {
  category: string;
  estAmount: string;
  estCurrency: Currency;
  realAmount: string;
  realCurrency: Currency;
  invoiceNo: string;
  vendor: string;
}

interface AdditionalCharge {
  id: string;
  description: string;
  estAmount: string;
  estCurrency: Currency;
  realAmount: string;
  realCurrency: Currency;
  invoiceNo: string;
  vendor: string;
}

interface BillingSettings {
  billingCurrency: Currency;
  roe: string;
}

interface BillingOverride {
  rowKey: string;
  billingAmount: string;
}

// ─── Linked Quote Panel ─────────────────────────────────────────

const QUOTE_DISPLAY_FIELDS = [
  "Shipper", "Consignee", "Load Type", "Agent", "Agent's PIC",
  "Incoterm Origin", "Incoterm Destination", "Cargo Origin", "Origin",
  "POL", "POD", "Destination", "HS Code", "Cargo Description",
  "Trade Direction", "Volume", "Weight", "Number of pieces",
  "CNTR count [1]", "CNTR length [1]", "CNTR count [2]", "CNTR length [2]",
] as const;

const COST_CATEGORY_LABELS: Record<string, string> = {
  freight: "Freight",
  collection: "Collection/Delivery",
  locals: "Locals",
  others: "Others",
  insurance: "Insurance",
  customs: "Customs",
};

interface QuoteCostData {
  costs: { category: string; realAmount: string; realCurrency: string }[];
  additionalCharges: { description: string; realAmount: string; realCurrency: string }[];
  billingOverrides: Record<string, string>;
  billingCurrency: string;
}

function LinkedQuotePanel({ quoteNumber, onClose }: { quoteNumber: string; onClose: () => void }) {
  const [quoteData, setQuoteData] = useState<Record<string, string> | null>(null);
  const [costData, setCostData] = useState<QuoteCostData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const fetchAll = async () => {
      try {
        const quotesResp = await apiRequest("GET", "/api/quotes");
        const quotes: any[] = await quotesResp.json();
        const found = quotes.find((q: any) => q.quoteNumber === quoteNumber);
        if (found && !cancelled) {
          const parsed = typeof found.data === "string" ? JSON.parse(found.data) : found.data;
          setQuoteData(parsed);
        }

        const costsResp = await apiRequest("GET", `/api/invoicing/${encodeURIComponent(quoteNumber)}`);
        const costsJson = await costsResp.json();

        const billingResp = await apiRequest("GET", `/api/billing/${encodeURIComponent(quoteNumber)}`);
        const billingJson = await billingResp.json();

        if (!cancelled) {
          const overridesMap: Record<string, string> = {};
          for (const ov of billingJson.overrides || []) {
            overridesMap[ov.rowKey] = ov.billingAmount;
          }
          setCostData({
            costs: costsJson.costs || [],
            additionalCharges: costsJson.additionalCharges || [],
            billingOverrides: overridesMap,
            billingCurrency: billingJson.settings?.billingCurrency || "CZK",
          });
        }
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false);
    };

    fetchAll();
    return () => { cancelled = true; };
  }, [quoteNumber]);

  const parseCostNum = (v: string) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
  const supplierTotal = costData
    ? costData.costs.reduce((s, c) => s + parseCostNum(c.realAmount), 0)
      + costData.additionalCharges.reduce((s, c) => s + parseCostNum(c.realAmount), 0)
    : 0;
  const billingTotal = costData
    ? costData.costs.reduce((s, c) => {
        const ov = costData.billingOverrides[c.category];
        return s + parseCostNum(ov || c.realAmount);
      }, 0)
      + costData.additionalCharges.reduce((s, c) => s + parseCostNum(c.realAmount), 0)
    : 0;
  const profit = billingTotal - supplierTotal;

  const fmtNum = (n: number) => n.toLocaleString("en", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  return (
    <div
      className="flex flex-col h-full border-l overflow-y-auto"
      style={{ width: "400px", minWidth: "400px", background: "hsl(var(--surface-8))", borderColor: "hsl(var(--border-20))" }}
    >
      {/* Header */}
      <div className="flex-none flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "hsl(var(--border-20))", background: "hsl(var(--surface-9))" }}>
        <div className="flex items-center gap-2 min-w-0">
          <SplitSquareHorizontal className="w-4 h-4 text-[var(--brand-teal)] flex-none" />
          <div className="min-w-0">
            <h3 className="text-xs font-semibold text-foreground">Linked Quote</h3>
            <p className="text-[10px] text-muted-foreground font-mono">{quoteNumber}</p>
          </div>
        </div>
        <button onClick={onClose} className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors flex-none">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">Loading...</div>
        ) : !quoteData ? (
          <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">Quote not found</div>
        ) : (
          <div className="space-y-4">
            {/* Quote fields */}
            <div>
              <h4 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                <Ship className="w-3 h-3 text-[var(--brand-teal)]" /> Quote Details
              </h4>
              <div className="space-y-1.5">
                {QUOTE_DISPLAY_FIELDS.map((field) => {
                  const val = quoteData[field];
                  if (!val) return null;
                  return (
                    <div key={field} className="flex items-start gap-2">
                      <span className="text-[11px] text-muted-foreground flex-none" style={{ width: "120px" }}>{field}</span>
                      <span className="text-xs text-foreground">{val}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Cost Breakdown */}
            {costData && (costData.costs.length > 0 || costData.additionalCharges.length > 0) && (
              <div>
                <h4 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Package className="w-3 h-3 text-[var(--brand-teal)]" /> Cost Breakdown
                </h4>
                <div className="rounded-lg overflow-hidden" style={{ background: "hsl(var(--surface-11))" }}>
                  <div className="grid grid-cols-3 gap-1 px-3 py-1.5 text-[10px] uppercase tracking-wide font-semibold text-muted-foreground border-b" style={{ borderColor: "hsl(var(--border-18))" }}>
                    <span>Category</span>
                    <span className="text-right">Suppliers</span>
                    <span className="text-right">Billing</span>
                  </div>
                  {costData.costs.map((c) => {
                    const billingAmt = costData.billingOverrides[c.category] || c.realAmount;
                    if (!c.realAmount && !billingAmt) return null;
                    return (
                      <div key={c.category} className="grid grid-cols-3 gap-1 px-3 py-1.5 text-xs border-b" style={{ borderColor: "hsl(var(--border-15))" }}>
                        <span className="text-foreground/80">{COST_CATEGORY_LABELS[c.category] || c.category}</span>
                        <span className="text-right tabular-nums text-foreground">
                          {c.realAmount ? `${fmtNum(parseCostNum(c.realAmount))} ${c.realCurrency}` : "\u2014"}
                        </span>
                        <span className="text-right tabular-nums text-foreground">
                          {billingAmt ? `${fmtNum(parseCostNum(billingAmt))} ${costData.billingCurrency}` : "\u2014"}
                        </span>
                      </div>
                    );
                  })}
                  {costData.additionalCharges.map((ac, i) => (
                    <div key={`ac-${i}`} className="grid grid-cols-3 gap-1 px-3 py-1.5 text-xs border-b" style={{ borderColor: "hsl(var(--border-15))" }}>
                      <span className="text-foreground/80">{ac.description || "Additional"}</span>
                      <span className="text-right tabular-nums text-foreground">
                        {ac.realAmount ? `${fmtNum(parseCostNum(ac.realAmount))} ${ac.realCurrency}` : "\u2014"}
                      </span>
                      <span className="text-right tabular-nums text-foreground">\u2014</span>
                    </div>
                  ))}
                  <div className="grid grid-cols-3 gap-1 px-3 py-2 text-xs font-semibold" style={{ background: "hsl(var(--surface-9))" }}>
                    <span className="text-foreground">Total</span>
                    <span className="text-right tabular-nums text-foreground">{fmtNum(supplierTotal)} {costData.billingCurrency}</span>
                    <span className="text-right tabular-nums text-foreground">{fmtNum(billingTotal)} {costData.billingCurrency}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 px-3 py-2 text-xs font-semibold" style={{ background: "hsl(var(--surface-7))" }}>
                    <span className="text-foreground">Profit</span>
                    <span />
                    <span className={`text-right tabular-nums font-bold ${profit >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {profit >= 0 ? "+" : ""}{fmtNum(profit)} {costData.billingCurrency}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Popout Window (full page detail view) ──────────────────────

function PopoutDetailView({ jobNumber, shipmentData, onClose }: { jobNumber: string; shipmentData: Record<string, string>; onClose: () => void }) {
  const safeData = shipmentData || {};
  const fields = Object.entries(safeData).filter(([, v]) => v && v.trim() !== "");

  return createPortal(
    <div className="fixed inset-0 z-[999999] overflow-y-auto" style={{ background: "hsl(var(--surface-6))" }}>
      <div className="max-w-5xl mx-auto px-8 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold font-mono text-[var(--brand-teal)]">{jobNumber}</h1>
            <p className="text-xs text-muted-foreground mt-1">
              {safeData["POL"] || "—"} → {safeData["POD"] || "—"} → {safeData["Destination"] || "—"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors hover:bg-white/5"
            style={{ color: "hsl(var(--muted-65))", border: "1px solid hsl(var(--border-20))" }}
          >
            <X className="w-3.5 h-3.5" /> Close
          </button>
        </div>
        <div className="grid grid-cols-3 gap-x-6 gap-y-2">
          {fields.map(([key, value]) => (
            <div key={key} className="flex flex-col py-1.5 border-b" style={{ borderColor: "hsl(var(--border-15))" }}>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{key}</span>
              <span className="text-xs text-foreground mt-0.5">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Costs Breakdown Tab ─────────────────────────────────────────

function CostsBreakdownTab({ jobNumber }: { jobNumber: string }) {
  const [costs, setCosts] = useState<CostRow[]>(
    COST_CATEGORIES.map((c) => ({
      category: c.key,
      estAmount: "",
      estCurrency: "CZK" as Currency,
      realAmount: "",
      realCurrency: "CZK" as Currency,
      invoiceNo: "",
      vendor: "",
    }))
  );
  const [additionalCharges, setAdditionalCharges] = useState<AdditionalCharge[]>([]);
  const [billing, setBilling] = useState<BillingSettings>({ billingCurrency: "CZK", roe: "1" });
  const [billingOverrides, setBillingOverrides] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [quoteInput, setQuoteInput] = useState("");
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteStatus, setQuoteStatus] = useState<string | null>(null);

  // Import costs from a quote number
  const importQuoteCosts = useCallback(async (rawInput: string) => {
    if (!rawInput.trim()) return;
    setQuoteLoading(true);
    setQuoteStatus(null);
    // Accept full invoice number (CZQ00000001-001) or just quote number (CZQ00000001)
    // Extract parent quote number by removing the -NNN suffix
    const qn = rawInput.trim().replace(/-\d+$/, "");
    try {
      // Fetch quote costs
      const costsResp = await apiRequest("GET", `/api/invoicing/${encodeURIComponent(qn.trim())}`);
      const costsJson = await costsResp.json();
      const billingResp = await apiRequest("GET", `/api/billing/${encodeURIComponent(qn.trim())}`);
      const billingJson = await billingResp.json();

      const quoteCosts = costsJson.costs || [];
      if (quoteCosts.length === 0) {
        setQuoteStatus("No costs found for this quote");
        setQuoteLoading(false);
        return;
      }

      // Map quote costs to estimated costs + save
      const costMap: Record<string, any> = {};
      for (const c of quoteCosts) costMap[c.category] = c;

      const updated = costs.map((row) => {
        const src = costMap[row.category];
        if (src && src.realAmount) {
          const newRow = { ...row, estAmount: src.realAmount, estCurrency: (src.realCurrency || "CZK") as Currency };
          // Save to API
          apiRequest("POST", "/api/invoicing/costs", {
            jobNumber, category: row.category,
            estAmount: newRow.estAmount, estCurrency: newRow.estCurrency,
            realAmount: newRow.realAmount, realCurrency: newRow.realCurrency,
            invoiceNumber: newRow.invoiceNo, vendor: newRow.vendor,
          }).catch(() => {});
          return newRow;
        }
        return row;
      });
      setCosts(updated);

      // Import billing settings if available
      const quoteOverrides: Record<string, string> = {};
      for (const ov of billingJson.overrides || []) quoteOverrides[ov.rowKey] = ov.billingAmount;
      if (Object.keys(quoteOverrides).length > 0) {
        setBillingOverrides((prev) => ({ ...prev, ...quoteOverrides }));
        for (const [rowKey, amt] of Object.entries(quoteOverrides)) {
          apiRequest("POST", "/api/billing/override", { jobNumber, rowKey, billingAmount: amt }).catch(() => {});
        }
      }

      if (billingJson.settings?.billingCurrency) {
        const newBilling = { ...billing, billingCurrency: billingJson.settings.billingCurrency as Currency };
        if (billingJson.settings.roe) newBilling.roe = billingJson.settings.roe;
        setBilling(newBilling);
        // Save billing settings directly
        apiRequest("POST", "/api/billing/settings", { jobNumber, billingCurrency: newBilling.billingCurrency, roe: newBilling.roe }).catch(() => {});
      }

      const importedCount = quoteCosts.filter((c: any) => c.realAmount).length;
      setQuoteStatus(`Imported ${importedCount} cost(s) from ${qn.trim()}`);
    } catch (err: any) {
      setQuoteStatus("Quote not found or error loading costs");
    }
    setQuoteLoading(false);
  }, [costs, billing, jobNumber]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const fetchAll = async () => {
      try {
        const [invResp, billResp] = await Promise.all([
          apiRequest("GET", `/api/invoicing/${encodeURIComponent(jobNumber)}`),
          apiRequest("GET", `/api/billing/${encodeURIComponent(jobNumber)}`),
        ]);
        const invJson = await invResp.json();
        const billJson = await billResp.json();
        if (!cancelled) {
          // Merge fetched costs with category structure
          const costMap: Record<string, any> = {};
          for (const c of invJson.costs || []) costMap[c.category] = c;
          setCosts(
            COST_CATEGORIES.map((c) => {
              const src = costMap[c.key] || {};
              return {
                category: c.key,
                estAmount: src.estAmount || "",
                estCurrency: (src.estCurrency as Currency) || "CZK",
                realAmount: src.realAmount || "",
                realCurrency: (src.realCurrency as Currency) || "CZK",
                invoiceNo: src.invoiceNo || "",
                vendor: src.vendor || "",
              };
            })
          );
          const addChg: AdditionalCharge[] = (invJson.additionalCharges || []).map((ac: any, i: number) => ({
            id: ac.id || String(i),
            description: ac.description || "",
            estAmount: ac.estAmount || "",
            estCurrency: (ac.estCurrency as Currency) || "CZK",
            realAmount: ac.realAmount || "",
            realCurrency: (ac.realCurrency as Currency) || "CZK",
            invoiceNo: ac.invoiceNo || "",
            vendor: ac.vendor || "",
          }));
          setAdditionalCharges(addChg);

          const ovMap: Record<string, string> = {};
          for (const ov of billJson.overrides || []) ovMap[ov.rowKey] = ov.billingAmount;
          setBillingOverrides(ovMap);
          setBilling({
            billingCurrency: (billJson.settings?.billingCurrency as Currency) || "CZK",
            roe: billJson.settings?.roe || "1",
          });
        }
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false);
    };
    fetchAll();
    return () => { cancelled = true; };
  }, [jobNumber]);

  const parseCostNum = (v: string) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
  const fmtNum = (n: number) => n.toLocaleString("en", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  const saveInvoicing = useCallback(async () => {
    try {
      await apiRequest("POST", `/api/invoicing/${encodeURIComponent(jobNumber)}`, {
        costs,
        additionalCharges,
      });
    } catch { /* ignore */ }
  }, [jobNumber, costs, additionalCharges]);

  const saveBilling = useCallback(async (overrides: Record<string, string>, settings: BillingSettings) => {
    try {
      await apiRequest("POST", `/api/billing/${encodeURIComponent(jobNumber)}`, {
        settings,
        overrides: Object.entries(overrides).map(([rowKey, billingAmount]) => ({ rowKey, billingAmount })),
      });
    } catch { /* ignore */ }
  }, [jobNumber]);

  const updateCostField = (category: string, field: keyof CostRow, value: string) => {
    setCosts((prev) => prev.map((c) => c.category === category ? { ...c, [field]: value } : c));
  };

  const updateBillingOverride = (rowKey: string, value: string) => {
    setBillingOverrides((prev) => ({ ...prev, [rowKey]: value }));
  };

  const addCharge = () => {
    setAdditionalCharges((prev) => [
      ...prev,
      { id: `new-${Date.now()}`, description: "", estAmount: "", estCurrency: "CZK", realAmount: "", realCurrency: "CZK", invoiceNo: "", vendor: "" },
    ]);
  };

  const deleteCharge = (id: string) => {
    setAdditionalCharges((prev) => prev.filter((c) => c.id !== id));
  };

  const updateChargeField = (id: string, field: keyof AdditionalCharge, value: string) => {
    setAdditionalCharges((prev) => prev.map((c) => c.id === id ? { ...c, [field]: value } : c));
  };

  const subtotalEst = costs.reduce((s, c) => s + parseCostNum(c.estAmount), 0);
  const subtotalReal = costs.reduce((s, c) => s + parseCostNum(c.realAmount), 0);
  const subtotalBilling = costs.reduce((s, c) => {
    const ov = billingOverrides[c.category];
    return s + parseCostNum(ov !== undefined ? ov : c.realAmount);
  }, 0);

  const inputClass = "w-full bg-transparent text-xs text-foreground outline-none focus:ring-1 focus:ring-[var(--brand-teal)]/50 rounded px-1 py-0.5";
  const cellClass = "px-2 py-1.5 border-r last:border-r-0 align-middle";
  const borderCol = "hsl(var(--border-18))";

  const CurrencySelect = ({ value, onChange }: { value: Currency; onChange: (v: Currency) => void }) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Currency)}
      onBlur={saveInvoicing}
      className="bg-transparent text-xs text-foreground outline-none cursor-pointer w-14"
      style={{ color: "var(--brand-teal)" }}
    >
      {CURRENCIES.map((c) => <option key={c} value={c} style={{ background: "hsl(var(--surface-10))" }}>{c}</option>)}
    </select>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-xs text-muted-foreground">
        Loading costs...
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Billing settings bar */}
      <div
        className="flex items-center gap-4 px-4 py-2.5 rounded-lg"
        style={{ background: "hsl(var(--surface-11))", border: "1px solid hsl(var(--border-18))" }}
      >
        <DollarSign className="w-3.5 h-3.5 text-[var(--brand-teal)] flex-none" />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Billing</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">Currency</span>
          <select
            value={billing.billingCurrency}
            onChange={(e) => {
              const next = { ...billing, billingCurrency: e.target.value as Currency };
              setBilling(next);
              saveBilling(billingOverrides, next);
            }}
            className="text-xs text-[var(--brand-teal)] bg-transparent outline-none cursor-pointer"
          >
            {CURRENCIES.map((c) => <option key={c} value={c} style={{ background: "hsl(var(--surface-10))" }}>{c}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">ROE</span>
          <input
            type="text"
            value={billing.roe}
            onChange={(e) => setBilling((prev) => ({ ...prev, roe: e.target.value }))}
            onBlur={() => saveBilling(billingOverrides, billing)}
            className="w-16 bg-transparent text-xs text-foreground outline-none border-b focus:border-[var(--brand-teal)] transition-colors text-center"
            style={{ borderColor: "hsl(var(--border-25))" }}
          />
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">Quote</span>
          <input
            type="text"
            value={quoteInput}
            onChange={(e) => { setQuoteInput(e.target.value); setQuoteStatus(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") importQuoteCosts(quoteInput); }}
            placeholder="CZQ00000001-001"
            className="w-28 bg-transparent text-xs text-foreground outline-none border-b focus:border-[var(--brand-teal)] transition-colors placeholder:text-muted-foreground/30"
            style={{ borderColor: "hsl(var(--border-25))" }}
            data-testid="quote-import-input"
          />
          <button
            onClick={() => importQuoteCosts(quoteInput)}
            disabled={!quoteInput.trim() || quoteLoading}
            className="px-2 py-0.5 rounded text-[10px] font-medium transition-all disabled:opacity-30"
            style={{ background: "var(--brand-teal-soft)", color: "var(--brand-teal)" }}
            data-testid="quote-import-btn"
          >
            {quoteLoading ? "..." : "Import"}
          </button>
          {quoteStatus && (
            <span className={`text-[10px] ${quoteStatus.startsWith("Imported") ? "text-green-400" : "text-yellow-400"}`}>
              {quoteStatus}
            </span>
          )}
        </div>
      </div>

      {/* Main costs table */}
      <div className="rounded-lg overflow-hidden" style={{ border: "1px solid hsl(var(--border-18))" }}>
        {/* Table header */}
        <div
          className="grid text-[10px] uppercase tracking-wider font-semibold text-muted-foreground"
          style={{ background: "hsl(var(--surface-9))", gridTemplateColumns: "1fr 80px 60px 80px 60px 90px 90px 60px 80px" }}
        >
          {["Category", "Est. Amt", "Curr", "Real Cost", "Curr", "Invoice No.", "Vendor", "Billing Curr", "Billing Amt"].map((h) => (
            <div key={h} className={cellClass} style={{ borderColor: borderCol }}>{h}</div>
          ))}
        </div>

        {/* Cost rows */}
        {costs.map((row) => {
          const cat = COST_CATEGORIES.find((c) => c.key === row.category);
          const billingAmt = billingOverrides[row.category] ?? row.realAmount;
          return (
            <div
              key={row.category}
              className="grid border-t hover:bg-white/[0.02] transition-colors"
              style={{ gridTemplateColumns: "1fr 80px 60px 80px 60px 90px 90px 60px 80px", borderColor: borderCol }}
            >
              <div className={cellClass} style={{ borderColor: borderCol }}>
                <span className="text-xs text-foreground/80">{cat?.label || row.category}</span>
              </div>
              <div className={cellClass} style={{ borderColor: borderCol }}>
                <input type="text" value={row.estAmount} placeholder="—"
                  onChange={(e) => updateCostField(row.category, "estAmount", e.target.value)}
                  onBlur={saveInvoicing} className={inputClass} />
              </div>
              <div className={cellClass} style={{ borderColor: borderCol }}>
                <CurrencySelect value={row.estCurrency} onChange={(v) => updateCostField(row.category, "estCurrency", v)} />
              </div>
              <div className={cellClass} style={{ borderColor: borderCol }}>
                <input type="text" value={row.realAmount} placeholder="—"
                  onChange={(e) => updateCostField(row.category, "realAmount", e.target.value)}
                  onBlur={saveInvoicing} className={inputClass} />
              </div>
              <div className={cellClass} style={{ borderColor: borderCol }}>
                <CurrencySelect value={row.realCurrency} onChange={(v) => updateCostField(row.category, "realCurrency", v)} />
              </div>
              <div className={cellClass} style={{ borderColor: borderCol }}>
                <input type="text" value={row.invoiceNo} placeholder="—"
                  onChange={(e) => updateCostField(row.category, "invoiceNo", e.target.value)}
                  onBlur={saveInvoicing} className={inputClass} />
              </div>
              <div className={cellClass} style={{ borderColor: borderCol }}>
                <input type="text" value={row.vendor} placeholder="—"
                  onChange={(e) => updateCostField(row.category, "vendor", e.target.value)}
                  onBlur={saveInvoicing} className={inputClass} />
              </div>
              <div className={cellClass} style={{ borderColor: borderCol }}>
                <span className="text-xs text-[var(--brand-teal)]">{billing.billingCurrency}</span>
              </div>
              <div className={cellClass} style={{ borderColor: borderCol }}>
                <input type="text" value={billingAmt} placeholder="—"
                  onChange={(e) => updateBillingOverride(row.category, e.target.value)}
                  onBlur={() => saveBilling(billingOverrides, billing)} className={inputClass} />
              </div>
            </div>
          );
        })}

        {/* Subtotal row */}
        <div
          className="grid border-t text-xs font-semibold"
          style={{ gridTemplateColumns: "1fr 80px 60px 80px 60px 90px 90px 60px 80px", borderColor: borderCol, background: "hsl(var(--surface-9))" }}
        >
          <div className={cellClass} style={{ borderColor: borderCol }}>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Subtotal</span>
          </div>
          <div className={cellClass} style={{ borderColor: borderCol }}>
            <span className="tabular-nums text-foreground">{fmtNum(subtotalEst)}</span>
          </div>
          <div className={cellClass} style={{ borderColor: borderCol }} />
          <div className={cellClass} style={{ borderColor: borderCol }}>
            <span className="tabular-nums text-foreground">{fmtNum(subtotalReal)}</span>
          </div>
          <div className={cellClass} style={{ borderColor: borderCol }} />
          <div className={cellClass} style={{ borderColor: borderCol }} />
          <div className={cellClass} style={{ borderColor: borderCol }} />
          <div className={cellClass} style={{ borderColor: borderCol }} />
          <div className={cellClass} style={{ borderColor: borderCol }}>
            <span className="tabular-nums text-[var(--brand-teal)]">{fmtNum(subtotalBilling)}</span>
          </div>
        </div>
      </div>

      {/* Additional Charges */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
            Other Additional Charges
          </h3>
          <button
            onClick={addCharge}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors hover:bg-white/5"
            style={{ color: "var(--brand-teal)", border: "1px solid hsl(var(--border-20))" }}
          >
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>

        {additionalCharges.length > 0 && (
          <div className="rounded-lg overflow-hidden" style={{ border: "1px solid hsl(var(--border-18))" }}>
            <div
              className="grid text-[10px] uppercase tracking-wider font-semibold text-muted-foreground"
              style={{ background: "hsl(var(--surface-9))", gridTemplateColumns: "1fr 80px 60px 80px 60px 90px 90px 28px" }}
            >
              {["Description", "Est. Amt", "Curr", "Real Cost", "Curr", "Invoice No.", "Vendor", ""].map((h, i) => (
                <div key={i} className={cellClass} style={{ borderColor: borderCol }}>{h}</div>
              ))}
            </div>
            {additionalCharges.map((ac) => (
              <div
                key={ac.id}
                className="grid border-t group hover:bg-white/[0.02] transition-colors"
                style={{ gridTemplateColumns: "1fr 80px 60px 80px 60px 90px 90px 28px", borderColor: borderCol }}
              >
                <div className={cellClass} style={{ borderColor: borderCol }}>
                  <input type="text" value={ac.description} placeholder="Description"
                    onChange={(e) => updateChargeField(ac.id, "description", e.target.value)}
                    onBlur={saveInvoicing} className={inputClass} />
                </div>
                <div className={cellClass} style={{ borderColor: borderCol }}>
                  <input type="text" value={ac.estAmount} placeholder="—"
                    onChange={(e) => updateChargeField(ac.id, "estAmount", e.target.value)}
                    onBlur={saveInvoicing} className={inputClass} />
                </div>
                <div className={cellClass} style={{ borderColor: borderCol }}>
                  <CurrencySelect value={ac.estCurrency} onChange={(v) => updateChargeField(ac.id, "estCurrency", v)} />
                </div>
                <div className={cellClass} style={{ borderColor: borderCol }}>
                  <input type="text" value={ac.realAmount} placeholder="—"
                    onChange={(e) => updateChargeField(ac.id, "realAmount", e.target.value)}
                    onBlur={saveInvoicing} className={inputClass} />
                </div>
                <div className={cellClass} style={{ borderColor: borderCol }}>
                  <CurrencySelect value={ac.realCurrency} onChange={(v) => updateChargeField(ac.id, "realCurrency", v)} />
                </div>
                <div className={cellClass} style={{ borderColor: borderCol }}>
                  <input type="text" value={ac.invoiceNo} placeholder="—"
                    onChange={(e) => updateChargeField(ac.id, "invoiceNo", e.target.value)}
                    onBlur={saveInvoicing} className={inputClass} />
                </div>
                <div className={cellClass} style={{ borderColor: borderCol }}>
                  <input type="text" value={ac.vendor} placeholder="—"
                    onChange={(e) => updateChargeField(ac.id, "vendor", e.target.value)}
                    onBlur={saveInvoicing} className={inputClass} />
                </div>
                <div className={`${cellClass} flex items-center justify-center`} style={{ borderColor: borderCol }}>
                  <button
                    onClick={() => deleteCharge(ac.id)}
                    className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center text-muted-foreground/40 hover:text-red-400 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {additionalCharges.length === 0 && (
          <div
            className="rounded-lg py-4 text-center text-[10px] text-muted-foreground/50"
            style={{ border: "1px dashed hsl(var(--border-20))" }}
          >
            No additional charges. Click + Add to create one.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Documents Tab ───────────────────────────────────────────────

function DocumentsTab({
  attachments,
  dragOver,
  setDragOver,
  fileInputRef,
  handleFileDrop,
  handleFileInput,
  deleteAttachment,
  formatSize,
  formatTimestamp,
  getFileIcon,
}: {
  attachments: AttachmentFile[];
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleFileDrop: (e: React.DragEvent) => void;
  handleFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  deleteAttachment: (id: string) => void;
  formatSize: (bytes: number) => string;
  formatTimestamp: (iso?: string) => string;
  getFileIcon: (type: string, name: string) => React.ReactNode;
}) {
  const getTypeLabel = (type: string, name: string) => {
    const ext = name.split(".").pop()?.toLowerCase() || "";
    if (type === "application/pdf" || ext === "pdf") return "PDF";
    if (ext === "xls" || ext === "xlsx") return "Excel";
    if (ext === "doc" || ext === "docx") return "Word";
    return ext.toUpperCase() || "File";
  };

  return (
    <div className="p-4 space-y-4">
      {/* Drop zone */}
      <div
        className="rounded-lg border-2 border-dashed p-8 text-center transition-all cursor-pointer"
        style={{
          borderColor: dragOver ? "var(--brand-teal)" : "hsl(var(--border-22))",
          background: dragOver ? "rgba(20, 184, 166, 0.05)" : "hsl(var(--surface-6))",
        }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleFileDrop}
        onClick={() => fileInputRef.current?.click()}
        data-testid="documents-drop-zone"
      >
        <input ref={fileInputRef} type="file" multiple onChange={handleFileInput} className="hidden" />
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3"
          style={{ background: "hsl(var(--surface-11))", border: "1px solid hsl(var(--border-20))" }}
        >
          <Plus className="w-5 h-5 text-[var(--brand-teal)]" />
        </div>
        <p className="text-sm font-medium text-foreground/80 mb-1">Add Document</p>
        <p className="text-[10px] text-muted-foreground">Drop files here or click to browse</p>
      </div>

      {/* File list */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
            Attached Documents
          </h3>
          <span className="text-[10px] text-muted-foreground/50">
            {attachments.length} file{attachments.length !== 1 ? "s" : ""}
          </span>
        </div>

        {attachments.length === 0 ? (
          <div className="py-6 text-center text-[10px] text-muted-foreground/40">
            No documents attached yet
          </div>
        ) : (
          <div className="space-y-1">
            {attachments.map((f) => (
              <div
                key={f.id}
                className="group flex items-center gap-3 px-3 py-2 rounded-lg transition-colors hover:bg-white/[0.03]"
                style={{ background: "hsl(var(--surface-9))", border: "1px solid hsl(var(--border-16))" }}
              >
                <div className="flex-none">{getFileIcon(f.type, f.name)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{f.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span
                      className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                      style={{ background: "hsl(var(--border-20))", color: "hsl(var(--muted-65))" }}
                    >
                      {getTypeLabel(f.type, f.name)}
                    </span>
                    <span className="text-[9px] text-muted-foreground/50">{formatSize(f.size)}</span>
                    {f.addedAt && (
                      <span className="text-[9px] text-muted-foreground/40">{formatTimestamp(f.addedAt)}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => deleteAttachment(f.id)}
                  className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded flex items-center justify-center text-muted-foreground/40 hover:text-red-400 transition-all flex-none"
                  title="Delete"
                  data-testid={`delete-attachment-${f.id}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tracking Tab ────────────────────────────────────────────────

const TASK_DESCRIPTIONS: Record<string, string> = {
  booking_to_agent: "Booking sent to agent",
  booking_confirmed: "Booking has been confirmed",
  pre_alert_received: "Pre-alert received from shipper",
  arrival_notice_sent: "Arrival notice sent to consignee",
  paperwork_received: "Paperwork received from agent",
  paperwork_to_customs: "Paperwork provided to customs",
  shipment_released_agent: "Shipment released from agent",
  booking_to_agent_2: "Booking sent to agent (delivery leg)",
  booking_confirmed_2: "Booking confirmed for delivery",
  pre_alert_received_2: "Pre-alert received",
  pre_alert_date_agreed: "Pre-alert date agreed with consignee",
  arrival_notice_sent_2: "Arrival notice sent",
  paperwork_to_customs_2: "Paperwork provided to customs for clearance",
  shipment_released_delivery: "Shipment released for final delivery",
  delivered: "Shipment delivered to final destination",
  haulage_booked: "Haulage has been booked",
  delivery_date_agreed: "Delivery date agreed",
  customs_cleared: "Customs cleared",
};

const ALL_TASK_LABELS: Record<string, string> = {
  ...Object.fromEntries(TASK_LIST_GROUP1.map((t) => [t.key, t.label])),
  ...Object.fromEntries(TASK_LIST_GROUP2.map((t) => [t.key, t.label])),
};

function TrackingTab({ tasks, formatTimestamp }: { tasks: Record<string, TaskState>; formatTimestamp: (iso?: string) => string }) {
  const completedEvents = Object.entries(tasks)
    .filter(([, state]) => state.completed && state.completedAt)
    .sort((a, b) => {
      const ta = new Date(a[1].completedAt!).getTime();
      const tb = new Date(b[1].completedAt!).getTime();
      return tb - ta; // newest first
    });

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <MapPin className="w-3.5 h-3.5 text-[var(--brand-teal)]" />
        <h3 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
          Tracking History
        </h3>
      </div>

      {completedEvents.length === 0 ? (
        <div
          className="py-12 text-center rounded-lg"
          style={{ border: "1px dashed hsl(var(--border-20))" }}
        >
          <MapPin className="w-6 h-6 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground/50">No tracking events yet</p>
        </div>
      ) : (
        <div className="relative">
          {/* Vertical timeline line */}
          <div
            className="absolute left-2 top-3 bottom-3 w-px"
            style={{ background: "hsl(var(--border-20))" }}
          />
          <div className="space-y-1">
            {completedEvents.map(([taskKey, state], idx) => (
              <div key={taskKey} className="flex gap-4 relative">
                {/* Blue dot */}
                <div
                  className="flex-none w-4 h-4 rounded-full border-2 mt-1 z-10"
                  style={{
                    background: idx === 0 ? "var(--brand-teal)" : "hsl(var(--surface-8))",
                    borderColor: idx === 0 ? "var(--brand-teal)" : "var(--brand-blue)",
                  }}
                />
                {/* Content */}
                <div
                  className="flex-1 rounded-lg p-3 mb-2"
                  style={{ background: "hsl(var(--surface-10))", border: "1px solid hsl(var(--border-17))" }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold text-foreground">
                      {ALL_TASK_LABELS[taskKey] || taskKey}
                    </p>
                    <span className="text-[9px] text-muted-foreground/60 flex-none tabular-nums">
                      {formatTimestamp(state.completedAt)}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {TASK_DESCRIPTIONS[taskKey] || "Task completed"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Modal ─────────────────────────────────────────────────

type TabKey = "details" | "costs" | "documents" | "warehousing" | "tracking";

interface ShipmentDetailModalProps {
  jobNumber: string;
  shipmentData: Record<string, string>;
  onClose: () => void;
}

export function ShipmentDetailModal({
  jobNumber,
  shipmentData,
  onClose,
}: ShipmentDetailModalProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("details");
  const [tasks, setTasks] = useState<Record<string, TaskState>>({});
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [showPopout, setShowPopout] = useState(false);
  const [showSplit, setShowSplit] = useState(false);

  const safeData = shipmentData || {};
  const linkedQuote = safeData["Linked Quote"] || "";

  // Load tasks on mount
  useEffect(() => {
    let cancelled = false;
    apiRequest("GET", `/api/tasks/${encodeURIComponent(jobNumber)}`)
      .then((res) => res.json())
      .then((data: any) => {
        if (cancelled) return;
        if (Array.isArray(data)) {
          const map: Record<string, TaskState> = {};
          for (const t of data) {
            if (t.taskKey) {
              map[t.taskKey] = { completed: !!t.completed, completedAt: t.completedAt || undefined };
            }
          }
          setTasks(map);
        } else if (data && typeof data === "object") {
          setTasks(data);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [jobNumber]);

  // Load attachments on mount
  useEffect(() => {
    let cancelled = false;
    apiRequest("GET", `/api/attachments/${encodeURIComponent(jobNumber)}`)
      .then((res) => res.json())
      .then((data: AttachmentFile[]) => {
        if (!cancelled) setAttachments(data);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [jobNumber]);

  const { user: authUser } = useAuth();

  const toggleTask = useCallback(
    async (taskKey: string) => {
      const current = tasks[taskKey];
      // Once checked, cannot uncheck
      if (current?.completed) return;
      const now = new Date().toISOString();
      const userEmail = authUser?.email || "";

      setTasks((prev) => ({
        ...prev,
        [taskKey]: {
          completed: true,
          completedAt: now,
          completedBy: userEmail,
        },
      }));

      try {
        await apiRequest("POST", "/api/tasks", {
          jobNumber,
          taskKey,
          completed: true,
          completedBy: userEmail,
        });
      } catch {
        setTasks((prev) => ({
          ...prev,
          [taskKey]: current || { completed: false },
        }));
      }
    },
    [tasks, jobNumber, authUser],
  );

  const handleFileDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length === 0) return;

      for (const file of Array.from(e.dataTransfer.files)) {
        try {
          const res = await apiRequest("POST", "/api/attachments", {
            jobNumber,
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
          });
          const created: AttachmentFile = await res.json();
          setAttachments((prev) => [...prev, created]);
        } catch { /* ignore */ }
      }
    },
    [jobNumber],
  );

  const handleFileInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || e.target.files.length === 0) return;
      for (const file of Array.from(e.target.files)) {
        try {
          const res = await apiRequest("POST", "/api/attachments", {
            jobNumber,
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
          });
          const created: AttachmentFile = await res.json();
          setAttachments((prev) => [...prev, created]);
        } catch { /* ignore */ }
      }
      e.target.value = "";
    },
    [jobNumber],
  );

  const deleteAttachment = useCallback(async (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    try {
      await apiRequest("DELETE", `/api/attachments/${encodeURIComponent(id)}`);
    } catch { /* ignore */ }
  }, []);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatTimestamp = (iso?: string) => {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) +
        " " +
        d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return iso;
    }
  };

  const getFileIcon = (type: string, name: string) => {
    const ext = name.split(".").pop()?.toLowerCase() || "";
    if (type === "application/pdf" || ext === "pdf")
      return <FileText className="w-4 h-4 text-red-400" />;
    if (ext === "doc" || ext === "docx")
      return <FileText className="w-4 h-4 text-blue-400" />;
    if (ext === "xls" || ext === "xlsx")
      return <FileText className="w-4 h-4 text-green-400" />;
    return <File className="w-4 h-4 text-muted-foreground" />;
  };

  const status = safeData["Shipment Status"] || "";
  const currentStep = getStatusStep(status);
  const badgeColor = getStatusBadgeColor(status);

  const pol = safeData["POL"] || "—";
  const pod = safeData["POD"] || "—";
  const destination = safeData["Destination"] || "—";
  const etd = safeData["Estimated Departure"] || "—";
  const eta = safeData["Estimated Arrival"] || "—";

  const overviewRows = [
    { label: "Customer", value: safeData["Customer"] },
    { label: "Shipper", value: safeData["Shipper"] },
    { label: "Consignee", value: safeData["Consignee"] },
    {
      label: "Incoterm",
      value: [safeData["Incoterm Origin"], safeData["Incoterm Destination"]]
        .filter(Boolean)
        .join(" / "),
    },
    { label: "Container", value: safeData["Container Number"] },
    { label: "Carrier", value: safeData["Shipping line / Coloader"] },
    { label: "MBL", value: safeData["Master BoL Number"] },
  ];

  if (showPopout) {
    return <PopoutDetailView jobNumber={jobNumber} shipmentData={safeData} onClose={() => setShowPopout(false)} />;
  }

  const iconBtnClass = "w-7 h-7 rounded-md flex items-center justify-center transition-colors";
  const iconBtnStyle = (active?: boolean) => ({
    background: active ? "var(--brand-teal-soft)" : "transparent",
    color: active ? "var(--brand-teal)" : "hsl(var(--muted-55))",
  });

  const TABS: { key: TabKey; label: string }[] = [
    { key: "details", label: "Shipment Details" },
    { key: "costs", label: "Costs Breakdown" },
    { key: "documents", label: "Documents" },
    { key: "warehousing", label: "Warehouse" },
    { key: "tracking", label: "Tracking" },
  ];

  const TaskCheckbox = ({ taskKey, label }: { taskKey: string; label: string }) => {
    const task = tasks[taskKey];
    const isChecked = task?.completed ?? false;
    return (
      <label className={`flex items-center gap-2.5 py-1.5 px-2 rounded-md transition-colors ${isChecked ? "cursor-default" : "cursor-pointer hover:bg-white/[0.03]"}`}>
        <div className="relative flex-none">
          <input
            type="checkbox"
            checked={isChecked}
            onChange={() => { if (!isChecked) toggleTask(taskKey); }}
            disabled={isChecked}
            className="sr-only"
            data-testid={`task-${taskKey}`}
          />
          <div
            className="w-4 h-4 rounded border flex items-center justify-center transition-colors"
            style={{
              background: isChecked ? "var(--brand-teal)" : "transparent",
              borderColor: isChecked ? "var(--brand-teal)" : "hsl(var(--border-30))",
            }}
          >
            {isChecked && <Check className="w-3 h-3 text-white" />}
          </div>
        </div>
        <span className="text-xs flex-1" style={{ color: isChecked ? "var(--brand-green)" : "hsl(var(--muted-75))" }}>
          {label}
        </span>
        {isChecked && task?.completedAt && (
          <span className="text-[9px] text-muted-foreground/50 flex-none">
            {task.completedBy && <span className="text-[var(--brand-teal)]/70 mr-1">{task.completedBy}</span>}
            {formatTimestamp(task.completedAt)}
          </span>
        )}
      </label>
    );
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid="shipment-detail-modal"
    >
      <div
        className={`relative flex ${
          isMaximized ? "w-[95vw] h-[95vh]" : "max-w-5xl w-full max-h-[90vh]"
        } rounded-xl overflow-hidden transition-all duration-200`}
        style={{
          background: "hsl(var(--surface-8))",
          border: "1px solid hsl(var(--border-20))",
        }}
      >
        {/* Main card content */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

          {/* ── Header (sticky) ── */}
          <div
            className="flex-none px-6 pt-4 pb-0 border-b"
            style={{ background: "hsl(var(--surface-8))", borderColor: "hsl(var(--border-20))" }}
          >
            {/* Action buttons row */}
            <div className="flex items-center gap-1 mb-3">
              <button
                onClick={() => setIsMaximized((v) => !v)}
                className={iconBtnClass + " hover:bg-white/5"}
                style={iconBtnStyle(isMaximized)}
                title={isMaximized ? "Restore size" : "Maximize"}
                data-testid="btn-maximize"
              >
                {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => setShowPopout(true)}
                className={iconBtnClass + " hover:bg-white/5"}
                style={iconBtnStyle()}
                title="Open in full view"
                data-testid="btn-popout"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setShowSplit((v) => !v)}
                className={iconBtnClass + " hover:bg-white/5"}
                style={iconBtnStyle(showSplit)}
                title={linkedQuote ? `Split view — ${linkedQuote}` : "No linked quote"}
                disabled={!linkedQuote}
                data-testid="btn-split"
              >
                <SplitSquareHorizontal className="w-3.5 h-3.5" style={{ opacity: linkedQuote ? 1 : 0.3 }} />
              </button>
            </div>

            {/* Job number + route | Status + dates + close */}
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-bold font-mono text-[var(--brand-teal)]">{jobNumber}</h2>
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                  <MapPin className="w-3 h-3" />
                  {pol}
                  <span className="text-muted-foreground/50">→</span>
                  {pod}
                  <span className="text-muted-foreground/50">→</span>
                  {destination}
                </p>
              </div>

              <div className="flex items-center gap-3 flex-none">
                <span
                  className="px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap"
                  style={{
                    background: `${badgeColor}20`,
                    color: badgeColor,
                    border: `1px solid ${badgeColor}40`,
                  }}
                >
                  {status || "Unknown"}
                </span>
                <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                  <span>ETD {etd}</span>
                  <span className="mx-1">/</span>
                  <span>ETA {eta}</span>
                </div>
                <button
                  onClick={onClose}
                  className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                  data-testid="shipment-detail-close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Tab nav */}
            <div className="flex items-center gap-1 pb-0">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap mb-[-1px]"
                  style={{
                    background: activeTab === tab.key ? "var(--brand-teal)" : "transparent",
                    color: activeTab === tab.key ? "#fff" : "hsl(var(--muted-55))",
                    border: activeTab === tab.key ? "1px solid var(--brand-teal)" : "1px solid transparent",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Tab content (scrollable) ── */}
          <div className="flex-1 overflow-y-auto">

            {/* Tab 1: Shipment Details */}
            {activeTab === "details" && (
              <>
                {/* Milestones */}
                <div className="px-6 py-4 border-b" style={{ borderColor: "hsl(var(--border-20))" }}>
                  <div className="flex items-center justify-between">
                    {MILESTONE_STEPS.map((step, i) => {
                      const stepIndex = i + 1;
                      const isCompleted = stepIndex < currentStep;
                      const isCurrent = stepIndex === currentStep;

                      let circleColor = "hsl(var(--border-25))";
                      let circleBorder = "hsl(var(--border-25))";
                      if (isCompleted) { circleColor = "var(--brand-green)"; circleBorder = "var(--brand-green)"; }
                      if (isCurrent) { circleColor = "var(--brand-teal)"; circleBorder = "var(--brand-teal)"; }

                      return (
                        <div key={step} className="flex-1 flex flex-col items-center relative">
                          {i > 0 && (
                            <div
                              className="absolute top-3 right-1/2 w-full h-0.5"
                              style={{ background: isCompleted || isCurrent ? "var(--brand-green)" : "hsl(var(--border-25))" }}
                            />
                          )}
                          <div
                            className="relative z-10 w-6 h-6 rounded-full flex items-center justify-center"
                            style={{
                              background: isCompleted || isCurrent ? circleColor : "hsl(var(--surface-8))",
                              border: `2px solid ${circleBorder}`,
                            }}
                          >
                            {isCompleted && <Check className="w-3 h-3 text-white" />}
                            {isCurrent && <div className="w-2 h-2 rounded-full" style={{ background: "white" }} />}
                          </div>
                          <span
                            className="text-[9px] mt-1.5 text-center leading-tight"
                            style={{ color: isCompleted || isCurrent ? "#d1d5db" : "hsl(var(--border-40))" }}
                          >
                            {step}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Two-column grid */}
                <div className="grid grid-cols-2 gap-4 p-6">
                  {/* Left Column */}
                  <div className="space-y-4">
                    {/* Shipment Overview */}
                    <div className="rounded-lg p-4" style={{ background: "hsl(var(--surface-11))" }}>
                      <h3 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                        <Ship className="w-3.5 h-3.5 text-[var(--brand-teal)]" />
                        Shipment Overview
                      </h3>
                      <div className="space-y-2">
                        {overviewRows.map(({ label, value }) => (
                          <div key={label} className="flex items-start gap-2">
                            <span className="text-[11px] text-muted-foreground flex-none" style={{ width: "110px" }}>
                              {label}
                            </span>
                            <span className="text-xs text-foreground">{value || "—"}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Addresses */}
                    <div className="rounded-lg p-4" style={{ background: "hsl(var(--surface-11))" }}>
                      <h3 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-[var(--brand-teal)]" />
                        Addresses
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="rounded-md p-3" style={{ background: "hsl(var(--surface-6))" }}>
                          <p className="text-[11px] font-bold text-muted-foreground mb-1">Shipper</p>
                          <p className="text-xs text-foreground mb-2">{safeData["Shipper"] || "—"}</p>
                          <p className="text-[11px] font-bold text-muted-foreground mb-1">Pick Up Address</p>
                          <p className="text-xs text-foreground">{safeData["Pickup Address"] || "—"}</p>
                        </div>
                        <div className="rounded-md p-3" style={{ background: "hsl(var(--surface-6))" }}>
                          <p className="text-[11px] font-bold text-muted-foreground mb-1">Consignee</p>
                          <p className="text-xs text-foreground mb-2">{safeData["Consignee"] || "—"}</p>
                          <p className="text-[11px] font-bold text-muted-foreground mb-1">Delivery Address</p>
                          <p className="text-xs text-foreground">{safeData["Delivery Address"] || "—"}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Tasks */}
                  <div className="space-y-4">
                    <div className="rounded-lg p-4" style={{ background: "hsl(var(--surface-11))" }}>
                      <h3 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5 text-[var(--brand-teal)]" />
                        Tasks
                      </h3>

                      {/* Import or Export tasks based on Shipment type */}
                      {(() => {
                        const tradeDir = (safeData["Trade Direction"] || "").trim();
                        const isExport = tradeDir === "Export" || tradeDir.toUpperCase() === "EXPORT";
                        const taskList = isExport ? EXPORT_TASKS : IMPORT_TASKS;
                        return (
                          <>
                            <p className="text-[9px] uppercase tracking-wider font-semibold mb-2" style={{ color: "hsl(var(--muted-45))" }}>
                              {isExport ? "Export" : "Import"} workflow
                            </p>
                            <div className="space-y-0.5">
                              {taskList.map(({ key, label }) => (
                                <TaskCheckbox key={key} taskKey={key} label={label} />
                              ))}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Tab 2: Costs Breakdown */}
            {activeTab === "costs" && <CostsBreakdownTab jobNumber={jobNumber} />}

            {/* Tab 3: Documents */}
            {activeTab === "documents" && (
              <DocumentsTab
                attachments={attachments}
                dragOver={dragOver}
                setDragOver={setDragOver}
                fileInputRef={fileInputRef}
                handleFileDrop={handleFileDrop}
                handleFileInput={handleFileInput}
                deleteAttachment={deleteAttachment}
                formatSize={formatSize}
                formatTimestamp={formatTimestamp}
                getFileIcon={getFileIcon}
              />
            )}

            {/* Tab 4: Warehousing */}
            {activeTab === "warehousing" && (
              <ShipmentWarehouseTab
                jobNumber={jobNumber}
                stackable={safeData["Stackable"] === "true" || safeData["Stackable"] === "Yes" || safeData["Stackable"] === "1"}
                fullSheetData={safeData}
              />
            )}

            {/* Tab 5: Tracking */}
            {activeTab === "tracking" && (
              <TrackingTab tasks={tasks} formatTimestamp={formatTimestamp} />
            )}
          </div>
        </div>

        {/* Split: Linked Quote Panel */}
        {showSplit && linkedQuote && (
          <LinkedQuotePanel quoteNumber={linkedQuote} onClose={() => setShowSplit(false)} />
        )}
      </div>
    </div>,
    document.body,
  );
}

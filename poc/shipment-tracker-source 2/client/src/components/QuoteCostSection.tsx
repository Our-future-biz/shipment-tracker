import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { apiRequest } from "@/lib/queryClient";
import {
  Plus,
  Trash2,
  Receipt,
  Loader2,
  Printer,
  X,
  Check,
  BookCheck,
  Download,
  Eye,
} from "lucide-react";
import { jsPDF } from "jspdf";

// ─── Constants ────────────────────────────────────────────────────

const CURRENCIES = ["CZK", "USD", "EUR", "GBP", "CHF", "CNY", "JPY"] as const;

const COST_CATEGORIES = [
  { key: "freight", label: "Freight" },
  { key: "collection", label: "Collection / Delivery" },
  { key: "locals", label: "Locals" },
  { key: "others", label: "Others" },
  { key: "insurance", label: "Insurance" },
  { key: "customs", label: "Customs clearance" },
] as const;

// ─── Types ────────────────────────────────────────────────────────

interface CostRow {
  category: string;
  estAmount: string;
  estCurrency: string;
  realAmount: string;
  realCurrency: string;
  invoiceNumber: string;
  vendor: string;
}

interface AdditionalRow {
  id: number | null;
  invoiceNumber: string;
  vendor: string;
  description: string;
  estAmount: string;
  estCurrency: string;
  realAmount: string;
  realCurrency: string;
}

interface BillingOverrideMap {
  [rowKey: string]: string; // rowKey → billing amount
}

interface GeneratedInvoice {
  id: number;
  invoiceNumber: string;
  invoiceType: string;
  billingCurrency: string;
  totalAmount: string;
  createdAt: string;
}

// ─── Props ────────────────────────────────────────────────────────

interface QuoteCostSectionProps {
  quoteNumber: string;
  quoteData: Record<string, string>;
  onBooked?: (data: BookedData) => void | Promise<void>; // callback when user books the quote
}

export interface BookedData {
  quoteNumber: string;
  selectedInvoiceNumber: string;
  quoteData: Record<string, string>;
  costs: CostRow[];
  additionalCharges: AdditionalRow[];
  billingCurrency: string;
  roe: string;
  billingOverrides: BillingOverrideMap;
}

// ─── Helpers ──────────────────────────────────────────────────────

function parseNum(v: string): number {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function fmt(n: number): string {
  return n ? n.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
}

function fmtNonEmpty(n: number): string {
  return n ? n.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00";
}

// Keyed debounce: each key gets its own independent timer
function useKeyedDebounce(fn: (...args: any[]) => void, delay: number) {
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  return useCallback((key: string, ...args: any[]) => {
    const existing = timers.current.get(key);
    if (existing) clearTimeout(existing);
    timers.current.set(key, setTimeout(() => {
      timers.current.delete(key);
      fn(...args);
    }, delay));
  }, [fn, delay]);
}

// ─── Small UI components ──────────────────────────────────────────

function CurrencySelect({ value, onChange, testId }: { value: string; onChange: (v: string) => void; testId?: string }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-xs rounded border border-border/40 bg-background/60 text-foreground px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary w-16"
      data-testid={testId}
    >
      {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
    </select>
  );
}

function EditableInput({ value, onChange, placeholder, className, testId, type = "text", readOnly = false }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  className?: string; testId?: string; type?: "text" | "number"; readOnly?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder || "—"}
      readOnly={readOnly}
      className={`text-xs rounded border border-border/40 bg-background/60 text-foreground px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/40 ${readOnly ? "opacity-60 cursor-default" : ""} ${className || ""}`}
      data-testid={testId}
    />
  );
}

// ─── PDF Generation ───────────────────────────────────────────────

function generateInvoicePDF(params: {
  invoiceNumber: string;
  jobNumber: string;
  billedPartyName: string;
  billedPartyAddress: string;
  billingCurrency: string;
  invoiceType: "breakdown" | "total";
  lineItems: { label: string; amount: number }[];
  totalAmount: number;
}) {
  const { invoiceNumber, jobNumber, billedPartyName, billingCurrency, invoiceType, lineItems, totalAmount } = params;
  const doc = new jsPDF();
  const w = doc.internal.pageSize.getWidth();
  let y = 20;

  // Header
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("INVOICE", 20, y);
  y += 12;

  // Issuer
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("ABC", 20, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("domcekova 16, Praha 5", 20, y); y += 8;

  // Invoice details (right side)
  const rightX = 130;
  let ry = 20;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Invoice Number:", rightX, ry);
  doc.setFont("helvetica", "normal");
  doc.text(invoiceNumber, rightX + 35, ry); ry += 5;
  doc.setFont("helvetica", "bold");
  doc.text("Date:", rightX, ry);
  doc.setFont("helvetica", "normal");
  doc.text(new Date().toLocaleDateString("en-GB"), rightX + 35, ry); ry += 5;
  doc.setFont("helvetica", "bold");
  doc.text("Reference:", rightX, ry);
  doc.setFont("helvetica", "normal");
  doc.text(jobNumber, rightX + 35, ry); ry += 5;
  doc.setFont("helvetica", "bold");
  doc.text("Currency:", rightX, ry);
  doc.setFont("helvetica", "normal");
  doc.text(billingCurrency, rightX + 35, ry);

  // Billed to
  y += 4;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Bill To:", 20, y); y += 5;
  doc.setFont("helvetica", "normal");
  doc.text(billedPartyName || "—", 20, y); y += 10;

  // Line separator
  doc.setDrawColor(180);
  doc.line(20, y, w - 20, y);
  y += 6;

  if (invoiceType === "breakdown") {
    // Table header
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("Description", 20, y);
    doc.text("Amount", w - 50, y, { align: "right" });
    y += 2;
    doc.line(20, y, w - 20, y);
    y += 5;

    // Line items
    doc.setFont("helvetica", "normal");
    for (const item of lineItems) {
      if (item.amount > 0) {
        doc.text(item.label, 20, y);
        doc.text(`${billingCurrency} ${fmtNonEmpty(item.amount)}`, w - 50, y, { align: "right" });
        y += 5;
      }
    }
  } else {
    // Total only
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Freight and logistics services as per agreement", 20, y);
    y += 8;
  }

  // Total
  y += 4;
  doc.line(w - 80, y, w - 20, y);
  y += 6;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL DUE:", w - 80, y);
  doc.text(`${billingCurrency} ${fmtNonEmpty(totalAmount)}`, w - 20, y, { align: "right" });

  // Payment terms placeholder
  y += 16;
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("Payment Terms:", 20, y);
  doc.setFont("helvetica", "normal");
  doc.text("_______________________________________________", 55, y);
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.text("Bank Details:", 20, y);
  doc.setFont("helvetica", "normal");
  doc.text("_______________________________________________", 55, y);
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.text("Due Date:", 20, y);
  doc.setFont("helvetica", "normal");
  doc.text("_______________________________________________", 55, y);

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text("Generated by Shipment Tracker — ABC", w / 2, 285, { align: "center" });

  // Use blob output + open in new tab (works in sandboxed iframes where doc.save is blocked)
  const pdfBlob = doc.output('blob');
  const blobUrl = URL.createObjectURL(pdfBlob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = `${invoiceNumber}.pdf`;
  link.target = '_blank';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Fallback: also try opening in new tab
  setTimeout(() => window.open(blobUrl, '_blank'), 100);
}


// ─── Invoice Chip with Download/Show popup ───────────────────────

function InvoiceChip({ inv, quoteNumber, quoteData, costs, additionalCharges, billing, billingOverrides }: {
  inv: GeneratedInvoice;
  quoteNumber: string;
  quoteData: Record<string, string>;
  costs: CostRow[];
  additionalCharges: AdditionalRow[];
  billing: { billingCurrency: string; roe: string };
  billingOverrides: BillingOverrideMap;
}) {
  const [showPopup, setShowPopup] = useState(false);
  const [showCosts, setShowCosts] = useState(false);

  const parseN = (v: string) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

  const handleDownload = () => {
    setShowPopup(false);
    const lineItems = costs
      .map((c) => {
        const billingAmt = billingOverrides[c.category] || c.realAmount;
        return { label: COST_CATEGORIES.find((cat) => cat.key === c.category)?.label || c.category, amount: parseN(billingAmt) };
      })
      .filter((li) => li.amount > 0);
    for (const ac of additionalCharges) {
      if (parseN(ac.realAmount) > 0) lineItems.push({ label: ac.description || "Additional", amount: parseN(ac.realAmount) });
    }
    generateInvoicePDF({
      invoiceNumber: inv.invoiceNumber,
      jobNumber: quoteNumber,
      billedPartyName: quoteData["Consignee"] || quoteData["Shipper"] || "",
      billedPartyAddress: "",
      billingCurrency: inv.billingCurrency,
      invoiceType: inv.invoiceType as "breakdown" | "total",
      lineItems,
      totalAmount: parseN(inv.totalAmount),
    });
  };

  return (
    <>
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border border-border/30 cursor-pointer hover:border-[var(--brand-teal)]/50 transition-colors relative"
        style={{ background: "hsl(var(--surface-11))" }}
        onClick={() => setShowPopup((v) => !v)}
        data-testid={`invoice-chip-${inv.invoiceNumber}`}
      >
        <Receipt className="w-3 h-3 text-[var(--brand-teal)]" />
        <span className="font-mono font-medium text-foreground">{inv.invoiceNumber}</span>
        <span className="text-muted-foreground">({inv.invoiceType})</span>
        <span className="text-muted-foreground">{inv.billingCurrency} {inv.totalAmount}</span>
      </span>

      {showPopup && (
        <div className="fixed inset-0 z-[9999]" onClick={() => setShowPopup(false)}>
          <div
            className="absolute rounded-lg border shadow-xl p-1 flex flex-col gap-0.5"
            style={{ background: "hsl(var(--surface-12))", borderColor: "hsl(var(--border-25))", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={handleDownload} className="flex items-center gap-2 px-3 py-2 rounded-md text-xs hover:bg-white/5 transition-colors text-foreground w-full text-left">
              <Download className="w-3.5 h-3.5 text-[var(--brand-teal)]" /> Download PDF
            </button>
            <button onClick={() => { setShowPopup(false); setShowCosts(true); }} className="flex items-center gap-2 px-3 py-2 rounded-md text-xs hover:bg-white/5 transition-colors text-foreground w-full text-left">
              <Eye className="w-3.5 h-3.5 text-[var(--brand-teal)]" /> Show Costs
            </button>
          </div>
        </div>
      )}

      {showCosts && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setShowCosts(false)}>
          <div className="rounded-xl border max-w-lg w-full mx-4 p-5" style={{ background: "hsl(var(--surface-8))", borderColor: "hsl(var(--border-20))" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground">{inv.invoiceNumber} \u2014 Cost Details</h3>
              <button onClick={() => setShowCosts(false)} className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5"><X className="w-4 h-4" /></button>
            </div>
            <div className="rounded-lg overflow-hidden" style={{ background: "hsl(var(--surface-11))", border: "1px solid hsl(var(--border-18))" }}>
              <div className="grid grid-cols-3 gap-1 px-3 py-1.5 text-[10px] uppercase tracking-wide font-semibold text-muted-foreground border-b" style={{ borderColor: "hsl(var(--border-18))" }}>
                <span>Category</span>
                <span className="text-right">Suppliers</span>
                <span className="text-right">Billing ({inv.billingCurrency})</span>
              </div>
              {costs.map((c) => {
                const billingAmt = billingOverrides[c.category] || c.realAmount;
                if (!c.realAmount && !billingAmt) return null;
                return (
                  <div key={c.category} className="grid grid-cols-3 gap-1 px-3 py-1.5 text-xs border-b" style={{ borderColor: "hsl(var(--border-15))" }}>
                    <span className="text-foreground/80">{COST_CATEGORIES.find((cat) => cat.key === c.category)?.label || c.category}</span>
                    <span className="text-right tabular-nums text-foreground">{c.realAmount || "\u2014"} {c.realCurrency}</span>
                    <span className="text-right tabular-nums text-foreground">{billingAmt || "\u2014"}</span>
                  </div>
                );
              })}
              <div className="grid grid-cols-3 gap-1 px-3 py-2 text-xs font-semibold" style={{ background: "hsl(var(--surface-9))" }}>
                <span className="text-foreground">Total</span>
                <span className="text-right tabular-nums text-[var(--brand-teal)]">{costs.reduce((s, c) => s + parseN(c.realAmount), 0).toLocaleString()} {billing.billingCurrency}</span>
                <span className="text-right tabular-nums text-[var(--brand-teal)]">{parseN(inv.totalAmount).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────

export function QuoteCostSection({ quoteNumber, quoteData, onBooked }: QuoteCostSectionProps) {
  // Data state
  const [costs, setCosts] = useState<CostRow[]>(() =>
    COST_CATEGORIES.map((c) => ({
      category: c.key, estAmount: "", estCurrency: "CZK",
      realAmount: "", realCurrency: "CZK", invoiceNumber: "", vendor: "",
    }))
  );
  const [additionalCharges, setAdditionalCharges] = useState<AdditionalRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Billing state
  const [billingCurrency, setBillingCurrency] = useState("CZK");
  const [roe, setRoe] = useState("1");
  const [billingOverrides, setBillingOverrides] = useState<BillingOverrideMap>({});
  const [generatedInvoices, setGeneratedInvoices] = useState<GeneratedInvoice[]>([]);

  // Print dialog
  const [showPrintDialog, setShowPrintDialog] = useState(false);

  // Booked dialog state
  type BookedStep = "select-quote" | "confirm";
  const [showBookedDialog, setShowBookedDialog] = useState(false);
  const [bookedStep, setBookedStep] = useState<BookedStep>("select-quote");
  const [isCreatingShipment, setIsCreatingShipment] = useState(false);
  const [selectedBookedInvoice, setSelectedBookedInvoice] = useState("");

  // ─── Load invoicing + billing data when quoteNumber changes ────
  useEffect(() => {
    if (!quoteNumber) {
      setCosts(COST_CATEGORIES.map((c) => ({
        category: c.key, estAmount: "", estCurrency: "CZK",
        realAmount: "", realCurrency: "CZK", invoiceNumber: "", vendor: "",
      })));
      setAdditionalCharges([]);
      setBillingCurrency("CZK");
      setRoe("1");
      setBillingOverrides({});
      setGeneratedInvoices([]);
      setLoaded(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        // Load invoicing data + billing data in parallel
        const [invResp, billResp] = await Promise.all([
          apiRequest("GET", `/api/invoicing/${encodeURIComponent(quoteNumber)}`),
          apiRequest("GET", `/api/billing/${encodeURIComponent(quoteNumber)}`),
        ]);
        const invData = await invResp.json();
        const billData = await billResp.json();
        if (cancelled) return;

        // Merge stored costs
        const storedMap = new Map<string, any>();
        for (const c of invData.costs) storedMap.set(c.category, c);
        setCosts(COST_CATEGORIES.map((cat) => {
          const stored = storedMap.get(cat.key);
          return stored
            ? {
                category: cat.key,
                estAmount: stored.estAmount || "", estCurrency: stored.estCurrency || "CZK",
                realAmount: stored.realAmount || "", realCurrency: stored.realCurrency || "CZK",
                invoiceNumber: stored.invoiceNumber || "", vendor: stored.vendor || "",
              }
            : {
                category: cat.key, estAmount: "", estCurrency: "CZK",
                realAmount: "", realCurrency: "CZK", invoiceNumber: "", vendor: "",
              };
        }));

        setAdditionalCharges(
          invData.additionalCharges.map((ac: any) => ({
            id: ac.id,
            invoiceNumber: ac.invoiceNumber || "", vendor: ac.vendor || "",
            description: ac.description || "",
            estAmount: ac.estAmount || "", estCurrency: ac.estCurrency || "CZK",
            realAmount: ac.realAmount || "", realCurrency: ac.realCurrency || "CZK",
          }))
        );

        // Billing
        if (billData.settings) {
          setBillingCurrency(billData.settings.billingCurrency || "CZK");
          setRoe(billData.settings.roe || "1");
        } else {
          setBillingCurrency("CZK");
          setRoe("1");
        }
        const overMap: BillingOverrideMap = {};
        for (const ov of billData.overrides) overMap[ov.rowKey] = ov.billingAmount;
        setBillingOverrides(overMap);
        setGeneratedInvoices(billData.invoices || []);
        setLoaded(true);
      } catch (err) {
        console.error("Failed to load invoicing data:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [quoteNumber]);

  // ─── Auto-save cost rows ──────────────────────────────────────
  const saveCostRow = useCallback((row: CostRow) => {
    if (!quoteNumber) return;
    apiRequest("POST", "/api/invoicing/costs", {
      jobNumber: quoteNumber, category: row.category,
      estAmount: row.estAmount, estCurrency: row.estCurrency,
      realAmount: row.realAmount, realCurrency: row.realCurrency,
      invoiceNumber: row.invoiceNumber, vendor: row.vendor,
    }).catch((err) => console.error("Failed to save cost:", err));
  }, [quoteNumber]);

  const debouncedSaveCost = useKeyedDebounce(saveCostRow, 600);

  const updateCost = useCallback((category: string, field: keyof CostRow, value: string) => {
    setCosts((prev) => {
      const next = prev.map((r) => r.category === category ? { ...r, [field]: value } : r);
      const updated = next.find((r) => r.category === category);
      if (updated) debouncedSaveCost(category, updated);
      return next;
    });
  }, [debouncedSaveCost]);

  // ─── Additional charges CRUD ──────────────────────────────────
  const addRow = useCallback(async () => {
    if (!quoteNumber) return;
    try {
      const resp = await apiRequest("POST", "/api/invoicing/additional", {
        jobNumber: quoteNumber, sortOrder: additionalCharges.length,
      });
      const row = await resp.json();
      setAdditionalCharges((prev) => [...prev, {
        id: row.id, invoiceNumber: "", vendor: "", description: "",
        estAmount: "", estCurrency: "CZK", realAmount: "", realCurrency: "CZK",
      }]);
    } catch (err) { console.error("Failed to add row:", err); }
  }, [quoteNumber, additionalCharges.length]);

  const saveAdditionalRow = useCallback((row: AdditionalRow) => {
    if (!row.id) return;
    apiRequest("PATCH", `/api/invoicing/additional/${row.id}`, {
      invoiceNumber: row.invoiceNumber, vendor: row.vendor, description: row.description,
      estAmount: row.estAmount, estCurrency: row.estCurrency,
      realAmount: row.realAmount, realCurrency: row.realCurrency,
    }).catch((err) => console.error("Failed to save additional charge:", err));
  }, []);

  const debouncedSaveAdditional = useKeyedDebounce(saveAdditionalRow, 600);

  const updateAdditional = useCallback((index: number, field: keyof AdditionalRow, value: string) => {
    setAdditionalCharges((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      const key = String(next[index].id ?? `new-${index}`);
      debouncedSaveAdditional(key, next[index]);
      return next;
    });
  }, [debouncedSaveAdditional]);

  const deleteRow = useCallback(async (index: number) => {
    const row = additionalCharges[index];
    if (row.id) {
      try { await apiRequest("DELETE", `/api/invoicing/additional/${row.id}`); }
      catch (err) { console.error("Failed to delete row:", err); return; }
    }
    setAdditionalCharges((prev) => prev.filter((_, i) => i !== index));
  }, [additionalCharges]);

  // ─── Billing settings save ────────────────────────────────────
  const saveBillingSettings = useCallback((currency: string, roeVal: string) => {
    if (!quoteNumber) return;
    apiRequest("POST", "/api/billing/settings", {
      jobNumber: quoteNumber, billingCurrency: currency, roe: roeVal,
    }).catch((err) => console.error("Failed to save billing settings:", err));
  }, [quoteNumber]);

  const debouncedSaveBillingSettings = useKeyedDebounce(saveBillingSettings, 600);

  const handleBillingCurrencyChange = useCallback((v: string) => {
    setBillingCurrency(v);
    debouncedSaveBillingSettings("billing", v, roe);
  }, [roe, debouncedSaveBillingSettings]);

  const handleRoeChange = useCallback((v: string) => {
    setRoe(v);
    debouncedSaveBillingSettings("roe", billingCurrency, v);
  }, [billingCurrency, debouncedSaveBillingSettings]);

  // ─── Billing override save ────────────────────────────────────
  const saveBillingOverride = useCallback((rowKey: string, amount: string) => {
    if (!quoteNumber) return;
    apiRequest("POST", "/api/billing/override", { jobNumber: quoteNumber, rowKey, billingAmount: amount })
      .catch((err) => console.error("Failed to save billing override:", err));
  }, [quoteNumber]);

  const debouncedSaveOverride = useKeyedDebounce(saveBillingOverride, 600);

  const updateBillingOverride = useCallback((rowKey: string, amount: string) => {
    setBillingOverrides((prev) => ({ ...prev, [rowKey]: amount }));
    debouncedSaveOverride(rowKey, rowKey, amount);
  }, [debouncedSaveOverride]);

  // ─── Billing amount computation ───────────────────────────────
  const roeNum = parseNum(roe) || 1;

  const getBillingAmount = useCallback((rowKey: string, realAmount: string): number => {
    // If there's a manual override, use it
    const override = billingOverrides[rowKey];
    if (override !== undefined && override !== "") return parseNum(override);
    // Otherwise auto-calculate: realAmount * ROE
    return parseNum(realAmount) * roeNum;
  }, [billingOverrides, roeNum]);

  const getBillingDisplay = useCallback((rowKey: string, realAmount: string): string => {
    const override = billingOverrides[rowKey];
    if (override !== undefined && override !== "") return override;
    const calc = parseNum(realAmount) * roeNum;
    return calc ? calc.toFixed(2) : "";
  }, [billingOverrides, roeNum]);

  // ─── Totals ───────────────────────────────────────────────────
  const estCostsTotal = useMemo(() => costs.reduce((s, r) => s + parseNum(r.estAmount), 0), [costs]);
  const realCostsTotal = useMemo(() => costs.reduce((s, r) => s + parseNum(r.realAmount), 0), [costs]);
  const billingCostsTotal = useMemo(() =>
    costs.reduce((s, r) => s + getBillingAmount(r.category, r.realAmount), 0),
    [costs, getBillingAmount]);

  const additionalEstTotal = useMemo(() => additionalCharges.reduce((s, r) => s + parseNum(r.estAmount), 0), [additionalCharges]);
  const additionalRealTotal = useMemo(() => additionalCharges.reduce((s, r) => s + parseNum(r.realAmount), 0), [additionalCharges]);
  const additionalBillingTotal = useMemo(() =>
    additionalCharges.reduce((s, r) => s + getBillingAmount(`additional-${r.id}`, r.realAmount), 0),
    [additionalCharges, getBillingAmount]);

  const summaryEst = estCostsTotal + additionalEstTotal;
  const summaryReal = realCostsTotal + additionalRealTotal;
  const summaryBilling = billingCostsTotal + additionalBillingTotal;

  // ─── Print quote handler ─────────────────────────────────────
  const handlePrintInvoice = useCallback(async (type: "breakdown" | "total") => {
    if (!quoteNumber) return;
    try {
      // Generate invoice number via API
      const resp = await apiRequest("POST", "/api/billing/generate-invoice", {
        jobNumber: quoteNumber,
        invoiceType: type,
        billingCurrency,
        totalAmount: summaryBilling.toFixed(2),
      });
      const inv = await resp.json();
      setGeneratedInvoices((prev) => [...prev, inv]);

      // Determine billed party from quoteData
      const shipmentType = quoteData["Trade Direction"] || "";
      const isExport = shipmentType.toLowerCase().includes("exp");
      const billedPartyName = isExport
        ? (quoteData["Shipper"] || "")
        : (quoteData["Consignee"] || "");

      // Build line items
      const lineItems: { label: string; amount: number }[] = [];
      for (const row of costs) {
        const cat = COST_CATEGORIES.find((c) => c.key === row.category);
        const amt = getBillingAmount(row.category, row.realAmount);
        if (amt > 0) lineItems.push({ label: cat?.label || row.category, amount: amt });
      }
      for (const row of additionalCharges) {
        const amt = getBillingAmount(`additional-${row.id}`, row.realAmount);
        if (amt > 0) lineItems.push({ label: row.description || "Additional charge", amount: amt });
      }

      generateInvoicePDF({
        invoiceNumber: inv.invoiceNumber,
        jobNumber: quoteNumber,
        billedPartyName,
        billedPartyAddress: "",
        billingCurrency,
        invoiceType: type,
        lineItems,
        totalAmount: summaryBilling,
      });

      setShowPrintDialog(false);
    } catch (err) {
      console.error("Failed to generate invoice:", err);
    }
  }, [quoteNumber, billingCurrency, summaryBilling, costs, additionalCharges, getBillingAmount, quoteData]);

  // ─── Render ───────────────────────────────────────────────────

  if (!quoteNumber) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground" data-testid="quote-cost-empty">
        <Receipt className="w-10 h-10 opacity-30" />
        <p className="text-sm">No quote selected</p>
      </div>
    );
  }

  if (loading && !loaded) {
    return (
      <div className="flex items-center justify-center h-40" data-testid="quote-cost-loading">
        <Loader2 className="w-6 h-6 text-[var(--brand-teal)] animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8" data-testid="quote-cost-container">
      {/* ─── Main table: Suppliers Costs + Billing side by side ─── */}
      <section>
        <div className="flex items-end gap-6 mb-3">
          <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider">Suppliers Costs</h2>
          <div className="flex-1" />
          <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider">Billing</h2>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground uppercase">Currency</span>
            <CurrencySelect
              value={billingCurrency}
              onChange={handleBillingCurrencyChange}
              testId="quote-cost-billing-currency"
            />
            <span className="text-[10px] text-muted-foreground uppercase ml-2">ROE</span>
            <input
              type="text"
              value={roe}
              onChange={(e) => handleRoeChange(e.target.value)}
              className="text-xs rounded border border-border/40 bg-background/60 text-foreground px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary w-16 text-center"
              placeholder="1"
              data-testid="quote-cost-billing-roe"
            />
          </div>
        </div>

        {/* Header row */}
        <div className="grid gap-1 mb-1.5" style={{
          gridTemplateColumns: "160px 110px 68px 16px 110px",
        }}>
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider"></span>
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Suppliers Costs</span>
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Curr</span>
          <span></span>
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider text-center">
            Billing ({billingCurrency})
          </span>
        </div>

        {/* Cost rows */}
        {costs.map((row) => {
          const cat = COST_CATEGORIES.find((c) => c.key === row.category);
          return (
            <div
              key={row.category}
              className="grid gap-1 items-center py-1 border-b border-border/20"
              style={{ gridTemplateColumns: "160px 110px 68px 16px 110px" }}
              data-testid={`quote-cost-row-${row.category}`}
            >
              <span className="text-xs font-medium text-foreground/80 text-right pr-2">{cat?.label}</span>
              <EditableInput value={row.realAmount} onChange={(v) => updateCost(row.category, "realAmount", v)} placeholder="0.00" testId={`quote-cost-real-${row.category}`} />
              <CurrencySelect value={row.realCurrency} onChange={(v) => updateCost(row.category, "realCurrency", v)} testId={`quote-cost-realcur-${row.category}`} />
              {/* Separator */}
              <div className="flex justify-center"><div className="w-px h-5 bg-border/40" /></div>
              {/* Billing amount */}
              <EditableInput
                value={getBillingDisplay(row.category, row.realAmount)}
                onChange={(v) => updateBillingOverride(row.category, v)}
                placeholder="0.00"
                testId={`quote-cost-billing-amt-${row.category}`}
              />
            </div>
          );
        })}

        {/* Subtotal row */}
        <div className="grid gap-1 items-center py-2 mt-1" style={{
          gridTemplateColumns: "160px 110px 68px 16px 110px",
        }}>
          <span className="text-xs font-semibold text-foreground/60 text-right pr-2">Subtotal</span>
          <span className="text-xs font-semibold text-[var(--brand-teal)] tabular-nums px-2">{fmt(realCostsTotal)}</span>
          <span></span>
          <div className="flex justify-center"><div className="w-px h-5 bg-border/40" /></div>
          <span className="text-xs font-semibold text-[var(--brand-teal)] tabular-nums text-center" data-testid="quote-cost-billing-costs-subtotal">{fmt(billingCostsTotal)}</span>
        </div>
      </section>

      {/* ─── Other Additional Charges ─── */}
      <section>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider">Other additional charges</h2>
          <button
            onClick={addRow}
            className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md bg-[var(--brand-teal)] text-white hover:bg-[var(--brand-teal-strong)] transition-colors"
            data-testid="quote-cost-btn-add-additional"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>

        {additionalCharges.length === 0 ? (
          <div className="text-xs text-muted-foreground/60 py-4 text-center border border-dashed border-border/30 rounded-md">
            No additional charges. Click "Add" to create one.
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="grid gap-1 mb-1.5" style={{
              gridTemplateColumns: "180px 110px 68px 28px 16px 110px",
            }}>
              <span className="text-[10px] font-medium text-muted-foreground uppercase">Description</span>
              <span className="text-[10px] font-medium text-muted-foreground uppercase">Suppliers Costs</span>
              <span className="text-[10px] font-medium text-muted-foreground uppercase">Curr</span>
              <span></span>
              <span></span>
              <span className="text-[10px] font-medium text-muted-foreground uppercase text-center">Billing ({billingCurrency})</span>
            </div>

            {additionalCharges.map((row, idx) => (
              <div
                key={row.id ?? `new-${idx}`}
                className="grid gap-1 items-center py-1 border-b border-border/20"
                style={{ gridTemplateColumns: "180px 110px 68px 28px 16px 110px" }}
                data-testid={`quote-cost-additional-row-${idx}`}
              >
                <EditableInput value={row.description} onChange={(v) => updateAdditional(idx, "description", v)} placeholder="—" testId={`quote-cost-add-desc-${idx}`} />
                <EditableInput value={row.realAmount} onChange={(v) => updateAdditional(idx, "realAmount", v)} placeholder="0.00" testId={`quote-cost-add-real-${idx}`} />
                <CurrencySelect value={row.realCurrency} onChange={(v) => updateAdditional(idx, "realCurrency", v)} testId={`quote-cost-add-realcur-${idx}`} />
                <button
                  onClick={() => deleteRow(idx)}
                  className="flex items-center justify-center w-6 h-6 rounded text-red-400/70 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                  title="Delete row" data-testid={`quote-cost-add-del-${idx}`}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
                <div className="flex justify-center"><div className="w-px h-5 bg-border/40" /></div>
                <EditableInput
                  value={getBillingDisplay(`additional-${row.id}`, row.realAmount)}
                  onChange={(v) => updateBillingOverride(`additional-${row.id}`, v)}
                  placeholder="0.00"
                  testId={`quote-cost-add-billing-${idx}`}
                />
              </div>
            ))}

            {/* Additional charges subtotal */}
            <div className="grid gap-1 items-center py-2 mt-1" style={{
              gridTemplateColumns: "180px 110px 68px 28px 16px 110px",
            }}>
              <span className="text-xs font-semibold text-foreground/60 text-right pr-2">Additional charges total</span>
              <span className="text-xs font-semibold text-[var(--brand-teal)] tabular-nums px-2">{fmt(additionalRealTotal)}</span>
              <span></span><span></span>
              <div className="flex justify-center"><div className="w-px h-5 bg-border/40" /></div>
              <span className="text-xs font-semibold text-[var(--brand-teal)] tabular-nums text-center">{fmt(additionalBillingTotal)}</span>
            </div>
          </>
        )}
      </section>

      {/* ─── Summary + Print ─── */}
      <section className="border-t-2 border-[var(--brand-teal)]/30 pt-4">
        <div className="flex items-center gap-6 flex-wrap">
          <span className="text-sm font-bold text-foreground">Summary</span>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium text-muted-foreground uppercase">Suppliers Costs</span>
              <span className="text-sm font-bold text-[var(--brand-teal)] tabular-nums" data-testid="quote-cost-summary-real">{fmtNonEmpty(summaryReal)}</span>
            </div>
            <div className="w-px h-5 bg-border/40 mx-2" />
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium text-muted-foreground uppercase">Billing ({billingCurrency})</span>
              <span className="text-sm font-bold text-amber-400 tabular-nums" data-testid="quote-cost-summary-billing">{fmtNonEmpty(summaryBilling)}</span>
            </div>
          </div>

          {/* Profit */}
          {(summaryBilling > 0 || summaryReal > 0) && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium text-muted-foreground uppercase">Profit</span>
              <span
                className={`text-sm font-bold tabular-nums ${summaryBilling - summaryReal > 0 ? "text-green-400" : summaryBilling - summaryReal < 0 ? "text-red-400" : "text-foreground/60"}`}
                data-testid="quote-cost-summary-profit"
              >
                {(summaryBilling - summaryReal) > 0 ? "+" : ""}
                {(summaryBilling - summaryReal).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {billingCurrency}
              </span>
            </div>
          )}

          <div className="flex-1" />

          {/* Print Quote button */}
          <button
            onClick={() => setShowPrintDialog(true)}
            disabled={summaryBilling <= 0}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: summaryBilling > 0 ? "var(--brand-teal)" : "hsl(var(--border-20))", color: summaryBilling > 0 ? "hsl(var(--surface-8))" : "hsl(var(--fg-60))" }}
            data-testid="quote-cost-btn-print-invoice"
          >
            <Printer className="w-4 h-4" />
            Print Quote
          </button>

          {/* Booked button */}
          {generatedInvoices.length > 0 && onBooked && (
            <button
              onClick={() => { setBookedStep("select-quote"); setSelectedBookedInvoice(""); setShowBookedDialog(true); }}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all bg-amber-500 text-black hover:bg-amber-400"
              data-testid="quote-cost-btn-booked"
            >
              <BookCheck className="w-4 h-4" />
              Booked
            </button>
          )}
        </div>

        {/* Generated invoices history */}
        {generatedInvoices.length > 0 && (
          <div className="mt-4 pt-3 border-t border-border/20">
            <h3 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Generated Invoices</h3>
            <div className="flex flex-wrap gap-2">
              {generatedInvoices.map((inv) => (
                <InvoiceChip key={inv.id} inv={inv} quoteNumber={quoteNumber} quoteData={quoteData} costs={costs} additionalCharges={additionalCharges} billing={{ billingCurrency, roe }} billingOverrides={billingOverrides} />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ─── Print Quote Dialog ─── */}
      {showPrintDialog && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60" onClick={() => setShowPrintDialog(false)}>
          <div
            className="rounded-lg border shadow-2xl p-6 max-w-sm w-full mx-4"
            style={{ background: "hsl(var(--surface-11))", borderColor: "hsl(var(--border-25))" }}
            onClick={(e) => e.stopPropagation()}
            data-testid="quote-cost-print-dialog"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground">Print Quote</h3>
              <button
                onClick={() => setShowPrintDialog(false)}
                className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground mb-4">
              How should the invoice be printed for <span className="text-foreground font-medium">{quoteNumber}</span>?
            </p>

            <div className="space-y-2">
              <button
                onClick={() => handlePrintInvoice("breakdown")}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-md border text-left transition-all hover:bg-white/5"
                style={{ borderColor: "hsl(var(--border-25))" }}
                data-testid="quote-cost-print-breakdown"
              >
                <div>
                  <div className="text-sm font-medium text-foreground">Breakdown</div>
                  <div className="text-[11px] text-muted-foreground">Each surcharge listed as a separate line item</div>
                </div>
              </button>
              <button
                onClick={() => handlePrintInvoice("total")}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-md border text-left transition-all hover:bg-white/5"
                style={{ borderColor: "hsl(var(--border-25))" }}
                data-testid="quote-cost-print-total"
              >
                <div>
                  <div className="text-sm font-medium text-foreground">Total</div>
                  <div className="text-[11px] text-muted-foreground">Single lumpsum amount only</div>
                </div>
              </button>
            </div>

            <div className="mt-4 pt-3 border-t border-border/20 text-center">
              <span className="text-xs text-muted-foreground">
                Total: <span className="font-medium text-amber-400">{billingCurrency} {fmtNonEmpty(summaryBilling)}</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ─── Booked Dialog ─── */}
      {showBookedDialog && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60" onClick={() => setShowBookedDialog(false)}>
          <div
            className="rounded-lg border shadow-2xl p-6 max-w-sm w-full mx-4"
            style={{ background: "hsl(var(--surface-11))", borderColor: "hsl(var(--border-25))" }}
            onClick={(e) => e.stopPropagation()}
            data-testid="quote-cost-booked-dialog"
          >
            {bookedStep === "select-quote" && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-foreground">Book Quote</h3>
                  <button
                    onClick={() => setShowBookedDialog(false)}
                    className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-xs text-muted-foreground mb-4">
                  Select the generated quote to book:
                </p>

                <div className="space-y-2 mb-4">
                  {generatedInvoices.map((inv) => (
                    <button
                      key={inv.id}
                      onClick={() => setSelectedBookedInvoice(inv.invoiceNumber)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md border text-left transition-all hover:bg-white/5"
                      style={{
                        borderColor: selectedBookedInvoice === inv.invoiceNumber ? "var(--brand-teal)" : "hsl(var(--border-25))",
                        background: selectedBookedInvoice === inv.invoiceNumber ? "rgba(20,184,166,0.08)" : "transparent",
                      }}
                      data-testid={`booked-opt-${inv.invoiceNumber}`}
                    >
                      {selectedBookedInvoice === inv.invoiceNumber ? (
                        <Check className="w-4 h-4 text-[var(--brand-teal)] flex-none" />
                      ) : (
                        <div className="w-4 h-4 flex-none" />
                      )}
                      <div>
                        <span className="text-xs font-mono font-medium text-foreground">{inv.invoiceNumber}</span>
                        <span className="text-xs text-muted-foreground ml-2">({inv.invoiceType})</span>
                        <span className="text-xs text-muted-foreground ml-2">{inv.billingCurrency} {inv.totalAmount}</span>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setShowBookedDialog(false)}
                    className="text-xs px-4 py-2 rounded-md border border-border/50 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setBookedStep("confirm")}
                    disabled={!selectedBookedInvoice}
                    className="text-xs px-4 py-2 rounded-md bg-amber-500 text-black font-medium hover:bg-amber-400 transition-colors disabled:opacity-40"
                    data-testid="btn-booked-next"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {bookedStep === "confirm" && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-500/20">
                    <BookCheck className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Create Shipment from Quote?</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Based on <span className="font-mono text-amber-400">{selectedBookedInvoice}</span></p>
                  </div>
                </div>

                <p className="text-xs text-foreground/80 mb-2">
                  This will:
                </p>
                <ul className="text-xs text-foreground/70 mb-5 space-y-1.5 pl-4">
                  <li className="flex items-start gap-2"><Check className="w-3 h-3 text-[var(--brand-teal)] mt-0.5 flex-none" /> Create a new shipment in Full Sheet with the next Job Number</li>
                  <li className="flex items-start gap-2"><Check className="w-3 h-3 text-[var(--brand-teal)] mt-0.5 flex-none" /> Copy all quote data (Shipper, Consignee, POL, POD, etc.)</li>
                  <li className="flex items-start gap-2"><Check className="w-3 h-3 text-[var(--brand-teal)] mt-0.5 flex-none" /> Set Sales number to <span className="font-mono text-amber-400">{selectedBookedInvoice}</span></li>
                  <li className="flex items-start gap-2"><Check className="w-3 h-3 text-[var(--brand-teal)] mt-0.5 flex-none" /> Copy Suppliers Costs → Estimated Costs in Invoicing</li>
                  <li className="flex items-start gap-2"><Check className="w-3 h-3 text-[var(--brand-teal)] mt-0.5 flex-none" /> Copy Billing → Billing in Invoicing</li>
                </ul>

                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setBookedStep("select-quote")}
                    className="text-xs px-4 py-2 rounded-md border border-border/50 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    disabled={isCreatingShipment}
                    onClick={async () => {
                      if (isCreatingShipment) return;
                      setIsCreatingShipment(true);
                      try {
                        if (onBooked) {
                          await onBooked({
                            quoteNumber,
                            selectedInvoiceNumber: selectedBookedInvoice,
                            quoteData,
                            costs,
                            additionalCharges,
                            billingCurrency,
                            roe,
                            billingOverrides,
                          });
                        }
                        setShowBookedDialog(false);
                      } finally {
                        setIsCreatingShipment(false);
                      }
                    }}
                    className={`text-xs px-4 py-2 rounded-md font-medium transition-colors ${isCreatingShipment ? "bg-amber-500/50 text-black/50 cursor-not-allowed" : "bg-amber-500 text-black hover:bg-amber-400"}`}
                    data-testid="btn-booked-confirm"
                  >
                    {isCreatingShipment ? "Creating..." : "Confirm — Create Shipment"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

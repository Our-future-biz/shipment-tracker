import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useShipments } from "@/lib/shipment-context";
import { getColumnValue } from "@/lib/shipment-data";
import { apiRequest } from "@/lib/queryClient";
import {
  Search,
  ChevronDown,
  Check,
  Plus,
  Trash2,
  Receipt,
  Loader2,
  Printer,
  X,
  FileDown,
  AlertTriangle,
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

// ─── Main Component ───────────────────────────────────────────────

export function InvoicingTab() {
  const { data: shipments, jobNumbers } = useShipments();

  // Job number selection
  const [jobNumber, setJobNumber] = useState("");
  const [jobDropdownOpen, setJobDropdownOpen] = useState(false);
  const [jobSearch, setJobSearch] = useState("");
  const jobDropdownRef = useRef<HTMLDivElement>(null);

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
  // "CZQ00000001-001" — set once the user loads costs from a quote
  const [quoteRef, setQuoteRef] = useState("");
  const [billingOverrides, setBillingOverrides] = useState<BillingOverrideMap>({});
  const [generatedInvoices, setGeneratedInvoices] = useState<GeneratedInvoice[]>([]);

  // Print dialog
  const [showPrintDialog, setShowPrintDialog] = useState(false);

  // ─── Load-from-Quote state ─────────────────────────────────
  const [quoteDialogOpen, setQuoteDialogOpen] = useState(false);
  const [availableQuotes, setAvailableQuotes] = useState<Array<{ quoteNumber: string; customer?: string; shipper?: string; consignee?: string; createdAt?: string; nextSubLine?: string; hasEstimates?: boolean }>>([]);
  const [quoteSearch, setQuoteSearch] = useState("");
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [importingQuote, setImportingQuote] = useState("");
  const [importBanner, setImportBanner] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);

  // ─── Job number dropdown ──────────────────────────────────────
  const searchTerm = (jobDropdownOpen ? jobSearch : jobNumber).toLowerCase();
  const filteredJobs = searchTerm
    ? jobNumbers.filter((jn) => jn.toLowerCase().includes(searchTerm))
    : jobNumbers;

  const selectedShipment = jobNumber
    ? shipments.find((s) => s.jobNumber === jobNumber)
    : undefined;

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (jobDropdownRef.current && !jobDropdownRef.current.contains(e.target as Node)) {
        setJobDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ─── Load invoicing + billing data when job changes ────────────
  useEffect(() => {
    if (!jobNumber) {
      setCosts(COST_CATEGORIES.map((c) => ({
        category: c.key, estAmount: "", estCurrency: "CZK",
        realAmount: "", realCurrency: "CZK", invoiceNumber: "", vendor: "",
      })));
      setAdditionalCharges([]);
      setBillingCurrency("CZK");
      setRoe("1");
      setQuoteRef("");
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
          apiRequest("GET", `/api/invoicing/${encodeURIComponent(jobNumber)}`),
          apiRequest("GET", `/api/billing/${encodeURIComponent(jobNumber)}`),
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
          setQuoteRef(billData.settings.quoteRef || "");
        } else {
          setBillingCurrency("CZK");
          setRoe("1");
          setQuoteRef("");
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
  }, [jobNumber]);

  // ─── Auto-save cost rows ──────────────────────────────────────
  const saveCostRow = useCallback((row: CostRow) => {
    if (!jobNumber) return;
    apiRequest("POST", "/api/invoicing/costs", {
      jobNumber, category: row.category,
      estAmount: row.estAmount, estCurrency: row.estCurrency,
      realAmount: row.realAmount, realCurrency: row.realCurrency,
      invoiceNumber: row.invoiceNumber, vendor: row.vendor,
    }).catch((err) => console.error("Failed to save cost:", err));
  }, [jobNumber]);

  const debouncedSaveCost = useKeyedDebounce(saveCostRow, 600);

  const updateCost = useCallback((category: string, field: keyof CostRow, value: string) => {
    setCosts((prev) => {
      const next = prev.map((r) => r.category === category ? { ...r, [field]: value } : r);
      const updated = next.find((r) => r.category === category);
      if (updated) debouncedSaveCost(category, updated);
      return next;
    });
  }, [debouncedSaveCost]);

  // ─── Load from Quote ────────────────────────────────────
  // Opens the dialog and pre-fetches the list of available CZQ quotes.
  const openQuoteDialog = useCallback(async () => {
    setQuoteDialogOpen(true);
    setQuoteSearch("");
    setLoadingQuotes(true);
    try {
      // 1) Load the quote list and existing quoteRefs in parallel
      const [quotesResp, refsResp] = await Promise.all([
        apiRequest("GET", "/api/quotes"),
        apiRequest("GET", "/api/billing/quote-refs"),
      ]);
      const list: any[] = await quotesResp.json();
      const refs: string[] = await refsResp.json();
      const refsByQuote = new Map<string, number[]>();
      for (const r of refs) {
        const m = /^([A-Z0-9]+)-(\d{1,4})$/.exec(r);
        if (m) {
          const arr = refsByQuote.get(m[1]) || [];
          arr.push(parseInt(m[2], 10));
          refsByQuote.set(m[1], arr);
        }
      }
      const computeNext = (qn: string): string => {
        const used = new Set(refsByQuote.get(qn) || []);
        let n = 1;
        while (used.has(n)) n += 1;
        return `${qn}-${String(n).padStart(3, "0")}`;
      };

      // 2) For each quote, fetch its costs to know whether it has anything to import
      const base = (Array.isArray(list) ? list : []).map((q) => ({
        quoteNumber: q.quoteNumber || q.quote_number || "",
        customer: q.data?.["Customer"] || q.data?.["Shipper"] || "",
        shipper: q.data?.["Shipper"] || "",
        consignee: q.data?.["Consignee"] || "",
        createdAt: q.createdAt || q.created_at,
        nextSubLine: "",
        hasEstimates: false,
      })).filter((q) => q.quoteNumber);

      // Resolve estimate-presence flag for each quote in parallel
      const enriched = await Promise.all(base.map(async (q) => {
        try {
          const r = await apiRequest("GET", `/api/invoicing/${encodeURIComponent(q.quoteNumber)}`);
          const d = await r.json() as { costs?: Array<{ estAmount?: string }> };
          const has = (d?.costs || []).some((c) => (c.estAmount || "").trim() !== "");
          return { ...q, hasEstimates: has, nextSubLine: computeNext(q.quoteNumber) };
        } catch {
          return { ...q, hasEstimates: false, nextSubLine: computeNext(q.quoteNumber) };
        }
      }));
      setAvailableQuotes(enriched);
    } catch (err) {
      console.error("Failed to load quotes:", err);
      setAvailableQuotes([]);
    } finally {
      setLoadingQuotes(false);
    }
  }, []);

  // Compute the next available sub-line number for a given CZQ across all
  // shipments (so the same quote applied to multiple jobs gets -001/-002/...).
  async function computeNextSubLine(quoteNumber: string): Promise<string> {
    try {
      const resp = await apiRequest("GET", "/api/billing/quote-refs");
      const allRefs: string[] = await resp.json();
      const prefix = `${quoteNumber}-`;
      const used = new Set<number>();
      for (const r of allRefs) {
        if (typeof r === "string" && r.startsWith(prefix)) {
          const n = parseInt(r.slice(prefix.length), 10);
          if (!isNaN(n)) used.add(n);
        }
      }
      let n = 1;
      while (used.has(n)) n += 1;
      return `${quoteNumber}-${String(n).padStart(3, "0")}`;
    } catch {
      // If the endpoint isn't available yet, default to -001
      return `${quoteNumber}-001`;
    }
  }

  // Pull the quote's saved cost rows from /api/invoicing/<quoteNumber> and copy
  // each estimated amount + currency + vendor into the current job's invoicing.
  // Records a unique sub-line reference (e.g. CZQ00000001-001) on the job's
  // billing settings so the Summary shows which quote was used.
  const importFromQuote = useCallback(async (quoteNumber: string) => {
    if (!jobNumber) return;
    setImportingQuote(quoteNumber);
    setImportBanner(null);
    try {
      const resp = await apiRequest("GET", `/api/invoicing/${encodeURIComponent(quoteNumber)}`);
      const data = await resp.json() as { costs?: Array<{ category: string; estAmount?: string; estCurrency?: string; vendor?: string; }> };
      const quoteCosts = data?.costs || [];
      // Count how many quote rows actually have a non-empty estimated amount
      const nonEmptyFromQuote = quoteCosts.filter((c) => (c.estAmount || "").trim() !== "");
      if (quoteCosts.length === 0 || nonEmptyFromQuote.length === 0) {
        setImportBanner({ tone: "warn", text: `Quote ${quoteNumber} has no estimated amounts to load. Fill the quote first, then try again.` });
        return;
      }

      let copied = 0;
      let skipped = 0;
      const nextRows: CostRow[] = costs.map((existing) => {
        const fromQuote = quoteCosts.find((c) => c.category === existing.category);
        if (!fromQuote || !(fromQuote.estAmount || "").trim()) return existing;
        // Don't overwrite a non-empty user estimate
        if ((existing.estAmount || "").trim() !== "") {
          skipped += 1;
          return existing;
        }
        const next: CostRow = {
          ...existing,
          estAmount: fromQuote.estAmount || existing.estAmount,
          estCurrency: fromQuote.estCurrency || existing.estCurrency,
          vendor: fromQuote.vendor || existing.vendor,
        };
        saveCostRow(next);
        copied += 1;
        return next;
      });
      setCosts(nextRows);

      // Compute & persist the sub-line reference
      const ref = await computeNextSubLine(quoteNumber);
      try {
        await apiRequest("POST", "/api/billing/settings", {
          jobNumber,
          quoteRef: ref,
        });
        setQuoteRef(ref);
      } catch (err) {
        console.error("Failed to persist quoteRef:", err);
      }

      setQuoteDialogOpen(false);
      const parts: string[] = [];
      if (copied > 0) parts.push(`${copied} row${copied === 1 ? "" : "s"} loaded · reference ${ref}`);
      if (skipped > 0) parts.push(`${skipped} kept (already had an estimate)`);
      setImportBanner({
        tone: copied > 0 ? "ok" : "warn",
        text: copied > 0
          ? `Loaded from ${quoteNumber} — ${parts.join(" · ")}`
          : `Nothing imported — ${parts.join(" · ")}`,
      });
      setTimeout(() => setImportBanner(null), 8000);
    } catch (err: any) {
      console.error("Failed to import quote:", err);
      setImportBanner({ tone: "warn", text: `Failed to import ${quoteNumber}: ${err?.message || "unknown error"}` });
    } finally {
      setImportingQuote("");
    }
  }, [jobNumber, costs, saveCostRow]);

  // ─── Additional charges CRUD ──────────────────────────────────────────
  const addRow = useCallback(async () => {
    if (!jobNumber) return;
    try {
      const resp = await apiRequest("POST", "/api/invoicing/additional", {
        jobNumber, sortOrder: additionalCharges.length,
      });
      const row = await resp.json();
      setAdditionalCharges((prev) => [...prev, {
        id: row.id, invoiceNumber: "", vendor: "", description: "",
        estAmount: "", estCurrency: "CZK", realAmount: "", realCurrency: "CZK",
      }]);
    } catch (err) { console.error("Failed to add row:", err); }
  }, [jobNumber, additionalCharges.length]);

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
    if (!jobNumber) return;
    apiRequest("POST", "/api/billing/settings", {
      jobNumber, billingCurrency: currency, roe: roeVal,
    }).catch((err) => console.error("Failed to save billing settings:", err));
  }, [jobNumber]);

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
    if (!jobNumber) return;
    apiRequest("POST", "/api/billing/override", { jobNumber, rowKey, billingAmount: amount })
      .catch((err) => console.error("Failed to save billing override:", err));
  }, [jobNumber]);

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

  // ─── Print invoice handler ────────────────────────────────────
  const handlePrintInvoice = useCallback(async (type: "breakdown" | "total") => {
    if (!jobNumber) return;
    try {
      // Generate invoice number via API
      const resp = await apiRequest("POST", "/api/billing/generate-invoice", {
        jobNumber,
        invoiceType: type,
        billingCurrency,
        totalAmount: summaryBilling.toFixed(2),
      });
      const inv = await resp.json();
      setGeneratedInvoices((prev) => [...prev, inv]);

      // Determine billed party
      const shipmentType = selectedShipment ? getColumnValue(selectedShipment, "Trade Direction") : "";
      const isExport = shipmentType.toLowerCase().includes("exp");
      const billedPartyName = selectedShipment
        ? getColumnValue(selectedShipment, isExport ? "Shipper" : "Consignee")
        : "";

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
        jobNumber,
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
  }, [jobNumber, billingCurrency, summaryBilling, costs, additionalCharges, getBillingAmount, selectedShipment]);

  // ─── Render ───────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col" data-testid="invoicing-container">
      {/* Toolbar */}
      <div
        className="flex-none flex items-center gap-4 px-6 py-3 border-b border-border/50"
        style={{ background: "hsl(var(--surface-8))" }}
      >
        <Receipt className="w-4 h-4 text-[var(--brand-teal)]" />
        <span className="text-xs font-semibold text-foreground tracking-wide uppercase">Invoicing</span>

        {/* Job Number selector */}
        <div className="relative" ref={jobDropdownRef}>
          <button
            onClick={() => { setJobDropdownOpen(!jobDropdownOpen); setJobSearch(""); }}
            className="flex items-center gap-2 text-xs rounded-md border border-border/50 bg-background/50 text-foreground px-3 py-1.5 min-w-[200px] focus:outline-none focus:ring-1 focus:ring-primary"
            data-testid="invoicing-job-selector"
          >
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
            <span className={jobNumber ? "text-foreground" : "text-muted-foreground"}>
              {jobNumber || "Select Job Number..."}
            </span>
            <ChevronDown className="w-3 h-3 text-muted-foreground ml-auto" />
          </button>

          {jobDropdownOpen && (
            <div
              className="absolute z-50 top-full left-0 mt-1 w-72 rounded-md border border-border/50 shadow-xl overflow-hidden"
              style={{ background: "hsl(var(--surface-11))" }}
            >
              <div className="p-2 border-b border-border/30">
                <input
                  type="text" value={jobSearch} onChange={(e) => setJobSearch(e.target.value)}
                  placeholder="Search job numbers..."
                  className="w-full text-xs rounded border border-border/40 bg-background/50 text-foreground px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
                  autoFocus data-testid="invoicing-job-search"
                />
              </div>
              <div className="max-h-56 overflow-y-auto">
                {filteredJobs.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">No matching jobs</div>
                ) : (
                  filteredJobs.map((jn) => (
                    <button
                      key={jn}
                      onClick={() => { setJobNumber(jn); setJobDropdownOpen(false); setJobSearch(""); }}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 flex items-center gap-2 ${jn === jobNumber ? "text-[var(--brand-teal)]" : "text-foreground"}`}
                      data-testid={`invoicing-job-opt-${jn}`}
                    >
                      {jn === jobNumber && <Check className="w-3 h-3" />}
                      <span className={jn === jobNumber ? "" : "ml-5"}>{jn}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {selectedShipment && (
          <span className="text-xs text-muted-foreground truncate max-w-[500px]">
            {selectedShipment.shipper || ""}{selectedShipment.shipper && selectedShipment.consignee ? " → " : ""}{selectedShipment.consignee || ""}
          </span>
        )}

        {loading && <Loader2 className="w-4 h-4 text-[var(--brand-teal)] animate-spin" />}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-5" style={{ background: "hsl(var(--surface-6))" }}>
        {!jobNumber ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <Receipt className="w-10 h-10 opacity-30" />
            <p className="text-sm">Select a Job Number to view or edit invoicing data</p>
          </div>
        ) : loading && !loaded ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 text-[var(--brand-teal)] animate-spin" />
          </div>
        ) : (
          <div className="space-y-8">
            {/* Inline banner after import */}
            {importBanner && (
              <div
                className="flex items-start gap-2 px-3 py-2 rounded-md text-xs"
                style={{
                  background: importBanner.tone === "ok" ? "var(--tint-green-soft)" : "var(--tint-yellow-soft)",
                  border: `1px solid ${importBanner.tone === "ok" ? "var(--brand-green)" : "var(--dark-yellow)"}`,
                  color: importBanner.tone === "ok" ? "var(--brand-green)" : "var(--dark-yellow)",
                }}
                data-testid="invoicing-import-banner"
              >
                {importBanner.tone === "ok" ? <Check className="w-3.5 h-3.5 mt-0.5" /> : <AlertTriangle className="w-3.5 h-3.5 mt-0.5" />}
                <span className="flex-1">{importBanner.text}</span>
                <button onClick={() => setImportBanner(null)} className="opacity-60 hover:opacity-100"><X className="w-3 h-3" /></button>
              </div>
            )}

            {/* ─── Main table: Estimated + Billing side by side ─── */}
            <section>
              <div className="flex items-end gap-6 mb-3">
                <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider">Estimated Costs</h2>
                <button
                  onClick={openQuoteDialog}
                  disabled={!jobNumber}
                  className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded border transition-colors"
                  style={{
                    background: "var(--tint-green-soft)",
                    borderColor: "var(--brand-teal)",
                    color: "var(--brand-teal)",
                  }}
                  data-testid="button-load-from-quote"
                  title="Pre-fill estimated costs from an existing CZQ quote"
                >
                  <FileDown className="w-3 h-3" />
                  Load from Quote
                </button>
                <div className="flex-1" />
                <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider">Billing</h2>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground uppercase">Currency</span>
                  <CurrencySelect
                    value={billingCurrency}
                    onChange={handleBillingCurrencyChange}
                    testId="billing-currency"
                  />
                  <span className="text-[10px] text-muted-foreground uppercase ml-2">ROE</span>
                  <input
                    type="text"
                    value={roe}
                    onChange={(e) => handleRoeChange(e.target.value)}
                    className="text-xs rounded border border-border/40 bg-background/60 text-foreground px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary w-16 text-center"
                    placeholder="1"
                    data-testid="billing-roe"
                  />
                </div>
              </div>

              {/* Header row */}
              <div className="grid gap-1 mb-1.5" style={{
                gridTemplateColumns: "130px 90px 56px 90px 56px 110px 110px 16px 90px",
              }}>
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider"></span>
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Est. Amt</span>
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Curr</span>
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Real Cost</span>
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Curr</span>
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Invoice No.</span>
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Vendor</span>
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
                    style={{ gridTemplateColumns: "130px 90px 56px 90px 56px 110px 110px 16px 90px" }}
                    data-testid={`cost-row-${row.category}`}
                  >
                    <span className="text-xs font-medium text-foreground/80 text-right pr-2">{cat?.label}</span>
                    <EditableInput value={row.estAmount} onChange={(v) => updateCost(row.category, "estAmount", v)} placeholder="0.00" testId={`cost-est-${row.category}`} />
                    <CurrencySelect value={row.estCurrency} onChange={(v) => updateCost(row.category, "estCurrency", v)} testId={`cost-estcur-${row.category}`} />
                    <EditableInput value={row.realAmount} onChange={(v) => updateCost(row.category, "realAmount", v)} placeholder="0.00" testId={`cost-real-${row.category}`} />
                    <CurrencySelect value={row.realCurrency} onChange={(v) => updateCost(row.category, "realCurrency", v)} testId={`cost-realcur-${row.category}`} />
                    <EditableInput value={row.invoiceNumber} onChange={(v) => updateCost(row.category, "invoiceNumber", v)} placeholder="—" testId={`cost-inv-${row.category}`} />
                    <EditableInput value={row.vendor} onChange={(v) => updateCost(row.category, "vendor", v)} placeholder="—" testId={`cost-vendor-${row.category}`} />
                    {/* Separator */}
                    <div className="flex justify-center"><div className="w-px h-5 bg-border/40" /></div>
                    {/* Billing amount */}
                    <EditableInput
                      value={getBillingDisplay(row.category, row.realAmount)}
                      onChange={(v) => updateBillingOverride(row.category, v)}
                      placeholder="0.00"
                      testId={`billing-amt-${row.category}`}
                    />
                  </div>
                );
              })}

              {/* Subtotal row */}
              <div className="grid gap-1 items-center py-2 mt-1" style={{
                gridTemplateColumns: "130px 90px 56px 90px 56px 110px 110px 16px 90px",
              }}>
                <span className="text-xs font-semibold text-foreground/60 text-right pr-2">Subtotal</span>
                <span className="text-xs font-semibold text-[var(--brand-teal)] tabular-nums px-2">{fmt(estCostsTotal)}</span>
                <span></span>
                <span className="text-xs font-semibold text-[var(--brand-teal)] tabular-nums px-2">{fmt(realCostsTotal)}</span>
                <span></span><span></span><span></span>
                <div className="flex justify-center"><div className="w-px h-5 bg-border/40" /></div>
                <span className="text-xs font-semibold text-[var(--brand-teal)] tabular-nums text-center" data-testid="billing-costs-subtotal">{fmt(billingCostsTotal)}</span>
              </div>
            </section>

            {/* ─── Other Additional Charges ─── */}
            <section>
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider">Other additional charges</h2>
                <button
                  onClick={addRow}
                  className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md bg-[var(--brand-teal)] text-white hover:bg-[var(--brand-teal-strong)] transition-colors"
                  data-testid="btn-add-additional"
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
                    gridTemplateColumns: "110px 100px 130px 80px 56px 80px 56px 28px 16px 90px",
                  }}>
                    <span className="text-[10px] font-medium text-muted-foreground uppercase">Invoice No.</span>
                    <span className="text-[10px] font-medium text-muted-foreground uppercase">Vendor</span>
                    <span className="text-[10px] font-medium text-muted-foreground uppercase">Description</span>
                    <span className="text-[10px] font-medium text-muted-foreground uppercase">Est. Amt</span>
                    <span className="text-[10px] font-medium text-muted-foreground uppercase">Curr</span>
                    <span className="text-[10px] font-medium text-muted-foreground uppercase">Real Amt</span>
                    <span className="text-[10px] font-medium text-muted-foreground uppercase">Curr</span>
                    <span></span>
                    <span></span>
                    <span className="text-[10px] font-medium text-muted-foreground uppercase text-center">Billing ({billingCurrency})</span>
                  </div>

                  {additionalCharges.map((row, idx) => (
                    <div
                      key={row.id ?? `new-${idx}`}
                      className="grid gap-1 items-center py-1 border-b border-border/20"
                      style={{ gridTemplateColumns: "110px 100px 130px 80px 56px 80px 56px 28px 16px 90px" }}
                      data-testid={`additional-row-${idx}`}
                    >
                      <EditableInput value={row.invoiceNumber} onChange={(v) => updateAdditional(idx, "invoiceNumber", v)} placeholder="—" testId={`add-inv-${idx}`} />
                      <EditableInput value={row.vendor} onChange={(v) => updateAdditional(idx, "vendor", v)} placeholder="—" testId={`add-vendor-${idx}`} />
                      <EditableInput value={row.description} onChange={(v) => updateAdditional(idx, "description", v)} placeholder="—" testId={`add-desc-${idx}`} />
                      <EditableInput value={row.estAmount} onChange={(v) => updateAdditional(idx, "estAmount", v)} placeholder="0.00" testId={`add-est-${idx}`} />
                      <CurrencySelect value={row.estCurrency} onChange={(v) => updateAdditional(idx, "estCurrency", v)} testId={`add-estcur-${idx}`} />
                      <EditableInput value={row.realAmount} onChange={(v) => updateAdditional(idx, "realAmount", v)} placeholder="0.00" testId={`add-real-${idx}`} />
                      <CurrencySelect value={row.realCurrency} onChange={(v) => updateAdditional(idx, "realCurrency", v)} testId={`add-realcur-${idx}`} />
                      <button
                        onClick={() => deleteRow(idx)}
                        className="flex items-center justify-center w-6 h-6 rounded text-red-400/70 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                        title="Delete row" data-testid={`add-del-${idx}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                      <div className="flex justify-center"><div className="w-px h-5 bg-border/40" /></div>
                      <EditableInput
                        value={getBillingDisplay(`additional-${row.id}`, row.realAmount)}
                        onChange={(v) => updateBillingOverride(`additional-${row.id}`, v)}
                        placeholder="0.00"
                        testId={`add-billing-${idx}`}
                      />
                    </div>
                  ))}

                  {/* Additional charges subtotal */}
                  <div className="grid gap-1 items-center py-2 mt-1" style={{
                    gridTemplateColumns: "110px 100px 130px 80px 56px 80px 56px 28px 16px 90px",
                  }}>
                    <span className="text-xs font-semibold text-foreground/60 col-span-3 text-right pr-2">Additional charges total</span>
                    <span className="text-xs font-semibold text-[var(--brand-teal)] tabular-nums px-2">{fmt(additionalEstTotal)}</span>
                    <span></span>
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
                {quoteRef && (
                  <span
                    className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider"
                    style={{ color: "hsl(var(--muted-55))" }}
                    data-testid="summary-quote-ref"
                  >
                    <FileDown className="w-3 h-3" style={{ color: "var(--brand-teal)" }} />
                    <span>Quote ref</span>
                    <span className="font-mono text-xs" style={{ color: "var(--brand-teal)" }}>{quoteRef}</span>
                  </span>
                )}
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase">Estimated</span>
                    <span className="text-sm font-bold text-[var(--brand-teal)] tabular-nums" data-testid="summary-est">{fmtNonEmpty(summaryEst)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase">Real</span>
                    <span className="text-sm font-bold text-[var(--brand-teal)] tabular-nums" data-testid="summary-real">{fmtNonEmpty(summaryReal)}</span>
                  </div>
                  {summaryEst > 0 && summaryReal > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-medium text-muted-foreground uppercase">Diff</span>
                      <span
                        className={`text-sm font-bold tabular-nums ${summaryReal - summaryEst > 0 ? "text-red-400" : summaryReal - summaryEst < 0 ? "text-green-400" : "text-foreground/60"}`}
                        data-testid="summary-diff"
                      >
                        {(summaryReal - summaryEst) > 0 ? "+" : ""}{(summaryReal - summaryEst).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                  <div className="w-px h-5 bg-border/40 mx-2" />
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase">Billing ({billingCurrency})</span>
                    <span className="text-sm font-bold text-amber-400 tabular-nums" data-testid="summary-billing">{fmtNonEmpty(summaryBilling)}</span>
                  </div>
                </div>

                {/* Profit */}
                {(summaryBilling > 0 || summaryReal > 0) && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase">Profit</span>
                    <span
                      className={`text-sm font-bold tabular-nums ${summaryBilling - summaryReal > 0 ? "text-green-400" : summaryBilling - summaryReal < 0 ? "text-red-400" : "text-foreground/60"}`}
                      data-testid="summary-profit"
                    >
                      {(summaryBilling - summaryReal) > 0 ? "+" : ""}
                      {(summaryBilling - summaryReal).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {billingCurrency}
                    </span>
                  </div>
                )}

                <div className="flex-1" />

                {/* Print Invoice button */}
                <button
                  onClick={() => setShowPrintDialog(true)}
                  disabled={summaryBilling <= 0}
                  className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: summaryBilling > 0 ? "var(--brand-teal)" : "hsl(var(--border-20))", color: summaryBilling > 0 ? "hsl(var(--surface-8))" : "hsl(var(--fg-60))" }}
                  data-testid="btn-print-invoice"
                >
                  <Printer className="w-4 h-4" />
                  Print Invoice
                </button>
              </div>

              {/* Generated invoices history */}
              {generatedInvoices.length > 0 && (
                <div className="mt-4 pt-3 border-t border-border/20">
                  <h3 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Generated Invoices</h3>
                  <div className="flex flex-wrap gap-2">
                    {generatedInvoices.map((inv) => (
                      <span key={inv.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border border-border/30" style={{ background: "hsl(var(--surface-11))" }}>
                        <Receipt className="w-3 h-3 text-[var(--brand-teal)]" />
                        <span className="font-mono font-medium text-foreground">{inv.invoiceNumber}</span>
                        <span className="text-muted-foreground">({inv.invoiceType})</span>
                        <span className="text-muted-foreground">{inv.billingCurrency} {inv.totalAmount}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {/* ─── Print Invoice Dialog ─── */}
      {showPrintDialog && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60" onClick={() => setShowPrintDialog(false)}>
          <div
            className="rounded-lg border shadow-2xl p-6 max-w-sm w-full mx-4"
            style={{ background: "hsl(var(--surface-11))", borderColor: "hsl(var(--border-25))" }}
            onClick={(e) => e.stopPropagation()}
            data-testid="print-dialog"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground">Print Invoice</h3>
              <button
                onClick={() => setShowPrintDialog(false)}
                className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground mb-4">
              How should the invoice be printed for <span className="text-foreground font-medium">{jobNumber}</span>?
            </p>

            <div className="space-y-2">
              <button
                onClick={() => handlePrintInvoice("breakdown")}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-md border text-left transition-all hover:bg-white/5"
                style={{ borderColor: "hsl(var(--border-25))" }}
                data-testid="print-breakdown"
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
                data-testid="print-total"
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

      {/* ─── Load from Quote dialog ─── */}
      {quoteDialogOpen && (
        <div
          className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setQuoteDialogOpen(false)}
        >
          <div
            className="rounded-lg border shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
            style={{ background: "hsl(var(--surface-11))", borderColor: "hsl(var(--border-25))" }}
            onClick={(e) => e.stopPropagation()}
            data-testid="load-from-quote-dialog"
          >
            {/* Dialog header */}
            <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: "hsl(var(--border-17))" }}>
              <div className="flex items-center gap-2">
                <FileDown className="w-4 h-4" style={{ color: "var(--brand-teal)" }} />
                <h3 className="text-sm font-semibold text-foreground">Load estimated costs from a Quote</h3>
              </div>
              <button
                onClick={() => setQuoteDialogOpen(false)}
                className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-3 border-b text-xs text-muted-foreground" style={{ borderColor: "hsl(var(--border-17))" }}>
              Pick a CZQ quote to copy its Freight / Collection-Delivery / Locals / Others / Insurance / Customs estimates into
              <span className="text-foreground font-medium"> {jobNumber || "this shipment"}</span>.
              Existing estimated amounts on this shipment will not be overwritten.
            </div>

            {/* Search box */}
            <div className="px-5 py-3 border-b" style={{ borderColor: "hsl(var(--border-17))" }}>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={quoteSearch}
                  onChange={(e) => setQuoteSearch(e.target.value)}
                  placeholder="Search by CZQ number, customer, shipper, or consignee…"
                  className="w-full text-xs rounded border bg-background/50 text-foreground pl-8 pr-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
                  style={{ borderColor: "hsl(var(--border-22))" }}
                  autoFocus
                  data-testid="quote-dialog-search"
                />
              </div>
            </div>

            {/* Quote list */}
            <div className="flex-1 overflow-y-auto">
              {loadingQuotes ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--brand-teal)" }} />
                </div>
              ) : availableQuotes.length === 0 ? (
                <div className="px-5 py-8 text-center text-xs text-muted-foreground">
                  No quotes available. Create one in the Quote tab first.
                </div>
              ) : (() => {
                const q = quoteSearch.trim().toLowerCase();
                const filtered = q
                  ? availableQuotes.filter((qq) =>
                      qq.quoteNumber.toLowerCase().includes(q) ||
                      (qq.customer || "").toLowerCase().includes(q) ||
                      (qq.shipper || "").toLowerCase().includes(q) ||
                      (qq.consignee || "").toLowerCase().includes(q))
                  : availableQuotes;
                if (filtered.length === 0) {
                  return <div className="px-5 py-8 text-center text-xs text-muted-foreground">No matching quotes.</div>;
                }
                return filtered.map((qq) => {
                  const disabled = !qq.hasEstimates || importingQuote === qq.quoteNumber;
                  return (
                    <button
                      key={qq.quoteNumber}
                      onClick={() => qq.hasEstimates && importFromQuote(qq.quoteNumber)}
                      disabled={disabled}
                      className="w-full text-left px-5 py-3 border-b hover:bg-white/5 flex items-center gap-3 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ borderColor: "hsl(var(--border-15))" }}
                      data-testid={`quote-dialog-opt-${qq.quoteNumber}`}
                      title={qq.hasEstimates ? `Load this quote as ${qq.nextSubLine}` : "This quote has no estimated amounts yet — fill it in the Quote tab first"}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold" style={{ color: "var(--brand-teal)" }}>
                            {qq.nextSubLine || qq.quoteNumber}
                          </span>
                          {qq.createdAt && (
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(qq.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                            </span>
                          )}
                          {!qq.hasEstimates && (
                            <span
                              className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold"
                              style={{ background: "var(--tint-yellow-soft)", color: "var(--dark-yellow)" }}
                            >
                              empty
                            </span>
                          )}
                        </div>
                        {(qq.shipper || qq.consignee) && (
                          <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                            {qq.shipper || "—"} <span className="opacity-40">→</span> {qq.consignee || "—"}
                          </div>
                        )}
                      </div>
                      {importingQuote === qq.quoteNumber
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "var(--brand-teal)" }} />
                        : <FileDown className="w-3.5 h-3.5 text-muted-foreground" />}
                    </button>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

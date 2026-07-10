"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Tag } from "antd";
import { PrinterOutlined, PlusOutlined } from "@ant-design/icons";
import { api } from "@/lib/api";
import { useQuotes } from "@/hooks/useQuotes";
import { useToast } from "@/lib/toast";
import { CURRENCIES } from "@/lib/enums";
import type { interfaces } from "@/lib/api/client";
import { CostGrid } from "@/app/invoicing/_components/CostGrid";
import { AdditionalChargesGrid } from "@/app/invoicing/_components/AdditionalChargesGrid";
import {
  billingAmount,
  COST_CATEGORIES,
  type ChargeRow,
  type CostRow,
  fmt,
  overrideKeyForCharge,
  parseNum,
} from "@/app/invoicing/_lib/billing";
import { generateInvoicePDF } from "@/app/invoicing/_lib/invoicePdf";
import { quoteField } from "../_lib/quoteColumns";

interface GeneratedQuoteInvoice {
  invoiceNumber: string;
  invoiceType: string;
  billingCurrency: string;
  totalAmount: string;
  createdAt: string;
}

const uuid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.round(Math.random() * 1e6)}`);

const emptyCosts = (): CostRow[] =>
  COST_CATEGORIES.map((c) => ({
    category: c.key,
    label: c.label,
    estAmount: "",
    estCurrency: "CZK",
    realAmount: "",
    realCurrency: "CZK",
    invoiceNumber: "",
    vendor: "",
  }));

export function QuoteCostSection({ quote }: { quote: interfaces.QuoteItem }) {
  const { updateQuote } = useQuotes();
  const toast = useToast();

  const [costs, setCosts] = useState<CostRow[]>(emptyCosts());
  const [charges, setCharges] = useState<ChargeRow[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [billingCurrency, setBillingCurrency] = useState("CZK");
  const [roe, setRoe] = useState("1");
  const [generatedInvoices, setGeneratedInvoices] = useState<GeneratedQuoteInvoice[]>([]);

  const data = useMemo(() => (quote.data && typeof quote.data === "object" ? (quote.data as Record<string, unknown>) : {}), [quote.data]);

  // Seed local state when opened on a different quote.
  useEffect(() => {
    const stored = new Map((Array.isArray(data.costs) ? (data.costs as CostRow[]) : []).map((c) => [c.category, c]));
    setCosts(
      COST_CATEGORIES.map((cat) => {
        const s = stored.get(cat.key);
        return {
          category: cat.key,
          label: cat.label,
          estAmount: s?.estAmount ?? "",
          estCurrency: s?.estCurrency ?? "CZK",
          realAmount: s?.realAmount ?? "",
          realCurrency: s?.realCurrency ?? "CZK",
          invoiceNumber: s?.invoiceNumber ?? "",
          vendor: s?.vendor ?? "",
        };
      }),
    );
    setCharges(
      (Array.isArray(data.additionalCharges) ? (data.additionalCharges as ChargeRow[]) : []).map((c) => ({ ...c, id: c.id || uuid() })),
    );
    setOverrides((data.overrides && typeof data.overrides === "object" ? (data.overrides as Record<string, string>) : {}));
    const billing = data.billing as { billingCurrency?: string; roe?: string } | undefined;
    setBillingCurrency(billing?.billingCurrency ?? "CZK");
    setRoe(billing?.roe ?? "1");
    setGeneratedInvoices(Array.isArray(data.generatedInvoices) ? (data.generatedInvoices as GeneratedQuoteInvoice[]) : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote.id]);

  const persist = useCallback(
    (patch: Partial<{ costs: CostRow[]; charges: ChargeRow[]; overrides: Record<string, string>; billing: { billingCurrency: string; roe: string }; generatedInvoices: GeneratedQuoteInvoice[] }>) => {
      updateQuote({
        quoteNumber: quote.quoteNumber,
        params: {
          data: {
            ...data,
            costs: patch.costs ?? costs,
            additionalCharges: patch.charges ?? charges,
            overrides: patch.overrides ?? overrides,
            billing: patch.billing ?? { billingCurrency, roe },
            generatedInvoices: patch.generatedInvoices ?? generatedInvoices,
          },
        },
      }).catch(() => toast.error("Failed to save"));
    },
    [data, costs, charges, overrides, billingCurrency, roe, generatedInvoices, quote.quoteNumber, updateQuote, toast],
  );

  const roeNum = parseNum(roe) || 1;

  // Cost handlers
  const onCostField = (index: number, field: keyof CostRow, value: string) =>
    setCosts((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));

  // Additional charges
  const onChargeField = (index: number, field: keyof ChargeRow, value: string) =>
    setCharges((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  const addCharge = () => {
    const next = [...charges, { id: uuid(), description: "", estAmount: "", estCurrency: "CZK", realAmount: "", realCurrency: "CZK", invoiceNumber: "", vendor: "", sortOrder: charges.length }];
    setCharges(next);
    persist({ charges: next });
  };
  const deleteCharge = (index: number) => {
    const next = charges.filter((_, i) => i !== index);
    setCharges(next);
    persist({ charges: next });
  };

  // Overrides
  const onOverride = (rowKey: string, value: string) => setOverrides((prev) => ({ ...prev, [rowKey]: value }));

  // Totals
  const totals = useMemo(() => {
    const real = costs.reduce((s, r) => s + parseNum(r.realAmount), 0) + charges.reduce((s, r) => s + parseNum(r.realAmount), 0);
    const est = costs.reduce((s, r) => s + parseNum(r.estAmount), 0) + charges.reduce((s, r) => s + parseNum(r.estAmount), 0);
    const billing =
      costs.reduce((s, r) => s + billingAmount(overrides[r.category], r.realAmount, roeNum), 0) +
      charges.reduce((s, r) => s + billingAmount(overrides[overrideKeyForCharge(r.id)], r.realAmount, roeNum), 0);
    return { est, real, billing };
  }, [costs, charges, overrides, roeNum]);

  const handleGenerate = async (invoiceType: "breakdown" | "total") => {
    try {
      const { ref } = await api.quotes.quoteAllocateRef(quote.quoteNumber);
      const inv: GeneratedQuoteInvoice = { invoiceNumber: ref, invoiceType, billingCurrency, totalAmount: fmt(totals.billing), createdAt: new Date().toISOString() };
      const nextInvoices = [...generatedInvoices, inv];
      setGeneratedInvoices(nextInvoices);
      persist({ generatedInvoices: nextInvoices });

      const isExport = quoteField(quote.data, "Trade Direction").toLowerCase().includes("exp");
      const lineItems: { label: string; amount: number }[] = [];
      for (const r of costs) {
        const amt = billingAmount(overrides[r.category], r.realAmount, roeNum);
        if (amt > 0) lineItems.push({ label: r.label, amount: amt });
      }
      for (const r of charges) {
        const amt = billingAmount(overrides[overrideKeyForCharge(r.id)], r.realAmount, roeNum);
        if (amt > 0) lineItems.push({ label: r.description || "Additional charge", amount: amt });
      }
      generateInvoicePDF({
        invoiceNumber: ref,
        jobNumber: quote.quoteNumber,
        billedPartyName: quoteField(quote.data, isExport ? "Shipper" : "Consignee"),
        billingCurrency,
        invoiceType,
        lineItems,
        totalAmount: totals.billing,
      });
      toast.success(`Invoice ${ref} generated`);
    } catch {
      toast.error("Failed to generate invoice");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs font-semibold text-slate-700 mb-2">Costs</div>
        <CostGrid
          rows={costs}
          roe={roeNum}
          overrides={overrides}
          onField={onCostField}
          onFieldBlur={() => persist({})}
          onOverride={onOverride}
          onOverrideBlur={() => persist({})}
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-700">Additional Charges</span>
          <Button size="small" icon={<PlusOutlined />} onClick={addCharge}>Add charge</Button>
        </div>
        <AdditionalChargesGrid
          rows={charges}
          roe={roeNum}
          overrides={overrides}
          onField={onChargeField}
          onFieldBlur={() => persist({})}
          onOverride={(id, v) => onOverride(overrideKeyForCharge(id), v)}
          onOverrideBlur={() => persist({})}
          onDelete={deleteCharge}
        />
      </div>

      <div className="flex items-center gap-3 flex-wrap border-t border-slate-100 pt-3">
        <label className="text-xs text-slate-500">Billing currency:</label>
        <select
          value={billingCurrency}
          onChange={(e) => { setBillingCurrency(e.target.value); persist({ billing: { billingCurrency: e.target.value, roe } }); }}
          className="bg-white border border-slate-200 rounded-md text-xs px-2 py-1 text-slate-700 outline-none"
        >
          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="text-xs text-slate-500">ROE:</label>
        <input
          value={roe}
          onChange={(e) => setRoe(e.target.value)}
          onBlur={() => persist({ billing: { billingCurrency, roe } })}
          className="bg-white border border-slate-200 rounded-md text-xs px-2 py-1 w-24 text-slate-700 outline-none"
        />
        <div className="ml-auto flex items-center gap-4 text-xs">
          <span className="text-slate-400">Est: <span className="text-slate-600 font-medium">{fmt(totals.est)}</span></span>
          <span className="text-slate-400">Real: <span className="text-slate-600 font-medium">{fmt(totals.real)}</span></span>
          <span className="text-slate-500">Billing: <span className="text-indigo-600 font-semibold">{billingCurrency} {fmt(totals.billing)}</span></span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button icon={<PrinterOutlined />} onClick={() => handleGenerate("breakdown")}>Breakdown PDF</Button>
        <Button icon={<PrinterOutlined />} onClick={() => handleGenerate("total")}>Total Only PDF</Button>
      </div>

      {generatedInvoices.length > 0 && (
        <div className="border-t border-slate-100 pt-3">
          <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1.5">Generated Invoices</div>
          <div className="flex flex-col gap-1">
            {generatedInvoices.map((inv) => (
              <div key={inv.invoiceNumber} className="flex items-center gap-3 text-xs text-slate-600">
                <span className="font-mono font-medium text-slate-700">{inv.invoiceNumber}</span>
                <Tag bordered={false} className="text-[10px]">{inv.invoiceType}</Tag>
                <span className="text-slate-500">{inv.billingCurrency} {inv.totalAmount}</span>
                <span className="text-slate-400 ml-auto">{new Date(inv.createdAt).toLocaleString("en-GB")}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

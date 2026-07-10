"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Select, Button, Tag } from "antd";
import { PrinterOutlined, PlusOutlined } from "@ant-design/icons";
import { useShipments } from "@/hooks/useShipments";
import { useInvoicing } from "@/hooks/useInvoicing";
import { useQuotes } from "@/hooks/useQuotes";
import { api } from "@/lib/api";
import { CURRENCIES } from "@/lib/enums";
import { quoteCosts } from "@/app/quotes/_lib/quoteColumns";
import type { interfaces } from "@/lib/api/client";
import { PageHeader } from "@/components/PageHeader";
import { AppCard } from "@/components/AppCard";
import { useToast } from "@/lib/toast";
import { CostGrid } from "./CostGrid";
import { AdditionalChargesGrid } from "./AdditionalChargesGrid";
import {
  billingAmount,
  COST_CATEGORIES,
  type ChargeRow,
  type CostRow,
  fmt,
  overrideKeyForCharge,
  parseNum,
  resolveBilledParty,
} from "../_lib/billing";
import { generateInvoicePDF } from "../_lib/invoicePdf";

const chargeFromServer = (c: interfaces.AdditionalChargeItem): ChargeRow => ({
  id: c.id,
  description: c.description,
  estAmount: c.estAmount ?? "",
  estCurrency: c.estCurrency,
  realAmount: c.realAmount ?? "",
  realCurrency: c.realCurrency,
  invoiceNumber: c.invoiceNumber,
  vendor: c.vendor,
  sortOrder: c.sortOrder,
});

export const InvoicingView = () => {
  const toast = useToast();
  const { shipments } = useShipments();
  const [selectedShipmentId, setSelectedShipmentId] = useState<string | null>(null);
  const selectedShipment = shipments.find((s) => s.id === selectedShipmentId);
  const {
    data,
    isLoading,
    upsertCost,
    addCharge,
    updateCharge,
    deleteCharge,
    upsertOverride,
    upsertBilling,
    generateInvoice,
    isGenerating,
  } = useInvoicing(selectedShipmentId);
  const { quotes } = useQuotes();

  const [costs, setCosts] = useState<CostRow[]>([]);
  const [charges, setCharges] = useState<ChargeRow[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [billingCurrency, setBillingCurrency] = useState("CZK");
  const [roe, setRoe] = useState("1");
  const [generatedInvoices, setGeneratedInvoices] = useState<interfaces.GeneratedInvoiceItem[]>([]);
  const seededRef = useRef<string | null>(null);

  // Seed local state once per shipment; local state stays authoritative afterwards
  // so save-triggered refetches don't clobber in-progress edits.
  useEffect(() => {
    if (!selectedShipmentId || isLoading || !data) return;
    if (seededRef.current === selectedShipmentId) return;

    const stored = new Map(data.costs.map((c) => [c.category, c]));
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
    setCharges(data.additionalCharges.map(chargeFromServer));
    const ov: Record<string, string> = {};
    for (const o of data.billingOverrides) ov[o.rowKey] = o.billingAmount ?? "";
    setOverrides(ov);
    setBillingCurrency(data.billingSettings?.billingCurrency ?? "CZK");
    setRoe(data.billingSettings?.roe ?? "1");
    setGeneratedInvoices(data.generatedInvoices);
    seededRef.current = selectedShipmentId;
  }, [selectedShipmentId, isLoading, data]);

  const roeNum = parseNum(roe) || 1;

  // ─── Cost handlers ───────────────────────────────────────────────
  const onCostField = (index: number, field: keyof CostRow, value: string) =>
    setCosts((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));

  const saveCost = (row: CostRow) =>
    upsertCost({
      category: row.category,
      estAmount: row.estAmount,
      estCurrency: row.estCurrency,
      realAmount: row.realAmount,
      realCurrency: row.realCurrency,
      invoiceNumber: row.invoiceNumber,
      vendor: row.vendor,
    }).catch(() => toast.error("Failed to save cost"));

  // ─── Additional charge handlers ──────────────────────────────────
  const onChargeField = (index: number, field: keyof ChargeRow, value: string) =>
    setCharges((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));

  const saveCharge = (row: ChargeRow) =>
    updateCharge({
      chargeId: row.id,
      params: {
        description: row.description,
        vendor: row.vendor,
        invoiceNumber: row.invoiceNumber,
        estAmount: row.estAmount,
        estCurrency: row.estCurrency,
        realAmount: row.realAmount,
        realCurrency: row.realCurrency,
      },
    }).catch(() => toast.error("Failed to save charge"));

  const addChargeRow = async () => {
    try {
      const res = await addCharge({ description: "", estCurrency: "CZK", realCurrency: "CZK", sortOrder: charges.length });
      setCharges((prev) => [...prev, chargeFromServer(res.charge)]);
    } catch {
      toast.error("Failed to add charge");
    }
  };

  const deleteChargeRow = async (index: number) => {
    const row = charges[index];
    if (!row) return;
    try {
      await deleteCharge(row.id);
      setCharges((prev) => prev.filter((_, i) => i !== index));
    } catch {
      toast.error("Failed to delete charge");
    }
  };

  // ─── Override handlers ───────────────────────────────────────────
  const onOverride = (rowKey: string, value: string) => setOverrides((prev) => ({ ...prev, [rowKey]: value }));
  const saveOverride = (rowKey: string) =>
    upsertOverride({ rowKey, billingAmount: overrides[rowKey] ?? "" }).catch(() => toast.error("Failed to save override"));

  // ─── Billing settings ────────────────────────────────────────────
  const saveBilling = (currency: string, roeVal: string) =>
    upsertBilling({ billingCurrency: currency, roe: roeVal }).catch(() => toast.error("Failed to save billing"));

  // ─── Import estimated costs from a quote ─────────────────────────
  const quotesWithCosts = useMemo(
    () => quotes.filter((q) => quoteCosts(q.data).some((c) => (c.estAmount ?? "").trim() !== "")),
    [quotes],
  );

  const importFromQuote = async (quoteNumber: string) => {
    const quote = quotes.find((q) => q.quoteNumber === quoteNumber);
    if (!quote) return;
    const qCosts = quoteCosts(quote.data);
    let copied = 0;
    const next = costs.map((row) => {
      const from = qCosts.find((c) => c.category === row.category);
      if (!from || !(from.estAmount ?? "").trim()) return row;
      if ((row.estAmount ?? "").trim()) return row; // don't overwrite an existing estimate
      copied += 1;
      const updated = { ...row, estAmount: from.estAmount, estCurrency: from.estCurrency || row.estCurrency, vendor: from.vendor || row.vendor };
      saveCost(updated);
      return updated;
    });
    setCosts(next);
    try {
      const { ref } = await api.quotes.quoteAllocateRef(quoteNumber);
      await upsertBilling({ billingCurrency, roe, quoteRef: ref });
      toast.success(copied ? `Imported ${copied} estimate${copied !== 1 ? "s" : ""} from ${quoteNumber} (${ref})` : `No new estimates in ${quoteNumber}`);
    } catch {
      toast.error("Failed to record quote reference");
    }
  };

  // ─── Totals ──────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const estCosts = costs.reduce((s, r) => s + parseNum(r.estAmount), 0);
    const realCosts = costs.reduce((s, r) => s + parseNum(r.realAmount), 0);
    const billingCosts = costs.reduce((s, r) => s + billingAmount(overrides[r.category], r.realAmount, roeNum), 0);
    const estCharges = charges.reduce((s, r) => s + parseNum(r.estAmount), 0);
    const realCharges = charges.reduce((s, r) => s + parseNum(r.realAmount), 0);
    const billingCharges = charges.reduce(
      (s, r) => s + billingAmount(overrides[overrideKeyForCharge(r.id)], r.realAmount, roeNum),
      0,
    );
    return {
      est: estCosts + estCharges,
      real: realCosts + realCharges,
      billing: billingCosts + billingCharges,
    };
  }, [costs, charges, overrides, roeNum]);

  // ─── Generate ────────────────────────────────────────────────────
  const handleGenerate = async (invoiceType: "breakdown" | "total") => {
    if (!selectedShipment) return;
    try {
      const res = await generateInvoice({
        jobNumber: selectedShipment.jobNumber,
        invoiceType,
        billingCurrency,
        totalAmount: fmt(totals.billing),
      });
      setGeneratedInvoices((prev) => [...prev, res.invoice]);

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
        invoiceNumber: res.invoice.invoiceNumber,
        jobNumber: selectedShipment.jobNumber,
        billedPartyName: resolveBilledParty(selectedShipment),
        billingCurrency,
        invoiceType,
        lineItems,
        totalAmount: totals.billing,
      });
      toast.success(`Invoice ${res.invoice.invoiceNumber} generated`);
    } catch {
      toast.error("Failed to generate invoice");
    }
  };

  return (
    <div className="bg-slate-50 min-h-full p-6">
      <div className="max-w-[1400px] mx-auto">
        <PageHeader title="Invoicing" />

        <AppCard className="mb-5">
          <div className="flex items-center gap-4">
            <Select
              placeholder="Select a shipment..."
              value={selectedShipmentId}
              onChange={setSelectedShipmentId}
              style={{ width: 400 }}
              showSearch
              filterOption={(input, option) => (option?.label ?? "").toLowerCase().includes(input.toLowerCase())}
              options={shipments.map((s) => ({ value: s.id, label: `${s.jobNumber} — ${s.shipper} → ${s.consignee}` }))}
            />
            {selectedShipment && (
              <Tag bordered={false} className="bg-indigo-100 text-indigo-500 rounded-xl font-medium text-xs px-2.5 py-0.5">
                {selectedShipment.jobNumber}
              </Tag>
            )}
          </div>
        </AppCard>

        {!selectedShipmentId ? (
          <AppCard>
            <div className="flex items-center justify-center h-[200px] text-slate-400 text-sm">
              Select a shipment to view invoicing
            </div>
          </AppCard>
        ) : isLoading ? (
          <AppCard>
            <div className="flex items-center justify-center h-[200px] text-slate-400 text-sm">Loading...</div>
          </AppCard>
        ) : (
          <div className="flex flex-col gap-5 max-w-[1150px]">
            <AppCard
              title="Costs"
              extra={
                <Select
                  size="small"
                  placeholder="Import from Quote…"
                  style={{ width: 220 }}
                  value={null}
                  onChange={(v) => v && importFromQuote(v)}
                  showSearch
                  filterOption={(input, option) => (option?.value ?? "").toLowerCase().includes(input.toLowerCase())}
                  options={quotesWithCosts.map((q) => ({ value: q.quoteNumber, label: q.quoteNumber }))}
                  notFoundContent="No quotes with estimates"
                />
              }
            >
              <CostGrid
                rows={costs}
                roe={roeNum}
                overrides={overrides}
                onField={onCostField}
                onFieldBlur={(i) => saveCost(costs[i]!)}
                onOverride={onOverride}
                onOverrideBlur={saveOverride}
              />
            </AppCard>

            <AppCard
              title="Additional Charges"
              extra={<Button size="small" icon={<PlusOutlined />} onClick={addChargeRow}>Add charge</Button>}
            >
              <AdditionalChargesGrid
                rows={charges}
                roe={roeNum}
                overrides={overrides}
                onField={onChargeField}
                onFieldBlur={(i) => saveCharge(charges[i]!)}
                onOverride={(id, v) => onOverride(overrideKeyForCharge(id), v)}
                onOverrideBlur={(id) => saveOverride(overrideKeyForCharge(id))}
                onDelete={deleteChargeRow}
              />
            </AppCard>

            <AppCard title="Billing Settings">
              <div className="flex items-center gap-3 flex-wrap">
                <label className="text-xs text-slate-500">Billing currency:</label>
                <select
                  value={billingCurrency}
                  onChange={(e) => { setBillingCurrency(e.target.value); saveBilling(e.target.value, roe); }}
                  className="bg-white border border-slate-200 rounded-md text-xs px-2 py-1 text-slate-700 outline-none"
                >
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <label className="text-xs text-slate-500">ROE:</label>
                <input
                  value={roe}
                  onChange={(e) => setRoe(e.target.value)}
                  onBlur={() => saveBilling(billingCurrency, roe)}
                  className="bg-white border border-slate-200 rounded-md text-xs px-2 py-1 w-24 text-slate-700 outline-none"
                />
                <div className="ml-auto flex items-center gap-4 text-xs">
                  <span className="text-slate-400">Est: <span className="text-slate-600 font-medium">{fmt(totals.est)}</span></span>
                  <span className="text-slate-400">Real: <span className="text-slate-600 font-medium">{fmt(totals.real)}</span></span>
                  <span className="text-slate-500">Billing: <span className="text-indigo-600 font-semibold">{billingCurrency} {fmt(totals.billing)}</span></span>
                </div>
              </div>
            </AppCard>

            <AppCard title="Generate Invoice">
              <div className="flex items-center gap-2">
                <Button icon={<PrinterOutlined />} loading={isGenerating} onClick={() => handleGenerate("breakdown")}>
                  Breakdown PDF
                </Button>
                <Button icon={<PrinterOutlined />} loading={isGenerating} onClick={() => handleGenerate("total")}>
                  Total Only PDF
                </Button>
              </div>

              {generatedInvoices.length > 0 && (
                <div className="mt-4 border-t border-slate-100 pt-3">
                  <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1.5">
                    Generated Invoices
                  </div>
                  <div className="flex flex-col gap-1">
                    {generatedInvoices.map((inv) => (
                      <div key={inv.id} className="flex items-center gap-3 text-xs text-slate-600">
                        <span className="font-mono font-medium text-slate-700">{inv.invoiceNumber}</span>
                        <Tag bordered={false} className="text-[10px]">{inv.invoiceType}</Tag>
                        <span className="text-slate-500">{inv.billingCurrency} {inv.totalAmount}</span>
                        <span className="text-slate-400 ml-auto">{new Date(inv.createdAt).toLocaleString("en-GB")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </AppCard>
          </div>
        )}
      </div>
    </div>
  );
};

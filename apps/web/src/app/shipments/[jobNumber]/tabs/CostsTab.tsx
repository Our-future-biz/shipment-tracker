"use client";

import { useState } from "react";
import { Input, Select, Button } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ShipmentItem } from "@/hooks/useShipments";

const COST_CATEGORIES = [
  { key: "freight", label: "Freight" },
  { key: "collection", label: "Collection/Delivery" },
  { key: "locals", label: "Locals" },
  { key: "others", label: "Others" },
  { key: "insurance", label: "Insurance" },
  { key: "customs", label: "Customs clearance" },
];

const CURRENCIES = ["CZK", "USD", "EUR", "GBP", "CNY"];

interface CostRow {
  key: string;
  label: string;
  estAmount: string;
  estCurrency: string;
  realAmount: string;
  realCurrency: string;
  invoiceNumber: string;
  vendor: string;
}

export function CostsTab({ shipment }: { shipment: ShipmentItem }) {
  const queryClient = useQueryClient();
  const [quoteInput, setQuoteInput] = useState("");
  const [quoteStatus, setQuoteStatus] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["invoicing", shipment.id],
    queryFn: () => api.invoicing.invoicingGet(shipment.id),
  });

  const upsertCost = useMutation({
    mutationFn: (params: { category: string; estAmount?: string; estCurrency?: string; realAmount?: string; realCurrency?: string; invoiceNumber?: string; vendor?: string }) =>
      api.invoicing.invoicingUpsertCost(shipment.id, params),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoicing", shipment.id] }),
  });

  const upsertBilling = useMutation({
    mutationFn: (params: { billingCurrency?: string; roe?: string; quoteRef?: string }) =>
      api.invoicing.invoicingUpsertBillingSettings(shipment.id, params),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoicing", shipment.id] }),
  });

  const upsertOverride = useMutation({
    mutationFn: (params: { rowKey: string; billingAmount: string }) =>
      api.invoicing.invoicingUpsertBillingOverride(shipment.id, params),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoicing", shipment.id] }),
  });

  const addCharge = useMutation({
    mutationFn: (params: { description?: string; estAmount?: string; estCurrency?: string; realAmount?: string; realCurrency?: string }) =>
      api.invoicing.invoicingAddCharge(shipment.id, params),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoicing", shipment.id] }),
  });

  const updateCharge = useMutation({
    mutationFn: ({ chargeId, ...params }: { chargeId: string; description?: string; estAmount?: string; estCurrency?: string; realAmount?: string; realCurrency?: string; invoiceNumber?: string; vendor?: string }) =>
      api.invoicing.invoicingUpdateCharge(shipment.id, chargeId, params),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoicing", shipment.id] }),
  });

  const deleteCharge = useMutation({
    mutationFn: (chargeId: string) => api.invoicing.invoicingDeleteCharge(shipment.id, chargeId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoicing", shipment.id] }),
  });

  const importQuoteCosts = async () => {
    if (!quoteInput.trim()) return;
    setQuoteLoading(true);
    setQuoteStatus(null);
    const qn = quoteInput.trim().replace(/-\d+$/, "");
    try {
      const quoteData = await api.invoicing.invoicingGet(qn);
      const quoteCosts = quoteData.costs ?? [];
      if (quoteCosts.length === 0) {
        setQuoteStatus("No costs found for this quote");
        setQuoteLoading(false);
        return;
      }
      let imported = 0;
      for (const c of quoteCosts) {
        if (c.realAmount) {
          await api.invoicing.invoicingUpsertCost(shipment.id, {
            category: c.category,
            estAmount: c.realAmount,
            estCurrency: c.realCurrency || "CZK",
          });
          imported++;
        }
      }
      // Carry over the quote's billing settings (currency + ROE) and the quote ref
      const qBilling = quoteData.billingSettings;
      await upsertBilling.mutateAsync({
        quoteRef: qn,
        ...(qBilling?.billingCurrency ? { billingCurrency: qBilling.billingCurrency } : {}),
        ...(qBilling?.roe ? { roe: qBilling.roe } : {}),
      });

      // Carry over the quote's per-row billing overrides
      let importedOverrides = 0;
      for (const ov of quoteData.billingOverrides ?? []) {
        if (ov.billingAmount) {
          await upsertOverride.mutateAsync({ rowKey: ov.rowKey, billingAmount: ov.billingAmount });
          importedOverrides++;
        }
      }

      queryClient.invalidateQueries({ queryKey: ["invoicing", shipment.id] });
      setQuoteStatus(
        `Imported ${imported} cost(s)${importedOverrides > 0 ? ` + ${importedOverrides} billing override(s)` : ""} from ${qn}`,
      );
    } catch {
      setQuoteStatus("Quote not found or error");
    }
    setQuoteLoading(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32 text-slate-400">
        Loading costs...
      </div>
    );
  }

  const costs = data?.costs ?? [];
  const charges = data?.additionalCharges ?? [];
  const billing = data?.billingSettings;
  const overrides = data?.billingOverrides ?? [];
  const overrideMap: Record<string, string> = {};
  for (const ov of overrides) if (ov.billingAmount) overrideMap[ov.rowKey] = ov.billingAmount;

  const parseCostNum = (v: string | null | undefined) => { const n = parseFloat(v || ""); return isNaN(n) ? 0 : n; };
  const fmtNum = (n: number) => n.toLocaleString("en", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  const costRows: CostRow[] = COST_CATEGORIES.map((cat) => {
    const row = costs.find((c) => c.category === cat.key);
    return {
      key: cat.key,
      label: cat.label,
      estAmount: row?.estAmount || "",
      estCurrency: row?.estCurrency || "CZK",
      realAmount: row?.realAmount || "",
      realCurrency: row?.realCurrency || "CZK",
      invoiceNumber: row?.invoiceNumber || "",
      vendor: row?.vendor || "",
    };
  });

  const subtotalEst = costRows.reduce((s, c) => s + parseCostNum(c.estAmount), 0);
  const subtotalReal = costRows.reduce((s, c) => s + parseCostNum(c.realAmount), 0);
  const chargesReal = charges.reduce((s, c) => s + parseCostNum(c.realAmount), 0);
  const subtotalBilling = costRows.reduce((s, c) => s + parseCostNum(overrideMap[c.key] || c.realAmount), 0);
  const profit = subtotalBilling - (subtotalReal + chargesReal);

  const handleCostBlur = (category: string, field: string, value: string) => {
    upsertCost.mutate({ category, [field]: value });
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5">
      {/* Billing settings bar */}
      <div className="flex items-center gap-3 mb-4 p-2 px-3 bg-slate-50 rounded-md border border-slate-200 flex-wrap">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Billing</span>
        <Select
          size="small"
          value={billing?.billingCurrency || "CZK"}
          onChange={(v) => upsertBilling.mutate({ billingCurrency: v })}
          options={CURRENCIES.map((c) => ({ value: c, label: c }))}
          className="w-[75px]"
        />
        <span className="text-[11px] text-slate-500">ROE:</span>
        <Input
          size="small"
          className="w-[60px]"
          defaultValue={billing?.roe || "1"}
          onBlur={(e) => upsertBilling.mutate({ roe: e.target.value })}
        />
        <div className="ml-auto flex items-center gap-1.5">
          <Input
            size="small"
            placeholder="CZQ00000001"
            value={quoteInput}
            onChange={(e) => { setQuoteInput(e.target.value); setQuoteStatus(null); }}
            onPressEnter={importQuoteCosts}
            className="w-[130px]"
          />
          <Button size="small" type="primary" onClick={importQuoteCosts} loading={quoteLoading} disabled={!quoteInput.trim()}>
            Import
          </Button>
          {quoteStatus && (
            <span className={`text-[11px] ${quoteStatus.startsWith("Imported") ? "text-green-600" : "text-amber-500"}`}>
              {quoteStatus}
            </span>
          )}
        </div>
      </div>

      {/* Editable costs table */}
      <table className="w-full border-collapse text-xs mb-4">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="text-left p-2 px-3 font-semibold text-slate-500">Category</th>
            <th className="text-right p-2 font-semibold text-slate-500">Est. Amount</th>
            <th className="text-center p-2 px-1 font-semibold text-slate-500">Cur</th>
            <th className="text-right p-2 font-semibold text-slate-500">Real Cost</th>
            <th className="text-center p-2 px-1 font-semibold text-slate-500">Cur</th>
            <th className="text-left p-2 font-semibold text-slate-500">Invoice #</th>
            <th className="text-left p-2 font-semibold text-slate-500">Vendor</th>
            <th className="text-right p-2 font-semibold text-slate-500">Billing</th>
          </tr>
        </thead>
        <tbody>
          {costRows.map((row) => (
            <tr key={row.key} className="border-b border-slate-100">
              <td className="p-1.5 px-3 text-slate-700">{row.label}</td>
              <td className="p-1 text-right">
                <Input size="small" defaultValue={row.estAmount} placeholder="—" className="w-[76px] text-right"
                  onBlur={(e) => handleCostBlur(row.key, "estAmount", e.target.value)} />
              </td>
              <td className="p-1 px-0.5 text-center">
                <Select size="small" defaultValue={row.estCurrency} className="w-[62px]"
                  options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                  onChange={(v) => handleCostBlur(row.key, "estCurrency", v)} />
              </td>
              <td className="p-1 text-right">
                <Input size="small" defaultValue={row.realAmount} placeholder="—" className="w-[76px] text-right"
                  onBlur={(e) => handleCostBlur(row.key, "realAmount", e.target.value)} />
              </td>
              <td className="p-1 px-0.5 text-center">
                <Select size="small" defaultValue={row.realCurrency} className="w-[62px]"
                  options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                  onChange={(v) => handleCostBlur(row.key, "realCurrency", v)} />
              </td>
              <td className="p-1">
                <Input size="small" defaultValue={row.invoiceNumber} placeholder="—" className="w-[85px]"
                  onBlur={(e) => handleCostBlur(row.key, "invoiceNumber", e.target.value)} />
              </td>
              <td className="p-1">
                <Input size="small" defaultValue={row.vendor} placeholder="—" className="w-[85px]"
                  onBlur={(e) => handleCostBlur(row.key, "vendor", e.target.value)} />
              </td>
              <td className="p-1 text-right">
                <Input size="small" defaultValue={overrideMap[row.key] || row.realAmount} placeholder="—" className="w-[76px] text-right font-semibold"
                  onBlur={(e) => upsertOverride.mutate({ rowKey: row.key, billingAmount: e.target.value })} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-200 font-bold">
            <td className="p-2 px-3">Subtotal</td>
            <td className="p-2 text-right">{fmtNum(subtotalEst)}</td>
            <td />
            <td className="p-2 text-right">{fmtNum(subtotalReal)}</td>
            <td />
            <td colSpan={2} />
            <td className="p-2 text-right">{fmtNum(subtotalBilling)}</td>
          </tr>
        </tfoot>
      </table>

      {/* Additional Charges */}
      <div className="flex items-center justify-between mb-2">
        <strong className="text-xs">Additional Charges</strong>
        <Button size="small" onClick={() => addCharge.mutate({})}>+ Add</Button>
      </div>

      {charges.length > 0 && (
        <table className="w-full border-collapse text-xs mb-3">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left p-1.5 px-2 font-semibold text-slate-500">Description</th>
              <th className="text-right p-1.5 px-2 font-semibold text-slate-500">Est.</th>
              <th className="text-center p-1.5 px-1 font-semibold text-slate-500">Cur</th>
              <th className="text-right p-1.5 px-2 font-semibold text-slate-500">Real</th>
              <th className="text-center p-1.5 px-1 font-semibold text-slate-500">Cur</th>
              <th className="text-left p-1.5 px-2 font-semibold text-slate-500">Invoice</th>
              <th className="text-left p-1.5 px-2 font-semibold text-slate-500">Vendor</th>
              <th className="w-[30px]" />
            </tr>
          </thead>
          <tbody>
            {charges.map((ac) => (
              <tr key={ac.id} className="border-b border-slate-100">
                <td className="p-1">
                  <Input size="small" defaultValue={ac.description} placeholder="Description"
                    onBlur={(e) => updateCharge.mutate({ chargeId: ac.id, description: e.target.value })} />
                </td>
                <td className="p-1 text-right">
                  <Input size="small" defaultValue={ac.estAmount || ""} placeholder="—" className="w-[70px] text-right"
                    onBlur={(e) => updateCharge.mutate({ chargeId: ac.id, estAmount: e.target.value })} />
                </td>
                <td className="p-1 px-0.5">
                  <Select size="small" defaultValue={ac.estCurrency || "CZK"} className="w-[60px]"
                    options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                    onChange={(v) => updateCharge.mutate({ chargeId: ac.id, estCurrency: v })} />
                </td>
                <td className="p-1 text-right">
                  <Input size="small" defaultValue={ac.realAmount || ""} placeholder="—" className="w-[70px] text-right"
                    onBlur={(e) => updateCharge.mutate({ chargeId: ac.id, realAmount: e.target.value })} />
                </td>
                <td className="p-1 px-0.5">
                  <Select size="small" defaultValue={ac.realCurrency || "CZK"} className="w-[60px]"
                    options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                    onChange={(v) => updateCharge.mutate({ chargeId: ac.id, realCurrency: v })} />
                </td>
                <td className="p-1">
                  <Input size="small" defaultValue={ac.invoiceNumber} placeholder="—" className="w-[80px]"
                    onBlur={(e) => updateCharge.mutate({ chargeId: ac.id, invoiceNumber: e.target.value })} />
                </td>
                <td className="p-1">
                  <Input size="small" defaultValue={ac.vendor} placeholder="—" className="w-[80px]"
                    onBlur={(e) => updateCharge.mutate({ chargeId: ac.id, vendor: e.target.value })} />
                </td>
                <td className="p-1 px-0.5">
                  <Button type="text" size="small" danger icon={<DeleteOutlined className="text-[11px]" />}
                    onClick={() => deleteCharge.mutate(ac.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {charges.length === 0 && (
        <div className="p-4 text-center border border-dashed border-slate-200 rounded-md text-slate-400 text-xs">
          No additional charges. Click + Add to create one.
        </div>
      )}

      {/* Profit summary */}
      <div className="mt-3 p-2.5 px-3 bg-slate-50 rounded-md flex justify-between items-center">
        <span className="text-xs font-semibold">Profit</span>
        <span className={`text-sm font-bold ${profit >= 0 ? "text-green-600" : "text-red-600"}`}>
          {profit >= 0 ? "+" : ""}{fmtNum(profit)} {billing?.billingCurrency || "CZK"}
        </span>
      </div>
    </div>
  );
}

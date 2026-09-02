"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Input, Select, Button, Checkbox, Tooltip, message } from "antd";
import { DeleteOutlined, UndoOutlined, DownOutlined } from "@ant-design/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ShipmentItem } from "@/hooks/useShipments";
import { getFieldValue } from "@/hooks/useShipments";
import {
  computeCosts, money, signed, num,
  type BuyingRow, type SellingRow, type Rates,
} from "./costsCalc";

const CURRENCIES = ["CZK", "USD", "EUR", "GBP", "CNY"];

/** Kategorie z mockupu (select .b-type) */
const COST_CATEGORIES = [
  "Freight", "Collection/Delivery", "Locals", "Others", "Insurance", "Customs clearance",
];

/* ── sdilene tridy dle mockupu (--cb-field-h 30px, --cb-cell-x 6px) ── */
const CELL = "px-[6px] py-[6px] border-b border-slate-100 align-middle";
const FIELD =
  "w-full h-[30px] px-2 text-[13px] border border-slate-200 rounded-md outline-none " +
  "focus:border-indigo-500 bg-white";
const TH =
  "text-[11.5px] font-bold tracking-[.04em] uppercase text-slate-500 px-[6px] py-2 " +
  "border-b border-slate-200 whitespace-nowrap";

function SectionCard({
  title, tone, actions, children,
}: {
  title: string;
  tone: "buy" | "sell" | "fx" | "report";
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const bg = {
    buy: "bg-[#EEF0FC] text-[#3F4DBF]",
    sell: "bg-[#E6F5EC] text-[#177245]",
    fx: "bg-[#F3F4F8] text-slate-600",
    report: "bg-[#151B2B] text-white",
  }[tone];
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-4">
      <div className={`h-[38px] px-4 flex items-center gap-3 text-[12.5px] font-bold uppercase tracking-[.05em] ${bg}`}>
        <span>{title}</span>
        {actions && <span className="ml-auto flex items-center gap-2">{actions}</span>}
      </div>
      {children}
    </div>
  );
}

/** male tlacitko v zahlavi karty (mockup: .add-btn, vyska 26px) */
function HeadBtn({
  onClick, disabled, title, children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="h-[26px] px-[10px] text-[12px] font-semibold rounded-md border border-white/40
                 bg-white/80 text-slate-700 cursor-pointer hover:bg-white disabled:opacity-50
                 disabled:cursor-default transition-colors whitespace-nowrap"
    >
      {children}
    </button>
  );
}

export function CostsTab({ shipment }: { shipment: ShipmentItem }) {
  const queryClient = useQueryClient();
  const [quoteInput, setQuoteInput] = useState("");
  const [quoteStatus, setQuoteStatus] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["invoicing", shipment.id],
    queryFn: () => api.invoicing.invoicingGet(shipment.id),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["invoicing", shipment.id] });

  /* ── Billing nastaveni ── */
  const billing = data?.billingSettings ?? null;
  const [billingCur, setBillingCur] = useState("CZK");
  const [roe, setRoe] = useState("1");
  useEffect(() => {
    if (billing?.billingCurrency) setBillingCur(billing.billingCurrency);
    if (billing?.roe) setRoe(billing.roe);
  }, [billing?.billingCurrency, billing?.roe]);

  const upsertBilling = useMutation({
    mutationFn: (params: { billingCurrency?: string; roe?: string; quoteRef?: string }) =>
      api.invoicing.invoicingUpsertBillingSettings(shipment.id, params),
    onSuccess: invalidate,
  });

  /* ── Kurzy CNB (mockup: fetchCnbRates) ── */
  // Zaklad kurzu dle mockupu: u importu ETA, u exportu ETD.
  // Vychozi volba se ridi smerem zasilky, uzivatel ji muze prepnout.
  const tradeDirection = (getFieldValue(shipment, "tradeDirection") || "").trim().toLowerCase();
  const [rateBasis, setRateBasis] = useState<"eta" | "etd">(
    tradeDirection === "export" ? "etd" : "eta",
  );
  const shipmentDate = useMemo(() => {
    const raw = getFieldValue(
      shipment,
      rateBasis === "etd" ? "estimatedDeparture" : "estimatedArrival",
    );
    const txt = String(raw ?? "").trim();
    if (!txt) return "";
    // uz ve tvaru YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(txt)) return txt.slice(0, 10);
    // grid uklada data jako MM/DD/YY nebo MM/DD/YYYY
    const m = txt.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    if (m) {
      const [, mm, dd, yy] = m;
      const year = yy!.length === 2 ? `20${yy}` : yy!;
      return `${year}-${mm!.padStart(2, "0")}-${dd!.padStart(2, "0")}`;
    }
    const parsed = new Date(txt);
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
  }, [shipment, rateBasis]);
  const [rateDate, setRateDate] = useState("");
  useEffect(() => { if (shipmentDate) setRateDate(shipmentDate); }, [shipmentDate]);

  const fxQuery = useQuery({
    queryKey: ["fx-cnb", rateDate],
    queryFn: () => api.invoicing.invoicingFxRates(rateDate ? { date: rateDate } : {}),
    staleTime: 60 * 60 * 1000,
  });
  const rates: Rates = fxQuery.data?.rates ?? { CZK: 1, USD: 20.62, EUR: 24.12 };

  /* ── Buying costs ── */
  const buyRows: BuyingRow[] = useMemo(
    () => (data?.costs ?? []).map((c) => ({
      id: c.id,
      category: c.category ?? "",
      vendor: c.vendor ?? "",
      estQty: c.estQty ?? "",
      estAmount: c.estAmount ?? "",
      estCurrency: c.estCurrency || "CZK",
      realQty: c.realQty ?? "",
      realAmount: c.realAmount ?? "",
      realCurrency: c.realCurrency || "CZK",
      invoiceNumber: c.invoiceNumber ?? "",
      received: !!c.received,
    })),
    [data?.costs],
  );

  const addBuy = useMutation({
    mutationFn: () => api.invoicing.invoicingAddBuyingCost(shipment.id, { sortOrder: buyRows.length }),
    onSuccess: invalidate,
  });
  const updateBuy = useMutation({
    mutationFn: ({ id, ...params }: { id: string } & Record<string, unknown>) =>
      api.invoicing.invoicingUpdateBuyingCost(shipment.id, id, params),
    onSuccess: invalidate,
  });
  const deleteBuy = useMutation({
    mutationFn: (id: string) => api.invoicing.invoicingDeleteBuyingCost(shipment.id, id),
    onSuccess: invalidate,
  });

  /* ── Selling costs ── */
  const sellRows: SellingRow[] = useMemo(
    () => (data?.sellingCosts ?? []).map((c) => ({
      id: c.id,
      category: c.category ?? "",
      customer: c.customer ?? "",
      qty: c.qty ?? "",
      amount: c.amount ?? "",
      currency: c.currency || "CZK",
      invoice: !!c.invoice,
    })),
    [data?.sellingCosts],
  );

  const addSell = useMutation({
    mutationFn: (params: Record<string, unknown> = {}) =>
      api.invoicing.invoicingAddSellingCost(shipment.id, { sortOrder: sellRows.length, ...params }),
    onSuccess: invalidate,
  });
  const updateSell = useMutation({
    mutationFn: ({ id, ...params }: { id: string } & Record<string, unknown>) =>
      api.invoicing.invoicingUpdateSellingCost(shipment.id, id, params),
    onSuccess: invalidate,
  });
  const deleteSell = useMutation({
    mutationFn: (id: string) => api.invoicing.invoicingDeleteSellingCost(shipment.id, id),
    onSuccess: invalidate,
  });

  /* ── Undo smazani (mockup: undo-btn) ── */
  const undoBuyRef = useRef<Record<string, unknown> | null>(null);
  const undoSellRef = useRef<Record<string, unknown> | null>(null);
  const [canUndoBuy, setCanUndoBuy] = useState(false);
  const [canUndoSell, setCanUndoSell] = useState(false);

  const removeBuy = (row: BuyingRow) => {
    const { id: _id, ...rest } = row;
    undoBuyRef.current = rest;
    setCanUndoBuy(true);
    deleteBuy.mutate(row.id);
  };
  const undoBuy = () => {
    const r = undoBuyRef.current;
    if (!r) return;
    api.invoicing.invoicingAddBuyingCost(shipment.id, r).then(() => {
      undoBuyRef.current = null;
      setCanUndoBuy(false);
      invalidate();
    });
  };
  const removeSell = (row: SellingRow) => {
    const { id: _id, ...rest } = row;
    undoSellRef.current = rest;
    setCanUndoSell(true);
    deleteSell.mutate(row.id);
  };
  const undoSell = () => {
    const r = undoSellRef.current;
    if (!r) return;
    api.invoicing.invoicingAddSellingCost(shipment.id, r).then(() => {
      undoSellRef.current = null;
      setCanUndoSell(false);
      invalidate();
    });
  };

  /* ── Copy from buying (mockup: copyFromBuying) ── */
  const copyFromBuying = async () => {
    if (!buyRows.length) return message.info("No buying costs to copy");
    for (const [i, r] of buyRows.entries()) {
      await api.invoicing.invoicingAddSellingCost(shipment.id, {
        category: r.category,
        qty: r.realQty || r.estQty || "",
        amount: r.realAmount || r.estAmount || "",
        currency: r.realAmount ? r.realCurrency : r.estCurrency,
        sortOrder: sellRows.length + i,
      });
    }
    invalidate();
    message.success(`Copied ${buyRows.length} row(s) from buying`);
  };

  /* ── Copy from quote (zachovano z puvodni verze) ── */
  const importQuoteCosts = async (target: "buy" | "sell") => {
    if (!quoteInput.trim()) return;
    setQuoteLoading(true);
    setQuoteStatus(null);
    const qn = quoteInput.trim().replace(/-\d+$/, "");
    try {
      const quoteData = await api.invoicing.invoicingGet(qn);
      const quoteCosts = quoteData.costs ?? [];
      if (!quoteCosts.length) {
        setQuoteStatus("No costs found for this quote");
        setQuoteLoading(false);
        return;
      }
      let imported = 0;
      for (const [i, c] of quoteCosts.entries()) {
        const amount = c.realAmount || c.estAmount;
        if (!amount) continue;
        const currency = (c.realAmount ? c.realCurrency : c.estCurrency) || "CZK";
        if (target === "buy") {
          await api.invoicing.invoicingAddBuyingCost(shipment.id, {
            category: c.category, vendor: c.vendor ?? "",
            estQty: c.realAmount ? (c.realQty ?? "") : (c.estQty ?? ""),
            estAmount: amount, estCurrency: currency,
            sortOrder: buyRows.length + i,
          });
        } else {
          await api.invoicing.invoicingAddSellingCost(shipment.id, {
            category: c.category, amount, currency,
            sortOrder: sellRows.length + i,
          });
        }
        imported++;
      }
      const qBilling = quoteData.billingSettings;
      await upsertBilling.mutateAsync({
        quoteRef: qn,
        ...(qBilling?.billingCurrency ? { billingCurrency: qBilling.billingCurrency } : {}),
        ...(qBilling?.roe ? { roe: qBilling.roe } : {}),
      });
      invalidate();
      setQuoteStatus(`Imported ${imported} cost(s) from ${qn}`);
    } catch {
      setQuoteStatus("Quote not found or error");
    }
    setQuoteLoading(false);
  };

  /* ── Vypocty (presne dle recalcCosts z mockupu) ── */
  const t = useMemo(
    () => computeCosts(buyRows, sellRows, billingCur, rates, roe),
    [buyRows, sellRows, billingCur, rates, roe],
  );

  if (isLoading) {
    return <div className="p-6 text-center text-slate-400 text-sm">Loading…</div>;
  }

  return (
    <div>
      {/* ═══════════ 1. BUYING COSTS ═══════════ */}
      <SectionCard
        title="Buying costs"
        tone="buy"
        actions={
          <>
            <HeadBtn onClick={undoBuy} disabled={!canUndoBuy} title="Vrátit smazaný náklad zpět">
              <UndoOutlined />
            </HeadBtn>
            <HeadBtn onClick={() => importQuoteCosts("buy")} disabled={quoteLoading || !quoteInput.trim()}>
              Copy from quote
            </HeadBtn>
            <HeadBtn onClick={() => addBuy.mutate()}>Add buying cost</HeadBtn>
          </>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: "separate", borderSpacing: 0, minWidth: "1180px" }}>
            <thead>
              {/* seskupene zahlavi Estimated / Real dle mockupu */}
              <tr>
                <th colSpan={2} className="border-b border-slate-200" />
                <th colSpan={3} className={`${TH} text-center bg-[#F5F6FD] text-[#3F4DBF]`}>
                  Estimated buying costs
                </th>
                <th colSpan={5} className={`${TH} text-center bg-[#FBF6EF] text-[#95620B]`}>
                  Real buying costs
                </th>
                <th colSpan={2} className="border-b border-slate-200" />
              </tr>
              <tr>
                <th className={`${TH} text-left w-[16%]`}>Category</th>
                <th className={`${TH} text-left w-[9%]`}>Vendor</th>
                <th className={`${TH} text-center w-[5%]`}>Qty</th>
                <th className={`${TH} text-right w-[9%]`}>Est. Amount</th>
                <th className={`${TH} text-left w-[6%]`}>Cur</th>
                <th className={`${TH} text-center w-[5%]`}>Qty</th>
                <th className={`${TH} text-right w-[9%]`}>Real Cost</th>
                <th className={`${TH} text-left w-[6%]`}>Cur</th>
                <th className={`${TH} text-left w-[9%]`}>Invoice number</th>
                <th className={`${TH} text-center w-[6%]`} title="Přijatá faktura obdržena">Received</th>
                <th className={`${TH} text-right w-[12%]`}>Total in {billingCur}</th>
                <th className={`${TH} w-[44px]`} />
              </tr>
            </thead>
            <tbody>
              {buyRows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/60">
                  <td className={CELL}>
                    <Select
                      value={r.category || undefined}
                      placeholder="—"
                      variant="borderless"
                      className="w-full [&_.ant-select-selector]:!h-[30px] [&_.ant-select-selector]:!border
                                 [&_.ant-select-selector]:!border-slate-200 [&_.ant-select-selector]:!rounded-md
                                 [&_.ant-select-selection-item]:!text-[13px]"
                      options={COST_CATEGORIES.map((v) => ({ value: v, label: v }))}
                      onChange={(v) => updateBuy.mutate({ id: r.id, category: v })}
                    />
                  </td>
                  <td className={CELL}>
                    <input
                      className={FIELD}
                      defaultValue={r.vendor}
                      onBlur={(e) => e.target.value !== r.vendor && updateBuy.mutate({ id: r.id, vendor: e.target.value })}
                    />
                  </td>
                  {/* Estimated */}
                  <td className={CELL}>
                    <input
                      className={`${FIELD} text-center`}
                      defaultValue={r.estQty}
                      onBlur={(e) => e.target.value !== r.estQty && updateBuy.mutate({ id: r.id, estQty: e.target.value })}
                    />
                  </td>
                  <td className={CELL}>
                    <input
                      className={`${FIELD} text-right`}
                      defaultValue={r.estAmount}
                      onBlur={(e) => e.target.value !== r.estAmount && updateBuy.mutate({ id: r.id, estAmount: e.target.value })}
                    />
                  </td>
                  <td className={CELL}>
                    <Select
                      value={r.estCurrency}
                      variant="borderless"
                      className="w-full [&_.ant-select-selector]:!h-[30px] [&_.ant-select-selector]:!border
                                 [&_.ant-select-selector]:!border-slate-200 [&_.ant-select-selector]:!rounded-md
                                 [&_.ant-select-selection-item]:!text-[13px]"
                      options={CURRENCIES.map((v) => ({ value: v, label: v }))}
                      onChange={(v) => updateBuy.mutate({ id: r.id, estCurrency: v })}
                    />
                  </td>
                  {/* Real */}
                  <td className={CELL}>
                    <input
                      className={`${FIELD} text-center`}
                      defaultValue={r.realQty}
                      onBlur={(e) => e.target.value !== r.realQty && updateBuy.mutate({ id: r.id, realQty: e.target.value })}
                    />
                  </td>
                  <td
                    className={`${CELL} ${
                      t.buyRowOver[r.id] ? "bg-[#FBE6E4]" : t.buyRowUnder[r.id] ? "bg-[#E1F3E9]" : ""
                    }`}
                    title={
                      t.buyRowOver[r.id] ? "Real Cost je vyšší než Estimated"
                        : t.buyRowUnder[r.id] ? "Real Cost je nižší než Estimated" : undefined
                    }
                  >
                    <input
                      className={`${FIELD} text-right ${t.buyRowUnder[r.id] ? "!text-[#177245] font-bold" : ""}`}
                      defaultValue={r.realAmount}
                      onBlur={(e) => e.target.value !== r.realAmount && updateBuy.mutate({ id: r.id, realAmount: e.target.value })}
                    />
                  </td>
                  <td className={CELL}>
                    <Select
                      value={r.realCurrency}
                      variant="borderless"
                      className="w-full [&_.ant-select-selector]:!h-[30px] [&_.ant-select-selector]:!border
                                 [&_.ant-select-selector]:!border-slate-200 [&_.ant-select-selector]:!rounded-md
                                 [&_.ant-select-selection-item]:!text-[13px]"
                      options={CURRENCIES.map((v) => ({ value: v, label: v }))}
                      onChange={(v) => updateBuy.mutate({ id: r.id, realCurrency: v })}
                    />
                  </td>
                  <td className={CELL}>
                    <input
                      className={FIELD}
                      defaultValue={r.invoiceNumber}
                      onBlur={(e) => e.target.value !== r.invoiceNumber && updateBuy.mutate({ id: r.id, invoiceNumber: e.target.value })}
                    />
                  </td>
                  <td className={`${CELL} text-center`}>
                    <Checkbox
                      checked={r.received}
                      onChange={(e) => updateBuy.mutate({ id: r.id, received: e.target.checked })}
                    />
                  </td>
                  <td className={`${CELL} text-right text-[13px] font-semibold tabular-nums text-slate-800`}>
                    {money(t.buyRowTotals[r.id] ?? 0)}
                  </td>
                  <td className={`${CELL} text-center`}>
                    <Tooltip title="Smazat řádek">
                      <button
                        onClick={() => removeBuy(r)}
                        className="w-[26px] h-[26px] rounded-md grid place-items-center text-slate-400
                                   hover:bg-[#FBE6E4] hover:text-[#C3392B] border-0 bg-transparent cursor-pointer"
                      >
                        <DeleteOutlined />
                      </button>
                    </Tooltip>
                  </td>
                </tr>
              ))}
              {!buyRows.length && (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-slate-400 text-[13px]">
                    No buying costs yet — use “Add buying cost”.
                  </td>
                </tr>
              )}
            </tbody>
            {/* soucty: pod Est. Amount a Real Cost, mena vzdy pod sloupcem Cur */}
            <tfoot>
              <tr className="bg-slate-50 font-bold">
                <td className="px-[6px] py-2 text-[12px] uppercase tracking-wide text-slate-500" colSpan={3}>
                  Total buying
                </td>
                <td className="px-[6px] py-2 text-right text-[13px] tabular-nums text-slate-900">
                  {money(t.estTotal)}
                </td>
                <td className="px-[6px] py-2 text-[12px] text-slate-500">{billingCur}</td>
                <td />
                <td className={`px-[6px] py-2 text-right text-[13px] tabular-nums ${t.realStrictTotal ? "text-slate-900" : "text-slate-300"}`}>
                  {t.realStrictTotal ? money(t.realStrictTotal) : "—"}
                </td>
                <td className="px-[6px] py-2 text-[12px] text-slate-500">{t.realStrictTotal ? billingCur : ""}</td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          </table>
        </div>
      </SectionCard>

      {/* ═══════════ 2. SELLING COSTS ═══════════ */}
      <SectionCard
        title="Selling costs"
        tone="sell"
        actions={
          <>
            <HeadBtn onClick={undoSell} disabled={!canUndoSell} title="Vrátit smazaný náklad zpět">
              <UndoOutlined />
            </HeadBtn>
            <HeadBtn onClick={() => importQuoteCosts("sell")} disabled={quoteLoading || !quoteInput.trim()}>
              Copy from quote
            </HeadBtn>
            <HeadBtn onClick={copyFromBuying}>Copy from buying</HeadBtn>
            <HeadBtn onClick={() => addSell.mutate({})}>Add selling cost</HeadBtn>
          </>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: "separate", borderSpacing: 0, minWidth: "900px" }}>
            <thead>
              <tr>
                <th className={`${TH} text-left w-[185px]`}>Category</th>
                <th className={`${TH} text-left w-[28%]`}>Customer</th>
                <th className={`${TH} text-center w-[10%]`}>Qty</th>
                <th className={`${TH} text-right w-[13%]`}>Amount</th>
                <th className={`${TH} text-left w-[9%]`}>Cur</th>
                <th className={`${TH} text-right w-[14%]`}>Total in {billingCur}</th>
                <th className={`${TH} text-center w-[7%]`} title="Zahrnout do kalkulačního listu k fakturaci">Invoice</th>
                <th className={`${TH} w-[44px]`} />
              </tr>
            </thead>
            <tbody>
              {sellRows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/60">
                  <td className={CELL}>
                    <Select
                      value={r.category || undefined}
                      placeholder="—"
                      variant="borderless"
                      className="w-full [&_.ant-select-selector]:!h-[30px] [&_.ant-select-selector]:!border
                                 [&_.ant-select-selector]:!border-slate-200 [&_.ant-select-selector]:!rounded-md
                                 [&_.ant-select-selection-item]:!text-[13px]"
                      options={COST_CATEGORIES.map((v) => ({ value: v, label: v }))}
                      onChange={(v) => updateSell.mutate({ id: r.id, category: v })}
                    />
                  </td>
                  <td className={CELL}>
                    <input
                      className={FIELD}
                      defaultValue={r.customer}
                      onBlur={(e) => e.target.value !== r.customer && updateSell.mutate({ id: r.id, customer: e.target.value })}
                    />
                  </td>
                  <td className={CELL}>
                    <input
                      className={`${FIELD} text-center`}
                      defaultValue={r.qty}
                      onBlur={(e) => e.target.value !== r.qty && updateSell.mutate({ id: r.id, qty: e.target.value })}
                    />
                  </td>
                  <td className={CELL}>
                    <input
                      className={`${FIELD} text-right`}
                      defaultValue={r.amount}
                      onBlur={(e) => e.target.value !== r.amount && updateSell.mutate({ id: r.id, amount: e.target.value })}
                    />
                  </td>
                  <td className={CELL}>
                    <Select
                      value={r.currency}
                      variant="borderless"
                      className="w-full [&_.ant-select-selector]:!h-[30px] [&_.ant-select-selector]:!border
                                 [&_.ant-select-selector]:!border-slate-200 [&_.ant-select-selector]:!rounded-md
                                 [&_.ant-select-selection-item]:!text-[13px]"
                      options={CURRENCIES.map((v) => ({ value: v, label: v }))}
                      onChange={(v) => updateSell.mutate({ id: r.id, currency: v })}
                    />
                  </td>
                  <td className={`${CELL} text-right text-[13px] font-semibold tabular-nums text-slate-800`}>
                    {money(t.sellRowTotals[r.id] ?? 0)}
                  </td>
                  <td className={`${CELL} text-center`}>
                    <Checkbox
                      checked={r.invoice}
                      onChange={(e) => updateSell.mutate({ id: r.id, invoice: e.target.checked })}
                    />
                  </td>
                  <td className={`${CELL} text-center`}>
                    <Tooltip title="Smazat řádek">
                      <button
                        onClick={() => removeSell(r)}
                        className="w-[26px] h-[26px] rounded-md grid place-items-center text-slate-400
                                   hover:bg-[#FBE6E4] hover:text-[#C3392B] border-0 bg-transparent cursor-pointer"
                      >
                        <DeleteOutlined />
                      </button>
                    </Tooltip>
                  </td>
                </tr>
              ))}
              {!sellRows.length && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400 text-[13px]">
                    No selling costs yet — use “Add selling cost”.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-bold">
                <td className="px-[6px] py-2 text-[12px] uppercase tracking-wide text-slate-500" colSpan={5}>
                  Total selling
                </td>
                <td className="px-[6px] py-2 text-right text-[13px] tabular-nums text-slate-900" colSpan={3}>
                  {money(t.sellTotalCZK)} CZK
                  {billingCur !== "CZK" && ` · ${money(t.sellTotal)} ${billingCur}`}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </SectionCard>

      {/* ═══════════ 3. BILLING & KURZY ČNB ═══════════ */}
      <SectionCard title="Billing & exchange rates" tone="fx">
        <div className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[12px] font-bold tracking-[.07em] uppercase text-slate-500">Billing currency</span>
            <Select
              value={billingCur}
              className="w-[110px]"
              options={CURRENCIES.map((v) => ({ value: v, label: v }))}
              onChange={(v) => { setBillingCur(v); upsertBilling.mutate({ billingCurrency: v }); }}
            />
            <Tooltip title="Záložní kurz (CZK za 1 jednotku) pro měny mimo kurzovní lístek ČNB">
              <span className="text-[12px] font-bold tracking-[.07em] uppercase text-slate-500">ROE</span>
            </Tooltip>
            <Input
              value={roe}
              onChange={(e) => setRoe(e.target.value)}
              onBlur={() => upsertBilling.mutate({ roe })}
              className="w-[110px] text-right"
            />
            <Tooltip title="U importu se kurz bere k datu ETA, u exportu k datu ETD">
              <Select
                value={rateBasis}
                className="w-[150px]"
                options={[
                  { value: "eta", label: "Rate at ETA" },
                  { value: "etd", label: "Rate at ETD" },
                ]}
                onChange={(v) => setRateBasis(v)}
              />
            </Tooltip>
            <Tooltip title="Datum ETA/ETD zásilky — kurz ČNB se načte k tomuto dni">
              <input
                type="date"
                value={rateDate}
                onChange={(e) => setRateDate(e.target.value)}
                className="h-8 px-2 text-[13px] border border-slate-200 rounded-md outline-none focus:border-indigo-500"
              />
            </Tooltip>
            <span className="text-[12.5px] font-semibold text-slate-500">
              {fxQuery.isLoading
                ? "Načítám kurzy ČNB…"
                : fxQuery.data
                  ? `Kurzy ČNB ${fxQuery.data.fallback ? "— záložní (ČNB nedostupná)" : `k ${rateBasis.toUpperCase()} ${fxQuery.data.validFor} (týden ${fxQuery.data.week})`}: USD ${rates.USD?.toFixed(3)} · EUR ${rates.EUR?.toFixed(3)} CZK`
                  : ""}
            </span>
          </div>

          {/* souhrnny grid: Total buying costs Estimated/Real v CZK, USD a EUR */}
          <table className="mt-4 w-full max-w-[620px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr>
                <th className={`${TH} text-left`} />
                <th className={`${TH} text-right`}>CZK</th>
                <th className={`${TH} text-right`}>USD</th>
                <th className={`${TH} text-right`}>EUR</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: "Total buying — Estimated", czk: t.estCZK },
                { label: "Total buying — Real", czk: t.realCZK },
              ].map((row) => (
                <tr key={row.label}>
                  <td className="px-[15px] py-[10px] text-[12px] font-bold tracking-[.06em] uppercase text-slate-600 border-b border-slate-100">
                    {row.label}
                  </td>
                  {[row.czk, row.czk / (rates.USD || 1), row.czk / (rates.EUR || 1)].map((v, i) => (
                    <td key={i} className="px-[15px] py-[10px] text-right font-bold text-slate-900 tabular-nums border-b border-slate-100 whitespace-nowrap">
                      {row.czk > 0 ? money(v) : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {/* import z nabidky */}
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <Input
              placeholder="QCZ20260815001"
              value={quoteInput}
              onChange={(e) => setQuoteInput(e.target.value)}
              className="w-[200px]"
            />
            <span className="text-[12.5px] text-slate-500">
              Quote reference for “Copy from quote”
            </span>
            {quoteStatus && <span className="text-[12.5px] font-semibold text-[#177245]">{quoteStatus}</span>}
          </div>
        </div>
      </SectionCard>

      {/* ═══════════ 4. REPORT ═══════════ */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <button
          onClick={() => setReportOpen((v) => !v)}
          title="Zobrazit / skrýt report"
          className="w-full h-[38px] px-4 flex items-center gap-3 bg-[#151B2B] text-white
                     text-[12.5px] font-bold uppercase tracking-[.05em] border-0 cursor-pointer"
        >
          <span>Report</span>
          <DownOutlined className={`text-[10px] transition-transform ${reportOpen ? "rotate-180" : ""}`} />
          <span className="ml-auto flex items-center gap-5 normal-case tracking-normal">
            {[
              { k: "Buying costs", v: t.hasAny ? money(t.buyCZK) : "—" },
              { k: "Selling costs", v: t.hasAny ? money(t.sellCZK) : "—" },
              { k: "Profit", v: t.hasAny ? signed(t.profitCZK) : "—", profit: true },
            ].map((x) => (
              <span key={x.k} className="flex items-center gap-2">
                <span className="text-[11.5px] font-semibold text-white/45">{x.k}</span>
                <span
                  className={`text-[13px] font-bold tabular-nums ${
                    !t.hasAny ? "text-white/45"
                      : x.profit ? (t.profitCZK >= 0 ? "text-[#4ADE80]" : "text-[#F87171]")
                        : "text-white"
                  }`}
                >
                  {x.v}
                </span>
              </span>
            ))}
          </span>
        </button>

        {reportOpen && (
          <div className="p-4">
            {/* Profit tabulka v CZK / USD / EUR */}
            <table className="w-full max-w-[720px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr>
                  <th className={`${TH} text-left`} />
                  <th className={`${TH} text-right`}>CZK</th>
                  <th className={`${TH} text-right`}>USD</th>
                  <th className={`${TH} text-right`}>EUR</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "Buying costs", czk: t.buyCZK, signed: false },
                  { label: "Selling costs", czk: t.sellCZK, signed: false },
                  { label: "Profit", czk: t.profitCZK, signed: true },
                ].map((row) => (
                  <tr key={row.label} className={row.signed ? "font-bold" : ""}>
                    <td className="px-[15px] py-[10px] text-[13px] text-slate-700 border-b border-slate-100">
                      {row.label}
                    </td>
                    {[row.czk, row.czk / (rates.USD || 1), row.czk / (rates.EUR || 1)].map((v, i) => (
                      <td
                        key={i}
                        className={`px-[15px] py-[10px] text-right text-[13px] tabular-nums border-b border-slate-100 whitespace-nowrap ${
                          !t.hasAny ? "text-slate-300"
                            : row.signed ? (t.profitCZK >= 0 ? "text-[#177245] font-bold" : "text-[#C3392B] font-bold")
                              : "text-slate-900"
                        }`}
                      >
                        {t.hasAny ? (row.signed ? signed(v) : money(v)) : "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* R x E: Real - Estimated */}
            <div className="mt-5">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-[12px] font-bold tracking-[.06em] uppercase text-slate-600">
                  R x E — Real − Estimated
                </span>
                <Tooltip title="Rozdíl Real − Estimated u nákladů. Záporná hodnota = úspora oproti odhadu.">
                  <span
                    className={`text-[13px] font-bold tabular-nums ${
                      !t.hasRxe ? "text-slate-300"
                        : t.rxeTotal > 0.001 ? "text-[#C3392B]"
                          : t.rxeTotal < -0.001 ? "text-[#177245]" : "text-slate-400"
                    }`}
                  >
                    {t.hasRxe ? `${signed(t.rxeTotal)} ${billingCur}` : "—"}
                  </span>
                </Tooltip>
              </div>

              {t.rxeRows.length > 0 && (
                <table className="w-full max-w-[720px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                  <thead>
                    <tr>
                      <th className={`${TH} text-left`}>Category</th>
                      <th className={`${TH} text-left`}>Vendor</th>
                      <th className={`${TH} text-right`}>R x E</th>
                      <th className={`${TH} text-right`}>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.rxeRows.map((x, i) => (
                      <tr key={i}>
                        <td className="px-[15px] py-[8px] text-[13px] text-slate-700 border-b border-slate-100">{x.cat}</td>
                        <td className="px-[15px] py-[8px] text-[13px] text-slate-500 border-b border-slate-100">
                          {x.vendor || "—"}
                        </td>
                        <td
                          className={`px-[15px] py-[8px] text-right text-[13px] font-semibold tabular-nums border-b border-slate-100 ${
                            x.delta > 0.001 ? "text-[#C3392B]" : x.delta < -0.001 ? "text-[#177245]" : "text-slate-400"
                          }`}
                        >
                          {signed(x.delta)}
                        </td>
                        <td className="px-[15px] py-[8px] text-right text-[12.5px] text-slate-500 tabular-nums border-b border-slate-100">
                          {x.pct ? `${x.pct > 0 ? "+" : "−"}${Math.abs(x.pct).toFixed(1)} %` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

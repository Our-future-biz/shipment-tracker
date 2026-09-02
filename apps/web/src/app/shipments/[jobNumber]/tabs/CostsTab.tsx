"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Input, Select, Checkbox, Tooltip, Modal, AutoComplete, message } from "antd";
import { DeleteOutlined, UndoOutlined, DownOutlined, CopyOutlined } from "@ant-design/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ShipmentItem } from "@/hooks/useShipments";
import { getFieldValue } from "@/hooks/useShipments";
import {
  computeCosts, money, signed, num,
  type BuyingRow, type SellingRow, type Rates,
} from "./costsCalc";

const CURRENCIES = ["CZK", "USD", "EUR", "GBP", "CNY"];

/** Mockup naseptava meny podle kodu i nazvu (renderCombo, mode "cur"). */
const CURRENCY_NAMES: Record<string, string> = {
  CZK: "Czech koruna",
  USD: "US dollar",
  EUR: "Euro",
  GBP: "Pound sterling",
  CNY: "Chinese yuan",
};

/** Vyber meny s naseptavanim - filtruje podle kodu i nazvu meny. */
function CurrencyPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <AutoComplete
      value={value}
      onChange={(v) => onChange((v || "").toUpperCase())}
      onSelect={(v) => onChange(v)}
      filterOption={(input, option) => {
        const q = (input || "").toLowerCase().trim();
        if (!q) return true;
        const code = String(option?.value ?? "").toLowerCase();
        return code.includes(q) || (CURRENCY_NAMES[String(option?.value)] ?? "").toLowerCase().includes(q);
      }}
      options={CURRENCIES.map((c) => ({ value: c, label: `${c} — ${CURRENCY_NAMES[c] ?? ""}` }))}
      className="w-full [&_.ant-select-selector]:!h-[30px] [&_.ant-select-selector]:!border
                 [&_.ant-select-selector]:!border-slate-200 [&_.ant-select-selector]:!rounded-md
                 [&_input]:!text-[13px]"
    />
  );
}

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
  // modalni okno Copy from quote (mockup: #quoteModal)
  const [quoteModal, setQuoteModal] = useState<null | "buy" | "sell">(null);
  const [quoteErr, setQuoteErr] = useState("");
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

  // novy radek dle mockupu: Qty = 1, meny podle zvolene billing meny
  const addBuy = useMutation({
    mutationFn: () => api.invoicing.invoicingAddBuyingCost(shipment.id, {
      estQty: "1", realQty: "1",
      estCurrency: billingCur, realCurrency: billingCur,
      sortOrder: buyRows.length,
    }),
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
      sourceBuyId: c.sourceBuyId ?? null,
    })),
    [data?.sellingCosts],
  );

  // novy radek dle mockupu: Qty = 1, mena podle billing meny, Invoice zaskrtnuto
  const addSell = useMutation({
    mutationFn: (params: Record<string, unknown> = {}) =>
      api.invoicing.invoicingAddSellingCost(shipment.id, {
        qty: "1", currency: billingCur, invoice: true,
        sortOrder: sellRows.length, ...params,
      } as never),
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

  /* ── Undo jako zasobnik (mockup: undoStack + snapshotCostRow/restoreCostRow) ──
     Mockup si pamatuje vice smazanych radku a vraci je na PUVODNI pozici. */
  interface UndoEntry { index: number; values: Record<string, unknown> }
  const undoBuyStack = useRef<UndoEntry[]>([]);
  const undoSellStack = useRef<UndoEntry[]>([]);
  const [undoBuyCount, setUndoBuyCount] = useState(0);
  const [undoSellCount, setUndoSellCount] = useState(0);

  /** prazdny radek nema smysl vracet (mockup: costRowFilled) */
  const buyRowFilled = (r: BuyingRow) =>
    !!(r.category || r.vendor || r.estAmount || r.realAmount || r.invoiceNumber);
  const sellRowFilled = (r: SellingRow) => !!(r.category || r.customer || r.amount);

  const removeBuy = (row: BuyingRow, index: number) => {
    if (buyRowFilled(row)) {
      const { id: _id, ...values } = row;
      undoBuyStack.current.push({ index, values });
      setUndoBuyCount(undoBuyStack.current.length);
    }
    deleteBuy.mutate(row.id);
  };

  const undoBuy = async () => {
    const entry = undoBuyStack.current.pop();
    setUndoBuyCount(undoBuyStack.current.length);
    if (!entry) return;
    // vraceni na puvodni pozici: radek dostane sortOrder podle ulozeneho indexu
    // a nasledujici radky se posunou
    await api.invoicing.invoicingAddBuyingCost(shipment.id, {
      ...entry.values, sortOrder: entry.index,
    });
    for (const [i, r] of buyRows.entries()) {
      if (i >= entry.index) {
        await api.invoicing.invoicingUpdateBuyingCost(shipment.id, r.id, { sortOrder: i + 1 } as never);
      }
    }
    invalidate();
  };

  const removeSell = (row: SellingRow, index: number) => {
    if (sellRowFilled(row)) {
      const { id: _id, ...values } = row;
      undoSellStack.current.push({ index, values });
      setUndoSellCount(undoSellStack.current.length);
    }
    deleteSell.mutate(row.id);
  };

  const undoSell = async () => {
    const entry = undoSellStack.current.pop();
    setUndoSellCount(undoSellStack.current.length);
    if (!entry) return;
    await api.invoicing.invoicingAddSellingCost(shipment.id, {
      ...entry.values, sortOrder: entry.index,
    } as never);
    for (const [i, r] of sellRows.entries()) {
      if (i >= entry.index) {
        await api.invoicing.invoicingUpdateSellingCost(shipment.id, r.id, { sortOrder: i + 1 } as never);
      }
    }
    invalidate();
  };

  /* ── Kopie radku (mockup: tlacitko .dup) ──
     Nekopiruje se Invoice number ani Received - vazou se ke konkretni fakture.
     U selling se nekopiruje vazba na zdrojovy radek - kopie je novy nezavisly radek. */
  const duplicateBuy = async (r: BuyingRow, index: number) => {
    await api.invoicing.invoicingAddBuyingCost(shipment.id, {
      category: r.category, vendor: r.vendor,
      estQty: r.estQty, estAmount: r.estAmount, estCurrency: r.estCurrency,
      realQty: r.realQty, realAmount: r.realAmount, realCurrency: r.realCurrency,
      sortOrder: index + 1,
    });
    for (const [i, row] of buyRows.entries()) {
      if (i > index) await api.invoicing.invoicingUpdateBuyingCost(shipment.id, row.id, { sortOrder: i + 1 } as never);
    }
    invalidate();
  };

  const duplicateSell = async (r: SellingRow, index: number) => {
    await api.invoicing.invoicingAddSellingCost(shipment.id, {
      category: r.category, customer: r.customer,
      qty: r.qty, amount: r.amount, currency: r.currency, invoice: r.invoice,
      sortOrder: index + 1,
    });
    for (const [i, row] of sellRows.entries()) {
      if (i > index) await api.invoicing.invoicingUpdateSellingCost(shipment.id, row.id, { sortOrder: i + 1 } as never);
    }
    invalidate();
  };

  /* ── Zmena meny u Estimated se zrcadli do Real, dokud neni Real vyplneny ── */
  const changeEstCurrency = (r: BuyingRow, currency: string) => {
    const mirror = !num(r.realAmount);
    updateBuy.mutate({ id: r.id, estCurrency: currency, ...(mirror ? { realCurrency: currency } : {}) });
  };

  /* ── Received se ridi vyplnenim cisla faktury, rucne zaskrtnout nejde ── */
  const changeInvoiceNumber = (r: BuyingRow, value: string) => {
    if (value === r.invoiceNumber) return;
    updateBuy.mutate({ id: r.id, invoiceNumber: value, received: !!value.trim() });
  };

  /* ── Copy from buying (mockup: copyFromBuying) ──
     Kopiruje VZDY z Estimated (Qty x Est. Amount v mene estimated) - Real se nikdy
     nepouziva. Radky jiz zkopirovane driv se preskoci (vazba sourceBuyId). */
  const copyFromBuying = async () => {
    const already = new Set(sellRows.map((r) => r.sourceBuyId).filter(Boolean));
    const rows = buyRows.filter((r) => !already.has(r.id) && (r.category || num(r.estAmount)));
    if (!rows.length) {
      message.info(already.size ? "All buying rows are already copied" : "No buying costs to copy");
      return;
    }
    for (const [i, r] of rows.entries()) {
      await api.invoicing.invoicingAddSellingCost(shipment.id, {
        category: r.category,
        qty: r.estQty || "1",
        amount: r.estAmount || "",
        currency: r.estCurrency,
        sourceBuyId: r.id,
        sortOrder: sellRows.length + i,
      } as never);
    }
    invalidate();
    message.success(`Copied ${rows.length} row(s) from buying`);
  };

  /* ── Copy from quote (mockup: openQuoteModal / doQuoteImport) ──
     Reference se zadava v modalnim okne, ne primo v karte. */
  const importQuoteCosts = async () => {
    const target = quoteModal;
    if (!target) return;
    const ref = quoteInput.trim();
    if (!ref) { setQuoteErr("Enter the quotation reference."); return; }

    setQuoteLoading(true);
    setQuoteErr("");
    const qn = ref.replace(/-\d+$/, "");
    try {
      const quoteData = await api.invoicing.invoicingGet(qn);
      const quoteCosts = quoteData.costs ?? [];
      if (!quoteCosts.length) {
        setQuoteErr(`No costs found for quote ${qn}.`);
        setQuoteLoading(false);
        return;
      }
      let imported = 0;
      for (const [i, c] of quoteCosts.entries()) {
        const amount = c.realAmount || c.estAmount;
        if (!amount) continue;
        const currency = (c.realAmount ? c.realCurrency : c.estCurrency) || billingCur;
        const qty = (c.realAmount ? c.realQty : c.estQty) || "1";
        if (target === "buy") {
          await api.invoicing.invoicingAddBuyingCost(shipment.id, {
            category: c.category, vendor: c.vendor ?? "",
            estQty: qty, estAmount: amount, estCurrency: currency,
            realQty: "1", realCurrency: currency,
            sortOrder: buyRows.length + i,
          });
        } else {
          await api.invoicing.invoicingAddSellingCost(shipment.id, {
            category: c.category, qty, amount, currency, invoice: true,
            sortOrder: sellRows.length + i,
          } as never);
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
      setQuoteModal(null);
    } catch {
      setQuoteErr("Quote not found or error.");
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
            <HeadBtn onClick={undoBuy} disabled={!undoBuyCount} title="Vrátit smazaný náklad zpět">
              <UndoOutlined />
            </HeadBtn>
            <HeadBtn onClick={() => { setQuoteErr(""); setQuoteModal("buy"); }}>
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
                <th className={`${TH} w-[70px]`} />
              </tr>
            </thead>
            <tbody>
              {buyRows.map((r, rowIndex) => (
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
                    <CurrencyPicker value={r.estCurrency} onChange={(v) => changeEstCurrency(r, v)} />
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
                    <CurrencyPicker value={r.realCurrency} onChange={(v) => updateBuy.mutate({ id: r.id, realCurrency: v })} />
                  </td>
                  <td className={CELL}>
                    <input
                      className={FIELD}
                      defaultValue={r.invoiceNumber}
                      onBlur={(e) => changeInvoiceNumber(r, e.target.value)}
                    />
                  </td>
                  <td className={`${CELL} text-center`}>
                    <Tooltip title="Received se zaškrtne automaticky po vyplnění čísla přijaté faktury">
                      <span>
                        <Checkbox checked={r.received} disabled tabIndex={-1} />
                      </span>
                    </Tooltip>
                  </td>
                  <td className={`${CELL} text-right text-[13px] font-semibold tabular-nums text-slate-800`}>
                    {money(t.buyRowTotals[r.id] ?? 0)}
                  </td>
                  <td className={`${CELL} text-center whitespace-nowrap`}>
                    <Tooltip title="Kopírovat řádek">
                      <button
                        onClick={() => duplicateBuy(r, rowIndex)}
                        className="w-[26px] h-[26px] rounded-md grid place-items-center text-slate-400
                                   hover:bg-[#E7EAFC] hover:text-[#4457D6] border-0 bg-transparent cursor-pointer inline-grid"
                      >
                        <CopyOutlined />
                      </button>
                    </Tooltip>
                    <Tooltip title="Smazat řádek">
                      <button
                        onClick={() => removeBuy(r, rowIndex)}
                        className="w-[26px] h-[26px] rounded-md grid place-items-center text-slate-400
                                   hover:bg-[#FBE6E4] hover:text-[#C3392B] border-0 bg-transparent cursor-pointer inline-grid"
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
            <HeadBtn onClick={undoSell} disabled={!undoSellCount} title="Vrátit smazaný náklad zpět">
              <UndoOutlined />
            </HeadBtn>
            <HeadBtn onClick={() => { setQuoteErr(""); setQuoteModal("sell"); }}>
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
                <th className={`${TH} w-[70px]`} />
              </tr>
            </thead>
            <tbody>
              {sellRows.map((r, rowIndex) => (
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
                    <CurrencyPicker value={r.currency} onChange={(v) => updateSell.mutate({ id: r.id, currency: v })} />
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
                  <td className={`${CELL} text-center whitespace-nowrap`}>
                    <Tooltip title="Kopírovat řádek">
                      <button
                        onClick={() => duplicateSell(r, rowIndex)}
                        className="w-[26px] h-[26px] rounded-md grid place-items-center text-slate-400
                                   hover:bg-[#E7EAFC] hover:text-[#4457D6] border-0 bg-transparent cursor-pointer inline-grid"
                      >
                        <CopyOutlined />
                      </button>
                    </Tooltip>
                    <Tooltip title="Smazat řádek">
                      <button
                        onClick={() => removeSell(r, rowIndex)}
                        className="w-[26px] h-[26px] rounded-md grid place-items-center text-slate-400
                                   hover:bg-[#FBE6E4] hover:text-[#C3392B] border-0 bg-transparent cursor-pointer inline-grid"
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

          {quoteStatus && (
            <div className="mt-3 text-[12.5px] font-semibold text-[#177245]">{quoteStatus}</div>
          )}
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

      {/* Copy from quote - modalni okno dle mockupu (#quoteModal) */}
      <Modal
        open={quoteModal !== null}
        onCancel={() => { setQuoteModal(null); setQuoteErr(""); }}
        onOk={importQuoteCosts}
        okText="Import"
        cancelText="Cancel"
        confirmLoading={quoteLoading}
        title="Copy from quote"
        width={430}
      >
        <p className="text-[13px] text-slate-600 mb-3.5">
          {quoteModal === "sell"
            ? "Enter the quotation reference. All selling costs will be imported from the quote."
            : "Enter the quotation reference. All buying costs will be imported from the quote."}
        </p>
        <Input
          autoFocus
          placeholder="QCZ20260815001"
          value={quoteInput}
          onChange={(e) => { setQuoteInput(e.target.value); setQuoteErr(""); }}
          onPressEnter={importQuoteCosts}
          className="font-mono tracking-[.03em]"
        />
        <div className="text-[#C3392B] text-[12.5px] font-semibold min-h-[17px] mt-[7px]">
          {quoteErr}
        </div>
      </Modal>
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { CURRENCIES } from "@/lib/cargo";
import Link from "next/link";
import { App, Input, Select, Checkbox, Tooltip, Modal } from "antd";
import { DeleteOutlined, UndoOutlined, DownOutlined, CopyOutlined, WarningOutlined } from "@ant-design/icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage, ErrCode, isAPIError } from "@/lib/api";
import type { controllers } from "@/lib/api/client";
import type { ShipmentItem } from "@/hooks/useShipments";
import { formatDate, formatDateTime } from "@/lib/date";
import { normaliseAmount } from "@/lib/money";
import { isSalesQuoteRef } from "@/app/sales/_lib/salesQuote";
import { chargeLabel, chargeOptions } from "@/lib/chargeCodes";
import { money, signed, num, type BuyingRow, type SellingRow } from "./costsCalc";
import { useCostsData } from "./useCostsData";
import { useConsignments, useTripRefs } from "@/hooks/useTruckingConsignments";
import { isTruckingCost, parseTruckingRef, truckingCostTag } from "@/lib/truckingCosts";
import { TruckingCostTagLink } from "@/components/TruckingCostTagLink";
import { useModules } from "@/lib/auth/AuthContext";

interface CurrencyPickerProps {
  value: string;
  onChange: (v: string) => void;
}

/**
 * Currency picker, searching by code and name. The currency can be switched even on a
 * locked row: it is a frequent change, not worth unlocking the row with a double-click.
 */
function CurrencyPicker({ value, onChange }: CurrencyPickerProps) {
  return (
    <Select
      value={value || undefined}
      onChange={onChange}
      showSearch
      placeholder="CUR"
      // matches the code or the name
      filterOption={(input, option) => {
        const q = (input || "").toLowerCase().trim();
        if (!q) return true;
        const code = String(option?.value ?? "").toLowerCase();
        const name = String(option?.title ?? "").toLowerCase();
        return code.includes(q) || name.includes(q);
      }}
      options={CURRENCIES.map(({ code, name }) => ({
        value: code, title: name, label: `${code} — ${name}`,
      }))}
      // the open list shows the name too, the cell only the code
      optionRender={(opt) => (
        <span className="text-[13px]">
          <span className="font-semibold">{String(opt.value)}</span>
          <span className="text-slate-400"> — {String(opt.data?.title ?? "")}</span>
        </span>
      )}
      labelRender={(p) => <span className="text-[13px]">{String(p.value ?? "")}</span>}
      popupMatchSelectWidth={false}
      className="w-full [&_.ant-select-selector]:!h-[30px] [&_.ant-select-selector]:!border
                 [&_.ant-select-selector]:!border-slate-200 [&_.ant-select-selector]:!rounded-md
                 [&_.ant-select-selection-item]:!text-[13px] [&_.ant-select-selection-search-input]:!text-[13px]"
    />
  );
}

/** Amount fields of a row: the database (numeric) takes "4999.5", not "4 999,50". */
const AMOUNT_FIELDS = ["estQty", "estAmount", "realQty", "realAmount", "qty", "amount"];

/**
 * Typed amounts in the form the API takes ("4 999,50" -> "4999.5"). An invalid amount is not
 * sent: it throws, and onError shows the message (instead of a 500 and a value on screen
 * that was never saved).
 */
function cleanAmounts<T extends object>(params: T): T {
  const out: Record<string, unknown> = { ...(params as Record<string, unknown>) };
  for (const key of AMOUNT_FIELDS) {
    if (typeof out[key] !== "string") continue;
    const clean = normaliseAmount(out[key] as string);
    if (clean === null) throw new Error(`"${out[key]}" is not a valid amount (max. 2 decimals)`);
    out[key] = clean;
  }
  return out as T;
}

/* ── shared classes (field height 30px, cell padding 6px) ── */
const CELL = "px-[6px] py-[6px] border-b border-slate-100 align-middle";
/** Splits estimated from real buying costs: a thick line down the whole table. */
const SPLIT = "border-l-[3px] border-l-slate-900";
const FIELD =
  "w-full h-[30px] px-2 text-[13px] border border-slate-200 rounded-md outline-none " +
  "focus:border-indigo-500 bg-white";
/** A Trucking row's value: plain text (read-only, readable by screen readers), as tall as a field. */
const READ = "block min-h-[30px] px-2 py-[5px] text-[13px] text-slate-800";
const TH =
  "text-[11.5px] font-bold tracking-[.04em] uppercase text-slate-500 px-[6px] py-2 " +
  "border-b border-slate-200 whitespace-nowrap";

interface SectionCardProps {
  title: string;
  tone: "buy" | "sell";
  actions?: React.ReactNode;
  children: React.ReactNode;
}

function SectionCard({
  title, tone, actions, children,
}: SectionCardProps) {
  const bg = {
    buy: "bg-accent-faint text-accent-strong",
    sell: "bg-ok-soft text-ok",
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

interface HeadBtnProps {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  /** Required when the button renders only an icon. */
  ariaLabel?: string;
  children: React.ReactNode;
}

/** small button in a card header (26px high) */
function HeadBtn({
  onClick, disabled, title, ariaLabel, children,
}: HeadBtnProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      className="h-[26px] px-[10px] text-[12px] font-semibold rounded-md border border-white/40
                 bg-white/80 text-slate-700 cursor-pointer hover:bg-white disabled:opacity-50
                 disabled:cursor-default transition-colors whitespace-nowrap"
    >
      {children}
    </button>
  );
}

interface CostsTabProps {
  shipment: ShipmentItem;
}

export function CostsTab({ shipment }: CostsTabProps) {
  const queryClient = useQueryClient();
  // Toasts go through the App context: antd's static `message` shows nothing under React 19.
  const { message } = App.useApp();
  const [quoteInput, setQuoteInput] = useState("");
  const [quoteLoading, setQuoteLoading] = useState(false);
  // the Copy from quote dialog
  const [quoteModal, setQuoteModal] = useState<null | "buy" | "sell">(null);
  const [quoteErr, setQuoteErr] = useState("");
  // The server refused because this quote's lines are on that side already: the next try says to copy them again.
  const [quoteAgain, setQuoteAgain] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  /* Row locking: a filled row turns read-only once left, a double-click opens it again.
     The ids of unlocked rows are kept; every other filled row is locked. */
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const unlock = (id: string) => setUnlocked((p) => new Set(p).add(id));
  const lock = (id: string) => setUnlocked((p) => {
    const n = new Set(p);
    n.delete(id);
    return n;
  });

  // Rows, rates and totals come from the shared hook, so the Quote card on the detail page
  // shows exactly the same figures as this tab.
  const { data, billingCur, fx, rates, ratesLoading, ratesError, buyRows, sellRows, totals: t } = useCostsData(shipment);
  const { isEnabled: isModuleOn } = useModules();

  // Rows Trucking writes (a consignment's sell, its trips' buy, …) are kept by Trucking: shown
  // read-only here (plain text, so screen readers and the keyboard reach them), tagged with the
  // consignment or trip they come from and linked to it.
  const truckingRefs = new Map(
    [...(data?.costs ?? []), ...(data?.sellingCosts ?? [])].filter((c) => isTruckingCost(c.sourceTruckingRef)).map((c) => [c.id, c.sourceTruckingRef ?? ""]),
  );
  // Only the trips these rows name are read (a few), not the whole trips list.
  const tripIds = [...new Set([...truckingRefs.values()].flatMap((ref) => {
    const parsed = parseTruckingRef(ref);
    return parsed?.kind === "trip" ? [parsed.id] : [];
  }))];
  // With the Trucking Concept hidden for the company the rows stay (they are costs), tagged
  // without a link, and nothing is asked of Trucking (the server would refuse it).
  const truckingOn = isModuleOn("trucking_concept");
  const { consignments: jobConsignments } = useConsignments({ shipmentId: shipment.id }, { enabled: truckingOn && truckingRefs.size > 0 });
  const tripRefs = useTripRefs(truckingOn ? tripIds : []);
  const truckingTagOf = (id: string) =>
    truckingCostTag(truckingRefs.get(id), { consignments: jobConsignments, tripRefs, shipmentId: shipment.id, linkable: truckingOn });

  // Costs feed the shipment's totals (list rows, the customer's rollups), so those refresh too.
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["shipments"] });
    return queryClient.invalidateQueries({ queryKey: ["invoicing", shipment.id] });
  };

  /** A failed write must be shown — it used to be swallowed, and the button seemed to do nothing. */
  const showError = (what: string) => (e: unknown) => {
    const detail = e instanceof Error ? e.message : "";
    console.error(`[CostsTab] ${what}`, e);
    message.error(detail ? `${what}: ${detail}` : what);
  };

  /* ── Buying costs ── */
  // a new row: Qty = 1, currencies of the chosen billing currency
  const addBuy = useMutation({
    mutationFn: () => api.invoicing.invoicingAddBuyingCost(shipment.id, {
      estQty: "1", realQty: "1",
      estCurrency: billingCur, realCurrency: billingCur,
      sortOrder: buyRows.length,
    }),
    onSuccess: (res) => { unlock(res.cost.id); invalidate(); },
    onError: showError("Could not add the buying cost"),
  });
  const updateBuy = useMutation({
    mutationFn: async ({ id, ...params }: { id: string } & controllers.UpdateBuyingRequest) =>
      api.invoicing.invoicingUpdateBuyingCost(shipment.id, id, cleanAmounts(params)),
    onSuccess: invalidate,
    onError: showError("Could not save the change"),
  });
  const deleteBuy = useMutation({
    mutationFn: (id: string) => api.invoicing.invoicingDeleteBuyingCost(shipment.id, id),
    onSuccess: invalidate,
    onError: showError("Could not delete the row"),
  });

  /* ── Selling costs ── */
  // a new row: Qty = 1, the billing currency, ticked for Invoice
  const addSell = useMutation({
    mutationFn: async (params: controllers.AddSellingRequest = {}) =>
      api.invoicing.invoicingAddSellingCost(shipment.id, cleanAmounts({
        qty: "1", currency: billingCur, invoice: true,
        sortOrder: sellRows.length, ...params,
      })),
    onSuccess: (res) => { unlock(res.sellingCost.id); invalidate(); },
    onError: showError("Could not add the selling cost"),
  });
  const updateSell = useMutation({
    mutationFn: async ({ id, ...params }: { id: string } & controllers.UpdateSellingRequest) =>
      api.invoicing.invoicingUpdateSellingCost(shipment.id, id, cleanAmounts(params)),
    onSuccess: invalidate,
    onError: showError("Could not save the change"),
  });
  const deleteSell = useMutation({
    mutationFn: (id: string) => api.invoicing.invoicingDeleteSellingCost(shipment.id, id),
    onSuccess: invalidate,
    onError: showError("Could not delete the row"),
  });

  /* ── Empty table ──
     No row is created by itself: merely opening the tab would write to the database, and
     empty costs would then show up on the Invoicing page too. An empty table has a button
     that adds the first row with one click instead. */

  /* ── Undo as a stack ──
     Several deleted rows are remembered, and each comes back at its ORIGINAL position. */
  interface UndoEntry { index: number; values: Record<string, unknown> }
  const undoBuyStack = useRef<UndoEntry[]>([]);
  const undoSellStack = useRef<UndoEntry[]>([]);
  const [undoBuyCount, setUndoBuyCount] = useState(0);
  const [undoSellCount, setUndoSellCount] = useState(0);

  /** an empty row is not worth bringing back */
  const buyRowFilled = (r: BuyingRow) =>
    !!(r.category || r.description || r.vendor || r.estAmount || r.realAmount || r.invoiceNumber);
  const sellRowFilled = (r: SellingRow) => !!(r.category || r.description || r.customer || r.amount);

  /** whether a row is filled — a filled row locks */
  const buyLocked = (r: BuyingRow) =>
    !unlocked.has(r.id) && !!(r.category || num(r.estAmount) || num(r.realAmount));
  const sellLocked = (r: SellingRow) =>
    !unlocked.has(r.id) && !!(r.category || num(r.amount));

  /** a locked row: fields look like text, a double-click opens them */
  const lockedField = (locked: boolean) =>
    locked
      ? " !border-transparent !bg-transparent pointer-events-none"
      : "";

  /**
   * Snapshot of a row's values for the undo stack. The id is dropped (the
   * restored row gets a new one) and so are nulls — the request fields are
   * optional strings, and the columns are nullable anyway, so omitting a null
   * is equivalent to sending it and avoids a type mismatch on the wire.
   */
  const undoValues = (row: BuyingRow | SellingRow): Record<string, unknown> => {
    const values: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (key === "id" || value === null || value === undefined) continue;
      values[key] = value;
    }
    return values;
  };

  const removeBuy = (row: BuyingRow, index: number) => {
    if (buyRowFilled(row)) {
      undoBuyStack.current.push({ index, values: undoValues(row) });
      setUndoBuyCount(undoBuyStack.current.length);
    }
    deleteBuy.mutate(row.id);
  };

  /**
   * Runs a handler that talks to the API directly (not via a mutation) and
   * surfaces any failure — otherwise a rejected promise from an onClick just
   * disappears and the button looks like it did nothing.
   */
  const guarded = (what: string, run: () => Promise<void>) => () => {
    run().catch(showError(what));
  };

  const undoBuy = async () => {
    const entry = undoBuyStack.current.pop();
    setUndoBuyCount(undoBuyStack.current.length);
    if (!entry) return;
    // back to its original position: the row gets the sortOrder of its saved index
    // and the rows after it move down
    await Promise.all([
      api.invoicing.invoicingAddBuyingCost(shipment.id, { ...entry.values, sortOrder: entry.index }),
      ...buyRows.flatMap((r, i) => i >= entry.index
        ? [api.invoicing.invoicingUpdateBuyingCost(shipment.id, r.id, { sortOrder: i + 1 })]
        : []),
    ]);
    invalidate();
  };

  const removeSell = (row: SellingRow, index: number) => {
    if (sellRowFilled(row)) {
      undoSellStack.current.push({ index, values: undoValues(row) });
      setUndoSellCount(undoSellStack.current.length);
    }
    deleteSell.mutate(row.id);
  };

  const undoSell = async () => {
    const entry = undoSellStack.current.pop();
    setUndoSellCount(undoSellStack.current.length);
    if (!entry) return;
    await Promise.all([
      api.invoicing.invoicingAddSellingCost(shipment.id, { ...entry.values, sortOrder: entry.index }),
      ...sellRows.flatMap((r, i) => i >= entry.index
        ? [api.invoicing.invoicingUpdateSellingCost(shipment.id, r.id, { sortOrder: i + 1 })]
        : []),
    ]);
    invalidate();
  };

  /* ── Duplicate a row ──
     Invoice number and Received are not copied: they belong to one particular invoice.
     A selling copy does not keep the link to its source row: it is a new, independent row. */
  const duplicateBuy = async (r: BuyingRow, index: number) => {
    await api.invoicing.invoicingAddBuyingCost(shipment.id, {
      category: r.category, description: r.description, vendor: r.vendor,
      estQty: r.estQty, estAmount: r.estAmount, estCurrency: r.estCurrency,
      realQty: r.realQty, realAmount: r.realAmount, realCurrency: r.realCurrency,
      sortOrder: index + 1,
    });
    await Promise.all(buyRows.flatMap((row, i) => i > index
      ? [api.invoicing.invoicingUpdateBuyingCost(shipment.id, row.id, { sortOrder: i + 1 })]
      : []));
    invalidate();
  };

  const duplicateSell = async (r: SellingRow, index: number) => {
    await api.invoicing.invoicingAddSellingCost(shipment.id, {
      category: r.category, description: r.description, customer: r.customer,
      qty: r.qty, amount: r.amount, currency: r.currency, invoice: r.invoice,
      sortOrder: index + 1,
    });
    await Promise.all(sellRows.flatMap((row, i) => i > index
      ? [api.invoicing.invoicingUpdateSellingCost(shipment.id, row.id, { sortOrder: i + 1 })]
      : []));
    invalidate();
  };

  /* ── A currency change on Estimated is mirrored to Real while Real is empty ── */
  const changeEstCurrency = (r: BuyingRow, currency: string) => {
    const mirror = !num(r.realAmount);
    updateBuy.mutate({ id: r.id, estCurrency: currency, ...(mirror ? { realCurrency: currency } : {}) });
  };

  /* ── Received follows the invoice number being filled in; it can't be ticked by hand ── */
  const changeInvoiceNumber = (r: BuyingRow, value: string) => {
    if (value === r.invoiceNumber) return;
    updateBuy.mutate({ id: r.id, invoiceNumber: value, received: !!value.trim() });
  };

  /* ── Copy from buying ──
     Always copies Estimated (Qty × Est. Amount in the estimated currency) — Real is never
     used. Rows copied before are skipped (linked by sourceBuyId). */
  const copyFromBuying = async () => {
    const already = new Set(sellRows.map((r) => r.sourceBuyId).filter(Boolean));
    const rows = buyRows.filter((r) => !already.has(r.id) && !truckingRefs.has(r.id) && (r.category || num(r.estAmount)));
    if (!rows.length) {
      message.info(already.size ? "All buying rows are already copied" : "No buying costs to copy");
      return;
    }
    // A single empty row is dropped when copying, so it isn't left over as an extra.
    const onlyEmpty =
      sellRows.length === 1 && !sellRowFilled(sellRows[0]!) ? sellRows[0]! : null;

    const baseOrder = onlyEmpty ? 0 : sellRows.length;
    await Promise.all([
      ...rows.map((r, i) =>
        api.invoicing.invoicingAddSellingCost(shipment.id, {
          category: r.category,
          description: r.description,
          qty: r.estQty || "1",
          amount: r.estAmount || "",
          currency: r.estCurrency,
          sourceBuyId: r.id,
          sortOrder: baseOrder + i,
        })),
      ...(onlyEmpty ? [api.invoicing.invoicingDeleteSellingCost(shipment.id, onlyEmpty.id)] : []),
    ]);
    invalidate();
    message.success(`Copied ${rows.length} row(s) from buying`);
  };

  /* ── Copy from quote (mockup: openQuoteModal / doQuoteImport) ──
     The reference is typed in a dialog. The quote a shipment was sold from is the one in its
     Sales Number, so the dialog starts with that. */
  const openQuoteModal = (target: "buy" | "sell") => {
    const salesNumber = (shipment.salesNumber ?? "").trim();
    if (isSalesQuoteRef(salesNumber)) setQuoteInput(salesNumber);
    setQuoteErr("");
    setQuoteAgain(false);
    setQuoteModal(target);
  };

  // The server copies the lines of the quote as it is stored - one row per line, each in its own
  // currency - to the side of the card the dialog was opened from.
  const importQuoteCosts = async () => {
    const target = quoteModal;
    if (!target) return;
    // The whole reference, variant suffix included: QCZ...-2 is another quote than QCZ...
    const quoteNumber = quoteInput.trim();
    if (!quoteNumber) { setQuoteErr("Enter the quotation reference."); return; }

    setQuoteLoading(true);
    setQuoteErr("");
    try {
      const copied = await api.invoicing.invoicingImportQuote(shipment.id, { quoteNumber, target, force: quoteAgain || undefined });
      const rows = target === "buy" ? copied.buying : copied.selling;
      const side = target === "buy" ? "buying" : "selling";
      invalidate();
      if (rows) message.success(`Copied ${rows} ${side} cost line${rows === 1 ? "" : "s"} from ${quoteNumber}`);
      else message.info(`${quoteNumber} has no ${side} cost lines`);
      setQuoteModal(null);
    } catch (err) {
      // A quote is copied to a side once. Copying it again has to be asked for: the dialog stays,
      // says so, and its next try is that request.
      if (isAPIError(err) && err.code === ErrCode.FailedPrecondition) setQuoteAgain(true);
      // The server's own sentence: it names the reference that was not found or already copied.
      const reason = apiErrorMessage(err);
      setQuoteErr(`${reason.charAt(0).toUpperCase()}${reason.slice(1)}.`);
    }
    setQuoteLoading(false);
  };

  /** Currencies on a row (plus the billing currency) that ČNB has no rate for. */
  const missingFor = (...currencies: string[]) =>
    [...new Set([...currencies, billingCur].filter((c) => c && c !== "CZK" && !rates[c]))].join(", ");

  /** A row's total in the billing currency, or a dash that says which rate is missing. */
  const rowTotal = (total: number | null | undefined, ...currencies: string[]) =>
    total == null ? (
      <Tooltip title={`No exchange rate for ${missingFor(...currencies)} — this row is left out of the totals`}>
        <span className="text-warn cursor-help">—</span>
      </Tooltip>
    ) : (
      money(total)
    );
  const buyRowTotal = (r: BuyingRow) => rowTotal(t.buyRowTotals[r.id], r.estCurrency, r.realCurrency);
  const sellRowTotal = (r: SellingRow) => rowTotal(t.sellRowTotals[r.id], r.currency);

  // No blocking screen: the cards always render. Until the data arrives the tables are
  // empty and a thin progress bar runs at the top.


  return (
    <div>
      {/* ═══════════ 1. BUYING COSTS ═══════════ */}
      <SectionCard
        title="Buying costs"
        tone="buy"
        actions={
          <>
            <HeadBtn onClick={guarded("Could not restore the row", undoBuy)} disabled={!undoBuyCount} title="Undo the last deleted cost" ariaLabel="Undo the last deleted buying cost">
              <UndoOutlined />
            </HeadBtn>
            <HeadBtn onClick={() => openQuoteModal("buy")}>
              Copy from quote
            </HeadBtn>
            <HeadBtn onClick={() => addBuy.mutate()}>Add buying cost</HeadBtn>
          </>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1240px] border-separate border-spacing-0">
            <thead>
              {/* grouped Estimated / Real header */}
              <tr>
                <th colSpan={3} className="border-b border-slate-200" />
                <th colSpan={3} className={`${TH} text-center bg-accent-faint text-accent-strong`}>
                  Estimated buying costs
                </th>
                <th colSpan={5} className={`${TH} ${SPLIT} text-center bg-warn-faint text-warn`}>
                  Real buying costs
                </th>
                <th colSpan={2} className="border-b border-slate-200" />
              </tr>
              <tr>
                <th className={`${TH} text-left w-[13%]`}>Category</th>
                <th className={`${TH} text-left w-[12%]`}>Description</th>
                <th className={`${TH} text-left w-[8%]`}>Vendor</th>
                <th className={`${TH} text-center w-[4%]`}>Qty</th>
                <th className={`${TH} text-right w-[8%]`}>Est. Amount</th>
                <th className={`${TH} text-left w-[6%]`}>Cur</th>
                <th className={`${TH} ${SPLIT} text-center w-[4%]`}>Qty</th>
                <th className={`${TH} text-right w-[8%]`}>Real Cost</th>
                <th className={`${TH} text-left w-[6%]`}>Cur</th>
                <th className={`${TH} text-left w-[8%]`}>Invoice number</th>
                <th className={`${TH} text-center w-[5%]`} title="Supplier invoice received">Received</th>
                <th className={`${TH} text-right w-[10%]`}>Total in {billingCur}</th>
                <th className={`${TH} w-[70px]`} />
              </tr>
            </thead>
            <tbody>
              {buyRows.map((r, rowIndex) => {
                const truckingTag = truckingTagOf(r.id);
                if (truckingTag) {
                  return (
                    <tr key={r.id} className="bg-indigo-50/40">
                      <td className={CELL}><span className={READ}>{r.category ? chargeLabel(r.category) : "—"}</span></td>
                      <td className={CELL}>
                        <span className={READ}>{r.description}</span>
                        <TruckingCostTagLink tag={truckingTag} />
                      </td>
                      <td className={CELL}><span className={READ}>{r.vendor}</span></td>
                      <td className={CELL}><span className={`${READ} text-center`}>{r.estQty}</span></td>
                      <td className={CELL}><span className={`${READ} text-right tabular-nums`}>{r.estAmount}</span></td>
                      <td className={CELL}><span className={READ}>{r.estCurrency}</span></td>
                      <td className={`${CELL} ${SPLIT}`}><span className={`${READ} text-center`}>{r.realQty}</span></td>
                      <td className={`${CELL} ${t.buyRowOver[r.id] ? "bg-danger-soft" : t.buyRowUnder[r.id] ? "bg-ok-soft" : ""}`}>
                        <span className={`${READ} text-right tabular-nums`}>{r.realAmount}</span>
                      </td>
                      <td className={CELL}><span className={READ}>{r.realCurrency}</span></td>
                      <td className={CELL}><span className={READ}>{r.invoiceNumber}</span></td>
                      <td className={`${CELL} text-center`}>
                        <Checkbox checked={r.received} disabled aria-label="Supplier invoice received" />
                      </td>
                      <td className={`${CELL} text-right text-[13px] font-semibold tabular-nums text-slate-800`}>{buyRowTotal(r)}</td>
                      <td className={CELL} />
                    </tr>
                  );
                }
                const locked = buyLocked(r);
                const fld = lockedField(locked);
                return (
                <tr
                  key={r.id}
                  className={`hover:bg-slate-50/60 ${locked ? "cursor-pointer" : ""}`}
                  onDoubleClick={() => unlock(r.id)}
                  onKeyDown={(e) => { if (e.key === "Enter") { (e.target as HTMLElement).blur(); lock(r.id); } }}
                >
                  <td className={CELL}>
                    <Select
                      value={r.category || undefined}
                      placeholder="—"
                      variant="borderless"
                      className={`w-full [&_.ant-select-selector]:!h-[30px] [&_.ant-select-selector]:!border
                                 [&_.ant-select-selector]:!border-slate-200 [&_.ant-select-selector]:!rounded-md
                                 [&_.ant-select-selection-item]:!text-[13px]${
                        locked ? " [&_.ant-select-selector]:!border-transparent [&_.ant-select-arrow]:!hidden pointer-events-none" : ""
                      }`}
                      options={chargeOptions(r.category)}
                      onChange={(v) => updateBuy.mutate({ id: r.id, category: v })}
                    />
                  </td>
                  <td className={CELL}>
                    <input
                      className={`${FIELD}${fld}`}
                      defaultValue={r.description}
                      onBlur={(e) => e.target.value !== r.description && updateBuy.mutate({ id: r.id, description: e.target.value })}
                    />
                  </td>
                  <td className={CELL}>
                    <input
                      className={`${FIELD}${fld}`}
                      defaultValue={r.vendor}
                      onBlur={(e) => e.target.value !== r.vendor && updateBuy.mutate({ id: r.id, vendor: e.target.value })}
                    />
                  </td>
                  {/* Estimated */}
                  <td className={CELL}>
                    <input
                      className={`${FIELD} text-center${fld}`}
                      defaultValue={r.estQty}
                      onBlur={(e) => e.target.value !== r.estQty && updateBuy.mutate({ id: r.id, estQty: e.target.value })}
                    />
                  </td>
                  <td className={CELL}>
                    <input
                      className={`${FIELD} text-right${fld}`}
                      defaultValue={r.estAmount}
                      onBlur={(e) => e.target.value !== r.estAmount && updateBuy.mutate({ id: r.id, estAmount: e.target.value })}
                    />
                  </td>
                  <td className={CELL}>
                    <CurrencyPicker value={r.estCurrency} onChange={(v) => changeEstCurrency(r, v)} />
                  </td>
                  {/* Real */}
                  <td className={`${CELL} ${SPLIT}`}>
                    <input
                      className={`${FIELD} text-center${fld}`}
                      defaultValue={r.realQty}
                      onBlur={(e) => e.target.value !== r.realQty && updateBuy.mutate({ id: r.id, realQty: e.target.value })}
                    />
                  </td>
                  <td
                    className={`${CELL} ${
                      t.buyRowOver[r.id] ? "bg-danger-soft" : t.buyRowUnder[r.id] ? "bg-ok-soft" : ""
                    }`}
                    title={
                      t.buyRowOver[r.id] ? "Real Cost is higher than Estimated"
                        : t.buyRowUnder[r.id] ? "Real Cost is lower than Estimated" : undefined
                    }
                  >
                    <input
                      className={`${FIELD} text-right${fld} ${t.buyRowUnder[r.id] ? "!text-ok font-bold" : ""}`}
                      defaultValue={r.realAmount}
                      onBlur={(e) => e.target.value !== r.realAmount && updateBuy.mutate({ id: r.id, realAmount: e.target.value })}
                    />
                  </td>
                  <td className={CELL}>
                    <CurrencyPicker value={r.realCurrency} onChange={(v) => updateBuy.mutate({ id: r.id, realCurrency: v })} />
                  </td>
                  <td className={CELL}>
                    <input
                      className={`${FIELD}${fld}`}
                      defaultValue={r.invoiceNumber}
                      onBlur={(e) => changeInvoiceNumber(r, e.target.value)}
                    />
                  </td>
                  <td className={`${CELL} text-center`}>
                    <Tooltip title="Received is ticked automatically once the invoice number is filled in">
                      <span>
                        <Checkbox checked={r.received} disabled tabIndex={-1} />
                      </span>
                    </Tooltip>
                  </td>
                  <td className={`${CELL} text-right text-[13px] font-semibold tabular-nums text-slate-800`}>{buyRowTotal(r)}</td>
                  <td className={`${CELL} text-center whitespace-nowrap`}>
                    <Tooltip title="Duplicate row">
                      <button
                        onClick={guarded("Could not duplicate the row", () => duplicateBuy(r, rowIndex))}
                        aria-label="Duplicate buying cost row"
                        className="w-[26px] h-[26px] rounded-md grid place-items-center text-slate-400
                                   hover:bg-accent-soft hover:text-accent border-0 bg-transparent cursor-pointer inline-grid"
                      >
                        <CopyOutlined />
                      </button>
                    </Tooltip>
                    <Tooltip title="Delete row">
                      <button
                        onClick={() => removeBuy(r, rowIndex)}
                        aria-label="Delete buying cost row"
                        className="w-[26px] h-[26px] rounded-md grid place-items-center text-slate-400
                                   hover:bg-danger-soft hover:text-danger border-0 bg-transparent cursor-pointer inline-grid"
                      >
                        <DeleteOutlined />
                      </button>
                    </Tooltip>
                  </td>
                </tr>
                );
              })}
              {!buyRows.length && (
                <tr>
                  <td colSpan={13} className="px-4 py-8 text-center">
                    <button
                      onClick={() => addBuy.mutate()}
                      disabled={addBuy.isPending}
                      className="text-[13px] text-indigo-600 font-semibold border-0 bg-transparent
                                 cursor-pointer hover:underline disabled:opacity-50"
                    >
                      No buying costs yet — add the first one
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
            {/* totals: under Est. Amount and Real Cost, the currency always under the Cur column */}
            <tfoot>
              <tr className="bg-slate-50 font-bold">
                <td className="px-[6px] py-2 text-[12px] uppercase tracking-wide text-slate-500" colSpan={4}>
                  Total buying
                </td>
                <td className="px-[6px] py-2 text-right text-[13px] tabular-nums text-slate-900">
                  {money(t.estTotal)}
                </td>
                <td className="px-[6px] py-2 text-[12px] text-slate-500">{billingCur}</td>
                <td className={SPLIT} />
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
            <HeadBtn onClick={guarded("Could not restore the row", undoSell)} disabled={!undoSellCount} title="Undo the last deleted cost" ariaLabel="Undo the last deleted selling cost">
              <UndoOutlined />
            </HeadBtn>
            <HeadBtn onClick={() => openQuoteModal("sell")}>
              Copy from quote
            </HeadBtn>
            <HeadBtn onClick={guarded("Could not copy from buying", copyFromBuying)}>Copy from buying</HeadBtn>
            <HeadBtn onClick={() => addSell.mutate({})}>Add selling cost</HeadBtn>
          </>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={`${TH} text-left w-[185px]`}>Category</th>
                <th className={`${TH} text-left w-[16%]`}>Description</th>
                {/* the "customer" field holds the line text printed on the invoice */}
                <th className={`${TH} text-left w-[16%]`} title="Printed on the invoice line; when empty, the category is printed">Invoice text</th>
                <th className={`${TH} text-center w-[7%]`}>Qty</th>
                <th className={`${TH} text-right w-[11%]`}>Amount</th>
                <th className={`${TH} text-left w-[8%]`}>Cur</th>
                <th className={`${TH} text-right w-[13%]`}>Total in {billingCur}</th>
                <th className={`${TH} text-center w-[6%]`} title="Include in the billing calculation sheet">Invoice</th>
                <th className={`${TH} w-[70px]`} />
              </tr>
            </thead>
            <tbody>
              {sellRows.map((r, rowIndex) => {
                const truckingTag = truckingTagOf(r.id);
                if (truckingTag) {
                  return (
                    <tr key={r.id} className="bg-indigo-50/40">
                      <td className={CELL}><span className={READ}>{r.category ? chargeLabel(r.category) : "—"}</span></td>
                      <td className={CELL}>
                        <span className={READ}>{r.description}</span>
                        <TruckingCostTagLink tag={truckingTag} />
                      </td>
                      <td className={CELL}><span className={READ}>{r.customer}</span></td>
                      <td className={CELL}><span className={`${READ} text-center`}>{r.qty}</span></td>
                      <td className={CELL}><span className={`${READ} text-right tabular-nums`}>{r.amount}</span></td>
                      <td className={CELL}><span className={READ}>{r.currency}</span></td>
                      <td className={`${CELL} text-right text-[13px] font-semibold tabular-nums ${r.invoice ? "text-slate-800" : "text-slate-400 line-through"}`}>{sellRowTotal(r)}</td>
                      <td className={`${CELL} text-center`}>
                        <Checkbox checked={r.invoice} disabled aria-label="Include in the invoice" />
                      </td>
                      <td className={CELL} />
                    </tr>
                  );
                }
                const locked = sellLocked(r);
                const fld = lockedField(locked);
                return (
                <tr
                  key={r.id}
                  className={`hover:bg-slate-50/60 ${locked ? "cursor-pointer" : ""}`}
                  onDoubleClick={() => unlock(r.id)}
                  onKeyDown={(e) => { if (e.key === "Enter") { (e.target as HTMLElement).blur(); lock(r.id); } }}
                >
                  <td className={CELL}>
                    <Select
                      value={r.category || undefined}
                      placeholder="—"
                      variant="borderless"
                      className={`w-full [&_.ant-select-selector]:!h-[30px] [&_.ant-select-selector]:!border
                                 [&_.ant-select-selector]:!border-slate-200 [&_.ant-select-selector]:!rounded-md
                                 [&_.ant-select-selection-item]:!text-[13px]${
                        locked ? " [&_.ant-select-selector]:!border-transparent [&_.ant-select-arrow]:!hidden pointer-events-none" : ""
                      }`}
                      options={chargeOptions(r.category)}
                      onChange={(v) => updateSell.mutate({ id: r.id, category: v })}
                    />
                  </td>
                  <td className={CELL}>
                    <input
                      className={`${FIELD}${fld}`}
                      defaultValue={r.description}
                      onBlur={(e) => e.target.value !== r.description && updateSell.mutate({ id: r.id, description: e.target.value })}
                    />
                  </td>
                  <td className={CELL}>
                    <input
                      className={`${FIELD}${fld}`}
                      defaultValue={r.customer}
                      placeholder={r.category ? `On the invoice: ${chargeLabel(r.category)}` : "Text on the invoice"}
                      maxLength={200}
                      aria-label="Invoice text"
                      onBlur={(e) => e.target.value !== r.customer && updateSell.mutate({ id: r.id, customer: e.target.value })}
                    />
                  </td>
                  <td className={CELL}>
                    <input
                      className={`${FIELD} text-center${fld}`}
                      defaultValue={r.qty}
                      onBlur={(e) => e.target.value !== r.qty && updateSell.mutate({ id: r.id, qty: e.target.value })}
                    />
                  </td>
                  <td className={CELL}>
                    <input
                      className={`${FIELD} text-right${fld}`}
                      defaultValue={r.amount}
                      onBlur={(e) => e.target.value !== r.amount && updateSell.mutate({ id: r.id, amount: e.target.value })}
                    />
                  </td>
                  <td className={CELL}>
                    <CurrencyPicker value={r.currency} onChange={(v) => updateSell.mutate({ id: r.id, currency: v })} />
                  </td>
                  <td className={`${CELL} text-right text-[13px] font-semibold tabular-nums ${r.invoice ? "text-slate-800" : "text-slate-400 line-through"}`}>{sellRowTotal(r)}</td>
                  <td className={`${CELL} text-center`}>
                    <Checkbox
                      checked={r.invoice}
                      onChange={(e) => updateSell.mutate({ id: r.id, invoice: e.target.checked })}
                    />
                  </td>
                  <td className={`${CELL} text-center whitespace-nowrap`}>
                    <Tooltip title="Duplicate row">
                      <button
                        onClick={guarded("Could not duplicate the row", () => duplicateSell(r, rowIndex))}
                        aria-label="Duplicate selling cost row"
                        className="w-[26px] h-[26px] rounded-md grid place-items-center text-slate-400
                                   hover:bg-accent-soft hover:text-accent border-0 bg-transparent cursor-pointer inline-grid"
                      >
                        <CopyOutlined />
                      </button>
                    </Tooltip>
                    <Tooltip title="Delete row">
                      <button
                        onClick={() => removeSell(r, rowIndex)}
                        aria-label="Delete selling cost row"
                        className="w-[26px] h-[26px] rounded-md grid place-items-center text-slate-400
                                   hover:bg-danger-soft hover:text-danger border-0 bg-transparent cursor-pointer inline-grid"
                      >
                        <DeleteOutlined />
                      </button>
                    </Tooltip>
                  </td>
                </tr>
                );
              })}
              {!sellRows.length && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center">
                    <button
                      onClick={() => addSell.mutate({})}
                      disabled={addSell.isPending}
                      className="text-[13px] text-emerald-700 font-semibold border-0 bg-transparent
                                 cursor-pointer hover:underline disabled:opacity-50"
                    >
                      No selling costs yet — add the first one
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-bold">
                <td className="px-[6px] py-2 text-[12px] uppercase tracking-wide text-slate-500" colSpan={6}>
                  Total selling
                  {/* Only rows ticked for invoicing count towards the total and the profit. */}
                  {t.sellNotInvoicedCount > 0 && (
                    <span className="ml-2 font-medium normal-case tracking-normal text-[12px] text-slate-400">
                      ({t.sellNotInvoicedCount} row{t.sellNotInvoicedCount === 1 ? "" : "s"} not
                      ticked for Invoice — {money(t.sellNotInvoicedTotal)} {billingCur} excluded)
                    </span>
                  )}
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

      {/* ═══════════ 3. RATES ═══════════
          The ČNB rate of the job's tax date: ATA for imports, ATD for exports; provisional by
          ETA / ETD until then. The server (fx service) picks it; this only shows it. */}
      <div className="flex items-center gap-4 flex-wrap bg-white border border-slate-200 rounded-xl px-4 py-3 mb-4">
        <span className="text-[12px] font-bold tracking-[.06em] uppercase text-slate-500">
          ČNB rate
        </span>

        {/* three rates side by side: EUR / CZK / USD */}
        <div className="flex items-center gap-2">
          {([
            ["EUR", rates.EUR],
            ["CZK", 1],
            ["USD", rates.USD],
          ] as [string, number | undefined][]).map(([code, value]) => (
            <span
              key={code}
              className="inline-flex items-center gap-2 border border-slate-200 rounded-md px-3 h-8 bg-white"
            >
              <span className="text-[12px] font-bold text-slate-500">{code}</span>
              <span className="text-[13px] font-semibold text-slate-900 tabular-nums">
                {value ? value.toFixed(3) : "—"}
              </span>
            </span>
          ))}
        </div>

        {/* state: locked at ATA / ATD, or provisional */}
        {fx && (
          fx.ratesMissing ? (
            <Tooltip title="The ČNB fixing of the job's tax date should be stored but isn't (the import failed). The job can't lock until it is imported.">
              <span className="text-[12px] font-semibold text-danger bg-danger-soft border border-danger rounded-md px-2 py-0.5">
                Rate missing
              </span>
            </Tooltip>
          ) : fx.status === "locked" ? (
            <Tooltip title={`Locked ${formatDateTime(fx.lockedAt)}${fx.previousRateDate ? ` · re-locked from ${formatDate(fx.previousRateDate)} after ${fx.basis.toUpperCase()} changed` : ""}`}>
              <span className="text-[12px] font-semibold text-slate-700 bg-slate-100 border border-slate-300 rounded-md px-2 py-0.5">
                Locked
              </span>
            </Tooltip>
          ) : (
            <span className="text-[12px] font-semibold text-warn bg-warn-soft border border-warn rounded-md px-2 py-0.5">
              Provisional
            </span>
          )
        )}

        {/* where the rate comes from */}
        <span className="text-[12.5px] text-slate-500">
          {ratesLoading ? (
            "Loading rates…"
          ) : ratesError || !fx ? (
            <span className="text-warn font-semibold">Could not load the ČNB rates</span>
          ) : fx.ratesMissing ? (
            <span className="text-danger font-semibold">
              ČNB rate for {formatDate(fx.rateDate)} not imported — <Link href="/exchange" className="underline">sync it in Exchange</Link>
            </span>
          ) : fx.rates.length === 0 ? (
            <span className="text-warn font-semibold">
              No ČNB rates stored — <Link href="/exchange" className="underline">check Exchange</Link>
            </span>
          ) : fx.status === "locked" ? (
            <>ČNB {formatDate(fx.rates.find((r) => r.currency === "EUR")?.fixingDate ?? fx.rateDate)} · by {fx.basis.toUpperCase()} {formatDate(fx.rateDate)}</>
          ) : fx.basis === "today" ? (
            <span className="text-warn font-semibold">
              No {fx.direction === "export" ? "ETD / ATD" : "ETA / ATA"} date — using today&apos;s rate
            </span>
          ) : (
            <>
              ČNB {formatDate(fx.rates.find((r) => r.currency === "EUR")?.fixingDate ?? fx.rateDate)} · by {fx.basis.toUpperCase()} {formatDate(fx.rateDate)}
              {" "}· locks at {fx.direction === "export" ? "ATD" : "ATA"}
            </>
          )}
          {fx?.directionAssumed && <span className="text-slate-400"> · no trade direction, treated as import</span>}
        </span>
      </div>

      {/* Rows in a currency the rate sheet does not cover are left out of every
          total — say so rather than letting the numbers look complete. */}
      {t.missingCurrencies.length > 0 && (
        <div className="flex items-start gap-2 bg-warn-soft border border-warn rounded-xl px-4 py-3 mb-4">
          <WarningOutlined className="text-warn mt-[2px]" />
          <span className="text-[12.5px] text-warn-ink">
            <strong>ČNB publishes no rate for {t.missingCurrencies.join(", ")}.</strong>{" "}
            {t.unconvertibleRowCount} row{t.unconvertibleRowCount === 1 ? " is" : "s are"} left out of
            the totals below.
          </span>
        </div>
      )}

      {/* ═══════════ 4. REPORT ═══════════ */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <button
          onClick={() => setReportOpen((v) => !v)}
          title="Show / hide report"
          className="w-full h-[38px] px-4 flex items-center gap-3 bg-ink text-white
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
                      : x.profit ? (t.profitCZK >= 0 ? "text-green-400" : "text-red-400")
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
            <table className="w-full max-w-[720px] border-separate border-spacing-0">
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
                    {/* A missing rate must never be substituted with 1 — that would
                        reprint the CZK figure verbatim under a USD/EUR heading. */}
                    {[row.czk, rates.USD ? row.czk / rates.USD : null, rates.EUR ? row.czk / rates.EUR : null].map((v, i) => (
                      <td
                        key={i}
                        className={`px-[15px] py-[10px] text-right text-[13px] tabular-nums border-b border-slate-100 whitespace-nowrap ${
                          !t.hasAny || v === null ? "text-slate-300"
                            : row.signed ? (t.profitCZK >= 0 ? "text-ok font-bold" : "text-danger font-bold")
                              : "text-slate-900"
                        }`}
                      >
                        {t.hasAny && v !== null ? (row.signed ? signed(v) : money(v)) : "—"}
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
                <Tooltip title="Difference Real − Estimated on buying costs. A negative value means a saving against the estimate.">
                  <span
                    className={`text-[13px] font-bold tabular-nums ${
                      !t.hasRxe ? "text-slate-300"
                        : t.rxeTotal > 0.001 ? "text-danger"
                          : t.rxeTotal < -0.001 ? "text-ok" : "text-slate-400"
                    }`}
                  >
                    {t.hasRxe ? `${signed(t.rxeTotal)} ${billingCur}` : "—"}
                  </span>
                </Tooltip>
              </div>

              {t.rxeRows.length > 0 && (
                <table className="w-full max-w-[720px] border-separate border-spacing-0">
                  <thead>
                    <tr>
                      <th className={`${TH} text-left`}>Category</th>
                      <th className={`${TH} text-left`}>Vendor</th>
                      <th className={`${TH} text-right`}>R x E</th>
                      <th className={`${TH} text-right`}>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.rxeRows.map((x) => (
                      <tr key={x.id}>
                        <td className="px-[15px] py-[8px] text-[13px] text-slate-700 border-b border-slate-100">{x.cat}</td>
                        <td className="px-[15px] py-[8px] text-[13px] text-slate-500 border-b border-slate-100">
                          {x.vendor || "—"}
                        </td>
                        <td
                          className={`px-[15px] py-[8px] text-right text-[13px] font-semibold tabular-nums border-b border-slate-100 ${
                            x.delta > 0.001 ? "text-danger" : x.delta < -0.001 ? "text-ok" : "text-slate-400"
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

      {/* the Copy from quote dialog */}
      <Modal
        open={quoteModal !== null}
        onCancel={() => { setQuoteModal(null); setQuoteErr(""); }}
        onOk={importQuoteCosts}
        okText={quoteAgain ? "Copy again" : "Import"}
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
          onChange={(e) => { setQuoteInput(e.target.value); setQuoteErr(""); setQuoteAgain(false); }}
          onPressEnter={importQuoteCosts}
          className="font-mono tracking-[.03em]"
        />
        <div className={`${quoteAgain ? "text-warn" : "text-danger"} text-[12.5px] font-semibold min-h-[17px] mt-[7px]`}>
          {quoteErr}
          {quoteAgain && " Copy again?"}
        </div>
      </Modal>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { CURRENCIES } from "@/lib/cargo";
import Link from "next/link";
import { App, Input, Select, Checkbox, Tooltip, Modal, Popover } from "antd";
import { CloseOutlined, DeleteOutlined, FileDoneOutlined, PlusOutlined, RollbackOutlined, SendOutlined, DownOutlined, CopyOutlined, WarningOutlined, LockOutlined } from "@ant-design/icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage, ErrCode, isAPIError } from "@/lib/api";
import type { controllers } from "@/lib/api/client";
import type { ShipmentItem } from "@/hooks/useShipments";
import { businessDayOf, formatDate, formatDateTime } from "@/lib/date";
import { amountTypingAllowed, normaliseAmount } from "@/lib/money";
import { asData, computeTotals, isSalesQuoteRef, quoteProfitIn } from "@/app/sales/_lib/salesQuote";
import { useSalesQuoteByRef } from "@/hooks/useSalesQuote";
import { INVOICE_KEYS } from "@/hooks/useInvoiceQueue";
import { openInvoicePdf, useInvoiceDocList, type InvoiceDoc } from "@/hooks/useInvoiceDocs";
import { isOpenInvoice } from "@/app/invoicing/_lib/openInvoices";
import { chargeLabel, chargeOptions } from "@/lib/chargeCodes";
import { money, signed, num, type BuyingRow, type SellingRow } from "./costsCalc";
import { useCostsData } from "./useCostsData";
import { useConsignments, useTripRefs } from "@/hooks/useTruckingConsignments";
import { isTruckingCost, parseTruckingRef, truckingCostTag } from "@/lib/truckingCosts";
import { TruckingCostTagLink } from "@/components/TruckingCostTagLink";
import { ProfitVsEstimate } from "@/components/ProfitVsEstimate";
import { useCanSeeConcepts } from "@/lib/auth/AuthContext";
import { SupplierPicker, type SupplierValue } from "@/components/SupplierPicker";
import { CostPaidCell } from "./CostPaidCell";
import { SectionCard } from "@/components/SectionCard";
import { Pill } from "@/components/Pill";
import {
  BTN,
  BTN_PRIMARY,
  BTN_SM,
  CARD,
  EMPTY,
  HINT,
  ICON_BTN_GHOST,
  ICON_BTN_DANGER,
  LABEL_TEXT,
  LINK,
  REF,
  TD,
  TD_TOTAL,
  TH,
} from "@/styles/ui";

interface CurrencyPickerProps {
  value: string;
  onChange: (v: string) => void;
  /** A locked row: the code reads as text, as the row's other fields (a double-click opens the row). */
  locked?: boolean;
}

/** Currency picker, searching by code and name. */
function CurrencyPicker({ value, onChange, locked = false }: CurrencyPickerProps) {
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
      className={`w-full [&_.ant-select-selector]:!h-[30px] [&_.ant-select-selector]:!border
                 [&_.ant-select-selector]:!border-slate-300 [&_.ant-select-selector]:!rounded-md
                 [&_.ant-select-selection-item]:!text-[13px] [&_.ant-select-selection-search-input]:!text-[13px]${
        locked ? " [&_.ant-select-selector]:!border-transparent [&_.ant-select-selector]:!bg-transparent [&_.ant-select-arrow]:!hidden pointer-events-none" : ""
      }`}
      tabIndex={locked ? -1 : undefined}
    />
  );
}

/**
 * A quantity or amount field: a key that would type anything but a number (a digit, "," or ".", a
 * space, a minus in front) types nothing. Shortcuts (copy, paste, select all) and what is pasted are
 * left alone: pasted text goes in as it is, and the save refuses it when it is no amount (cleanAmounts)
 * rather than saving what is left of it once its letters are gone ("2 x 40HC" is not 240).
 */
function onlyNumbers(e: React.KeyboardEvent<HTMLInputElement>) {
  // Ctrl / Cmd shortcuts pass; AltGr (Ctrl + Alt on Windows) and Option types a character, judged below
  if (e.key.length !== 1 || e.metaKey || (e.ctrlKey && !e.altKey) || e.nativeEvent.isComposing) return;
  const el = e.currentTarget;
  if (el.readOnly) return;
  const start = el.selectionStart ?? el.value.length;
  if (!amountTypingAllowed(e.key, el.value, start, el.selectionEnd ?? start)) e.preventDefault();
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

/* ── shared classes (field height 30px, cell padding 6px) ──
   The cost tables keep their own padding (6px): a class of styles/ui.ts that sets padding gets it
   with "!", as Tailwind sorts the classes, not the order they are written in. */
const CELL = "px-[6px] py-[6px] border-b border-slate-100 align-middle";
/** Splits estimated from real buying costs: a thick line down the whole table. */
const SPLIT = "border-l-[3px] border-l-slate-900";
const FIELD =
  "w-full h-[30px] px-2 text-[13px] text-slate-900 border border-slate-300 rounded-md outline-none " +
  "focus:border-indigo-500 bg-white";
/** A read-only row's value (Trucking, invoiced): plain text, readable by screen readers, as tall
 *  as a field, its text where a field's is (an input's 8px padding + 1px border). */
const READ = "block min-h-[30px] px-[9px] py-[5px] text-[13px] text-slate-900";
/** The same in a Select's column (category, currency): its text sits 12px in (11px + 1px border). */
const READ_SELECT = "block min-h-[30px] px-3 py-[5px] text-[13px] text-slate-900";
/** The note under an invoice text that is the row's own (set in Issue invoice), lined up with READ's text. */
const OWN_TEXT_HINT = `${HINT} block px-[9px] pb-[3px] leading-4`;

/**
 * What a selling row prints on its invoice line, as the server's invoice calculation has it: its own
 * text (set in Issue invoice, kept in `customer`), else its Description, else its category.
 */
const printedText = (r: SellingRow) =>
  r.customer.trim() || r.description.trim() || (r.category ? chargeLabel(r.category) : "");
/** A column head of the cost tables: the app's (TH) at the tables' padding. */
const HEAD = `${TH} !px-[6px]`;
/** The totals row: its label in small caps, its figures as TD_TOTAL, a currency as a hint. */
const FOOT_LINE = "border-t-2 border-slate-200";
const FOOT_LABEL = `px-[6px] py-2 ${FOOT_LINE} ${LABEL_TEXT}`;
const FOOT = `${TD_TOTAL} !px-[6px] text-right tabular-nums`;
const FOOT_UNIT = `px-[6px] py-2 ${FOOT_LINE} ${HINT}`;
/** A locked row in focus (it is a Tab stop): the focus colour of the app's buttons, as an outline. */
const ROW_FOCUS = "focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-indigo-500";
/** A row's Duplicate / Delete. */
const ROW_BTN = ICON_BTN_GHOST;
const ROW_DELETE_BTN = ICON_BTN_DANGER;
/** "No … costs yet — add the first one": a link-like button. */
const ADD_FIRST_BTN = `${LINK} text-[13px] font-semibold border-0 bg-transparent cursor-pointer disabled:opacity-50`;
/** A report cell: TD with its figure on the right; the colour goes on the figure's own span. */
const REPORT_NUM = `${TD} text-right tabular-nums whitespace-nowrap`;

interface HeadBtnProps {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  /** A fuller name than the words on the button, where two cards have the same words (Undo). */
  ariaLabel?: string;
  /** The card's main action (Add …): purple. */
  primary?: boolean;
  children: React.ReactNode;
}

/**
 * A button in a card's header bar, small and framed so it stands out on the bar: the main action
 * purple, the others white, each with its icon and words (Undo, Copy from …, Add …).
 */
function HeadBtn({
  onClick, disabled, title, ariaLabel, primary, children,
}: HeadBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      className={`${primary ? BTN_PRIMARY : BTN} ${BTN_SM}`}
    >
      {children}
    </button>
  );
}

interface CostsTabProps {
  shipment: ShipmentItem;
  /** Opens the job's Issue invoice (shown as a button beside the ČNB rate when given). */
  onIssueInvoice?: () => void;
}

export function CostsTab({ shipment, onIssueInvoice }: CostsTabProps) {
  const queryClient = useQueryClient();
  // Toasts go through the App context: antd's static `message` shows nothing under React 19.
  const { message, modal } = App.useApp();
  const [quoteInput, setQuoteInput] = useState("");
  const [quoteLoading, setQuoteLoading] = useState(false);
  // the Copy from quote dialog
  const [quoteModal, setQuoteModal] = useState(false);
  const [quoteErr, setQuoteErr] = useState("");
  // The server refused because this quote's lines are on both sides already: the next try says to copy them again.
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
  // A row opened with a double-click stays open while its own fields are clicked; a click
  // anywhere else closes it again (its field being left still saves on blur). The pop-ups of its
  // fields (a Select's list, a date picker, a tooltip) are part of the row; so is a dialog.
  useEffect(() => {
    if (!unlocked.size) return;
    const onDown = (e: PointerEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      if (!el || el.closest(".ant-select-dropdown, .ant-picker-dropdown, .ant-dropdown, .ant-popover, .ant-tooltip, .ant-modal-root, .ant-message")) return;
      const inRow = el.closest("[data-cost-row]")?.getAttribute("data-cost-row");
      setUnlocked((p) => {
        const n = new Set([...p].filter((id) => id === inRow));
        return n.size === p.size ? p : n;
      });
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [unlocked.size]);

  // Rows, rates and totals come from the shared hook, so the Quote card on the detail page
  // shows exactly the same figures as this tab.
  const { data, billingCur, fx, rates, ratesLoading, ratesError, buyRows, sellRows, totals: t } = useCostsData(shipment);
  const canSeeConcepts = useCanSeeConcepts();

  // Rows Trucking writes (a consignment's sell, its trips' buy, …) are kept by Trucking: shown
  // read-only here (plain text, so screen readers and the keyboard reach them), tagged with the
  // consignment or trip they come from and linked to it.
  const truckingRefs = new Map(
    [...(data?.costs ?? []), ...(data?.sellingCosts ?? [])].filter((c) => isTruckingCost(c.sourceTruckingRef)).map((c) => [c.id, c.sourceTruckingRef ?? ""]),
  );
  // Buying rows copied from a quote keep the quote's category, description and estimate, and are
  // not deleted (the server refuses both); the vendor and the real cost stay editable.
  const quoteRefs = new Map((data?.costs ?? []).filter((c) => c.sourceQuoteNumber).map((c) => [c.id, c.sourceQuoteNumber]));
  // Once a quote's lines are in, the estimate is the quote's alone: a line added by hand gets a
  // real cost only, its Estimated cells stay empty and closed (the server refuses an estimate).
  const quotePriced = quoteRefs.size > 0;

  // The quote the Report compares the profit with: the one the costs were last copied from (the
  // shipment's quote reference), else the one its buying lines name, else the one the Sales
  // Reference names. Its profit is the quote's own figure, at its own rates.
  const copiedFrom = (data?.billingSettings?.quoteRef ?? "").trim();
  const shipmentQuote = (shipment.salesNumber ?? "").trim();
  const profitQuoteRef = (isSalesQuoteRef(copiedFrom) ? copiedFrom : null) ?? [...quoteRefs.values()][0] ?? (isSalesQuoteRef(shipmentQuote) ? shipmentQuote : null);
  const profitQuote = useSalesQuoteByRef(profitQuoteRef);
  const profitQuoteData = profitQuote.data?.quote ? asData(profitQuote.data.quote.data) : null;
  // The job's profit against the quote's, in CZK, for the Report's bar.
  const quoteProfitCZK = profitQuoteData ? quoteProfitIn(profitQuoteData, rates, "CZK") : null;
  const vsQuoteCZK = t.hasAny && quoteProfitCZK !== null ? t.profitCZK - quoteProfitCZK : null;
  // Only the trips these rows name are read (a few), not the whole trips list.
  const tripIds = [...new Set([...truckingRefs.values()].flatMap((ref) => {
    const parsed = parseTruckingRef(ref);
    return parsed?.kind === "trip" ? [parsed.id] : [];
  }))];
  // Trucking Concept is for superadmins only: everyone else still sees the rows (they are costs),
  // tagged without a link, and nothing is asked of Trucking.
  const truckingOn = canSeeConcepts;
  const { consignments: jobConsignments } = useConsignments({ shipmentId: shipment.id }, { enabled: truckingOn && truckingRefs.size > 0 });
  const tripRefs = useTripRefs(truckingOn ? tripIds : []);
  // A master job's share of its own costs (Master Jobs → Costs Breakdown) is read-only here too,
  // tagged with the master job and linked to it, where it changes.
  const masterJobRows = new Set((data?.costs ?? []).filter((c) => c.sourceMasterJobRef).map((c) => c.id));
  const masterJobTag = shipment.masterJobId
    ? {
        label: `Split from ${shipment.masterJobMczNumber ?? "the master job"}`,
        href: `/master-jobs?open=${shipment.masterJobId}`,
        title: "This shipment's share of a master job cost - change it in the master job's Costs Breakdown",
      }
    : { label: "Split from a master job", href: null, title: "This shipment's share of a master job cost" };
  // Trucking's rows and a master job's shares are read-only here: a reorder leaves them where they are.
  const ownBuyRow = (r: { id: string }) => !truckingRefs.has(r.id) && !masterJobRows.has(r.id);
  const truckingTagOf = (id: string) =>
    truckingCostTag(truckingRefs.get(id), { consignments: jobConsignments, tripRefs, shipmentId: shipment.id, linkable: truckingOn }) ??
    (masterJobRows.has(id) ? masterJobTag : null);

  // Costs feed the shipment's totals (list rows, the customer's rollups), so those refresh too.
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["shipments"] });
    // …and the Invoicing queue's counts (to bill, lines invoiced)
    queryClient.invalidateQueries({ queryKey: INVOICE_KEYS.queueAll });
    // …and the suppliers' What we owe (received and paid move it), and their Open jobs and last use (a vendor link moves them)
    queryClient.invalidateQueries({ queryKey: ["supplier-costs"] });
    queryClient.invalidateQueries({ queryKey: ["supplier-usage"] });
    return queryClient.invalidateQueries({ queryKey: ["invoicing", shipment.id] });
  };

  /** A failed write must be shown — it used to be swallowed, and the button seemed to do nothing. */
  const showError = (what: string) => (e: unknown) => {
    const detail = e instanceof Error ? e.message : "";
    console.error(`[CostsTab] ${what}`, e);
    message.error(detail ? `${what}: ${detail}` : what);
  };

  /* ── Buying costs ── */
  // a new row: Qty = 1, currencies of the chosen billing currency - on Real only when the
  // shipment's estimate comes from its quote
  const addBuy = useMutation({
    mutationFn: () => api.invoicing.invoicingAddBuyingCost(shipment.id, {
      ...(quotePriced ? {} : { estQty: "1", estCurrency: billingCur }),
      realQty: "1", realCurrency: billingCur,
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
     Several deleted rows are remembered, and each comes back at its ORIGINAL position. A buying row is
     brought back as it was (the server restores it: when its invoice came, its payment and who noted it);
     a selling row is added again from what it held. */
  interface UndoBuyEntry { index: number; id: string }
  interface UndoSellEntry { index: number; values: controllers.AddSellingRequest }
  const undoBuyStack = useRef<UndoBuyEntry[]>([]);
  const undoSellStack = useRef<UndoSellEntry[]>([]);
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
    (!unlocked.has(r.id) || !invoicedKnown) && !!(r.category || num(r.amount));

  // Selling rows on an issued invoice (a credited one frees them): the invoice each is on.
  // Until the list has come, no filled row opens for editing (it may turn out to be invoiced).
  // A list that could not be read does not keep them shut: the card says so, and the rows open,
  // as the server refuses a change to an invoiced row whatever is shown here.
  const { data: invoiceDocs, isError: invoiceDocsFailed } = useInvoiceDocList(shipment.id);
  const invoicedKnown = !!invoiceDocs || invoiceDocsFailed;
  const invoicedBy = new Map<string, InvoiceDoc>();
  for (const doc of invoiceDocs?.invoices ?? []) {
    if (!isOpenInvoice(doc)) continue;
    for (const line of doc.lines) if (line.sourceSellingCostId) invoicedBy.set(line.sourceSellingCostId, doc);
  }

  /** a locked row: fields look like text, a double-click opens them (or Enter on the row; the
   *  fields themselves are read-only and out of the Tab order meanwhile, see `closed`) */
  const lockedField = (locked: boolean) =>
    locked
      ? " !border-transparent !bg-transparent pointer-events-none"
      : "";
  /** What makes a field of a locked row unreachable by the keyboard too: read-only, no Tab stop. */
  const closed = (locked: boolean) => (locked ? { readOnly: true, tabIndex: -1 } : {});
  /** A locked row is one Tab stop: Enter opens it, Enter in one of its fields closes it again. */
  const rowKeys = (id: string, locked: boolean) => ({
    tabIndex: locked ? 0 : undefined,
    onKeyDown: (e: React.KeyboardEvent<HTMLTableRowElement>) => {
      if (e.key !== "Enter") return;
      if (locked) {
        if (e.target !== e.currentTarget) return;
        // opened, the row is no Tab stop any more: the focus goes on to its first field
        const row = e.currentTarget;
        unlock(id);
        window.setTimeout(() => row.querySelector<HTMLElement>('input:not([readonly]):not([disabled]):not([tabindex="-1"])')?.focus(), 0);
        return;
      }
      (e.target as HTMLElement).blur();
      lock(id);
    },
  });

  /**
   * What a selling row is added again from on undo: the fields the request takes (the restored row gets a
   * new id; a null is left out, as the column's default is the same).
   */
  const sellUndoValues = (row: SellingRow): controllers.AddSellingRequest => ({
    category: row.category,
    description: row.description,
    customer: row.customer,
    qty: row.qty,
    amount: row.amount,
    currency: row.currency,
    invoice: row.invoice,
    ...(row.sourceBuyId ? { sourceBuyId: row.sourceBuyId } : {}),
  });

  // Remembered once it is deleted: a row that failed to delete has nothing to bring back.
  const removeBuy = (row: BuyingRow, index: number) => {
    deleteBuy.mutate(row.id, {
      onSuccess: () => {
        if (!buyRowFilled(row)) return;
        undoBuyStack.current.push({ index, id: row.id });
        setUndoBuyCount(undoBuyStack.current.length);
      },
    });
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
      api.invoicing.invoicingRestoreBuyingCost(shipment.id, entry.id, { sortOrder: entry.index }),
      ...buyRows.flatMap((r, i) => i >= entry.index && ownBuyRow(r)
        ? [api.invoicing.invoicingUpdateBuyingCost(shipment.id, r.id, { sortOrder: i + 1 })]
        : []),
    ]);
    invalidate();
  };

  const removeSell = (row: SellingRow, index: number) => {
    if (sellRowFilled(row)) {
      undoSellStack.current.push({ index, values: sellUndoValues(row) });
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
    // the copy is a line added by hand: no estimate of its own once the quote's lines are in
    await api.invoicing.invoicingAddBuyingCost(shipment.id, {
      category: r.category, description: r.description, vendor: r.vendor,
      // the copy names the same supplier: its link goes with it (Council Review 5, R6)
      ...(r.supplierCustomerId ? { supplierCustomerId: r.supplierCustomerId } : {}),
      ...(quotePriced ? {} : { estQty: r.estQty, estAmount: r.estAmount, estCurrency: r.estCurrency }),
      realQty: r.realQty, realAmount: r.realAmount, realCurrency: r.realCurrency,
      sortOrder: index + 1,
    });
    await Promise.all(buyRows.flatMap((row, i) => i > index && ownBuyRow(row)
      ? [api.invoicing.invoicingUpdateBuyingCost(shipment.id, row.id, { sortOrder: i + 1 })]
      : []));
    invalidate();
  };

  // A copy of a row on an issued invoice is a new charge, not one more line of the same: it is not
  // ticked for Invoice (or it would go straight onto the next one) and takes no own text from that
  // invoice - it is printed by its Description until it is given one.
  const duplicateSell = async (r: SellingRow, index: number, invoiced = false) => {
    await api.invoicing.invoicingAddSellingCost(shipment.id, {
      category: r.category, description: r.description,
      ...(invoiced ? { invoice: false } : { customer: r.customer, invoice: r.invoice }),
      qty: r.qty, amount: r.amount, currency: r.currency,
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

  /* ── Received follows the invoice number being filled in; it can't be ticked by hand ──
     Clearing the number of a paid line also takes its payment back: that is asked first (K8). */
  const changeInvoiceNumber = (r: BuyingRow, field: HTMLInputElement) => {
    const value = field.value;
    if (value === r.invoiceNumber) return;
    const save = () => updateBuy.mutate({ id: r.id, invoiceNumber: value, received: !!value.trim() });
    if (value.trim() || !r.paidOn) return save();
    modal.confirm({
      title: "Take back the payment?",
      content: `This cost was noted as paid on ${formatDate(r.paidOn)}. Without an invoice number it is no longer received, so the payment is taken back too.`,
      okText: "Clear number and payment",
      okButtonProps: { danger: true },
      cancelText: "Keep them",
      onOk: save,
      onCancel: () => {
        field.value = r.invoiceNumber;
      },
    });
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
  const openQuoteModal = () => {
    const salesNumber = (shipment.salesNumber ?? "").trim();
    if (isSalesQuoteRef(salesNumber)) setQuoteInput(salesNumber);
    setQuoteErr("");
    setQuoteAgain(false);
    setQuoteModal(true);
  };

  // The server copies the lines of the quote as it is stored - one row per line, each in its own
  // currency - to both sides: its buying lines to buying, its selling lines to selling. A side
  // that holds the quote's lines already is left as it is.
  const importQuoteCosts = async () => {
    // The whole reference, variant suffix included: QCZ...-2 is another quote than QCZ...
    const quoteNumber = quoteInput.trim();
    if (!quoteNumber) { setQuoteErr("Enter the quotation reference."); return; }

    setQuoteLoading(true);
    setQuoteErr("");
    try {
      const copied = await api.invoicing.invoicingImportQuote(shipment.id, { quoteNumber, target: "both", force: quoteAgain || undefined });
      invalidate();
      const counts = [
        copied.buying ? `${copied.buying} buying` : "",
        copied.selling ? `${copied.selling} selling` : "",
      ].filter(Boolean);
      const kept = copied.alreadyCopied?.length ? ` - its ${copied.alreadyCopied.join(" and ")} costs were here already` : "";
      const lines = copied.buying + copied.selling;
      if (lines) message.success(`Copied ${counts.join(" and ")} cost line${lines === 1 ? "" : "s"} from ${quoteNumber}${kept}`);
      else message.info(`${quoteNumber} has no cost lines`);
      setQuoteModal(false);
    } catch (err) {
      // A quote is copied to a side once; with both sides holding it, copying it again has to be
      // asked for: the dialog stays, says so, and its next try is that request. (A quote not Won
      // is refused for good.)
      if (isAPIError(err) && err.code === ErrCode.FailedPrecondition && err.details?.alreadyCopied === true) setQuoteAgain(true);
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
        <span className="text-amber-700 cursor-help">—</span>
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
      <div className="mb-4">
      <SectionCard
        title="Buying costs"
        bodyClassName="rounded-b-xl overflow-hidden"
        extra={
          <>
            <HeadBtn onClick={guarded("Could not restore the row", undoBuy)} disabled={!undoBuyCount} title="Bring back the last deleted buying cost" ariaLabel="Undo the last deleted buying cost">
              <RollbackOutlined />
              Undo
            </HeadBtn>
            {/* Copies the quote's buying and selling costs both. */}
            <HeadBtn onClick={openQuoteModal}>
              Copy from quote
            </HeadBtn>
            <HeadBtn primary onClick={() => addBuy.mutate()}><PlusOutlined />Add buying cost</HeadBtn>
          </>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1240px] border-separate border-spacing-0">
            <thead>
              {/* grouped Estimated / Real header */}
              <tr>
                <th colSpan={3} className="border-b border-slate-200" />
                <th colSpan={3} className={`${HEAD} !text-center bg-indigo-50 !text-indigo-700`}>
                  Estimated buying costs
                </th>
                <th colSpan={5} className={`${HEAD} ${SPLIT} !text-center bg-amber-50 !text-amber-700`}>
                  Real buying costs
                </th>
                <th colSpan={2} className="border-b border-slate-200" />
              </tr>
              <tr>
                <th className={`${HEAD} w-[13%]`}>Category</th>
                <th className={`${HEAD} w-[12%]`}>Description</th>
                <th className={`${HEAD} w-[8%]`}>Vendor</th>
                <th className={`${HEAD} !text-center w-[4%]`}>Qty</th>
                <th className={`${HEAD} text-right w-[8%]`}>Est. Amount</th>
                <th className={`${HEAD} w-[6%]`}>Cur</th>
                <th className={`${HEAD} ${SPLIT} !text-center w-[4%]`}>Qty</th>
                <th className={`${HEAD} text-right w-[8%]`}>Real Cost</th>
                <th className={`${HEAD} w-[6%]`}>Cur</th>
                <th className={`${HEAD} w-[8%]`}>Invoice number</th>
                <th className={`${HEAD} !text-center w-[5%]`} title="Supplier invoice received · paid">Received · Paid</th>
                <th className={`${HEAD} text-right w-[10%]`}>Total in {billingCur}</th>
                <th className={`${HEAD} w-[70px]`} />
              </tr>
            </thead>
            <tbody>
              {buyRows.map((r, rowIndex) => {
                const truckingTag = truckingTagOf(r.id);
                if (truckingTag) {
                  return (
                    <tr key={r.id} className="bg-indigo-50/40">
                      <td className={CELL}><span className={READ_SELECT}>{r.category ? chargeLabel(r.category) : "—"}</span></td>
                      <td className={CELL}>
                        <span className={READ}>{r.description}</span>
                        <TruckingCostTagLink tag={truckingTag} />
                      </td>
                      <td className={CELL}><span className={READ}>{r.vendor}</span></td>
                      <td className={CELL}><span className={`${READ} text-center`}>{r.estQty}</span></td>
                      <td className={CELL}><span className={`${READ} text-right tabular-nums`}>{r.estAmount}</span></td>
                      <td className={CELL}><span className={READ_SELECT}>{r.estCurrency}</span></td>
                      <td className={`${CELL} ${SPLIT}`}><span className={`${READ} text-center`}>{r.realQty}</span></td>
                      <td className={`${CELL} ${t.buyRowOver[r.id] ? "bg-red-100" : t.buyRowUnder[r.id] ? "bg-emerald-100" : ""}`}>
                        <span className={`${READ} text-right tabular-nums`}>{r.realAmount}</span>
                      </td>
                      <td className={CELL}><span className={READ_SELECT}>{r.realCurrency}</span></td>
                      <td className={CELL}><span className={READ}>{r.invoiceNumber}</span></td>
                      <td className={`${CELL} text-center`}>
                        <span className="inline-flex items-center gap-1.5">
                          <Checkbox checked={r.received} disabled aria-label="Supplier invoice received" />
                          <Checkbox checked={!!r.paidOn} disabled aria-label="Supplier invoice paid" />
                        </span>
                      </td>
                      <td className={`${CELL} text-right text-[13px] font-semibold tabular-nums text-slate-900`}>{buyRowTotal(r)}</td>
                      <td className={CELL} />
                    </tr>
                  );
                }
                const locked = buyLocked(r);
                const fld = lockedField(locked);
                const fromQuote = quoteRefs.get(r.id);
                // the quote's fields look like text and do not open, whatever the rest of the row does
                const fixed = lockedField(locked || !!fromQuote);
                // the Estimated cells: the quote's on its lines, and nobody's on a line added by hand -
                // one typed before the quote's lines came stays open until it is cleared
                const estClosed = !!fromQuote || (quotePriced && !num(r.estQty) && !num(r.estAmount));
                const est = lockedField(locked || estClosed);
                return (
                <tr
                  key={r.id}
                  className={`hover:bg-slate-50/60 ${locked ? `cursor-pointer ${ROW_FOCUS}` : ""}`}
                  data-cost-row={r.id}
                  onDoubleClick={() => unlock(r.id)}
                  {...rowKeys(r.id, locked)}
                >
                  <td className={CELL}>
                    <Select
                      value={r.category || undefined}
                      placeholder="—"
                      variant="borderless"
                      className={`w-full [&_.ant-select-selector]:!h-[30px] [&_.ant-select-selector]:!border
                                 [&_.ant-select-selector]:!border-slate-200 [&_.ant-select-selector]:!rounded-md
                                 [&_.ant-select-selection-item]:!text-[13px]${
                        locked || fromQuote ? " [&_.ant-select-selector]:!border-transparent [&_.ant-select-arrow]:!hidden pointer-events-none" : ""
                      }`}
                      options={chargeOptions(r.category, shipment.freightMode)}
                      showSearch
                      optionFilterProp="label"
                      popupMatchSelectWidth={380}
                      open={locked || fromQuote ? false : undefined}
                      tabIndex={locked || fromQuote ? -1 : undefined}
                      onChange={(v) => updateBuy.mutate({ id: r.id, category: v })}
                    />
                  </td>
                  <td className={CELL}>
                    <input
                      className={`${FIELD}${fixed}`}
                      {...closed(locked || !!fromQuote)}
                      defaultValue={r.description}
                      onBlur={(e) => e.target.value !== r.description && updateBuy.mutate({ id: r.id, description: e.target.value })}
                    />
                  </td>
                  <td className={CELL}>
                    <VendorCell row={r} locked={locked} className={fld} onSave={(change, onFailed) => updateBuy.mutate({ id: r.id, ...change }, { onError: onFailed })} />
                  </td>
                  {/* Estimated */}
                  <td className={CELL}>
                    <input
                      className={`${FIELD} text-center${est}`}
                      {...closed(locked || estClosed)}
                      defaultValue={r.estQty}
                      inputMode="decimal"
                      onKeyDown={onlyNumbers}
                      onBlur={(e) => e.target.value !== r.estQty && updateBuy.mutate({ id: r.id, estQty: e.target.value })}
                    />
                  </td>
                  <td className={CELL}>
                    <input
                      className={`${FIELD} text-right${est}`}
                      {...closed(locked || estClosed)}
                      defaultValue={r.estAmount}
                      inputMode="decimal"
                      onKeyDown={onlyNumbers}
                      onBlur={(e) => e.target.value !== r.estAmount && updateBuy.mutate({ id: r.id, estAmount: e.target.value })}
                    />
                  </td>
                  <td className={CELL}>
                    {estClosed ? (
                      <span className="block px-[11px] text-[13px] text-slate-900">{fromQuote || num(r.estAmount) ? r.estCurrency : ""}</span>
                    ) : (
                      <CurrencyPicker locked={locked} value={r.estCurrency} onChange={(v) => changeEstCurrency(r, v)} />
                    )}
                  </td>
                  {/* Real */}
                  <td className={`${CELL} ${SPLIT}`}>
                    <input
                      className={`${FIELD} text-center${fld}`}
                      {...closed(locked)}
                      defaultValue={r.realQty}
                      inputMode="decimal"
                      onKeyDown={onlyNumbers}
                      onBlur={(e) => e.target.value !== r.realQty && updateBuy.mutate({ id: r.id, realQty: e.target.value })}
                    />
                  </td>
                  <td
                    className={`${CELL} ${
                      t.buyRowOver[r.id] ? "bg-red-100" : t.buyRowUnder[r.id] ? "bg-emerald-100" : ""
                    }`}
                    title={
                      t.buyRowOver[r.id] ? "Real Cost is higher than Estimated"
                        : t.buyRowUnder[r.id] ? "Real Cost is lower than Estimated" : undefined
                    }
                  >
                    <input
                      className={`${FIELD} text-right${fld} ${t.buyRowUnder[r.id] ? "!text-emerald-700 font-bold" : ""}`}
                      {...closed(locked)}
                      defaultValue={r.realAmount}
                      inputMode="decimal"
                      onKeyDown={onlyNumbers}
                      onBlur={(e) => e.target.value !== r.realAmount && updateBuy.mutate({ id: r.id, realAmount: e.target.value })}
                    />
                  </td>
                  <td className={CELL}>
                    <CurrencyPicker locked={locked} value={r.realCurrency} onChange={(v) => updateBuy.mutate({ id: r.id, realCurrency: v })} />
                  </td>
                  <td className={CELL}>
                    <input
                      className={`${FIELD}${fld}`}
                      {...closed(locked)}
                      defaultValue={r.invoiceNumber}
                      onBlur={(e) => changeInvoiceNumber(r, e.target)}
                    />
                  </td>
                  <td className={`${CELL} text-center`}>
                    <span className="inline-flex items-center gap-1.5">
                      <Tooltip title={`Received is ticked automatically once the invoice number is filled in${r.receivedAt ? ` (${formatDate(businessDayOf(r.receivedAt))})` : ""}`}>
                        <span>
                          <Checkbox checked={r.received} disabled tabIndex={-1} />
                        </span>
                      </Tooltip>
                      {/* Paid once the invoice came, on the day picked (Council Outlay 7, step 6b; Council Review 5). */}
                      <CostPaidCell
                        received={r.received}
                        receivedAt={r.receivedAt}
                        paidOn={r.paidOn}
                        paidBy={r.paidBy}
                        paidAt={r.paidAt}
                        onChange={(paidOn) => updateBuy.mutate({ id: r.id, paidOn })}
                      />
                    </span>
                  </td>
                  <td className={`${CELL} text-right text-[13px] font-semibold tabular-nums text-slate-900`}>{buyRowTotal(r)}</td>
                  <td className={`${CELL} text-center whitespace-nowrap`}>
                    <Tooltip title="Duplicate row">
                      <button
                        onClick={guarded("Could not duplicate the row", () => duplicateBuy(r, rowIndex))}
                        aria-label="Duplicate buying cost row"
                        className={ROW_BTN}
                      >
                        <CopyOutlined />
                      </button>
                    </Tooltip>
                    {fromQuote ? (
                      <Tooltip title={`Copied from ${fromQuote}: category, description and estimate stay as the quote has them, and the row can't be deleted`}>
                        <span
                          role="img"
                          aria-label={`Copied from ${fromQuote}, estimate fixed`}
                          className="w-7 h-7 rounded-md place-items-center text-slate-400 inline-grid align-middle"
                        >
                          <LockOutlined />
                        </span>
                      </Tooltip>
                    ) : (
                      <Tooltip title="Delete row">
                        <button
                          onClick={() => removeBuy(r, rowIndex)}
                          aria-label="Delete buying cost row"
                          className={ROW_DELETE_BTN}
                        >
                          <DeleteOutlined />
                        </button>
                      </Tooltip>
                    )}
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
                      className={ADD_FIRST_BTN}
                    >
                      No buying costs yet — add the first one
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
            {/* totals: under Est. Amount and Real Cost, the currency always under the Cur column */}
            <tfoot>
              <tr className="bg-slate-50">
                <td className={FOOT_LABEL} colSpan={4}>
                  Total buying
                </td>
                <td className={FOOT}>
                  {money(t.estTotal)}
                </td>
                <td className={FOOT_UNIT}>{billingCur}</td>
                <td className={`${SPLIT} ${FOOT_LINE}`} />
                <td className={FOOT}>
                  {t.realStrictTotal ? money(t.realStrictTotal) : <span className={EMPTY}>—</span>}
                </td>
                <td className={FOOT_UNIT}>{t.realStrictTotal ? billingCur : ""}</td>
                <td colSpan={4} className={FOOT_LINE} />
              </tr>
            </tfoot>
          </table>
        </div>
      </SectionCard>
      </div>

      {/* ═══════════ 2. SELLING COSTS ═══════════ */}
      <div className="mb-4">
      <SectionCard
        title="Selling costs"
        bodyClassName="rounded-b-xl overflow-hidden"
        extra={
          <>
            <HeadBtn onClick={guarded("Could not restore the row", undoSell)} disabled={!undoSellCount} title="Bring back the last deleted selling cost" ariaLabel="Undo the last deleted selling cost">
              <RollbackOutlined />
              Undo
            </HeadBtn>
            <HeadBtn onClick={guarded("Could not copy from buying", copyFromBuying)}>Copy from buying</HeadBtn>
            <HeadBtn primary onClick={() => addSell.mutate({})}><PlusOutlined />Add selling cost</HeadBtn>
          </>
        }
      >
        {invoiceDocsFailed && !invoiceDocs && (
          <div role="status" className="flex items-center gap-2 px-4 py-2 border-b border-slate-100 text-[12px] text-red-600">
            <WarningOutlined />
            Could not check which rows are invoiced — the server still refuses changes to invoiced rows.
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={`${HEAD} !text-center w-[64px]`} title="Include in the billing calculation sheet">Invoice</th>
                {/* each head starts (or ends) where its column's text does: a Select's 12px, an input's 9px */}
                <th className={`${HEAD} !pl-[18px] w-[250px]`}>Category</th>
                {/* what the invoice line prints: the row's own text (set in Issue invoice), else its Description, else the category */}
                <th className={`${HEAD} !pl-[15px] w-[26%]`} title="Printed on the invoice line: the row's Description, or a text of its own set in Issue invoice">Invoice text</th>
                <th className={`${HEAD} !text-center w-[6%]`}>Qty</th>
                <th className={`${HEAD} !text-right !pr-[15px] w-[10%]`}>Amount</th>
                <th className={`${HEAD} !pl-[18px] w-[7%]`}>Cur</th>
                <th className={`${HEAD} !text-right w-[10%]`}>Total in {billingCur}</th>
                <th className={`${HEAD} w-[76px]`} />
              </tr>
            </thead>
            <tbody>
              {sellRows.map((r, rowIndex) => {
                const truckingTag = truckingTagOf(r.id);
                // On an issued invoice: read-only (the server refuses changes too) and tinted green.
                const invoicedOn = invoicedBy.get(r.id);
                if (truckingTag || invoicedOn) {
                  return (
                    <tr key={r.id} className={invoicedOn ? "bg-emerald-50/70" : "bg-indigo-50/40"}>
                      <td className={`${CELL} text-center`}>
                        <Checkbox checked={r.invoice} disabled aria-label="Include in the invoice" />
                      </td>
                      <td className={CELL}><span className={READ_SELECT}>{r.category ? chargeLabel(r.category) : "—"}</span></td>
                      <td className={CELL}>
                        {/* what the invoice line printed (an invoiced row) or prints */}
                        <span className={READ}>
                          {invoicedOn?.lines.find((l) => l.sourceSellingCostId === r.id)?.description ?? printedText(r)}
                        </span>
                        {r.customer.trim() && <span className={OWN_TEXT_HINT}>Own text from Issue invoice</span>}
                        {truckingTag && <TruckingCostTagLink tag={truckingTag} />}
                      </td>
                      <td className={CELL}><span className={`${READ} text-center`}>{r.qty}</span></td>
                      <td className={CELL}><span className={`${READ} text-right tabular-nums`}>{r.amount}</span></td>
                      <td className={CELL}><span className={READ_SELECT}>{r.currency}</span></td>
                      <td className={`${CELL} text-right text-[13px] font-semibold tabular-nums ${r.invoice ? "text-slate-900" : "text-slate-400 line-through"}`}>{sellRowTotal(r)}</td>
                      <td className={`${CELL} text-center whitespace-nowrap`}>
                        {/* Duplicate, then the invoice mark: in the places an open row has Duplicate and Delete.
                            A copy is a new row, not on the invoice and not ticked for it: it can be changed and invoiced. */}
                        {invoicedOn && (truckingTag ? (
                          <span aria-hidden className="inline-block w-7" />
                        ) : (
                          <Tooltip title="Duplicate row">
                            <button
                              onClick={guarded("Could not duplicate the row", () => duplicateSell(r, rowIndex, true))}
                              aria-label="Duplicate selling cost row"
                              className={ROW_BTN}
                            >
                              <CopyOutlined />
                            </button>
                          </Tooltip>
                        ))}
                        {invoicedOn && <InvoicedMark doc={invoicedOn} shipmentId={shipment.id} />}
                      </td>
                    </tr>
                  );
                }
                const locked = sellLocked(r);
                const fld = lockedField(locked);
                return (
                <tr
                  key={r.id}
                  className={`hover:bg-slate-50/60 ${locked ? `cursor-pointer ${ROW_FOCUS}` : ""}`}
                  data-cost-row={r.id}
                  onDoubleClick={() => unlock(r.id)}
                  {...rowKeys(r.id, locked)}
                >
                  <td className={`${CELL} text-center`}>
                    <Checkbox
                      aria-label="Include in the invoice"
                      checked={r.invoice}
                      onChange={(e) => updateSell.mutate({ id: r.id, invoice: e.target.checked })}
                    />
                  </td>
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
                      options={chargeOptions(r.category, shipment.freightMode)}
                      showSearch
                      optionFilterProp="label"
                      popupMatchSelectWidth={380}
                      open={locked ? false : undefined}
                      tabIndex={locked ? -1 : undefined}
                      onChange={(v) => updateSell.mutate({ id: r.id, category: v })}
                    />
                  </td>
                  <td className={CELL}>
                    {r.customer.trim() ? (
                      // A text of its own, set in Issue invoice, is what the line prints: shown here, with
                      // a way back to the Description (which it hides meanwhile).
                      <div className="flex items-start gap-1">
                        <div className="min-w-0 flex-1">
                          <span className={`${READ} !min-h-0 !pb-0 break-words`}>{r.customer}</span>
                          <span className={OWN_TEXT_HINT}>Own text from Issue invoice</span>
                        </div>
                        <Tooltip title={`Clear the own text: the line prints ${r.description.trim() ? `the Description ("${r.description.trim()}")` : "the category"} again`}>
                          <button
                            type="button"
                            onClick={() => updateSell.mutate({ id: r.id, customer: "" })}
                            aria-label="Clear the own invoice text"
                            className={ROW_BTN}
                          >
                            <CloseOutlined />
                          </button>
                        </Tooltip>
                      </div>
                    ) : (
                      <input
                        className={`${FIELD}${fld}`}
                        {...closed(locked)}
                        defaultValue={r.description}
                        placeholder={r.category ? chargeLabel(r.category) : undefined}
                        aria-label="Invoice text"
                        onBlur={(e) => e.target.value !== r.description && updateSell.mutate({ id: r.id, description: e.target.value })}
                      />
                    )}
                  </td>
                  <td className={CELL}>
                    <input
                      className={`${FIELD} text-center${fld}`}
                      {...closed(locked)}
                      defaultValue={r.qty}
                      inputMode="decimal"
                      onKeyDown={onlyNumbers}
                      onBlur={(e) => e.target.value !== r.qty && updateSell.mutate({ id: r.id, qty: e.target.value })}
                    />
                  </td>
                  <td className={CELL}>
                    <input
                      className={`${FIELD} text-right${fld}`}
                      {...closed(locked)}
                      defaultValue={r.amount}
                      inputMode="decimal"
                      onKeyDown={onlyNumbers}
                      onBlur={(e) => e.target.value !== r.amount && updateSell.mutate({ id: r.id, amount: e.target.value })}
                    />
                  </td>
                  <td className={CELL}>
                    <CurrencyPicker locked={locked} value={r.currency} onChange={(v) => updateSell.mutate({ id: r.id, currency: v })} />
                  </td>
                  <td className={`${CELL} text-right text-[13px] font-semibold tabular-nums ${r.invoice ? "text-slate-900" : "text-slate-400 line-through"}`}>{sellRowTotal(r)}</td>
                  <td className={`${CELL} text-center whitespace-nowrap`}>
                    <Tooltip title="Duplicate row">
                      <button
                        onClick={guarded("Could not duplicate the row", () => duplicateSell(r, rowIndex))}
                        aria-label="Duplicate selling cost row"
                        className={ROW_BTN}
                      >
                        <CopyOutlined />
                      </button>
                    </Tooltip>
                    <Tooltip title="Delete row">
                      <button
                        onClick={() => removeSell(r, rowIndex)}
                        aria-label="Delete selling cost row"
                        className={ROW_DELETE_BTN}
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
                  <td colSpan={8} className="px-4 py-8 text-center">
                    <button
                      onClick={() => addSell.mutate({})}
                      disabled={addSell.isPending}
                      className={ADD_FIRST_BTN}
                    >
                      No selling costs yet — add the first one
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50">
                <td className={FOOT_LABEL} colSpan={6}>
                  Total selling
                  {/* Only rows ticked for invoicing count towards the total and the profit. */}
                  {t.sellNotInvoicedCount > 0 && (
                    <span className={`ml-2 ${HINT} font-normal normal-case tracking-normal`}>
                      ({t.sellNotInvoicedCount} row{t.sellNotInvoicedCount === 1 ? "" : "s"} not
                      ticked for Invoice — {money(t.sellNotInvoicedTotal)} {billingCur} excluded)
                    </span>
                  )}
                </td>
                {/* under the rows' totals, in the same currency, as Total buying above */}
                <td className={FOOT}>
                  {money(t.sellTotal)}
                  {billingCur !== "CZK" && <div className={`${HINT} font-normal`}>{money(t.sellTotalCZK)} CZK</div>}
                </td>
                <td className={FOOT_UNIT}>{billingCur}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </SectionCard>
      </div>

      {/* ═══════════ 3. RATES ═══════════
          The ČNB rate of the job's tax date: ATA for imports, ATD for exports; provisional by
          ETA / ETD until then. The server (fx service) picks it; this only shows it. */}
      <div className={`${CARD} flex items-center gap-4 flex-wrap px-4 py-3 mb-4`}>
        <span className={LABEL_TEXT}>
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
              className="inline-flex items-center gap-2 border border-slate-200 rounded-lg px-3 h-8 bg-white"
            >
              <span className="text-[12px] font-bold text-slate-500">{code}</span>
              <span className="text-[13px] font-semibold text-slate-900 tabular-nums">
                {value ? value.toFixed(3) : <span className={EMPTY}>—</span>}
              </span>
            </span>
          ))}
        </div>

        {/* state: locked at ATA / ATD, or provisional */}
        {fx && (
          fx.ratesMissing ? (
            <Tooltip title="The ČNB fixing of the job's tax date should be stored but isn't (the import failed). The job can't lock until it is imported.">
              <Pill tone="red">Rate missing</Pill>
            </Tooltip>
          ) : fx.status === "locked" ? (
            <Tooltip title={`Locked ${formatDateTime(fx.lockedAt)}${fx.previousRateDate ? ` · re-locked from ${formatDate(fx.previousRateDate)} after ${fx.basis.toUpperCase()} changed` : ""}`}>
              <Pill tone="slate">Locked</Pill>
            </Tooltip>
          ) : (
            <Pill tone="amber">Provisional</Pill>
          )
        )}

        {/* where the rate comes from */}
        <span className="text-[13px] text-slate-500">
          {ratesLoading ? (
            "Loading rates…"
          ) : ratesError || !fx ? (
            <span className="text-amber-700 font-semibold">Could not load the ČNB rates</span>
          ) : fx.ratesMissing ? (
            <span className="text-red-600 font-semibold">
              ČNB rate for {formatDate(fx.rateDate)} not imported — <Link href="/exchange" className={LINK}>sync it in Exchange</Link>
            </span>
          ) : fx.rates.length === 0 ? (
            <span className="text-amber-700 font-semibold">
              No ČNB rates stored — <Link href="/exchange" className={LINK}>check Exchange</Link>
            </span>
          ) : fx.status === "locked" ? (
            <>ČNB {formatDate(fx.rates.find((r) => r.currency === "EUR")?.fixingDate ?? fx.rateDate)} · by {fx.basis.toUpperCase()} {formatDate(fx.rateDate)}</>
          ) : fx.basis === "today" ? (
            <span className="text-amber-700 font-semibold">
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

        {/* Issue invoice: the invoice is made right here (Invoicing's own panel, in a dialog on the
            shipment page; Invoicing itself switches to its Invoice tab). The app's main action.
            Only where the page offers it. */}
        {onIssueInvoice && (
          <button
            type="button"
            onClick={onIssueInvoice}
            className={`${BTN_PRIMARY} ml-auto`}
          >
            <SendOutlined />
            Issue invoice
          </button>
        )}
      </div>

      {/* Rows in a currency the rate sheet does not cover are left out of every
          total — say so rather than letting the numbers look complete. */}
      {t.missingCurrencies.length > 0 && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
          <WarningOutlined className="text-amber-600 mt-[2px]" />
          <span className="text-[13px] text-amber-900">
            <strong>ČNB publishes no rate for {t.missingCurrencies.join(", ")}.</strong>{" "}
            {t.unconvertibleRowCount} row{t.unconvertibleRowCount === 1 ? " is" : "s are"} left out of
            the totals below.
          </span>
        </div>
      )}

      {/* ═══════════ 4. REPORT ═══════════ */}
      {/* Its bar is dark on purpose: the job's result, set apart from the cost cards above. */}
      <div className={`${CARD} overflow-hidden`}>
        <button
          onClick={() => setReportOpen((v) => !v)}
          title="Show / hide report"
          className="w-full min-h-[42px] px-4 py-2 flex items-center gap-3 bg-slate-900 text-white
                     text-[13px] leading-5 font-bold uppercase tracking-wider border-0 cursor-pointer"
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
                <span className="text-[12px] font-semibold text-slate-400">{x.k}</span>
                <span
                  className={`text-[13px] font-bold tabular-nums ${
                    !t.hasAny ? "text-slate-400"
                      : x.profit ? (t.profitCZK >= 0 ? "text-emerald-400" : "text-red-400")
                        : "text-white"
                  }`}
                >
                  {x.v}
                </span>
              </span>
            ))}
            {vsQuoteCZK !== null && (
              <span className="flex items-center gap-2" title={`The job's profit minus the profit ${profitQuoteRef} calculated, in CZK`}>
                <span className="text-[12px] font-semibold text-slate-400">vs quote</span>
                <span
                  className={`text-[13px] font-bold tabular-nums ${
                    vsQuoteCZK > 0.004 ? "text-emerald-400" : vsQuoteCZK < -0.004 ? "text-red-400" : "text-slate-300"
                  }`}
                >
                  {signed(vsQuoteCZK)}
                </span>
              </span>
            )}
          </span>
        </button>

        {reportOpen && (
          <div className="p-4">
            {/* Profit tabulka v CZK / USD / EUR */}
            <table className="w-full max-w-[720px] border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className={TH} />
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
                    <td className={TD}>
                      {row.label}
                    </td>
                    {/* A missing rate must never be substituted with 1 — that would
                        reprint the CZK figure verbatim under a USD/EUR heading. */}
                    {[row.czk, rates.USD ? row.czk / rates.USD : null, rates.EUR ? row.czk / rates.EUR : null].map((v, i) => (
                      <td key={i} className={REPORT_NUM}>
                        <span
                          className={
                            !t.hasAny || v === null ? EMPTY
                              : row.signed ? (t.profitCZK >= 0 ? "text-emerald-700 font-bold" : "text-red-600 font-bold")
                                : "text-slate-900"
                          }
                        >
                          {t.hasAny && v !== null ? (row.signed ? signed(v) : money(v)) : "—"}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
                {profitQuoteRef && <QuoteProfitRows quoteRef={profitQuoteRef} data={profitQuoteData} loading={profitQuote.isLoading} rates={rates} profitCZK={t.profitCZK} hasAny={t.hasAny} />}
              </tbody>
            </table>

            {/* R x E: Real - Estimated */}
            <div className="mt-5">
              <div className="flex items-center gap-3 mb-2">
                <span className={LABEL_TEXT}>
                  R x E — Real − Estimated
                </span>
                <Tooltip title="Real − Estimated on buying costs: a real cost above the estimate is Profit Burning, one below it Profit Optimalization.">
                  {t.hasRxe ? (
                    <ProfitVsEstimate delta={t.rxeTotal} currency={billingCur} className="!text-[13px]" />
                  ) : (
                    <span className={`text-[13px] font-bold ${EMPTY}`}>—</span>
                  )}
                </Tooltip>
              </div>

              {t.rxeRows.length > 0 && (
                <table className="w-full max-w-[720px] border-separate border-spacing-0">
                  <thead>
                    <tr>
                      <th className={TH}>Category</th>
                      <th className={TH}>Vendor</th>
                      <th className={`${TH} text-right`}>R x E</th>
                      <th className={`${TH} text-right`}>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.rxeRows.map((x) => (
                      <tr key={x.id}>
                        <td className={TD}>{x.cat}</td>
                        <td className={TD}>
                          {x.vendor || <span className={EMPTY}>—</span>}
                        </td>
                        <td className={`${TD} text-right`}>
                          <ProfitVsEstimate delta={x.delta} currency={billingCur} />
                        </td>
                        <td className={`${TD} text-right tabular-nums`}>
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
        open={quoteModal}
        onCancel={() => { setQuoteModal(false); setQuoteErr(""); }}
        onOk={importQuoteCosts}
        okText={quoteAgain ? "Copy again" : "Import"}
        cancelText="Cancel"
        confirmLoading={quoteLoading}
        title="Copy from quote"
        width={430}
      >
        <p className="text-[13px] text-slate-700 mb-3.5">
          Enter the reference of a Won quotation. Its buying and selling costs will be imported to the
          buying and selling costs here.
        </p>
        <Input
          autoFocus
          placeholder="QCZ20260815001"
          value={quoteInput}
          onChange={(e) => { setQuoteInput(e.target.value); setQuoteErr(""); setQuoteAgain(false); }}
          onPressEnter={importQuoteCosts}
          className="tabular-nums tracking-[.03em]"
        />
        <div className={`${quoteAgain ? "text-amber-700" : "text-red-600"} text-[13px] font-semibold min-h-[17px] mt-[7px]`}>
          {quoteErr}
          {quoteAgain && " Copy again?"}
        </div>
      </Modal>
    </div>
  );
}

// The Report's comparison with the quote: the profit the quote calculated - in each column's
// currency, at the quote's own rates - and how far the job's profit is from it now. A difference
// below zero is profit lost against the quote.
function QuoteProfitRows({ quoteRef, data, loading, rates, profitCZK, hasAny }: {
  quoteRef: string;
  data: ReturnType<typeof asData> | null;
  loading: boolean;
  rates: Record<string, number>;
  profitCZK: number;
  hasAny: boolean;
}) {
  const label = TD;
  const cell = REPORT_NUM;
  const columns = ["CZK", "USD", "EUR"];
  if (!data) {
    return (
      <tr>
        <td className={label}>Quote profit ({quoteRef})</td>
        <td colSpan={3} className={cell}><span className="text-slate-400">{loading ? "Loading the quote…" : "The quote could not be read"}</span></td>
      </tr>
    );
  }
  const quoted = columns.map((c) => quoteProfitIn(data, rates, c));
  // A quote line in a currency without a rate is not in the quote's own profit either.
  const incomplete = computeTotals(data, rates).missingRates.length > 0;
  const now = columns.map((c) => (c === "CZK" ? profitCZK : rates[c] ? profitCZK / rates[c] : null));
  const diff = columns.map((_, i) => (quoted[i] === null || now[i] === null ? null : now[i]! - quoted[i]!));
  const tone = (v: number) => (v > 0.004 ? "text-emerald-700" : v < -0.004 ? "text-red-600" : "text-slate-500");
  return (
    <>
      <tr>
        <td className={label}>
          Quote profit{" "}
          <Link href={`/sales/quote/${quoteRef}`} className={LINK}>{quoteRef}</Link>
          {incomplete && (
            <Tooltip title="A line of the quote is in a currency without a rate and is left out of its profit">
              <WarningOutlined className="ml-1.5 text-amber-700" />
            </Tooltip>
          )}
        </td>
        {quoted.map((v, i) => (
          <td key={i} className={cell}><span className={v === null ? EMPTY : "text-slate-900"}>{v === null ? "—" : signed(v)}</span></td>
        ))}
      </tr>
      <tr className="font-bold">
        <td className={label}>
          <Tooltip title="The job's profit now minus the profit the quote calculated. Below zero, the job earns less than the quote did.">
            <span>Difference vs quote</span>
          </Tooltip>
        </td>
        {diff.map((v, i) => (
          <td key={i} className={cell}><span className={!hasAny || v === null ? EMPTY : tone(v)}>{hasAny && v !== null ? signed(v) : "—"}</span></td>
        ))}
      </tr>
    </>
  );
}

interface VendorCellProps {
  row: BuyingRow;
  /** A locked row: the field reads as text until the row is opened. */
  locked: boolean;
  className: string;
  /** `onFailed` is called when the save is refused. */
  onSave: (change: { vendor: string; supplierCustomerId: string }, onFailed: () => void) => void;
}

const sameSupplier = (a: SupplierValue, b: SupplierValue) => a.name === b.name && a.supplierCustomerId === b.supplierCustomerId;

// The vendor of a buying row: a supplier picked from the Customer Database (saved at once, linked, with
// its stars) or a name typed (saved when the field is left, unlinked), as the other fields save on blur.
function VendorCell({ row, locked, className, onSave }: VendorCellProps) {
  const stored: SupplierValue = { name: row.vendor, supplierCustomerId: row.supplierCustomerId };
  const [value, setValue] = useState<SupplierValue>(stored);
  // What the field holds now, for the blur that follows a pick before the state has caught up.
  const latest = useRef(stored);
  // What was last saved (or read): an Enter that picks also leaves the row, and its blur must not save the
  // same pick again before the row is read back (F-5).
  const sent = useRef(stored);
  useEffect(() => {
    const next = { name: row.vendor, supplierCustomerId: row.supplierCustomerId };
    latest.current = next;
    sent.current = next;
    setValue(next);
  }, [row.vendor, row.supplierCustomerId]);

  const save = (next: SupplierValue) => {
    if (sameSupplier(next, sent.current)) return;
    sent.current = next;
    // A refused save shows the stored vendor again, not the one that was not saved.
    const back = { name: row.vendor, supplierCustomerId: row.supplierCustomerId };
    onSave({ vendor: next.name, supplierCustomerId: next.supplierCustomerId ?? "" }, () => {
      latest.current = back;
      sent.current = back;
      setValue(back);
    });
  };

  return (
    <SupplierPicker
      value={value}
      className={className}
      plain={locked}
      ariaLabel="Vendor"
      placeholder="—"
      onChange={(next) => {
        latest.current = next;
        setValue(next);
        if (next.supplierCustomerId) save(next);
      }}
      onBlur={() => save(latest.current)}
    />
  );
}

interface InvoicedMarkProps {
  doc: InvoiceDoc;
  shipmentId: string;
}

/**
 * The mark of a selling row that is on an issued invoice: hovering or focusing it shows the invoice's
 * number (a link to its PDF) and where to find it in Invoicing; a click (or Enter) shows the PDF.
 */
function InvoicedMark({ doc, shipmentId }: InvoicedMarkProps) {
  const { message } = App.useApp();
  const show = () => openInvoicePdf(doc.id).catch(() => message.error(`Could not open the PDF of ${doc.number}`));
  return (
    <Popover
      placement="left"
      trigger={["hover", "focus"]}
      content={
        <div className="text-[13px] leading-5">
          <div className="text-slate-500">Invoiced on</div>
          <button type="button" onClick={show} className={`${LINK} ${REF} font-semibold cursor-pointer bg-transparent border-none p-0`}>
            {doc.number}
          </button>
          <div className="text-slate-500 tabular-nums">DUZP {formatDate(doc.duzp)}</div>
          <Link href={`/invoicing?shipment=${encodeURIComponent(shipmentId)}&tab=documents`} className={`${LINK} block mt-1 text-[12px]`}>
            Invoices &amp; credit notes →
          </Link>
        </div>
      }
    >
      <button
        type="button"
        onClick={show}
        aria-label={`Invoiced on ${doc.number} — show the invoice`}
        className={`${ICON_BTN_GHOST} !bg-emerald-100 !text-emerald-700 hover:!bg-emerald-200`}
      >
        <FileDoneOutlined />
      </button>
    </Popover>
  );
}

"use client";

import { useRef } from "react";
import Link from "next/link";
import { Alert, Checkbox, Segmented, Select, Spin, Tooltip } from "antd";
import { useMessages } from "@/lib/toast";
import { CopyOutlined, DeleteOutlined, LoadingOutlined, PlusOutlined, WarningOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";
import { chargeLabel, chargeOptions } from "@/lib/chargeCodes";
import { money, normaliseAmount } from "@/lib/money";
import { useLatestRates } from "@/lib/fx";
import { eurTotal, type EurTotal } from "../_lib/eurTotal";
import { ProfitVsEstimate } from "@/components/ProfitVsEstimate";
import { EMPTY_CELL } from "@/components/EmptyCell";
import { Pill, type PillTone } from "@/components/Pill";
import { CurrencyPicker } from "@/components/CurrencyPicker";
import { CATEGORY_SELECT, FIELD, WARNING_BANNER, WARNING_ICON, WARNING_TEXT, notAnAmount, onlyNumbers } from "@/components/costFields";
import { CountChip, SectionCard } from "@/components/SectionCard";
import { BTN_PRIMARY, BTN_SM, CARD, EMPTY_STATE, HINT, ICON_BTN_DANGER, ICON_BTN_GHOST, LABEL_TEXT, LINK, REF, TD_TOTAL, TH } from "@/styles/ui";
import { LOCKED_CONTROL, LOCKED_INPUT, OPEN_ROW_ATTR, lockOnEnter, useOpenRow } from "../_lib/rowLock";

type View = interfaces.MasterJobCostsView;
type Line = interfaces.MasterJobCostItem;
type Patch = controllers.UpdateMasterJobCostRequest;

// Under "master-jobs": linking or unlinking a shipment (which refreshes those) shows the new split too.
const costsKey = (masterJobId: string) => ["master-jobs", masterJobId, "costs"] as const;

/* The shipment Costs Breakdown's table look: 6px cells, the app's column heads at that padding,
   a thick line between the estimate and the real cost, and a grey totals row. */
const CELL = "px-[6px] py-[6px] border-b border-slate-100 align-middle text-[13px] text-slate-700";
const HEAD = `${TH} !px-[6px]`;
const SPLIT_LINE = "border-l-[3px] border-l-slate-900";
const FOOT_LINE = "border-t-2 border-slate-200";
const FOOT_LABEL = `px-[6px] py-2 ${FOOT_LINE} ${LABEL_TEXT}`;
const FOOT = `${TD_TOTAL} !px-[6px] text-right tabular-nums`;
/** The currency under a total, in the Cur column. */
const FOOT_UNIT = `px-[6px] py-2 ${FOOT_LINE} ${HINT}`;
/** "No buying costs yet — add the first one": a link-like button. */
const ADD_FIRST_BTN = `${LINK} text-[13px] font-semibold border-0 bg-transparent cursor-pointer disabled:opacity-50`;
const SPLIT_OPTIONS = [
  { value: "wm", label: "W/M" },
  { value: "shipment", label: "Per shipment" },
];

/** A line's total as the shipments are charged it: amount × quantity (none counts as 1). */
function lineTotal(amount: string | null, qty: string | null): number | null {
  if (amount == null || amount === "") return null;
  const q = qty == null || qty === "" ? 1 : Number(qty);
  return Number(amount) * (Number.isFinite(q) ? q : 1);
}

/** What a line comes to in the split: its real cost, or else its estimate; null when it has neither. */
function shownTotal(l: Line): { total: number; currency: string } | null {
  const real = lineTotal(l.realAmount, l.realQty);
  if (real != null) return { total: real, currency: l.realCurrency };
  const est = lineTotal(l.estAmount, l.estQty);
  return est != null ? { total: est, currency: l.estCurrency } : null;
}

/** Totals per currency, in the order the currencies first come: adding currencies up would take an exchange rate. */
function byCurrency(totals: ({ total: number; currency: string } | null)[]): [string, number][] {
  const sums = new Map<string, number>();
  for (const t of totals) if (t) sums.set(t.currency, (sums.get(t.currency) ?? 0) + t.total);
  return [...sums];
}

/** Where the shipments stand against the split: a pill, with the whole sentence as its tooltip. */
function splitStatus(split: View["split"]): { tone: PillTone; label: string; sentence: string } | null {
  if (!split.inSync) {
    return split.written > 0
      ? { tone: "amber", label: "Changed", sentence: "Changed since it was processed: the shipments still carry the earlier split." }
      : { tone: "amber", label: "Not processed", sentence: "Not processed yet: the shipments don't carry these costs." };
  }
  return split.written > 0 ? { tone: "green", label: "Processed", sentence: "Processed: the shipments carry this split." } : null;
}

interface Props {
  masterJob: interfaces.MasterJobItem;
}

// A sum in EUR as the screen writes it; a currency without a ČNB rate is named instead of being left out.
const eurText = ({ eur, missing }: EurTotal) => (eur === null ? `no ČNB rate for ${missing.join(", ")}` : `${money(eur)} EUR`);

// A master job's buying costs. Each line is shared out over the master job's shipments - by W/M or
// the same part each, as the line says. The split below always shows how that stands; a shipment
// carries its share, as a read-only row of its own Costs Breakdown, once the split is processed.
export function MasterJobCostsTab({ masterJob }: Props) {
  // The EUR figures wait for the rates: until they are in, every currency would read as one without a rate.
  const { rates, fixingLabel, isLoading: ratesLoading } = useLatestRates();
  const message = useMessages();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: costsKey(masterJob.id),
    queryFn: () => api.invoicing.invoicingMasterJobCosts(masterJob.id),
  });
  // A filled buying cost is locked: a double-click opens its row, a click elsewhere locks it again. A
  // line not filled yet (just added) stays open. Each field still saves as before.
  const { openKey, open, close } = useOpenRow();
  const filled = (l: Line) => !!(l.category || Number(l.estAmount) || Number(l.realAmount));

  // With several saves on their way (fields left one after another) an answer can arrive after a
  // later one's: the view is then read again once the last is in, rather than taken from either.
  const writeKey = ["master-job-costs-write", masterJob.id];
  const overlapped = useRef(false);
  const applied = (view: View) => {
    if (queryClient.isMutating({ mutationKey: writeKey }) > 1) {
      overlapped.current = true;
      return;
    }
    if (overlapped.current) {
      overlapped.current = false;
      void queryClient.invalidateQueries({ queryKey: costsKey(masterJob.id) });
    } else {
      queryClient.setQueryData(costsKey(masterJob.id), view);
    }
    void queryClient.invalidateQueries({ queryKey: ["invoicing"] });
    void queryClient.invalidateQueries({ queryKey: ["shipments"] });
  };
  // A failed save leaves the view as the server has it now (an answer skipped above included).
  const failed = (what: string) => (err: unknown) => {
    message.error(`${what}: ${apiErrorMessage(err)}`);
    overlapped.current = false;
    void queryClient.invalidateQueries({ queryKey: costsKey(masterJob.id) });
  };

  // A new line: Qty = 1 on both sides (the currencies are CZK until changed).
  const add = useMutation({
    mutationKey: writeKey,
    mutationFn: () => api.invoicing.invoicingMasterJobCostAdd(masterJob.id, { splitMethod: "wm", estQty: "1", realQty: "1" }),
    onSuccess: applied,
    onError: failed("Could not add the buying cost"),
  });
  const update = useMutation({
    mutationKey: writeKey,
    mutationFn: ({ id, patch }: { id: string; patch: Patch }) => api.invoicing.invoicingMasterJobCostUpdate(masterJob.id, id, patch),
    onSuccess: applied,
    onError: failed("Could not save the change"),
  });
  const remove = useMutation({
    mutationKey: writeKey,
    mutationFn: (id: string) => api.invoicing.invoicingMasterJobCostDelete(masterJob.id, id),
    onSuccess: applied,
    onError: failed("Could not delete the row"),
  });
  // A copy goes in below its line, with what it costs and how it is split; not its invoice number or
  // Received, which belong to one invoice. The lines below it move down one.
  const duplicate = useMutation({
    mutationKey: writeKey,
    mutationFn: async ({ line, index, all }: { line: Line; index: number; all: Line[] }) => {
      // The shipments taken out of the line stay out of the copy too. They are set once it is added,
      // so it comes out of the split until then (the server checks a line in it against Trucking).
      const excluded = line.excludedShipmentIds.length > 0;
      const added = await api.invoicing.invoicingMasterJobCostAdd(masterJob.id, {
        category: line.category,
        description: line.description,
        vendor: line.vendor,
        estQty: line.estQty ?? undefined,
        estAmount: line.estAmount ?? undefined,
        estCurrency: line.estCurrency,
        realQty: line.realQty ?? undefined,
        realAmount: line.realAmount ?? undefined,
        realCurrency: line.realCurrency,
        splitMethod: line.splitMethod,
        inSplit: excluded ? false : line.inSplit,
        sortOrder: index + 1,
      });
      const fresh = added.lines.filter((l) => !all.some((o) => o.id === l.id));
      const copy = fresh.find((l) => l.sortOrder === index + 1) ?? fresh[0];
      await Promise.all([
        ...all.flatMap((l, i) => {
          const sortOrder = i <= index ? i : i + 1;
          return l.sortOrder === sortOrder ? [] : [api.invoicing.invoicingMasterJobCostUpdate(masterJob.id, l.id, { sortOrder })];
        }),
        ...(copy && excluded
          ? [api.invoicing.invoicingMasterJobCostUpdate(masterJob.id, copy.id, { inSplit: line.inSplit, excludedShipmentIds: line.excludedShipmentIds })]
          : []),
      ]);
      // The answers came in any order: the view is read once they are all in.
      return api.invoicing.invoicingMasterJobCosts(masterJob.id);
    },
    onSuccess: applied,
    onError: failed("Could not duplicate the row"),
  });
  // The shares are in the shipments' Costs Breakdowns (and their totals) the moment this answers.
  const processSplit = useMutation({
    mutationKey: writeKey,
    mutationFn: () => api.invoicing.invoicingMasterJobProcessSplit(masterJob.id),
    onSuccess: (view: View) => {
      applied(view);
      message.success("The split is in the shipments' Costs Breakdowns");
    },
    onError: failed("Could not process the split"),
  });

  const save = (line: Line, patch: Patch) => update.mutate({ id: line.id, patch });
  // An amount typed as people write it ("1 250,50"); one that isn't a number is refused here.
  const saveAmount = (line: Line, field: "estQty" | "estAmount" | "realQty" | "realAmount", text: string) => {
    const value = normaliseAmount(text);
    if (value === null) return message.error(`Could not save the change: ${notAnAmount(text)}`);
    if (value !== (line[field] == null ? "" : String(Number(line[field])))) save(line, { [field]: value });
  };
  const saveText = (line: Line, field: "description" | "vendor", text: string) => {
    if (text.trim() !== line[field]) save(line, { [field]: text.trim() });
  };
  // Received follows the invoice number being filled in; it can't be ticked by hand. Only a changed
  // number is saved, as on a shipment's Costs Breakdown: leaving the field as it was changes nothing.
  const saveInvoiceNumber = (line: Line, text: string) => {
    const invoiceNumber = text.trim();
    if (invoiceNumber === line.invoiceNumber) return;
    save(line, { invoiceNumber, received: invoiceNumber !== "" });
  };
  // A currency change on Estimated is mirrored to Real while Real is empty.
  const saveEstCurrency = (line: Line, currency: string) =>
    save(line, { estCurrency: currency, ...(Number(line.realAmount) ? {} : { realCurrency: currency }) });
  // A shipment in or out of a line's split: the other shipments share the line out between them.
  const saveInSplit = (line: Line, shipmentId: string, inSplit: boolean) =>
    save(line, {
      excludedShipmentIds: inSplit ? line.excludedShipmentIds.filter((id) => id !== shipmentId) : [...line.excludedShipmentIds, shipmentId],
    });

  if (isError) return <Alert type="error" showIcon message={`Could not load the costs: ${apiErrorMessage(error)}`} />;
  if (isLoading || !data) {
    return (
      <div className={`${CARD} p-8 flex justify-center`}>
        <Spin />
      </div>
    );
  }

  const { lines, houses, shares, split } = data;
  const shareOf = (lineId: string, shipmentId: string) => shares.find((s) => s.lineId === lineId && s.shipmentId === shipmentId);
  const splitLines = lines.filter((l) => l.inSplit);
  // All the split shares out, per currency.
  const allIn = byCurrency(splitLines.map(shownTotal));
  // The table's totals under Est. Amount and Real Cost, per currency: every line, the filled ones.
  const estTotals = byCurrency(lines.map((l) => {
    const total = lineTotal(l.estAmount, l.estQty);
    return total ? { total, currency: l.estCurrency } : null;
  }));
  const realTotals = byCurrency(lines.map((l) => {
    const total = lineTotal(l.realAmount, l.realQty);
    return total ? { total, currency: l.realCurrency } : null;
  }));
  // For checking the total: the same amounts in EUR at today's ČNB rates, without the ROE %. The split itself stays in the currencies as received.
  const allInEur = eurTotal(allIn, rates);
  const housesInLine = (l: Line) => houses.filter((h) => !l.excludedShipmentIds.includes(h.shipmentId));
  // The shipments that would carry a part of the line: by W/M, only those with a W/M.
  const carriersOf = (l: Line) => houses.filter((h) => l.splitMethod !== "wm" || h.freightTon > 0);
  const carriersInLine = (l: Line) => carriersOf(l).filter((h) => !l.excludedShipmentIds.includes(h.shipmentId));
  // Only a shipment still in a W/M line's split is missing a share by having no W/M.
  const noWm = houses.filter((h) => !(h.freightTon > 0) && splitLines.some((l) => l.splitMethod === "wm" && !l.excludedShipmentIds.includes(h.shipmentId)));
  const totalWm = houses.reduce((sum, h) => sum + h.freightTon, 0);
  // Every shipment still in the line's split unlinked since (or, by W/M, left with no W/M): its cost
  // lands on nobody. A W/M line no shipment has a W/M for is the "no W/M" warning's.
  const nobodyCarries = splitLines.filter((l) => carriersOf(l).length > 0 && carriersInLine(l).length === 0);
  const busy = add.isPending || update.isPending || remove.isPending || duplicate.isPending || processSplit.isPending;
  // Each line and the whole master job against their estimates, worked out on the server at today's ČNB rates.
  const { vsEstimate, totalVsEstimate: totalVs } = data;
  const status = splitStatus(split);
  const duplicateLine = (line: Line, index: number) => duplicate.mutate({ line, index, all: lines });

  return (
    <div className="flex flex-col gap-4">
      <SectionCard
        title="Buying costs"
        bodyClassName="rounded-b-xl overflow-hidden"
        extra={
          <button type="button" onClick={() => add.mutate()} disabled={add.isPending} className={`${BTN_PRIMARY} ${BTN_SM}`}>
            {add.isPending ? <LoadingOutlined /> : <PlusOutlined />}
            Add buying cost
          </button>
        }
      >
        <p className={`m-0 px-4 pt-3 pb-2 ${HINT}`}>
          Each line is split over the {houses.length} linked shipment{houses.length === 1 ? "" : "s"}, and Process the split puts it in their
          Costs Breakdown, read-only there.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1300px] border-separate border-spacing-0">
            <thead>
              <tr>
                <th colSpan={4} className="border-b border-slate-200" />
                <th colSpan={3} className={`${HEAD} !text-center bg-indigo-50 !text-indigo-700`}>
                  Estimated buying costs
                </th>
                <th colSpan={5} className={`${HEAD} ${SPLIT_LINE} !text-center bg-amber-50 !text-amber-700`}>
                  Real buying costs
                </th>
                <th colSpan={3} className="border-b border-slate-200" />
              </tr>
              <tr>
                <th
                  className={`${HEAD} !text-center whitespace-nowrap`}
                  title="Share this cost out over the shipments. Untick it to keep the line on the master job only: no shipment carries it."
                >
                  In split
                </th>
                {/* The shipment's column widths. The master job's own columns (In split, Vs estimate, Split)
                    leave less room, so each keeps at least its width in the shipment's narrowest table (1240px). */}
                <th className={`${HEAD} w-[13%] min-w-[160px]`}>Category</th>
                <th className={`${HEAD} w-[12%] min-w-[150px]`}>Description</th>
                <th className={`${HEAD} w-[8%] min-w-[100px]`}>Vendor</th>
                <th className={`${HEAD} !text-center w-[4%] min-w-[50px]`}>Qty</th>
                <th className={`${HEAD} text-right w-[8%] min-w-[100px]`}>Est. Amount</th>
                <th className={`${HEAD} w-[6%] min-w-[75px]`}>Cur</th>
                <th className={`${HEAD} ${SPLIT_LINE} !text-center w-[4%] min-w-[50px]`}>Qty</th>
                <th className={`${HEAD} text-right w-[8%] min-w-[100px]`}>Real Cost</th>
                <th className={`${HEAD} w-[6%] min-w-[75px]`}>Cur</th>
                <th className={`${HEAD} w-[8%] min-w-[100px]`}>Invoice number</th>
                <th className={`${HEAD} !text-center w-[5%]`} title="Supplier invoice received">Received</th>
                <th className={`${HEAD} text-right`} title="The real cost against the estimate">Vs estimate</th>
                <th className={HEAD} title="How the line is shared out: by W/M (freight tons), or the same part for each shipment.">
                  Split
                </th>
                <th className={`${HEAD} w-[70px]`} />
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr>
                  <td colSpan={15} className="px-4 py-8 text-center">
                    <button type="button" onClick={() => add.mutate()} disabled={add.isPending} className={ADD_FIRST_BTN}>
                      No buying costs yet — add the first one
                    </button>
                  </td>
                </tr>
              )}
              {lines.map((line, index) => {
                const locked = openKey !== line.id && filled(line);
                const control = locked ? LOCKED_CONTROL : "";
                const input = locked ? LOCKED_INPUT : "";
                const lockedProps = locked ? { open: false, tabIndex: -1 } : {};
                return (
                <tr
                  key={line.id}
                  {...(locked ? {} : { [OPEN_ROW_ATTR]: "" })}
                  onDoubleClick={locked ? (e) => open(line.id, e) : undefined}
                  // The row being typed in is the open one.
                  onFocus={locked ? undefined : () => openKey !== line.id && open(line.id)}
                  onKeyDown={locked ? undefined : lockOnEnter(close)}
                  title={locked ? "Double-click to edit" : undefined}
                  className={`hover:bg-slate-50/60 ${locked ? "cursor-pointer" : ""}`}
                >
                  <td className={`${CELL} text-center`}>
                    <Checkbox
                      className={control}
                      tabIndex={locked ? -1 : undefined}
                      checked={line.inSplit}
                      disabled={busy}
                      onChange={(e) => save(line, { inSplit: e.target.checked })}
                      aria-label={`${line.category ? chargeLabel(line.category) : "This cost"} in the split`}
                    />
                  </td>
                  <td className={CELL}>
                    <Select
                      variant="borderless"
                      className={`${CATEGORY_SELECT} ${control}`}
                      {...lockedProps}
                      showSearch
                      optionFilterProp="label"
                      placeholder="—"
                      value={line.category || undefined}
                      options={chargeOptions(line.category, masterJob.freightMode)}
                      popupMatchSelectWidth={380}
                      onChange={(v: string) => save(line, { category: v })}
                      aria-label="Category"
                    />
                  </td>
                  <td className={CELL}>
                    <input readOnly={locked} className={`${FIELD} ${input}`} key={`d${line.description}`} defaultValue={line.description} onBlur={(e) => saveText(line, "description", e.target.value)} aria-label="Description" />
                  </td>
                  <td className={CELL}>
                    <input readOnly={locked} className={`${FIELD} ${input}`} key={`v${line.vendor}`} defaultValue={line.vendor} placeholder="—" onBlur={(e) => saveText(line, "vendor", e.target.value)} aria-label="Vendor" />
                  </td>
                  <td className={CELL}>
                    <input key={`eq${line.estQty}`} defaultValue={line.estQty ?? ""} inputMode="decimal" onKeyDown={onlyNumbers} onBlur={(e) => saveAmount(line, "estQty", e.target.value)} readOnly={locked} className={`${FIELD} text-center ${input}`} aria-label="Estimated quantity" />
                  </td>
                  <td className={CELL}>
                    <input key={`ea${line.estAmount}`} defaultValue={line.estAmount ?? ""} inputMode="decimal" onKeyDown={onlyNumbers} onBlur={(e) => saveAmount(line, "estAmount", e.target.value)} readOnly={locked} className={`${FIELD} text-right ${input}`} aria-label="Estimated amount" />
                  </td>
                  <td className={CELL}>
                    <CurrencyPicker locked={locked} value={line.estCurrency} onChange={(v) => saveEstCurrency(line, v)} ariaLabel="Estimated currency" />
                  </td>
                  <td className={`${CELL} ${SPLIT_LINE}`}>
                    <input key={`rq${line.realQty}`} defaultValue={line.realQty ?? ""} inputMode="decimal" onKeyDown={onlyNumbers} onBlur={(e) => saveAmount(line, "realQty", e.target.value)} readOnly={locked} className={`${FIELD} text-center ${input}`} aria-label="Real quantity" />
                  </td>
                  <td className={CELL}>
                    <input key={`ra${line.realAmount}`} defaultValue={line.realAmount ?? ""} inputMode="decimal" onKeyDown={onlyNumbers} onBlur={(e) => saveAmount(line, "realAmount", e.target.value)} readOnly={locked} className={`${FIELD} text-right ${input}`} aria-label="Real Cost" />
                  </td>
                  <td className={CELL}>
                    <CurrencyPicker locked={locked} value={line.realCurrency} onChange={(v) => save(line, { realCurrency: v })} ariaLabel="Real currency" />
                  </td>
                  <td className={CELL}>
                    <input readOnly={locked} className={`${FIELD} ${input}`} key={`in${line.invoiceNumber}`} defaultValue={line.invoiceNumber} onBlur={(e) => saveInvoiceNumber(line, e.target.value)} aria-label="Invoice number" />
                  </td>
                  <td className={`${CELL} text-center`}>
                    <Tooltip title="Received is ticked automatically once the invoice number is filled in">
                      <span>
                        <Checkbox checked={line.received} disabled tabIndex={-1} aria-label="Supplier invoice received" />
                      </span>
                    </Tooltip>
                  </td>
                  <td className={`${CELL} text-right whitespace-nowrap`}>
                    {(() => {
                      const vs = vsEstimate[line.id];
                      return vs ? <ProfitVsEstimate delta={vs.delta} currency={vs.currency} /> : EMPTY_CELL;
                    })()}
                  </td>
                  <td className={CELL}>
                    {/* Locked, it is out of reach of the keyboard too (its options take the focus and
                        the arrow keys); inert also lets the double-click through to the row. */}
                    <div inert={locked}>
                      <Segmented
                        size="small"
                        className={control}
                        value={line.splitMethod}
                        disabled={!line.inSplit}
                        options={SPLIT_OPTIONS}
                        onChange={(v) => save(line, { splitMethod: v as Line["splitMethod"] })}
                        aria-label="Split"
                      />
                    </div>
                  </td>
                  {/* Duplicate and Delete work on a locked row too, without opening it. */}
                  <td className={`${CELL} text-center whitespace-nowrap`} onDoubleClick={(e) => e.stopPropagation()}>
                    <Tooltip title="Duplicate row">
                      <button type="button" disabled={busy} onClick={() => duplicateLine(line, index)} aria-label="Duplicate buying cost row" className={ICON_BTN_GHOST}>
                        <CopyOutlined />
                      </button>
                    </Tooltip>
                    <Tooltip title="Delete row">
                      <button type="button" disabled={busy} onClick={() => remove.mutate(line.id)} aria-label="Delete buying cost row" className={ICON_BTN_DANGER}>
                        <DeleteOutlined />
                      </button>
                    </Tooltip>
                  </td>
                </tr>
                );
              })}
            </tbody>
            {/* Totals under Est. Amount and Real Cost, a line per currency, the currency under Cur. */}
            <tfoot>
              {/* Lined up at the top: with several currencies, the label and each side's first total share a line. */}
              <tr className="bg-slate-50 align-top">
                <td className={`${FOOT_LABEL} !leading-5`} colSpan={5}>
                  Total buying
                </td>
                <td className={FOOT}>
                  {estTotals.length > 0 ? estTotals.map(([currency, total]) => <div key={currency} className="leading-5">{money(total)}</div>) : EMPTY_CELL}
                </td>
                <td className={FOOT_UNIT}>
                  {estTotals.map(([currency]) => <div key={currency} className="leading-5">{currency}</div>)}
                </td>
                <td className={`${SPLIT_LINE} ${FOOT_LINE}`} />
                <td className={FOOT}>
                  {realTotals.length > 0 ? realTotals.map(([currency, total]) => <div key={currency} className="leading-5">{money(total)}</div>) : EMPTY_CELL}
                </td>
                <td className={FOOT_UNIT}>
                  {realTotals.map(([currency]) => <div key={currency} className="leading-5">{currency}</div>)}
                </td>
                <td className={FOOT_LINE} colSpan={5} />
              </tr>
              {totalVs && (
                <tr className="bg-slate-50">
                  <td className={FOOT_LABEL} colSpan={7}>
                    Against the estimates
                  </td>
                  <td className={`${SPLIT_LINE} ${FOOT_LINE}`} colSpan={5} />
                  <td className={FOOT}>
                    <ProfitVsEstimate delta={totalVs.delta} currency={totalVs.currency} className="!text-[13px]" />
                  </td>
                  <td className={FOOT_LINE} colSpan={2} />
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Split over the shipments" extra={<CountChip count={houses.length} />} bodyClassName="rounded-b-xl overflow-hidden">
        {houses.length === 0 ? (
          <p className={`m-0 px-4 ${EMPTY_STATE}`}>No shipments are linked yet — the costs are split once there are some (Linked Shipments tab).</p>
        ) : (
          <>
            {noWm.length > 0 && (
              <div className={`${WARNING_BANNER} mx-4 mt-3`}>
                <WarningOutlined className={WARNING_ICON} />
                <span className={WARNING_TEXT}>
                  <strong>
                    {noWm.map((h) => h.jobNumber).join(", ")} {noWm.length === 1 ? "has" : "have"} no weight or volume
                  </strong>
                  , so {noWm.length === 1 ? "it gets" : "they get"} no share of the lines split by W/M. Fill in the cargo to include{" "}
                  {noWm.length === 1 ? "it" : "them"}.
                </span>
              </div>
            )}
            {nobodyCarries.length > 0 && (
              <div className={`${WARNING_BANNER} mx-4 mt-3`}>
                <WarningOutlined className={WARNING_ICON} />
                <span className={WARNING_TEXT}>
                  <strong>{nobodyCarries.map((l) => (l.category ? chargeLabel(l.category) : "A cost")).join(", ")}: no shipment carries this cost.</strong>{" "}
                  Tick a shipment to include it.
                </span>
              </div>
            )}
            <p className={`m-0 px-4 pt-3 pb-2 ${HINT}`}>
              {splitLines.length > 0
                ? "Untick a shipment to take it out of a line's split: the ticked shipments share the whole line."
                : "No cost is in the split: tick In split on a buying cost to share it out."}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-0 [&_td:first-child]:!pl-4 [&_th:first-child]:!pl-4 [&_td:last-child]:!pr-4 [&_th:last-child]:!pr-4">
                <thead>
                  <tr>
                    <th className={HEAD}>Shipment</th>
                    <th className={`${HEAD} !text-right`}>W/M</th>
                    {splitLines.map((l) => (
                      <th key={l.id} className={`${HEAD} !text-right`} title={l.description}>
                        {l.category ? chargeLabel(l.category) : "Cost"}
                        <span className="block font-normal normal-case text-slate-400">{l.splitMethod === "wm" ? "by W/M" : "per shipment"}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {houses.map((h) => (
                    <tr key={h.shipmentId} className="hover:bg-slate-50/60">
                      <td className={CELL}>
                        <Link href={`/shipments/${h.shipmentId}?tab=costs`} className={`${REF} font-semibold ${LINK}`}>
                          {h.jobNumber}
                        </Link>
                      </td>
                      <td className={`${CELL} text-right tabular-nums`}>
                        {h.freightTon > 0 ? (
                          h.freightTon.toFixed(3)
                        ) : (
                          <Tooltip title="No weight or volume — no share of the lines split by W/M">
                            <span className="text-amber-600 cursor-help">—</span>
                          </Tooltip>
                        )}
                      </td>
                      {splitLines.map((l) => {
                        const s = shareOf(l.id, h.shipmentId);
                        const real = s?.real != null ? `${money(Number(s.real))} ${l.realCurrency}` : null;
                        const est = s?.est != null ? `${money(Number(s.est))} ${l.estCurrency}` : null;
                        const inSplit = !l.excludedShipmentIds.includes(h.shipmentId);
                        // The last shipment that carries it stays in: the line's cost has to land somewhere.
                        const carriers = carriersInLine(l);
                        const last = inSplit && carriers.length === 1 && carriers[0]!.shipmentId === h.shipmentId;
                        return (
                          <td key={l.id} className={`${CELL} text-right tabular-nums`}>
                            <div className="flex items-start justify-end gap-3">
                              <Tooltip title={last ? "At least one shipment stays in the split" : undefined}>
                                <Checkbox
                                  checked={inSplit}
                                  disabled={busy || last}
                                  onChange={(e) => saveInSplit(l, h.shipmentId, e.target.checked)}
                                  aria-label={`${h.jobNumber} in the split of ${l.category ? chargeLabel(l.category) : "this cost"}`}
                                />
                              </Tooltip>
                              <div className="min-w-[110px]">
                                {real ?? est ?? EMPTY_CELL}
                                {real && est && <span className="block text-[11px] text-slate-400">est. {est}</span>}
                              </div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50">
                    <td className={FOOT_LABEL}>Line total</td>
                    <td className={`${FOOT} whitespace-nowrap`}>
                      <span className="mr-3 font-normal text-slate-500">
                        {houses.length} shipment{houses.length === 1 ? "" : "s"}
                      </span>
                      {totalWm.toFixed(3)}
                    </td>
                    {splitLines.map((l) => {
                      const shown = shownTotal(l);
                      const total = shown?.total ?? null;
                      const currency = shown?.currency;
                      const inLine = housesInLine(l);
                      const lineWm = inLine.reduce((sum, h) => sum + h.freightTon, 0);
                      const byWm = l.splitMethod === "wm";
                      return (
                        <td key={l.id} className={FOOT}>
                          {total != null ? `${money(total)} ${currency}` : EMPTY_CELL}
                          {total != null && currency !== "EUR" && !ratesLoading && (
                            <span className="block text-[11px] font-normal text-slate-500">
                              {eurText(eurTotal([[currency ?? "", total]], rates))}
                            </span>
                          )}
                          {/* What one W/M costs on a line split by W/M, over the shipments in its split. */}
                          {total != null && byWm && lineWm > 0 && (
                            <span className="block text-[11px] font-normal text-slate-500">
                              ({currency}
                              {(total / lineWm).toFixed(2)} W/M)
                            </span>
                          )}
                          {inLine.length < houses.length && (
                            <span className="block text-[11px] font-normal text-slate-500">
                              {inLine.length} of {houses.length} shipments{byWm ? ` · ${lineWm.toFixed(3)} W/M` : ""}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 px-4 py-3">
              {splitLines.some((l) => l.category === "container_demurrage") && (
                <span className={`${HINT} mr-auto`}>Container demurrage also goes to each shipment&apos;s selling, at the same amount.</span>
              )}
              {split.sellingOnInvoices > 0 && (
                <span className="text-[12px] text-amber-700">
                  {split.sellingOnInvoices} demurrage selling row{split.sellingOnInvoices === 1 ? " is" : "s are"} on an issued invoice and stay
                  {split.sellingOnInvoices === 1 ? "s" : ""} as invoiced: credit the invoice to change {split.sellingOnInvoices === 1 ? "it" : "them"}.
                </span>
              )}
              {/* A billed shipment keeps what it carries of the split, buying and selling, until its invoice is credited. */}
              {(split.billedKept ?? []).length > 0 && (
                <span className="text-[12px] text-amber-700">
                  {split.billedKept.map((id) => houses.find((h) => h.shipmentId === id)?.jobNumber ?? id).join(", ")}{" "}
                  {split.billedKept.length === 1 ? "is" : "are"} billed and keep{split.billedKept.length === 1 ? "s" : ""} the costs{" "}
                  {split.billedKept.length === 1 ? "it carries" : "they carry"}: processing doesn&apos;t change {split.billedKept.length === 1 ? "it" : "them"}. Credit the
                  invoice to change {split.billedKept.length === 1 ? "it" : "them"}.
                </span>
              )}
              {status && (
                <Tooltip title={status.sentence}>
                  <Pill tone={status.tone}>{status.label}</Pill>
                </Tooltip>
              )}
              {allIn.length > 0 && (
                <span className="whitespace-nowrap text-[13px] font-semibold tabular-nums text-slate-900">
                  All in:{" "}
                  {allIn
                    .map(([currency, total]) => `${money(total)} ${currency}`)
                    .join(" + ")}
                  {!(allIn.length === 1 && allIn[0]![0] === "EUR") && !ratesLoading && (
                    <Tooltip title={`At the rates of ${fixingLabel || "today's ČNB fixing"}, without the ROE %. The split stays in the currencies as received.`}>
                      <span className="ml-1.5 text-indigo-700"> = {eurText(allInEur)}</span>
                    </Tooltip>
                  )}
                </span>
              )}
              <button
                type="button"
                disabled={split.inSync || busy}
                onClick={() => processSplit.mutate()}
                className={`${BTN_PRIMARY} ${BTN_SM}`}
              >
                {processSplit.isPending && <LoadingOutlined />}
                Process the split
              </button>
            </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}

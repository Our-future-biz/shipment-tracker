"use client";

import { useRef } from "react";
import Link from "next/link";
import { Alert, App, Checkbox, Input, Segmented, Select, Spin, Tooltip, type SelectProps } from "antd";
import { DeleteOutlined, LoadingOutlined, PlusOutlined, WarningOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";
import { CURRENCIES } from "@/lib/cargo";
import { chargeLabel, chargeOptions } from "@/lib/chargeCodes";
import { money, normaliseAmount } from "@/lib/money";
import { ProfitVsEstimate } from "@/components/ProfitVsEstimate";
import { EMPTY_CELL } from "@/components/EmptyCell";
import { CountChip, SectionCard } from "@/components/SectionCard";
import { BTN_PRIMARY, BTN_SM, CARD, EMPTY_STATE, HINT, ICON_BTN_GHOST, LABEL_TEXT, LINK, REF, TD_TOTAL, TH } from "@/styles/ui";

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
const SPLIT_WARNING = "mx-4 mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800";
/** A row's Delete: grey, red on hover. */
const ROW_DELETE_BTN = `${ICON_BTN_GHOST} hover:!bg-red-50 hover:!text-red-600`;
/** "No buying costs yet — add the first one": a link-like button. */
const ADD_FIRST_BTN = `${LINK} text-[13px] font-semibold border-0 bg-transparent cursor-pointer disabled:opacity-50`;
// The open list shows the name too, the cell only the code.
const CURRENCY_OPTIONS = CURRENCIES.map(({ code, name }) => ({ value: code, title: name, label: `${code} — ${name}` }));
const currencyOption: SelectProps["optionRender"] = (opt) => (
  <span className="text-[13px]">
    <span className="font-semibold">{String(opt.value)}</span>
    <span className="text-slate-400"> — {String(opt.data?.title ?? "")}</span>
  </span>
);
const currencyLabel: SelectProps["labelRender"] = (p) => String(p.value ?? "");
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

interface Props {
  masterJob: interfaces.MasterJobItem;
}

// A master job's buying costs. Each line is shared out over the master job's shipments - by W/M or
// the same part each, as the line says. The split below always shows how that stands; a shipment
// carries its share, as a read-only row of its own Costs Breakdown, once the split is processed.
export function MasterJobCostsTab({ masterJob }: Props) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: costsKey(masterJob.id),
    queryFn: () => api.invoicing.invoicingMasterJobCosts(masterJob.id),
  });

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

  const add = useMutation({
    mutationKey: writeKey,
    mutationFn: () => api.invoicing.invoicingMasterJobCostAdd(masterJob.id, { splitMethod: "wm" }),
    onSuccess: applied,
    onError: failed("Could not add the cost"),
  });
  const update = useMutation({
    mutationKey: writeKey,
    mutationFn: ({ id, patch }: { id: string; patch: Patch }) => api.invoicing.invoicingMasterJobCostUpdate(masterJob.id, id, patch),
    onSuccess: applied,
    onError: failed("Could not save the cost"),
  });
  const remove = useMutation({
    mutationKey: writeKey,
    mutationFn: (id: string) => api.invoicing.invoicingMasterJobCostDelete(masterJob.id, id),
    onSuccess: applied,
    onError: failed("Could not delete the cost"),
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
    if (value === null) return message.warning(`"${text}" is not a number`);
    if (value !== (line[field] == null ? "" : String(Number(line[field])))) save(line, { [field]: value });
  };
  const saveText = (line: Line, field: "description" | "vendor" | "invoiceNumber", text: string) => {
    if (text.trim() !== line[field]) save(line, { [field]: text.trim() });
  };
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
  // All the split shares out, per currency: adding currencies up would take an exchange rate.
  const allIn = new Map<string, number>();
  for (const l of splitLines) {
    const shown = shownTotal(l);
    if (shown) allIn.set(shown.currency, (allIn.get(shown.currency) ?? 0) + shown.total);
  }
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
  const busy = add.isPending || update.isPending || remove.isPending || processSplit.isPending;
  // Each line and the whole master job against their estimates, worked out on the server at today's ČNB rates.
  const { vsEstimate, totalVsEstimate: totalVs } = data;

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
          Costs Breakdown, read-only there. Split by W/M (freight tons) or the same part for each shipment. Untick In split to keep a line on
          the master job only: no shipment carries it.
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
                <th className={`${HEAD} !text-center whitespace-nowrap`} title="Share this cost out over the shipments">In split</th>
                <th className={HEAD}>Category</th>
                <th className={HEAD}>Description</th>
                <th className={HEAD}>Vendor</th>
                <th className={`${HEAD} !text-center`}>Qty</th>
                <th className={`${HEAD} text-right`}>Est. amount</th>
                <th className={HEAD}>Cur</th>
                <th className={`${HEAD} ${SPLIT_LINE} !text-center`}>Qty</th>
                <th className={`${HEAD} text-right`}>Real cost</th>
                <th className={HEAD}>Cur</th>
                <th className={HEAD}>Invoice number</th>
                <th className={`${HEAD} !text-center`} title="Supplier invoice received">Received</th>
                <th className={`${HEAD} text-right`} title="The real cost against the estimate">Vs estimate</th>
                <th className={HEAD}>Split</th>
                <th className={HEAD} />
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
              {lines.map((line) => (
                <tr key={line.id} className="hover:bg-slate-50/60">
                  <td className={`${CELL} text-center`}>
                    <Checkbox
                      checked={line.inSplit}
                      disabled={busy}
                      onChange={(e) => save(line, { inSplit: e.target.checked })}
                      aria-label={`${line.category ? chargeLabel(line.category) : "This cost"} in the split`}
                    />
                  </td>
                  <td className={`${CELL} min-w-[170px]`}>
                    <Select
                      size="small"
                      className="w-full"
                      showSearch
                      optionFilterProp="label"
                      placeholder="Category"
                      value={line.category || undefined}
                      options={chargeOptions(line.category, masterJob.freightMode)}
                      popupMatchSelectWidth={380}
                      onChange={(v: string) => save(line, { category: v })}
                      aria-label="Category"
                    />
                  </td>
                  <td className={`${CELL} min-w-[140px]`}>
                    <Input size="small" key={`d${line.description}`} defaultValue={line.description} onBlur={(e) => saveText(line, "description", e.target.value)} aria-label="Description" />
                  </td>
                  <td className={`${CELL} min-w-[120px]`}>
                    <Input size="small" key={`v${line.vendor}`} defaultValue={line.vendor} onBlur={(e) => saveText(line, "vendor", e.target.value)} aria-label="Vendor" />
                  </td>
                  <td className={`${CELL} w-[70px]`}>
                    <Input size="small" key={`eq${line.estQty}`} defaultValue={line.estQty ?? ""} onBlur={(e) => saveAmount(line, "estQty", e.target.value)} className="text-right" aria-label="Estimated quantity" />
                  </td>
                  <td className={`${CELL} w-[100px]`}>
                    <Input size="small" key={`ea${line.estAmount}`} defaultValue={line.estAmount ?? ""} onBlur={(e) => saveAmount(line, "estAmount", e.target.value)} className="text-right" aria-label="Estimated amount" />
                  </td>
                  <td className={`${CELL} w-[86px]`}>
                    <Select
                      size="small"
                      className="w-full"
                      showSearch
                      optionFilterProp="label"
                      value={line.estCurrency}
                      options={CURRENCY_OPTIONS}
                      optionRender={currencyOption}
                      labelRender={currencyLabel}
                      popupMatchSelectWidth={false}
                      onChange={(v: string) => save(line, { estCurrency: v })}
                      aria-label="Estimated currency"
                    />
                  </td>
                  <td className={`${CELL} w-[70px] ${SPLIT_LINE}`}>
                    <Input size="small" key={`rq${line.realQty}`} defaultValue={line.realQty ?? ""} onBlur={(e) => saveAmount(line, "realQty", e.target.value)} className="text-right" aria-label="Real quantity" />
                  </td>
                  <td className={`${CELL} w-[100px]`}>
                    <Input size="small" key={`ra${line.realAmount}`} defaultValue={line.realAmount ?? ""} onBlur={(e) => saveAmount(line, "realAmount", e.target.value)} className="text-right" aria-label="Real cost" />
                  </td>
                  <td className={`${CELL} w-[86px]`}>
                    <Select
                      size="small"
                      className="w-full"
                      showSearch
                      optionFilterProp="label"
                      value={line.realCurrency}
                      options={CURRENCY_OPTIONS}
                      optionRender={currencyOption}
                      labelRender={currencyLabel}
                      popupMatchSelectWidth={false}
                      onChange={(v: string) => save(line, { realCurrency: v })}
                      aria-label="Real currency"
                    />
                  </td>
                  <td className={`${CELL} min-w-[120px]`}>
                    <Input size="small" key={`in${line.invoiceNumber}`} defaultValue={line.invoiceNumber} onBlur={(e) => saveText(line, "invoiceNumber", e.target.value)} aria-label="Invoice number" />
                  </td>
                  <td className={`${CELL} text-center`}>
                    <Checkbox checked={line.received} onChange={(e) => save(line, { received: e.target.checked })} aria-label="Supplier invoice received" />
                  </td>
                  <td className={`${CELL} text-right whitespace-nowrap`}>
                    {(() => {
                      const vs = vsEstimate[line.id];
                      return vs ? <ProfitVsEstimate delta={vs.delta} currency={vs.currency} /> : EMPTY_CELL;
                    })()}
                  </td>
                  <td className={CELL}>
                    <Segmented
                      size="small"
                      value={line.splitMethod}
                      disabled={!line.inSplit}
                      options={SPLIT_OPTIONS}
                      onChange={(v) => save(line, { splitMethod: v as Line["splitMethod"] })}
                      aria-label="Split"
                    />
                  </td>
                  <td className={`${CELL} text-center`}>
                    <Tooltip title="Delete - it leaves the shipments too">
                      <button type="button" disabled={busy} onClick={() => remove.mutate(line.id)} aria-label="Delete cost" className={ROW_DELETE_BTN}>
                        <DeleteOutlined />
                      </button>
                    </Tooltip>
                  </td>
                </tr>
              ))}
            </tbody>
            {totalVs && (
              <tfoot>
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
              </tfoot>
            )}
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Split over the shipments" extra={<CountChip count={houses.length} />} bodyClassName="rounded-b-xl overflow-hidden">
        {houses.length === 0 ? (
          <p className={`m-0 px-4 ${EMPTY_STATE}`}>No shipments are linked yet - the costs are split once there are some (MBL Details → Linked shipments).</p>
        ) : (
          <>
            {noWm.length > 0 && (
              <div className={SPLIT_WARNING}>
                <WarningOutlined className="mt-0.5" />
                <span>
                  {noWm.map((h) => h.jobNumber).join(", ")} {noWm.length === 1 ? "has" : "have"} no weight or volume, so{" "}
                  {noWm.length === 1 ? "it gets" : "they get"} no share of the lines split by W/M. Fill in the cargo to include{" "}
                  {noWm.length === 1 ? "it" : "them"}.
                </span>
              </div>
            )}
            {nobodyCarries.length > 0 && (
              <div className={SPLIT_WARNING}>
                <WarningOutlined className="mt-0.5" />
                <span>
                  {nobodyCarries.map((l) => (l.category ? chargeLabel(l.category) : "A cost")).join(", ")}: no shipment carries this cost. Tick a shipment to
                  include it.
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
                        {h.freightTon > 0 ? h.freightTon.toFixed(3) : <span className="text-amber-600">—</span>}
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
              {!split.inSync && (
                <span className="text-[12px] text-amber-700">
                  {split.written > 0
                    ? "Changed since it was processed: the shipments still carry the earlier split."
                    : "Not processed yet: the shipments don't carry these costs."}
                </span>
              )}
              {split.inSync && split.written > 0 && <span className="text-[12px] text-emerald-700">Processed: the shipments carry this split.</span>}
              {allIn.size > 0 && (
                <span className="whitespace-nowrap text-[13px] font-semibold tabular-nums text-slate-900">
                  All in:{" "}
                  {[...allIn]
                    .map(([currency, total]) => `${money(total)} ${currency}`)
                    .join(" + ")}
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

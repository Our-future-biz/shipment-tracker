"use client";

import { useRef } from "react";
import Link from "next/link";
import { App, Button, Checkbox, Input, Segmented, Select, Spin, Tooltip } from "antd";
import { DeleteOutlined, DollarOutlined, PlusOutlined, WarningOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";
import { CURRENCIES } from "@/lib/cargo";
import { chargeLabel, chargeOptions } from "@/lib/chargeCodes";
import { normaliseAmount } from "@/lib/money";
import { ProfitVsEstimate } from "@/components/ProfitVsEstimate";
import { EMPTY_CELL } from "@/components/EmptyCell";
import { HINT, LINK, REF, TD, TD_TOTAL, TH } from "@/styles/ui";
import { MasterJobCard } from "./MasterJobFields";

type View = interfaces.MasterJobCostsView;
type Line = interfaces.MasterJobCostItem;
type Patch = controllers.UpdateMasterJobCostRequest;

// Under "master-jobs": linking or unlinking a shipment (which refreshes those) shows the new split too.
const costsKey = (masterJobId: string) => ["master-jobs", masterJobId, "costs"] as const;

// The line between the estimate and the real cost.
const SPLIT_LINE = "border-l border-l-slate-200";
const CURRENCY_OPTIONS = CURRENCIES.map(({ code }) => ({ value: code, label: code }));
const SPLIT_OPTIONS = [
  { value: "wm", label: "W/M" },
  { value: "shipment", label: "Per shipment" },
];

const amountOf = (n: number) => n.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A line's total as the shipments are charged it: amount × quantity (none counts as 1). */
function lineTotal(amount: string | null, qty: string | null): number | null {
  if (amount == null || amount === "") return null;
  const q = qty == null || qty === "" ? 1 : Number(qty);
  return Number(amount) * (Number.isFinite(q) ? q : 1);
}

interface Props {
  masterJob: interfaces.MasterJobItem;
}

// A master job's buying costs. Each line is shared out over the master job's shipments - by W/M or
// the same part each, as the line says - and every shipment carries its share as a read-only row of
// its own Costs Breakdown, worked out again on every change here and whenever its shipments change.
export function MasterJobCostsTab({ masterJob }: Props) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: costsKey(masterJob.id),
    queryFn: () => api.invoicing.invoicingMasterJobCosts(masterJob.id),
  });

  // The shares are in the shipments' Costs Breakdowns (and their totals) the moment this answers.
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

  if (isError) return <div className="py-10 text-center text-sm text-red-600">The master job&apos;s costs could not be loaded.</div>;
  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spin />
      </div>
    );
  }

  const { lines, houses, shares } = data;
  const shareOf = (lineId: string, shipmentId: string) => shares.find((s) => s.lineId === lineId && s.shipmentId === shipmentId);
  const noWm = houses.filter((h) => !(h.freightTon > 0));
  const totalWm = houses.reduce((sum, h) => sum + h.freightTon, 0);
  const anyWm = lines.some((l) => l.splitMethod === "wm");
  const busy = add.isPending || update.isPending || remove.isPending;
  // Each line and the whole master job against their estimates, worked out on the server at today's ČNB rates.
  const { vsEstimate, totalVsEstimate: totalVs } = data;

  return (
    <div className="flex flex-col gap-3">
      <MasterJobCard
        icon={<DollarOutlined />}
        title="Buying costs"
        actions={
          <Button size="small" icon={<PlusOutlined />} onClick={() => add.mutate()} loading={add.isPending}>
            Add buying cost
          </Button>
        }
      >
        <p className={`mt-0 mb-3 ${HINT}`}>
          Each line is split over the {houses.length} linked shipment{houses.length === 1 ? "" : "s"} and appears in their Costs
          Breakdown, read-only there. Split by W/M (freight tons) or the same part for each shipment.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={TH}>Category</th>
                <th className={TH}>Description</th>
                <th className={TH}>Vendor</th>
                <th className={TH}>Est. qty</th>
                <th className={TH}>Est. amount</th>
                <th className={TH}>Cur</th>
                <th className={`${TH} ${SPLIT_LINE}`}>Qty</th>
                <th className={TH}>Real cost</th>
                <th className={TH}>Cur</th>
                <th className={TH}>Invoice number</th>
                <th className={TH} title="Supplier invoice received">Received</th>
                <th className={TH} title="The real cost against the estimate">Vs estimate</th>
                <th className={TH}>Split</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr>
                  <td colSpan={14} className={`px-2 py-6 text-center ${HINT}`}>
                    No buying costs yet - add one and it is split over the linked shipments.
                  </td>
                </tr>
              )}
              {lines.map((line) => (
                <tr key={line.id}>
                  <td className={`${TD} min-w-[170px]`}>
                    <Select
                      size="small"
                      className="w-full"
                      showSearch
                      optionFilterProp="label"
                      placeholder="Category"
                      value={line.category || undefined}
                      options={chargeOptions(line.category, masterJob.freightMode)}
                      onChange={(v: string) => save(line, { category: v })}
                      aria-label="Category"
                    />
                  </td>
                  <td className={`${TD} min-w-[140px]`}>
                    <Input size="small" key={`d${line.description}`} defaultValue={line.description} onBlur={(e) => saveText(line, "description", e.target.value)} aria-label="Description" />
                  </td>
                  <td className={`${TD} min-w-[120px]`}>
                    <Input size="small" key={`v${line.vendor}`} defaultValue={line.vendor} onBlur={(e) => saveText(line, "vendor", e.target.value)} aria-label="Vendor" />
                  </td>
                  <td className={`${TD} w-[70px]`}>
                    <Input size="small" key={`eq${line.estQty}`} defaultValue={line.estQty ?? ""} onBlur={(e) => saveAmount(line, "estQty", e.target.value)} className="text-right" aria-label="Estimated quantity" />
                  </td>
                  <td className={`${TD} w-[100px]`}>
                    <Input size="small" key={`ea${line.estAmount}`} defaultValue={line.estAmount ?? ""} onBlur={(e) => saveAmount(line, "estAmount", e.target.value)} className="text-right" aria-label="Estimated amount" />
                  </td>
                  <td className={`${TD} w-[86px]`}>
                    <Select size="small" className="w-full" showSearch value={line.estCurrency} options={CURRENCY_OPTIONS} onChange={(v: string) => save(line, { estCurrency: v })} aria-label="Estimated currency" />
                  </td>
                  <td className={`${TD} w-[70px] ${SPLIT_LINE}`}>
                    <Input size="small" key={`rq${line.realQty}`} defaultValue={line.realQty ?? ""} onBlur={(e) => saveAmount(line, "realQty", e.target.value)} className="text-right" aria-label="Real quantity" />
                  </td>
                  <td className={`${TD} w-[100px]`}>
                    <Input size="small" key={`ra${line.realAmount}`} defaultValue={line.realAmount ?? ""} onBlur={(e) => saveAmount(line, "realAmount", e.target.value)} className="text-right" aria-label="Real cost" />
                  </td>
                  <td className={`${TD} w-[86px]`}>
                    <Select size="small" className="w-full" showSearch value={line.realCurrency} options={CURRENCY_OPTIONS} onChange={(v: string) => save(line, { realCurrency: v })} aria-label="Real currency" />
                  </td>
                  <td className={`${TD} min-w-[120px]`}>
                    <Input size="small" key={`in${line.invoiceNumber}`} defaultValue={line.invoiceNumber} onBlur={(e) => saveText(line, "invoiceNumber", e.target.value)} aria-label="Invoice number" />
                  </td>
                  <td className={`${TD} text-center`}>
                    <Checkbox checked={line.received} onChange={(e) => save(line, { received: e.target.checked })} aria-label="Supplier invoice received" />
                  </td>
                  <td className={TD}>
                    {(() => {
                      const vs = vsEstimate[line.id];
                      return vs ? <ProfitVsEstimate delta={vs.delta} currency={vs.currency} /> : EMPTY_CELL;
                    })()}
                  </td>
                  <td className={TD}>
                    <Segmented
                      size="small"
                      value={line.splitMethod}
                      options={SPLIT_OPTIONS}
                      onChange={(v) => save(line, { splitMethod: v as Line["splitMethod"] })}
                      aria-label="Split"
                    />
                  </td>
                  <td className={TD}>
                    <Tooltip title="Delete - it leaves the shipments too">
                      <Button size="small" type="text" danger icon={<DeleteOutlined />} disabled={busy} onClick={() => remove.mutate(line.id)} aria-label="Delete cost" />
                    </Tooltip>
                  </td>
                </tr>
              ))}
            </tbody>
            {totalVs && (
              <tfoot>
                <tr>
                  <td className={TD_TOTAL} colSpan={11}>
                    Against the estimates
                  </td>
                  <td className={TD_TOTAL} colSpan={3}>
                    <ProfitVsEstimate delta={totalVs.delta} currency={totalVs.currency} />
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </MasterJobCard>

      <MasterJobCard icon={<DollarOutlined />} title="Split over the shipments">
        {houses.length === 0 ? (
          <p className={`m-0 ${HINT}`}>No shipments are linked yet - the costs are split once there are some (MBL Details → Linked shipments).</p>
        ) : (
          <>
            {anyWm && noWm.length > 0 && (
              <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                <WarningOutlined className="mt-0.5" />
                <span>
                  {noWm.map((h) => h.jobNumber).join(", ")} {noWm.length === 1 ? "has" : "have"} no weight or volume, so{" "}
                  {noWm.length === 1 ? "it gets" : "they get"} no share of the lines split by W/M. Fill in the cargo to include{" "}
                  {noWm.length === 1 ? "it" : "them"}.
                </span>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={TH}>Shipment</th>
                    <th className={`${TH} !text-right`}>W/M</th>
                    {lines.map((l) => (
                      <th key={l.id} className={`${TH} !text-right`} title={l.description}>
                        {l.category ? chargeLabel(l.category) : "Cost"}
                        <span className="block font-normal normal-case text-slate-400">{l.splitMethod === "wm" ? "by W/M" : "per shipment"}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {houses.map((h) => (
                    <tr key={h.shipmentId}>
                      <td className={TD}>
                        <Link href={`/shipments/${h.shipmentId}`} className={`${REF} font-semibold ${LINK}`}>
                          {h.jobNumber}
                        </Link>
                      </td>
                      <td className={`${TD} text-right tabular-nums`}>
                        {h.freightTon > 0 ? h.freightTon.toFixed(3) : <span className="text-amber-600">—</span>}
                      </td>
                      {lines.map((l) => {
                        const s = shareOf(l.id, h.shipmentId);
                        const real = s?.real != null ? `${amountOf(Number(s.real))} ${l.realCurrency}` : null;
                        const est = s?.est != null ? `${amountOf(Number(s.est))} ${l.estCurrency}` : null;
                        return (
                          <td key={l.id} className={`${TD} text-right tabular-nums`}>
                            {real ?? est ?? EMPTY_CELL}
                            {real && est && <span className="block text-[11px] text-slate-400">est. {est}</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className={TD_TOTAL}>Line total</td>
                    <td className={`${TD_TOTAL} whitespace-nowrap text-right tabular-nums`}>
                      <span className="mr-3 font-normal text-slate-500">
                        {houses.length} shipment{houses.length === 1 ? "" : "s"}
                      </span>
                      {totalWm.toFixed(3)}
                    </td>
                    {lines.map((l) => {
                      const real = lineTotal(l.realAmount, l.realQty);
                      const est = lineTotal(l.estAmount, l.estQty);
                      const total = real ?? est;
                      const currency = real != null ? l.realCurrency : l.estCurrency;
                      return (
                        <td key={l.id} className={`${TD_TOTAL} text-right tabular-nums`}>
                          {total != null ? `${amountOf(total)} ${currency}` : EMPTY_CELL}
                          {/* What one W/M costs on a line split by W/M. */}
                          {total != null && l.splitMethod === "wm" && totalWm > 0 && (
                            <span className="block text-[11px] font-normal text-slate-500">
                              ({currency}
                              {(total / totalWm).toFixed(2)} W/M)
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </MasterJobCard>
    </div>
  );
}

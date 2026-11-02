"use client";

import Link from "next/link";
import { App, Button, Checkbox, Input, Segmented, Select, Spin, Tooltip } from "antd";
import { DeleteOutlined, DollarOutlined, PlusOutlined, WarningOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";
import { CURRENCIES } from "@/lib/cargo";
import { chargeLabel, chargeOptions } from "@/lib/chargeCodes";
import { normaliseAmount } from "@/lib/money";
import { MasterJobCard } from "./MasterJobFields";

type View = interfaces.MasterJobCostsView;
type Line = interfaces.MasterJobCostItem;
type Patch = controllers.UpdateRequest;

// Under "master-jobs": linking or unlinking a shipment (which refreshes those) shows the new split too.
const costsKey = (masterJobId: string) => ["master-jobs", masterJobId, "costs"] as const;

const TH = "px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap";
const CELL = "px-2 py-1.5 align-middle";
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
  const applied = (view: View) => {
    queryClient.setQueryData(costsKey(masterJob.id), view);
    void queryClient.invalidateQueries({ queryKey: ["invoicing"] });
    void queryClient.invalidateQueries({ queryKey: ["shipments"] });
  };
  const failed = (what: string) => (err: unknown) => message.error(`${what}: ${apiErrorMessage(err)}`);

  const add = useMutation({
    mutationFn: () => api.invoicing.invoicingMasterJobCostAdd(masterJob.id, { splitMethod: "wm" }),
    onSuccess: applied,
    onError: failed("Could not add the cost"),
  });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Patch }) => api.invoicing.invoicingMasterJobCostUpdate(masterJob.id, id, patch),
    onSuccess: applied,
    onError: failed("Could not save the cost"),
  });
  const remove = useMutation({
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
  const anyWm = lines.some((l) => l.splitMethod === "wm");
  const busy = add.isPending || update.isPending || remove.isPending;

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
        <p className="mt-0 mb-3 text-xs text-slate-500">
          Each line is split over the {houses.length} linked shipment{houses.length === 1 ? "" : "s"} and appears in their Costs
          Breakdown, read-only there. Split by W/M (freight tons) or the same part for each shipment.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead className="border-b border-slate-200">
              <tr>
                <th className={TH}>Category</th>
                <th className={TH}>Description</th>
                <th className={TH}>Vendor</th>
                <th className={TH}>Est. qty</th>
                <th className={TH}>Est. amount</th>
                <th className={TH}>Cur</th>
                <th className={`${TH} border-l border-slate-300`}>Qty</th>
                <th className={TH}>Real cost</th>
                <th className={TH}>Cur</th>
                <th className={TH}>Invoice number</th>
                <th className={TH} title="Supplier invoice received">Received</th>
                <th className={TH}>Split</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-2 py-6 text-center text-xs text-slate-400">
                    No buying costs yet - add one and it is split over the linked shipments.
                  </td>
                </tr>
              )}
              {lines.map((line) => (
                <tr key={line.id} className="border-b border-slate-100">
                  <td className={`${CELL} min-w-[170px]`}>
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
                    <Select size="small" className="w-full" showSearch value={line.estCurrency} options={CURRENCY_OPTIONS} onChange={(v: string) => save(line, { estCurrency: v })} aria-label="Estimated currency" />
                  </td>
                  <td className={`${CELL} w-[70px] border-l border-slate-300`}>
                    <Input size="small" key={`rq${line.realQty}`} defaultValue={line.realQty ?? ""} onBlur={(e) => saveAmount(line, "realQty", e.target.value)} className="text-right" aria-label="Real quantity" />
                  </td>
                  <td className={`${CELL} w-[100px]`}>
                    <Input size="small" key={`ra${line.realAmount}`} defaultValue={line.realAmount ?? ""} onBlur={(e) => saveAmount(line, "realAmount", e.target.value)} className="text-right" aria-label="Real cost" />
                  </td>
                  <td className={`${CELL} w-[86px]`}>
                    <Select size="small" className="w-full" showSearch value={line.realCurrency} options={CURRENCY_OPTIONS} onChange={(v: string) => save(line, { realCurrency: v })} aria-label="Real currency" />
                  </td>
                  <td className={`${CELL} min-w-[120px]`}>
                    <Input size="small" key={`in${line.invoiceNumber}`} defaultValue={line.invoiceNumber} onBlur={(e) => saveText(line, "invoiceNumber", e.target.value)} aria-label="Invoice number" />
                  </td>
                  <td className={`${CELL} text-center`}>
                    <Checkbox checked={line.received} onChange={(e) => save(line, { received: e.target.checked })} aria-label="Supplier invoice received" />
                  </td>
                  <td className={CELL}>
                    <Segmented
                      size="small"
                      value={line.splitMethod}
                      options={SPLIT_OPTIONS}
                      onChange={(v) => save(line, { splitMethod: v as Line["splitMethod"] })}
                      aria-label="Split"
                    />
                  </td>
                  <td className={CELL}>
                    <Tooltip title="Delete - it leaves the shipments too">
                      <Button size="small" type="text" danger icon={<DeleteOutlined />} disabled={busy} onClick={() => remove.mutate(line.id)} aria-label="Delete cost" />
                    </Tooltip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </MasterJobCard>

      <MasterJobCard icon={<DollarOutlined />} title="Split over the shipments">
        {houses.length === 0 ? (
          <p className="m-0 text-xs text-slate-500">No shipments are linked yet - the costs are split once there are some (MBL Details → Linked shipments).</p>
        ) : (
          <>
            {anyWm && noWm.length > 0 && (
              <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <WarningOutlined className="mt-0.5" />
                <span>
                  {noWm.map((h) => h.jobNumber).join(", ")} {noWm.length === 1 ? "has" : "have"} no weight or volume, so{" "}
                  {noWm.length === 1 ? "it gets" : "they get"} no share of the lines split by W/M. Fill in the cargo to include{" "}
                  {noWm.length === 1 ? "it" : "them"}.
                </span>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead className="border-b border-slate-200">
                  <tr>
                    <th className={TH}>Shipment</th>
                    <th className={`${TH} text-right`}>W/M</th>
                    {lines.map((l) => (
                      <th key={l.id} className={`${TH} text-right`} title={l.description}>
                        {l.category ? chargeLabel(l.category) : "Cost"}
                        <span className="block font-normal normal-case text-slate-400">{l.splitMethod === "wm" ? "by W/M" : "per shipment"}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {houses.map((h) => (
                    <tr key={h.shipmentId} className="border-b border-slate-100">
                      <td className={CELL}>
                        <Link href={`/shipments/${h.shipmentId}`} className="font-medium text-indigo-600 hover:underline">
                          {h.jobNumber}
                        </Link>
                      </td>
                      <td className={`${CELL} text-right tabular-nums ${h.freightTon > 0 ? "text-slate-700" : "text-amber-600"}`}>
                        {h.freightTon > 0 ? h.freightTon.toFixed(3) : "—"}
                      </td>
                      {lines.map((l) => {
                        const s = shareOf(l.id, h.shipmentId);
                        const real = s?.real != null ? `${amountOf(Number(s.real))} ${l.realCurrency}` : null;
                        const est = s?.est != null ? `${amountOf(Number(s.est))} ${l.estCurrency}` : null;
                        return (
                          <td key={l.id} className={`${CELL} text-right tabular-nums`}>
                            {real ?? est ?? <span className="text-slate-300">—</span>}
                            {real && est && <span className="block text-[11px] text-slate-400">est. {est}</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 font-semibold">
                    <td className={CELL} colSpan={2}>
                      Line total
                    </td>
                    {lines.map((l) => {
                      const real = lineTotal(l.realAmount, l.realQty);
                      const est = lineTotal(l.estAmount, l.estQty);
                      return (
                        <td key={l.id} className={`${CELL} text-right tabular-nums`}>
                          {real != null ? `${amountOf(real)} ${l.realCurrency}` : est != null ? `${amountOf(est)} ${l.estCurrency}` : "—"}
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

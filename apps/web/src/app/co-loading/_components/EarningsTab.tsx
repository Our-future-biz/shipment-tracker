"use client";

import { useState } from "react";
import Link from "next/link";
import { Spin } from "antd";
import { WarningOutlined } from "@ant-design/icons";
import { EMPTY_CELL } from "@/components/EmptyCell";
import { KPI_GRID_CLASS, KpiTile } from "@/components/KpiTile";
import { Pill } from "@/components/Pill";
import { CountChip, SectionCard } from "@/components/SectionCard";
import { useSailingBoxCostChanges, useSailingEarnings } from "@/hooks/useCoLoadingServices";
import { formatDate, formatDateTime } from "@/lib/date";
import { BTN, CARD, EMPTY_STATE, HINT, LINK, REF, TD, TD_TOTAL, TH } from "@/styles/ui";
import { tableFreightTons } from "../_lib/boxUtilization";
import {
  BOX_COST_LABEL,
  amountWords,
  boxCostWords,
  boxRateWords,
  changeWords,
  earningsNotes,
  earningsWarnings,
  invoicedHint,
  marginWords,
  profitProvisional,
  type EarningsAmount,
  type SailingBoxCosts,
} from "../_lib/earnings";
import { BoxCostsModal } from "./BoxCostsModal";

/** An amount in a table cell: EUR, with CZK underneath; a dash when the shipment's money is not known. */
function Amount({ amount, known = true, negativeRed = false }: { amount: EarningsAmount; known?: boolean; negativeRed?: boolean }) {
  if (!known) return <>{EMPTY_CELL}</>;
  const words = amountWords(amount);
  return (
    <span className="flex flex-col items-end leading-tight whitespace-nowrap">
      <span className={negativeRed && amount.czk < 0 ? "text-red-600" : undefined}>{words.main}</span>
      {words.under && <span className="text-[11px] font-normal text-slate-500">{words.under}</span>}
    </span>
  );
}

/** The record of the box costs' changes, read once it is opened: who, when, the old figure and the new. */
function BoxCostChanges({ sailingId, several }: { sailingId: string; several: boolean }) {
  const [open, setOpen] = useState(false);
  const { changes, isLoading, isError } = useSailingBoxCostChanges(sailingId, open);
  return (
    <div className="border-t border-slate-100 px-4 py-3">
      <button type="button" className={`${LINK} cursor-pointer border-0 bg-transparent p-0 text-[13px] font-medium`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? "Hide the record of changes" : "Show the record of changes"}
      </button>
      {open &&
        (isLoading ? (
          <p className={`${HINT} m-0 mt-2`}>Reading…</p>
        ) : isError ? (
          <p className="m-0 mt-2 text-[13px] text-red-600" role="alert">
            The record of changes could not be read.
          </p>
        ) : changes.length === 0 ? (
          <p className={`${HINT} m-0 mt-2`}>No box cost has been set yet.</p>
        ) : (
          <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0 text-[13px] text-slate-700">
            {changes.map((c) => (
              <li key={c.id}>
                <span className="text-slate-500 tabular-nums">{formatDateTime(c.changedAt)}</span> · {c.changedByName || "Somebody"} · {changeWords(c, several)}
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

/**
 * The costs of the sailing's boxes: each container's Origin Costs, Ocean Freight and Destination
 * Costs one under the other, its total, and the total of the sailing. "Set costs" opens a
 * container's dialog.
 */
function BoxCosts({ sailingId, containerType, box }: { sailingId: string; containerType: string; box: SailingBoxCosts }) {
  const [editing, setEditing] = useState<number | null>(null);
  const several = box.containers.length > 1;
  const rate = boxRateWords(box, formatDate);
  const edited = box.containers.find((c) => c.containerNo === editing) ?? null;
  return (
    <SectionCard title="Box costs" bodyClassName="p-0" extra={<span className={HINT}>estimates, set per container</span>}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={`${TH} !pl-4`}>{several ? "Container" : "Cost"}</th>
              {several && <th className={TH}>Cost</th>}
              <th className={`${TH} !text-right`}>Estimate</th>
              <th className={`${TH} !text-right max-sm:hidden`}>In EUR</th>
              <th className={`${TH} max-md:hidden`}>Note</th>
              <th className={`${TH} !pr-4`} />
            </tr>
          </thead>
          {box.containers.map((c) => (
            <tbody key={c.containerNo}>
              {c.lines.map((line, i) => (
                <tr key={line.kind}>
                  {several && i === 0 && (
                    <td className={`${TD} !pl-4 align-top font-semibold`} rowSpan={c.lines.length}>
                      {containerType} no. {c.containerNo}
                      <div className="mt-0.5 text-[12px] font-normal text-slate-500 tabular-nums">{box.set ? amountWords(c.total).main : ""}</div>
                    </td>
                  )}
                  <td className={`${TD} ${several ? "" : "!pl-4"}`}>{BOX_COST_LABEL[line.kind]}</td>
                  <td className={`${TD} text-right tabular-nums whitespace-nowrap ${line.amount === null ? "text-slate-400" : ""}`}>{boxCostWords(line.amount, line.currency)}</td>
                  <td className={`${TD} text-right tabular-nums whitespace-nowrap max-sm:hidden`}>
                    {line.amount === null ? EMPTY_CELL : line.czk === null ? <Pill tone="red">No rate</Pill> : amountWords({ czk: line.czk, eur: box.eurRate ? line.czk / box.eurRate : null }).main}
                  </td>
                  <td className={`${TD} max-md:hidden`}>{line.note || EMPTY_CELL}</td>
                  {i === 0 && (
                    <td className={`${TD} !pr-4 text-right align-top`} rowSpan={c.lines.length}>
                      <button type="button" className={BTN} onClick={() => setEditing(c.containerNo)} aria-label={several ? `Set the costs of container ${c.containerNo}` : "Set the costs of the container"}>
                        Set costs
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          ))}
          <tfoot>
            <tr>
              <td className={`${TD_TOTAL} !pl-4`} colSpan={several ? 2 : 1}>
                Total box costs
              </td>
              <td className={`${TD_TOTAL} text-right tabular-nums`} colSpan={2}>
                {box.set ? <Amount amount={box.total} /> : <span className="font-normal text-slate-500">Not set yet</span>}
              </td>
              <td className={`${TD_TOTAL} max-md:hidden`} />
              <td className={`${TD_TOTAL} !pr-4`} />
            </tr>
          </tfoot>
        </table>
      </div>
      {rate && <p className={`${HINT} m-0 border-t border-slate-100 px-4 py-3`}>{rate}</p>}
      <BoxCostChanges sailingId={sailingId} several={several} />
      {edited && <BoxCostsModal open onClose={() => setEditing(null)} sailingId={sailingId} container={edited} containerType={containerType} several={several} />}
    </SectionCard>
  );
}

interface EarningsTabProps {
  sailingId: string;
  /** "40' HC": what the sailing's containers are, for the box costs. */
  containerType: string;
  /** Opens the Linked shipments tab, where shipments are put in the box and taken out. */
  onOpenShipments: () => void;
}

// A sailing's Earnings (Council Outlay 13), for managers and admins: what its linked shipments sell
// for and what they cost of their own, each from its Costs Breakdown - selling lines ticked "Invoice",
// inland delivery and other buying lines. The costs of the box itself (Origin Costs, Ocean Freight,
// Destination Costs) are estimates managers set per container; they are added up and shared over
// the loaded shipments by W/M, which gives each shipment's profit and the sailing's. Until one is
// set, the tab shows what the sailing earns before them. A total with gaps says so; the shipment
// that earns least stands first.
export function EarningsTab({ sailingId, containerType, onOpenShipments }: EarningsTabProps) {
  const { earnings, isLoading, isError, refetch } = useSailingEarnings(sailingId);

  if (!earnings) {
    if (isLoading) {
      return (
        <div className="flex justify-center p-20">
          <Spin size="large" />
        </div>
      );
    }
    return (
      <div className={`${CARD} flex flex-col items-center gap-3 px-5 py-8 text-center`} role="alert">
        <p className="m-0 text-[13px] text-slate-700">{isError ? "The earnings could not be worked out." : "No figures for this sailing."}</p>
        <button type="button" className={BTN} onClick={() => void refetch()}>
          Try again
        </button>
      </div>
    );
  }

  const { totals } = earnings;
  const warnings = earningsWarnings(earnings);
  const linked = earnings.rows.length;
  const known = earnings.moneyKnown;
  const tile = (a: EarningsAmount) => (known ? amountWords(a).main : "Not known");
  const under = (a: EarningsAmount) => (known ? amountWords(a).under : null);
  const boxSet = earnings.boxCosts.set;
  // What the sailing earns: its profit once a box cost is set, what it earns before them until then.
  const earned = totals.profit ?? totals.beforeBox;

  return (
    <div className="flex flex-col gap-4">
      {warnings.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800" role="status">
          <WarningOutlined className="mt-0.5" aria-hidden />
          {warnings.length === 1 ? (
            <span>{warnings[0]}</span>
          ) : (
            <ul className="m-0 flex list-disc flex-col gap-1 pl-4">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className={KPI_GRID_CLASS}>
        <KpiTile label="Revenue" value={tile(totals.selling)} size="text" hint={known ? `invoiced: ${invoicedHint(earnings)}` : undefined} />
        <KpiTile
          label="Box costs"
          value={totals.boxCosts ? amountWords(totals.boxCosts).main : "Not set yet"}
          size="text"
          hint={totals.boxCosts ? (amountWords(totals.boxCosts).under ?? undefined) : "so no profit is shown"}
        />
        <KpiTile label="Inland delivery" value={tile(totals.inland)} size="text" hint={under(totals.inland) ?? undefined} />
        <KpiTile label="Other shipment costs" value={tile(totals.other)} size="text" hint={under(totals.other) ?? undefined} />
        <KpiTile
          label={boxSet ? "Profit" : "Before box costs"}
          value={tile(earned)}
          size="text"
          tone={known && earned.czk < 0 ? "red" : undefined}
          hint={!earnings.complete ? "incomplete" : profitProvisional(earnings) ? "provisional: the rate may move" : (under(earned) ?? undefined)}
          hintTone={!earnings.complete || profitProvisional(earnings) ? "amber" : undefined}
        />
        <KpiTile label="Margin" value={known ? marginWords(totals.marginPct) : "Not known"} size="text" tone={known && (totals.marginPct ?? 0) < 0 ? "red" : undefined} hint={boxSet ? "profit of the revenue" : "once box costs are set"} />
      </div>

      <BoxCosts sailingId={sailingId} containerType={containerType} box={earnings.boxCosts} />

      <SectionCard title="Earnings by shipment" bodyClassName="p-0" extra={linked > 0 ? <CountChip count={linked} /> : undefined}>
        {linked === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <p className={`${EMPTY_STATE} m-0 !py-0`}>No shipments linked yet.</p>
            <button type="button" className={BTN} onClick={onOpenShipments}>
              Open Linked shipments
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={`${TH} !pl-4`}>Shipment</th>
                  <th className={`${TH} max-md:hidden`}>Customer</th>
                  <th className={`${TH} !text-right max-lg:hidden`}>W/M</th>
                  <th className={`${TH} !text-right`}>Selling</th>
                  <th className={`${TH} !text-right max-sm:hidden`}>Inland delivery</th>
                  <th className={`${TH} !text-right max-sm:hidden`}>Other costs</th>
                  {boxSet && <th className={`${TH} !text-right max-lg:hidden`}>Share of box</th>}
                  <th className={`${TH} !text-right`}>{boxSet ? "Profit" : "Before box costs"}</th>
                  <th className={`${TH} !pr-4 max-sm:hidden`}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {earnings.rows.map((row) => {
                  const notes = earningsNotes(row);
                  return (
                    <tr key={row.shipmentId} className={row.counted ? "" : "text-slate-400"}>
                      <td className={`${TD} !pl-4`}>
                        {/* Its Costs tab: where every figure of the row comes from. */}
                        <Link href={`/shipments/${row.shipmentId}?tab=costs`} className={`${REF} ${LINK} font-semibold`}>
                          {row.jobNumber || "(no number yet)"}
                        </Link>
                      </td>
                      <td className={`${TD} max-md:hidden`}>{row.customer || EMPTY_CELL}</td>
                      <td className={`${TD} text-right tabular-nums max-lg:hidden`}>{row.freightTons > 0 ? tableFreightTons(row.freightTons) : EMPTY_CELL}</td>
                      <td className={`${TD} text-right tabular-nums`}>
                        <Amount amount={row.selling} known={row.moneyKnown} />
                      </td>
                      <td className={`${TD} text-right tabular-nums max-sm:hidden`}>
                        <Amount amount={row.inland} known={row.moneyKnown} />
                      </td>
                      <td className={`${TD} text-right tabular-nums max-sm:hidden`}>
                        <Amount amount={row.other} known={row.moneyKnown} />
                      </td>
                      {boxSet && <td className={`${TD} text-right tabular-nums max-lg:hidden`}>{row.boxShare ? <Amount amount={row.boxShare} /> : EMPTY_CELL}</td>}
                      <td className={`${TD} text-right tabular-nums font-semibold`}>
                        {/* A shipment with no share of the box has no profit to show: what it earns before the box stands instead. */}
                        <Amount amount={row.profit ?? row.beforeBox} known={row.moneyKnown} negativeRed={row.counted} />
                      </td>
                      <td className={`${TD} !pr-4 max-sm:hidden`}>
                        <span className="flex flex-wrap gap-1">
                          {notes.map((note) => (
                            <Pill key={note.text} tone={note.tone}>
                              {note.text}
                            </Pill>
                          ))}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td className={`${TD_TOTAL} !pl-4`}>Total</td>
                  <td className={`${TD_TOTAL} max-md:hidden`}>
                    {totals.shipments} {totals.shipments === 1 ? "shipment" : "shipments"}
                  </td>
                  <td className={`${TD_TOTAL} text-right tabular-nums max-lg:hidden`}>{tableFreightTons(totals.freightTons)}</td>
                  <td className={`${TD_TOTAL} text-right tabular-nums`}>
                    <Amount amount={totals.selling} known={known} />
                  </td>
                  <td className={`${TD_TOTAL} text-right tabular-nums max-sm:hidden`}>
                    <Amount amount={totals.inland} known={known} />
                  </td>
                  <td className={`${TD_TOTAL} text-right tabular-nums max-sm:hidden`}>
                    <Amount amount={totals.other} known={known} />
                  </td>
                  {boxSet && <td className={`${TD_TOTAL} text-right tabular-nums max-lg:hidden`}>{totals.boxCosts ? <Amount amount={totals.boxCosts} /> : EMPTY_CELL}</td>}
                  <td className={`${TD_TOTAL} text-right tabular-nums`}>
                    <Amount amount={earned} known={known} negativeRed />
                  </td>
                  <td className={`${TD_TOTAL} !pr-4 max-sm:hidden`}>{known && !earnings.complete ? <Pill tone="amber">Incomplete</Pill> : null}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </SectionCard>

      <p className={`${HINT} m-0`}>
        Every figure is the shipment&apos;s own, from its Costs Breakdown: selling lines ticked &quot;Invoice&quot;, and its buying lines - inland delivery (collection, haulage, on-carriage and
        delivery charges) and its other costs, at the real cost once filled in, the estimate until then. Amounts are valued at each shipment&apos;s own ČNB rate.{" "}
        {boxSet
          ? "The box costs are estimates set on this sailing only: they are added up and shared over the loaded shipments by W/M, to the cent, so a half-empty box shows as a lower profit. Nothing of them is written into a shipment's Costs Breakdown, so this profit differs from Job Profit."
          : "No box cost is set yet, so this is what the sailing earns before them, not its profit."}
        {earnings.notCounted > 0 && known ? ` ${earnings.notCounted} cancelled ${earnings.notCounted === 1 ? "shipment is" : "shipments are"} listed and not counted (selling ${amountWords(earnings.notCountedSelling).main}).` : ""}
      </p>
    </div>
  );
}

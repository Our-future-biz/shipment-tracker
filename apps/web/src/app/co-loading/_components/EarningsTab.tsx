"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Spin } from "antd";
import { WarningOutlined } from "@ant-design/icons";
import { EMPTY_CELL } from "@/components/EmptyCell";
import { KPI_GRID_CLASS, KpiTile, profitTone } from "@/components/KpiTile";
import { Pill } from "@/components/Pill";
import { CountChip, SectionCard } from "@/components/SectionCard";
import { useSailingBoxCostChanges, useSailingEarnings, useSailingUtilization } from "@/hooks/useCoLoadingServices";
import { formatDate, formatDateTime } from "@/lib/date";
import { earnedPerWm, sellRestOf, sellRestWords } from "../_lib/sellRest";
import { WhatIfCard } from "./WhatIfCard";
import { BTN, BTN_PRIMARY, CARD, EMPTY_STATE, HINT, LINK, REF, TD, TD_TOTAL, TH } from "@/styles/ui";
import { tableFreightTons } from "../_lib/boxUtilization";
import { floorWords,
  BOX_COST_LABEL,
  amountWords,
  boxCostWords,
  boxRateWords,
  breakEvenWords,
  unpricedShipments,
  unsoldWords,
  changeWords,
  checksSummary,
  earningsChecks,
  earningsNotes,
  invoicedHint,
  lead,
  marginWords,
  profitRemarks,
  sailingProfitOf,
  type EarningsAmount,
  type EarningsCheck,
  type EarningsNote,
  type SailingBoxCosts,
} from "../_lib/earnings";
import { BoxCostsModal } from "./BoxCostsModal";

/** An amount in a table cell: EUR, with CZK underneath; a dash when the shipment's money is not known. */
function Amount({ amount, known = true, negativeRed = false }: { amount: EarningsAmount; known?: boolean; negativeRed?: boolean }) {
  if (!known) return <>{EMPTY_CELL}</>;
  const words = amountWords(amount);
  return (
    <span className="flex flex-col items-end leading-tight whitespace-nowrap">
      <span className={negativeRed && lead(amount) < 0 ? "text-red-600" : undefined}>{words.main}</span>
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
          <p className={`${HINT} m-0 mt-2`}>Loading…</p>
        ) : isError ? (
          <p className="m-0 mt-2 text-[13px] text-red-600" role="alert">
            The record of changes could not be read.
          </p>
        ) : changes.length === 0 ? (
          <p className={`${HINT} m-0 mt-2`}>No changes yet.</p>
        ) : (
          <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0 text-[13px] text-slate-700">
            {changes.map((c) => (
              <li key={c.id}>
                <span className="text-slate-500 tabular-nums">{formatDateTime(c.changedAt)}</span> · {c.changedByName || "Unknown user"} · {changeWords(c, several, formatDate)}
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
function BoxCosts({ sailingId, containerType, box, closed }: { sailingId: string; containerType: string; box: SailingBoxCosts; closed: boolean }) {
  // The rate sentence is what makes a profit provisional: amber while it is.
  const provisional = box.set && box.rateProvisional && box.containers.some((c) => c.lines.some((l) => l.amount !== null && l.currency !== "CZK"));
  const [editing, setEditing] = useState<number | null>(null);
  const several = box.containers.length > 1;
  const rate = boxRateWords(box, formatDate, closed);
  const edited = box.containers.find((c) => c.containerNo === editing) ?? null;
  return (
    <SectionCard title="Box costs" bodyClassName="p-0" extra={<span className={HINT}>estimates, per container</span>}>
      {/* Nothing set yet: say what to do, so a first-time user is led to it. */}
      {!box.set && (
        <p className="m-0 border-b border-slate-100 px-4 py-3 text-[13px] text-slate-700">
          No box costs yet. Type the estimated Origin Costs, Ocean Freight and Destination Costs of {several ? "each container" : "the container"} to see the sailing&apos;s profit.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={`${TH} !pl-4`}>{several ? "Container" : "Cost"}</th>
              {several && <th className={TH}>Cost</th>}
              <th className={`${TH} !text-right`}>Amount</th>
              <th className={`${TH} !text-right max-sm:hidden`}>Value</th>
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
                      {/* The main action while this container has no costs; a plain "Change costs" once it has. */}
                      <button
                        type="button"
                        className={c.lines.some((l) => l.amount !== null) ? BTN : BTN_PRIMARY}
                        onClick={() => setEditing(c.containerNo)}
                        aria-label={several ? `Set the costs of container ${c.containerNo}` : "Set the costs of the container"}
                      >
                        {c.lines.some((l) => l.amount !== null) ? "Change costs" : "Set box costs"}
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
              {/* On a phone the Value column is hidden: the total stands under Amount, so the footer is as wide as the body. */}
              <td className={`${TD_TOTAL} text-right tabular-nums sm:hidden`}>{box.set ? <Amount amount={box.total} /> : <span className="font-normal text-slate-500">Not set</span>}</td>
              <td className={`${TD_TOTAL} text-right tabular-nums max-sm:hidden`} colSpan={2}>
                {box.set ? <Amount amount={box.total} /> : <span className="font-normal text-slate-500">Not set</span>}
              </td>
              <td className={`${TD_TOTAL} max-md:hidden`} />
              <td className={`${TD_TOTAL} !pr-4`} />
            </tr>
          </tfoot>
        </table>
      </div>
      {rate && <p className={`m-0 border-t border-slate-100 px-4 py-3 ${provisional ? "text-[13px] text-amber-700" : HINT}`}>{rate}</p>}
      <BoxCostChanges sailingId={sailingId} several={several} />
      {edited && <BoxCostsModal open onClose={() => setEditing(null)} sailingId={sailingId} container={edited} containerType={containerType} several={several} />}
    </SectionCard>
  );
}

/** A row's marks: a few words each, the whole sentence on hover. */
function Notes({ notes }: { notes: EarningsNote[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {notes.map((note) => (
        <Pill key={note.text} tone={note.tone} title={note.title}>
          {note.text}
        </Pill>
      ))}
    </span>
  );
}

/**
 * What to know about the figures, folded into one line under the tiles (Council Review 7, K17):
 * amber when something makes a total wrong, grey when there are only notes on how things were
 * counted. Opened, the two kinds stand apart.
 */
function Checks({ checks }: { checks: EarningsCheck[] }) {
  const [open, setOpen] = useState(false);
  const summary = checksSummary(checks);
  if (!summary) return null;
  const wrong = checks.filter((c) => c.wrong);
  const notes = checks.filter((c) => !c.wrong);
  const grave = wrong.length > 0;
  return (
    <div className={`rounded-xl border px-4 py-3 text-[13px] ${grave ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-600"}`} role="status">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {grave && <WarningOutlined aria-hidden />}
        <span className="font-medium">{summary}</span>
        <button type="button" className={`${LINK} cursor-pointer border-0 bg-transparent p-0 text-[13px] font-medium`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? "Hide" : "Show"}
        </button>
      </div>
      {open && (
        <div className="mt-2 flex flex-col gap-2">
          {wrong.length > 0 && (
            <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
              {wrong.map((c) => (
                <li key={c.text}>{c.text}</li>
              ))}
            </ul>
          )}
          {notes.length > 0 && (
            <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-slate-600">
              {notes.map((c) => (
                <li key={c.text}>{c.text}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

interface EarningsTabProps {
  sailingId: string;
  /** "40' HC": what the sailing's containers are, for the box costs. */
  containerType: string;
  /** The service is closed: box costs may still be corrected, the departure date not until it is reopened. */
  closed: boolean;
  /** Opens the Linked shipments tab, where shipments are put in the box and taken out. */
  onOpenShipments: () => void;
}

// A sailing's Earnings (Council Outlay 13), for managers and admins: what its linked shipments sell
// for and what they cost of their own, each from its Costs Breakdown - selling lines ticked "Invoice",
// inland delivery and other buying lines. The costs of the box itself (Origin Costs, Ocean Freight,
// Destination Costs) are estimates managers set per container; they are added up and shared over
// the loaded shipments by W/M, which gives each shipment's profit and the sailing's.
// The answer stands first (Council Review 7, K17): the tiles in the order of the sum, with what is
// earned before the box costs and the profit as two fixed figures; then one line of things to
// check, break-even, the box costs, and the shipments, the one that earns least first.
export function EarningsTab({ sailingId, containerType, closed, onOpenShipments }: EarningsTabProps) {
  const { earnings, isLoading, isError, isFetching, refetch } = useSailingEarnings(sailingId);
  // The box's room, for what the free space must earn (Council Outlay 14, B1) and "What if I add this" (B3).
  const { box } = useSailingUtilization(sailingId);
  const boxCard = useRef<HTMLDivElement>(null);

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
        <p className="m-0 text-[13px] text-slate-700">{isError ? "The earnings could not be loaded." : "Nothing to show for this sailing yet."}</p>
        <button type="button" className={BTN} onClick={() => void refetch()}>
          Try again
        </button>
      </div>
    );
  }

  const { totals } = earnings;
  const linked = earnings.rows.length;
  const known = earnings.moneyKnown;
  // With no shipment linked there is no figure to show: a dash, not 0.00.
  const tile = (a: EarningsAmount) => (!known ? "Not known" : linked === 0 ? "—" : amountWords(a).main);
  const under = (a: EarningsAmount) => (known && linked > 0 ? amountWords(a).under : null);
  const boxSet = earnings.boxCosts.set;
  const sellRest = known ? sellRestOf(earnings, box) : null;
  // The tab's main currency, for a rate typed into "What if I add this".
  const mainCurrency = totals.beforeBox.eur !== null ? "EUR" : "CZK";
  const perWmWords = (v: { value: number; currency: string }) => v.value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // What the box costs for each W/M loaded: the bar a shipment's own earning per W/M is read against.
  const boxPerWm = known && totals.boxCosts && totals.freightTons > 0 ? Math.round((((mainCurrency === "EUR" ? totals.boxCosts.eur : null) ?? totals.boxCosts.czk) / totals.freightTons) * 100) / 100 : null;
  const totalPerWm = known && totals.freightTons > 0 ? earnedPerWm({ counted: true, moneyKnown: true, freightTons: totals.freightTons, beforeBox: totals.beforeBox }) : null;
  const unpriced = unpricedShipments(earnings);
  // What makes the profit less than final, said on its tile (Council Review 7, K7 and K8).
  const remarks = known && boxSet ? profitRemarks(sailingProfitOf(sailingId, earnings)) : [];
  const profit = known ? totals.profit : null;
  const margin = known && totals.marginPct !== null ? `margin ${marginWords(totals.marginPct)}` : null;

  return (
    <div className="flex flex-col gap-4">
      {/* A refresh that failed: the figures below are the last ones read, and that is said. */}
      {isError && !isFetching && (
        <p className="m-0 flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700" role="alert">
          <span>The earnings could not be refreshed: the figures below may be out of date.</span>
          <button type="button" className={BTN} onClick={() => void refetch()}>
            Try again
          </button>
        </p>
      )}

      <div className={KPI_GRID_CLASS}>
        <KpiTile label="Revenue" value={tile(totals.selling)} size="text" hint={known && linked > 0 ? invoicedHint(earnings) : undefined} />
        <KpiTile label="Inland delivery" value={tile(totals.inland)} size="text" hint={under(totals.inland) ?? undefined} />
        <KpiTile label="Other costs" value={tile(totals.other)} size="text" hint={under(totals.other) ?? undefined} />
        <KpiTile
          label="Earned before box costs"
          wrapLabel
          value={tile(totals.beforeBox)}
          size="text"
          tone={known && lead(totals.beforeBox) < 0 ? "red" : undefined}
          hint={known && !earnings.complete ? "incomplete" : (under(totals.beforeBox) ?? undefined)}
          hintTone={known && !earnings.complete ? "amber" : undefined}
        />
        <KpiTile
          label="Box costs"
          value={totals.boxCosts ? amountWords(totals.boxCosts).main : "Not set"}
          size="text"
          hint={totals.boxCosts ? (amountWords(totals.boxCosts).under ?? undefined) : "set them to see the profit"}
          onClick={() => boxCard.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
        />
        <KpiTile
          label="Profit"
          value={!known ? "Not known" : profit ? amountWords(profit).main : "—"}
          size="text"
          tone={profit ? profitTone(lead(profit)) : undefined}
          hint={profit ? [margin, ...remarks].filter(Boolean).join(" · ") || undefined : known ? "once box costs are set" : undefined}
          hintTone={remarks.length > 0 ? "amber" : undefined}
        />
      </div>

      <Checks checks={earningsChecks(earnings)} />
      {/* The service's minimum earning per W/M (Council Outlay 14, B4): how the shipments stand against it. A mark only. */}
      {floorWords(earnings) && (
        <p className={`m-0 text-[13px] ${(earnings.belowFloor ?? 0) > 0 ? "font-medium text-amber-700" : "text-slate-500"}`} role="status">
          {floorWords(earnings)}
        </p>
      )}

      {known && (breakEvenWords(earnings) || unsoldWords(earnings) || unpriced.length > 0) && (
        <section className={`${CARD} flex flex-col gap-1.5 px-5 py-4 text-[13px] text-slate-700`} aria-label="Break-even and unused space">
          {/* Not worked out while a loaded shipment is not priced: these are the ones to open and price. */}
          {unpriced.length > 0 && (
            <p className="m-0 font-medium text-slate-900">
              Break-even is shown once every loaded shipment is priced. Still to price:{" "}
              {unpriced.map((s, i) => (
                <span key={s.shipmentId}>
                  {i > 0 && ", "}
                  <Link href={`/shipments/${s.shipmentId}?tab=costs`} className={`${REF} ${LINK}`}>
                    {s.jobNumber || "(no number yet)"}
                  </Link>
                </span>
              ))}
              .
            </p>
          )}
          {breakEvenWords(earnings) && <p className={`m-0 font-medium ${earnings.breakEven && !earnings.breakEven.reached ? "text-red-600" : "text-slate-900"}`}>{breakEvenWords(earnings)}</p>}
          {unsoldWords(earnings) && <p className="m-0">{unsoldWords(earnings)}</p>}
          {earnings.breakEven && <p className={`${HINT} m-0`}>Worked out from what the loaded shipments earn per W/M today. Shown as a dashed green line on Box utilization.</p>}
          {/* What the free space must earn (B1): the break-even turned into a rate to sell at. */}
          {sellRest && (
            <div className="mt-1.5 border-t border-slate-100 pt-2.5" role="status" aria-label="Sell the rest at">
              <p className="m-0 mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Sell the rest at</p>
              {sellRestWords(sellRest).map((line, i) => (
                <p key={line} className={`m-0 ${i === 0 ? "font-medium text-slate-900" : ""}`}>
                  {line}
                </p>
              ))}
              <p className={`${HINT} m-0 mt-1`}>An estimate: it assumes the rest is cargo like today&apos;s, with costs of its own in the same proportion. &quot;Before the box&quot; is selling less its inland delivery and other costs.</p>
            </div>
          )}
        </section>
      )}

      <div ref={boxCard}>
        <BoxCosts sailingId={sailingId} containerType={containerType} box={earnings.boxCosts} closed={closed} />
      </div>

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
                  <th className={`${TH} !text-right`}>Revenue</th>
                  <th className={`${TH} !text-right max-sm:hidden`}>Inland delivery</th>
                  <th className={`${TH} !text-right max-sm:hidden`}>Other costs</th>
                  <th className={`${TH} !text-right ${boxSet ? "max-lg:hidden" : ""}`}>Earned before box</th>
                  <th className={`${TH} !text-right max-xl:hidden`} title="What the shipment earns before the box, for each W/M it takes">
                    Earned / W/M
                  </th>
                  {boxSet && <th className={`${TH} !text-right max-lg:hidden`}>Box cost share</th>}
                  {boxSet && <th className={`${TH} !text-right`}>Profit</th>}
                  <th className={`${TH} !pr-4 max-sm:hidden`}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {earnings.rows.map((row) => {
                  const notes = earningsNotes(row);
                  const rowPerWm = earnedPerWm(row);
                  return (
                    <tr key={row.shipmentId} className={row.counted ? "" : "text-slate-400"}>
                      <td className={`${TD} !pl-4`}>
                        {/* Its Costs tab: where every figure of the row comes from. */}
                        <Link href={`/shipments/${row.shipmentId}?tab=costs`} className={`${REF} ${LINK} font-semibold`}>
                          {row.jobNumber || "(no number yet)"}
                        </Link>
                        {/* On a phone the Notes column is hidden: the marks stand under the job number instead. */}
                        {notes.length > 0 && (
                          <div className="mt-1 sm:hidden">
                            <Notes notes={notes} />
                          </div>
                        )}
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
                      <td className={`${TD} text-right tabular-nums ${boxSet ? "max-lg:hidden" : "font-semibold"}`}>
                        <Amount amount={row.beforeBox} known={row.moneyKnown} negativeRed={row.counted} />
                      </td>
                      {/* Shipments compared as rates (B2): below the box's cost per W/M, it does not pay its place. */}
                      <td className={`${TD} text-right tabular-nums max-xl:hidden ${rowPerWm && boxPerWm !== null && rowPerWm.currency === mainCurrency && rowPerWm.value < boxPerWm ? "text-red-600" : ""}`}>
                        {rowPerWm ? perWmWords(rowPerWm) : EMPTY_CELL}
                      </td>
                      {boxSet && <td className={`${TD} text-right tabular-nums max-lg:hidden`}>{row.boxShare ? <Amount amount={row.boxShare} /> : EMPTY_CELL}</td>}
                      {/* A shipment with no share of the box, or a cancelled one, has no profit: a dash, never its before-box figure. */}
                      {boxSet && <td className={`${TD} text-right tabular-nums font-semibold`}>{row.profit ? <Amount amount={row.profit} known={row.moneyKnown} negativeRed /> : EMPTY_CELL}</td>}
                      <td className={`${TD} !pr-4 max-sm:hidden`}>
                        <Notes notes={notes} />
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
                  <td className={`${TD_TOTAL} text-right tabular-nums ${boxSet ? "max-lg:hidden" : ""}`}>
                    <Amount amount={totals.beforeBox} known={known} negativeRed />
                  </td>
                  <td className={`${TD_TOTAL} text-right tabular-nums max-xl:hidden`}>
                    {totalPerWm ? (
                      <span className="inline-flex flex-col items-end leading-tight">
                        <span>{perWmWords(totalPerWm)}</span>
                        {boxPerWm !== null && <span className="text-[11px] font-normal text-slate-500">box {boxPerWm.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>}
                      </span>
                    ) : (
                      EMPTY_CELL
                    )}
                  </td>
                  {boxSet && <td className={`${TD_TOTAL} text-right tabular-nums max-lg:hidden`}>{totals.boxCosts ? <Amount amount={totals.boxCosts} /> : EMPTY_CELL}</td>}
                  {boxSet && <td className={`${TD_TOTAL} text-right tabular-nums`}>{profit ? <Amount amount={profit} negativeRed /> : EMPTY_CELL}</td>}
                  <td className={`${TD_TOTAL} !pr-4 max-sm:hidden`}>{known && !earnings.complete ? <Pill tone="amber">Incomplete</Pill> : null}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {earnings.notCounted > 0 && known && (
          <p className={`${HINT} m-0 border-t border-slate-100 px-4 py-3`}>
            {earnings.notCounted} cancelled {earnings.notCounted === 1 ? "shipment is" : "shipments are"} listed in grey and not counted (revenue {amountWords(earnings.notCountedSelling).main}
            {earnings.notCountedCosts.czk !== 0 ? `, own costs ${amountWords(earnings.notCountedCosts).main}` : ""}).
          </p>
        )}
      </SectionCard>

      {/* A sum for an enquiry (B3): only once the box has costs to share and something is loaded. */}
      {known && boxSet && linked > 0 && totals.profit && <WhatIfCard earnings={earnings} box={box} currency={mainCurrency} />}

      <details className={`${HINT} m-0`}>
        <summary className="cursor-pointer font-medium text-slate-600">How these figures are worked out</summary>
        <p className="m-0 mt-2">
          Every figure is the shipment&apos;s own, from its Costs Breakdown: selling lines ticked &quot;Invoice&quot;, and its buying lines - inland delivery (collection, haulage, on-carriage and
          delivery charges) and its other costs, at the real cost once filled in, the estimate until then. Amounts are valued at each shipment&apos;s own ČNB rate. The box costs are estimates
          set on this sailing only: they are added up and shared over the loaded shipments by W/M, to the cent, so a half-empty box shows as a lower profit. Nothing of them is written into a
          shipment&apos;s Costs Breakdown, so this profit differs from Job Profit. Where EUR and CZK disagree, the EUR figure decides profit or loss.
        </p>
      </details>
    </div>
  );
}

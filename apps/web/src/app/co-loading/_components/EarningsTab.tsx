"use client";

import Link from "next/link";
import { Spin } from "antd";
import { WarningOutlined } from "@ant-design/icons";
import { EMPTY_CELL } from "@/components/EmptyCell";
import { KPI_GRID_CLASS, KpiTile } from "@/components/KpiTile";
import { Pill } from "@/components/Pill";
import { CountChip, SectionCard } from "@/components/SectionCard";
import { useSailingEarnings } from "@/hooks/useCoLoadingServices";
import { BTN, CARD, EMPTY_STATE, HINT, LINK, REF, TD, TD_TOTAL, TH } from "@/styles/ui";
import { tableFreightTons } from "../_lib/boxUtilization";
import { amountWords, earningsNotes, earningsWarnings, invoicedHint, type EarningsAmount } from "../_lib/earnings";

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

interface EarningsTabProps {
  sailingId: string;
  /** Opens the Linked shipments tab, where shipments are put in the box and taken out. */
  onOpenShipments: () => void;
}

// A sailing's Earnings (Council Outlay 13), for managers and admins: what its linked shipments sell
// for and what they cost of their own, each from its Costs Breakdown - selling lines ticked "Invoice",
// inland delivery and other buying lines. The costs of the box itself (Origin Costs, Ocean Freight,
// Destination Costs, set per container) come with the next step; until then the tab says so and
// shows what the sailing earns before them. A total with gaps says so; the shipment that earns
// least stands first.
export function EarningsTab({ sailingId, onOpenShipments }: EarningsTabProps) {
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
        <KpiTile label="Revenue" value={tile(totals.selling)} size="text" hint={under(totals.selling) ?? `${totals.shipments} ${totals.shipments === 1 ? "shipment" : "shipments"}`} />
        <KpiTile label="Invoiced so far" value={tile(totals.invoiced)} size="text" hint={known ? invoicedHint(earnings) : undefined} />
        <KpiTile label="Inland delivery" value={tile(totals.inland)} size="text" hint={under(totals.inland) ?? undefined} />
        <KpiTile label="Other shipment costs" value={tile(totals.other)} size="text" hint={under(totals.other) ?? undefined} />
        <KpiTile
          label="Before box costs"
          value={tile(totals.beforeBox)}
          size="text"
          tone={known && totals.beforeBox.czk < 0 ? "red" : undefined}
          hint={earnings.complete ? (under(totals.beforeBox) ?? undefined) : "incomplete"}
          hintTone={earnings.complete ? undefined : "amber"}
        />
        <KpiTile label="Box costs" value="Not set yet" size="text" hint="so no profit is shown" />
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
                  <th className={`${TH} !text-right`}>Selling</th>
                  <th className={`${TH} !text-right max-lg:hidden`}>Invoiced</th>
                  <th className={`${TH} !text-right max-sm:hidden`}>Inland delivery</th>
                  <th className={`${TH} !text-right max-sm:hidden`}>Other costs</th>
                  <th className={`${TH} !text-right`}>Before box costs</th>
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
                      <td className={`${TD} text-right tabular-nums max-lg:hidden`}>
                        <Amount amount={row.invoiced} known={row.moneyKnown} />
                      </td>
                      <td className={`${TD} text-right tabular-nums max-sm:hidden`}>
                        <Amount amount={row.inland} known={row.moneyKnown} />
                      </td>
                      <td className={`${TD} text-right tabular-nums max-sm:hidden`}>
                        <Amount amount={row.other} known={row.moneyKnown} />
                      </td>
                      <td className={`${TD} text-right tabular-nums font-semibold`}>
                        <Amount amount={row.beforeBox} known={row.moneyKnown} negativeRed={row.counted} />
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
                  <td className={`${TD_TOTAL} text-right tabular-nums max-lg:hidden`}>
                    <Amount amount={totals.invoiced} known={known} />
                  </td>
                  <td className={`${TD_TOTAL} text-right tabular-nums max-sm:hidden`}>
                    <Amount amount={totals.inland} known={known} />
                  </td>
                  <td className={`${TD_TOTAL} text-right tabular-nums max-sm:hidden`}>
                    <Amount amount={totals.other} known={known} />
                  </td>
                  <td className={`${TD_TOTAL} text-right tabular-nums`}>
                    <Amount amount={totals.beforeBox} known={known} negativeRed />
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
        delivery charges) and its other costs, at the real cost once filled in, the estimate until then. Amounts are valued at each shipment&apos;s own ČNB rate. The costs of the box itself -
        Origin Costs, Ocean Freight, Destination Costs - are not set on a sailing yet, so this is what the sailing earns before them, not its profit.
        {earnings.notCounted > 0 && known ? ` ${earnings.notCounted} cancelled ${earnings.notCounted === 1 ? "shipment is" : "shipments are"} listed and not counted (selling ${amountWords(earnings.notCountedSelling).main}).` : ""}
      </p>
    </div>
  );
}

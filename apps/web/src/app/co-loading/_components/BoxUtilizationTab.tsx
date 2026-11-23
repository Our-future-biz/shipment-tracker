"use client";

import Link from "next/link";
import { Spin } from "antd";
import { WarningOutlined } from "@ant-design/icons";
import { EMPTY_CELL } from "@/components/EmptyCell";
import { KPI_GRID_CLASS, KpiTile } from "@/components/KpiTile";
import { Pill } from "@/components/Pill";
import { CountChip, SectionCard } from "@/components/SectionCard";
import { useSailingUtilization } from "@/hooks/useCoLoadingServices";
import { BTN, CARD, EMPTY_STATE, HINT, LABEL_TEXT, LINK, REF, TD, TD_TOTAL, TH } from "@/styles/ui";
import {
  fullWords,
  meterBar,
  meterScale,
  meterTone,
  meterWords,
  missingNote,
  noVolumeWords,
  rowNotes,
  shareWords,
  tableCbm,
  tableFreightTons,
  tableKg,
  usedOfLimit,
  type BoxMeter,
  type BoxUtilization,
  type MeterKind,
} from "../_lib/boxUtilization";

const BAR_TONE = { indigo: "bg-indigo-500", amber: "bg-amber-500", red: "bg-red-500" } as const;
const WORDS_TONE = { indigo: "text-slate-700", amber: "text-amber-700", red: "text-red-600" } as const;
const METER_TITLE: Record<MeterKind, string> = { volume: "Volume", weight: "Weight" };

/** A meter that cannot be drawn for this container type, with the reason and the plain total. */
function NoMeter({ kind, total, reason }: { kind: MeterKind; total: string; reason: string }) {
  return (
    <section className={`${CARD} flex flex-col gap-1.5 px-5 py-4`} aria-label={METER_TITLE[kind]}>
      <div className={LABEL_TEXT}>{METER_TITLE[kind]}</div>
      <div className="text-[20px] leading-7 font-bold tabular-nums text-slate-900">{total}</div>
      <p className={`${HINT} m-0`}>{reason}</p>
    </section>
  );
}

/**
 * One meter of the box: what is used of its limit, as a figure, a percentage, a bar and a sentence.
 * The bar runs to the most the box can ever take, with the limit as a mark on it, so "over the plan
 * but still loadable" and "more than the box takes" look different. Colour repeats what the words say.
 */
function Meter({ kind, meter, capacity }: { kind: MeterKind; meter: BoxMeter; capacity: NonNullable<BoxUtilization["capacity"]> }) {
  const tone = meterTone(meter);
  const bar = meterBar(meter);
  const words = meterWords(kind, meter, capacity);
  return (
    <section className={`${CARD} flex flex-col gap-2 px-5 py-4`} aria-label={METER_TITLE[kind]}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <div className={LABEL_TEXT}>{METER_TITLE[kind]}</div>
          <div className="text-[20px] leading-7 font-bold tabular-nums text-slate-900">{usedOfLimit(kind, meter)}</div>
        </div>
        <div className={`text-[20px] leading-7 font-bold tabular-nums ${tone === "red" ? "text-red-600" : "text-slate-900"}`}>{meter.pct}%</div>
      </div>
      <div
        className="relative h-3 rounded-full bg-slate-100"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, meter.pct)}
        aria-valuetext={`${METER_TITLE[kind]} ${usedOfLimit(kind, meter)}, ${meter.pct}%. ${words}`}
        aria-label={METER_TITLE[kind]}
      >
        {/* The bar's width and the mark's place are the figures themselves: the only inline styles. */}
        <span className={`absolute inset-y-0 left-0 rounded-full ${BAR_TONE[tone]}`} style={{ width: `${bar.filledPct}%` }} />
        <span className="absolute -inset-y-1 w-0.5 bg-slate-900" style={{ left: `${bar.limitPct}%` }} aria-hidden />
      </div>
      <div className="flex flex-wrap justify-between gap-x-4 text-[12px] text-slate-500 tabular-nums">
        <span>The mark is the limit</span>
        <span>{meterScale(kind, capacity)}</span>
      </div>
      <p className={`m-0 flex items-start gap-1.5 text-[13px] font-medium ${WORDS_TONE[tone]}`}>
        {tone !== "indigo" && <WarningOutlined className="mt-0.5" aria-hidden />}
        <span>{words}</span>
      </p>
    </section>
  );
}

interface BoxUtilizationTabProps {
  sailingId: string;
  /** Opens the Linked shipments tab, where shipments are put in the box and taken out. */
  onOpenShipments: () => void;
}

// A sailing's Box utilization (Council Outlay 12): how full its box is by volume and by weight,
// from the cargo of its linked shipments. The fuller meter says how full the box is. A total with
// gaps says so, a box over its limit is shown and never refused, and the shipments stand below,
// the biggest share first: the ones to look at when the box is over.
export function BoxUtilizationTab({ sailingId, onOpenShipments }: BoxUtilizationTabProps) {
  const { box, isLoading, isError, refetch } = useSailingUtilization(sailingId);

  if (!box) {
    if (isLoading) {
      return (
        <div className="flex justify-center p-20">
          <Spin size="large" />
        </div>
      );
    }
    return (
      <div className={`${CARD} flex flex-col items-center gap-3 px-5 py-8 text-center`} role="alert">
        <p className="m-0 text-[13px] text-slate-700">{isError ? "The box's fill could not be worked out." : "No figures for this sailing."}</p>
        <button type="button" className={BTN} onClick={() => void refetch()}>
          Try again
        </button>
      </div>
    );
  }

  const { capacity, totals } = box;
  const missing = missingNote(box);
  const linked = box.rows.length;

  return (
    <div className="flex flex-col gap-4">
      {missing && (
        <p className="m-0 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800" role="status">
          <WarningOutlined className="mt-0.5" aria-hidden />
          <span>{missing} The shipments are marked in the list below.</span>
        </p>
      )}

      {capacity ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {box.volume ? <Meter kind="volume" meter={box.volume} capacity={capacity} /> : <NoMeter kind="volume" total={`${tableCbm(totals.volumeCbm)} cbm`} reason={noVolumeWords(box.containerType)} />}
          {box.weight && <Meter kind="weight" meter={box.weight} capacity={capacity} />}
        </div>
      ) : (
        <p className={`${CARD} m-0 px-5 py-4 text-[13px] text-slate-700`} role="status">
          No capacity is known for a {box.containerType}: the totals are shown without a percentage.
        </p>
      )}

      <div className={KPI_GRID_CLASS}>
        <KpiTile label="Box is" value={fullWords(box)} tone={box.fullPct !== null && box.fullPct > 100 ? "red" : undefined} size="text" />
        <KpiTile label="Limited by" value={box.limitedBy === "volume" ? "Volume" : box.limitedBy === "weight" ? "Weight" : "—"} size="text" hint={box.limitedBy ? "the fuller of the two" : undefined} />
        <KpiTile
          label="Shipments"
          value={totals.shipments}
          hint={box.notCounted > 0 ? `${box.notCounted} cancelled, not counted` : "open Linked shipments"}
          onClick={onOpenShipments}
        />
        <KpiTile label="Colli" value={totals.colli.toLocaleString("en-US")} />
        <KpiTile label="W/M" value={tableFreightTons(totals.freightTons)} hint="added shipment by shipment" />
        <KpiTile
          label="Figures missing"
          value={box.missing.weight + box.missing.volume}
          tone={missing ? "amber" : undefined}
          hint={missing ? `${box.missing.weight} weight · ${box.missing.volume} volume` : "none"}
        />
      </div>

      <SectionCard title="Shipments in the box" bodyClassName="p-0" extra={linked > 0 ? <CountChip count={linked} /> : undefined}>
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
                  <th className={`${TH} max-sm:hidden`}>Customer</th>
                  <th className={`${TH} !text-right max-sm:hidden`}>Colli</th>
                  <th className={`${TH} !text-right`}>Weight (kg)</th>
                  <th className={`${TH} !text-right`}>Volume (cbm)</th>
                  <th className={`${TH} !text-right max-md:hidden`}>W/M</th>
                  <th className={TH}>Share of the box</th>
                  <th className={`${TH} !pr-4 max-sm:hidden`}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {box.rows.map((row) => {
                  const notes = rowNotes(row);
                  return (
                    <tr key={row.shipmentId} className={row.counted ? "" : "text-slate-400"}>
                      <td className={`${TD} !pl-4`}>
                        <Link href={`/shipments/${row.shipmentId}`} className={`${REF} ${LINK} font-semibold`}>
                          {row.jobNumber || "(no number yet)"}
                        </Link>
                      </td>
                      <td className={`${TD} max-sm:hidden`}>{row.customer || EMPTY_CELL}</td>
                      <td className={`${TD} text-right tabular-nums max-sm:hidden`}>{row.colli > 0 ? row.colli.toLocaleString("en-US") : EMPTY_CELL}</td>
                      {/* A missing figure is a dash; the note beside it says it is missing, not zero. */}
                      <td className={`${TD} text-right tabular-nums`}>{row.weightMissing ? EMPTY_CELL : tableKg(row.weightKg)}</td>
                      <td className={`${TD} text-right tabular-nums`}>{row.volumeMissing ? EMPTY_CELL : tableCbm(row.volumeCbm)}</td>
                      <td className={`${TD} text-right tabular-nums max-md:hidden`}>{row.freightTons > 0 ? tableFreightTons(row.freightTons) : EMPTY_CELL}</td>
                      <td className={TD}>{(row.counted && shareWords(row)) || EMPTY_CELL}</td>
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
                  <td className={`${TD_TOTAL} max-sm:hidden`}>
                    {totals.shipments} {totals.shipments === 1 ? "shipment" : "shipments"}
                  </td>
                  <td className={`${TD_TOTAL} text-right tabular-nums max-sm:hidden`}>{totals.colli.toLocaleString("en-US")}</td>
                  <td className={`${TD_TOTAL} text-right tabular-nums`}>{tableKg(totals.weightKg)}</td>
                  <td className={`${TD_TOTAL} text-right tabular-nums`}>{tableCbm(totals.volumeCbm)}</td>
                  <td className={`${TD_TOTAL} text-right tabular-nums max-md:hidden`}>{tableFreightTons(totals.freightTons)}</td>
                  <td className={TD_TOTAL} />
                  <td className={`${TD_TOTAL} !pr-4 max-sm:hidden`} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </SectionCard>

      <p className={`${HINT} m-0`}>
        The figures are each shipment&apos;s own: its cargo lines, or its typed totals where it has none. This is a sum, not a stowage check: cargo that cannot be stacked or is long
        fills a box sooner than its cbm says.{capacity?.planningCbm ? ` A box is planned to 85% of its inside volume.` : ""}
      </p>
    </div>
  );
}

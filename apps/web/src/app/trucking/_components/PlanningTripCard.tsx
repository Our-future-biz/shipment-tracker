"use client";

import { useState } from "react";
import Link from "next/link";
import { Dropdown } from "antd";
import { ArrowDownOutlined, ArrowUpOutlined, CloseOutlined, DownOutlined, HolderOutlined, WarningOutlined } from "@ant-design/icons";
import type { PlanningTrip } from "@/hooks/useTruckingConsignments";
import { Badge } from "@/app/warehouse/gate-log/_lib/gate";
import { btnDefault } from "@/app/warehouse/gate-log/_components/job/fields";
import { TRIP_STATUS_CHIP, tripHref } from "../_lib/consignments";
import { TERMS } from "../_lib/glossary";
import { formatPsc } from "../_lib/hauliers";
import { DEADLINE_BADGE, dropStop, moveStop, orderChanged, stopDeadline } from "../_lib/planning";
import { formatMoney, formatQty } from "../_lib/tariffs";
import { TripFillBars } from "./TripFillBars";
import { TruckingStatusChip } from "./TruckingStatusChip";

// Overdue / today, against the trip's day; nothing when the stop is not due yet.
const StopDeadlineBadge = ({ promisedDate, tripDate }: { promisedDate: string | null; tripDate: string }) => {
  const due = stopDeadline(promisedDate, tripDate);
  return due ? <Badge tone={DEADLINE_BADGE[due].tone}>{DEADLINE_BADGE[due].label}</Badge> : null;
};

export type TripCardAction = "print" | "send" | "manifest" | "labels";

interface PlanningTripCardProps {
  trip: PlanningTrip;
  vehicleLabel: string;
  /** A leg from the list is being dragged: the card takes it. */
  legDragging: boolean;
  busy: boolean;
  onDropLeg: (trip: PlanningTrip, legId: string) => void;
  onReorder: (trip: PlanningTrip, stopOrder: string[]) => void;
  onRemove: (trip: PlanningTrip, legId: string) => void;
  onAction: (trip: PlanningTrip, action: TripCardAction) => void;
}

// A trip of the day on the board: haulier and vehicle, the fill as two bars (LDM and kg), its
// stops in order (drag to reorder, or the arrows), the buy price and the warnings (shown, never
// blocking). A leg dropped on it goes on the trip.
export const PlanningTripCard = ({ trip, vehicleLabel, legDragging, busy, onDropLeg, onReorder, onRemove, onAction }: PlanningTripCardProps) => {
  const [draggingStop, setDraggingStop] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const order = trip.stops.map((s) => s.legId);
  const locked = trip.status === "IN_TRANSIT" || trip.status === "DONE" || trip.status === "CANCELLED";
  const takesLegs = legDragging && !locked;

  const reorder = (next: string[]) => orderChanged(order, next) && onReorder(trip, next);

  return (
    <article
      aria-label={`${TERMS.trip} ${trip.ref}`}
      onDragOver={(e) => {
        if (!takesLegs) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        if (!takesLegs) return;
        e.preventDefault();
        const legId = e.dataTransfer.getData("text/plain");
        if (legId) onDropLeg(trip, legId);
      }}
      className={`flex flex-col gap-2 rounded-xl border bg-white p-3 shadow-sm ${over ? "border-indigo-400 ring-2 ring-indigo-200" : takesLegs ? "border-dashed border-indigo-300" : "border-slate-200"}`}
    >
      <header className="flex flex-wrap items-center gap-2">
        <Link href={tripHref(trip.id)} className="font-mono text-[13px] font-bold text-indigo-600 hover:underline">
          {trip.ref}
        </Link>
        <TruckingStatusChip chip={TRIP_STATUS_CHIP[trip.status]} />
        <span className="text-[13px] font-semibold text-slate-800">{trip.haulierName}</span>
        <span className="text-xs text-slate-500">{vehicleLabel}</span>
        <Dropdown
          trigger={["click"]}
          menu={{
            items: [
              { key: "print", label: `Print ${TERMS.transportOrder.toLowerCase()}…`, disabled: locked, onClick: () => onAction(trip, "print") },
              { key: "send", label: `Send ${TERMS.transportOrder.toLowerCase()}…`, disabled: locked, onClick: () => onAction(trip, "send") },
              { key: "manifest", label: `${TERMS.manifest} PDF…`, onClick: () => onAction(trip, "manifest") },
              { key: "labels", label: "Labels PDF…", disabled: !trip.stops.length, onClick: () => onAction(trip, "labels") },
              { type: "divider" },
              { key: "open", label: <Link href={tripHref(trip.id)}>Open trip</Link> },
            ],
          }}
        >
          <button type="button" className={`${btnDefault} ml-auto`} aria-label={`Actions of ${trip.ref}`}>
            Actions <DownOutlined className="text-[10px]" />
          </button>
        </Dropdown>
      </header>

      <TripFillBars fill={trip.fill} capacity={trip.capacity} />
      <div className="flex flex-wrap gap-x-3 text-[11px] tabular-nums text-slate-500">
        <span>
          {trip.stops.length} {trip.stops.length === 1 ? "stop" : "stops"}
        </span>
        <span>
          {formatQty(trip.fill.palletPlaces)}
          {trip.capacity ? ` of ${formatQty(trip.capacity.palletPlaces)}` : ""} pallet places
        </span>
        <span className="ml-auto font-semibold text-slate-700">{trip.buyTotalCzk != null ? formatMoney(trip.buyTotalCzk, "CZK") : "Not priced"}</span>
      </div>

      {trip.warnings.length > 0 && (
        <ul className="m-0 list-none rounded-md bg-amber-50 px-2.5 py-1.5 text-[11.5px] text-amber-800" aria-label="Warnings">
          {trip.warnings.map((w) => (
            <li key={w} className="flex gap-1.5">
              <WarningOutlined className="mt-[3px]" aria-hidden />
              {w}
            </li>
          ))}
        </ul>
      )}

      {trip.stops.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-200 px-3 py-3 text-center text-[11px] text-slate-400">Drop legs here, or use “Add to trip…”</div>
      ) : (
        <ol className="m-0 list-none p-0" aria-label={`Stops of ${trip.ref}`}>
          {trip.stops.map((s, i) => (
            <li
              key={s.legId}
              draggable={!locked && !busy}
              onDragStart={(e) => {
                e.stopPropagation();
                e.dataTransfer.effectAllowed = "move";
                setDraggingStop(s.legId);
              }}
              onDragOver={(e) => draggingStop && e.preventDefault()}
              onDrop={(e) => {
                if (!draggingStop) return;
                e.preventDefault();
                e.stopPropagation();
                reorder(dropStop(order, draggingStop, s.legId));
                setDraggingStop(null);
              }}
              onDragEnd={() => setDraggingStop(null)}
              className={`flex items-center gap-2 border-t border-slate-100 py-1 text-xs ${draggingStop === s.legId ? "opacity-50" : ""}`}
            >
              {!locked && <HolderOutlined className="cursor-grab text-slate-300" aria-hidden />}
              <span className="w-4 text-right tabular-nums text-slate-400">{i + 1}</span>
              <span className="font-mono font-semibold text-slate-800">{s.consignmentRef}</span>
              <span className="min-w-0 flex-1 truncate text-slate-600">
                {trip.kind === "PICKUP_RUN" ? `${formatPsc(s.fromPostcode)} ${s.fromCity}` : `${formatPsc(s.toPostcode)} ${s.toCity}`} · {s.customerName}
              </span>
              <StopDeadlineBadge promisedDate={s.promisedDate} tripDate={trip.date} />
              {s.adr && <Badge tone="a">{TERMS.adr}</Badge>}
              <span className="tabular-nums text-slate-500">{formatQty(s.weightKg)} kg</span>
              {!locked && (
                <span className="inline-flex items-center gap-0.5">
                  <button type="button" className={btnDefault} aria-label={`Move ${s.consignmentRef} up`} disabled={i === 0 || busy} onClick={() => reorder(moveStop(order, s.legId, -1))}>
                    <ArrowUpOutlined />
                  </button>
                  <button type="button" className={btnDefault} aria-label={`Move ${s.consignmentRef} down`} disabled={i === trip.stops.length - 1 || busy} onClick={() => reorder(moveStop(order, s.legId, 1))}>
                    <ArrowDownOutlined />
                  </button>
                  <button type="button" className={btnDefault} aria-label={`Take ${s.consignmentRef} off ${trip.ref}`} disabled={busy} onClick={() => onRemove(trip, s.legId)}>
                    <CloseOutlined />
                  </button>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      {locked && <div className="text-[11px] text-slate-400">On its way — legs and stops no longer change here.</div>}
      {trip.status === "DRAFT" && trip.stops.length > 0 && <div className="text-[11px] text-slate-400">Draft — send the {TERMS.transportOrder.toLowerCase()} next.</div>}
    </article>
  );
};

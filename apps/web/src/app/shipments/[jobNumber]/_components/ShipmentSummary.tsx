"use client";

import Link from "next/link";
import { Tag } from "antd";
import { getFieldValue, type ShipmentItem } from "@/hooks/useShipments";
import { useShipmentTasks } from "@/hooks/useShipmentTasks";
import { formatDate } from "@/lib/date";
import { statusLabel, statusTagColor } from "@/lib/shipmentStatus";
import { CopyButton } from "@/components/CopyButton";
import { getActiveStageFromTasks, getTasksForDirection } from "./taskDefinitions";
import { EMPTY } from "./detailStyles";

/* ── Stepper stages ── */
const SHIPMENT_STAGES = [
  "Booking confirmed",
  "Cargo ready",
  "In transit",
  "Arrive at POD",
  "Customs clearance",
  "Delivered",
];

interface FactProps {
  label: string;
  children: React.ReactNode;
}

// One fact of the summary: a small grey label over its value, as the Invoicing summary has it.
function Fact({ label, children }: FactProps) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] leading-[14px] font-medium uppercase tracking-[.03em] text-slate-500 break-words">{label}</div>
      <div className="mt-0.5 min-h-[22px] flex items-center text-[13px] font-medium text-slate-900 min-w-0">{children}</div>
    </div>
  );
}

const dash = <span className={EMPTY}>—</span>;

/** A plain value that fades out instead of widening its column. */
const text = (v: string) => (v ? <span className="truncate" title={v}>{v}</span> : dash);

/**
 * The shipment at a glance, in the page header on every tab: which job it is, whose, how it
 * goes and where it is now; then from where to where, when, with whom and in what. Read-only:
 * every value is changed in the Shipment Details cards.
 */
export function ShipmentFacts({ shipment }: { shipment: ShipmentItem }) {
  const status = shipment.status ?? "";
  const container = getFieldValue(shipment, "containerNumber");
  const job = shipment.jobNumber ?? shipment.id;
  const pod = getFieldValue(shipment, "pod");
  const destination = getFieldValue(shipment, "destination");

  return (
    // Two rows of six on a wide screen; the columns line up across both rows. The second row
    // always reads POL, ETD, POD, ETA. The status gets the widest column, so it stays on one line.
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.85fr)_minmax(0,0.9fr)_minmax(0,1.45fr)] 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.05fr)_minmax(0,0.8fr)_minmax(0,1.25fr)_minmax(0,1.35fr)] gap-x-6 gap-y-3 lg:gap-y-1.5 lg:[&>*:nth-child(n+7)]:pt-1.5 lg:[&>*:nth-child(n+7)]:border-t lg:[&>*:nth-child(n+7)]:border-indigo-100">
      <Fact label="Job">
        <span className="flex items-center gap-1 min-w-0">
          <span className="truncate text-[16px] leading-6 font-bold text-slate-900 tabular-nums" title={job}>
            {job}
          </span>
          <CopyButton text={job} what="job number" />
        </span>
      </Fact>
      <Fact label="Customer">
        {shipment.customer ? (
          shipment.customerId ? (
            <Link href={`/customers/${shipment.customerId}`} className="truncate text-indigo-600 hover:underline" title={shipment.customer}>
              {shipment.customer}
            </Link>
          ) : (
            text(shipment.customer)
          )
        ) : (
          dash
        )}
      </Fact>
      <Fact label="Trade Direction">{text(getFieldValue(shipment, "tradeDirection"))}</Fact>
      <Fact label="Freight Mode">{text(getFieldValue(shipment, "freightMode"))}</Fact>
      <Fact label="Load Type">{text(getFieldValue(shipment, "loadType"))}</Fact>
      <Fact label="Shipment Status">
        {status ? (
          <Tag color={statusTagColor(status)} title={statusLabel(status)} className="!m-0 !text-[11px] !font-semibold max-w-full truncate">
            {statusLabel(status)}
          </Tag>
        ) : (
          dash
        )}
      </Fact>
      <Fact label="POL">{text(getFieldValue(shipment, "pol"))}</Fact>
      <Fact label="ETD Estimated">
        <span className="tabular-nums text-[14px] font-semibold">{formatDate(shipment.estimatedDeparture) || dash}</span>
      </Fact>
      <Fact label="POD">
        <span className="min-w-0">
          {text(pod)}
          {/* the final destination, which the header's route line also showed */}
          {destination && destination !== pod && (
            <span className="block truncate text-[12px] font-normal text-slate-500" title={destination}>
              Destination: {destination}
            </span>
          )}
        </span>
      </Fact>
      <Fact label="ETA Estimated">
        <span className="tabular-nums text-[14px] font-semibold">{formatDate(shipment.estimatedArrival) || dash}</span>
      </Fact>
      <Fact label="ETA Warehouse/HUB">
        <span className="tabular-nums">{formatDate(getFieldValue(shipment, "etaWarehouse")) || dash}</span>
      </Fact>
      <Fact label="Container Number">
        {container ? (
          // The same chip the Container Details tab gives a container number.
          <span className="truncate tabular-nums text-[12px] font-bold tracking-wide px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600" title={container}>
            {container}
          </span>
        ) : (
          dash
        )}
      </Fact>
    </div>
  );
}

/**
 * The shipment's progress through the six stages, driven by the completed tasks. Every segment is
 * full length - solid indigo done, light indigo in progress, grey not yet - so none reads as a
 * percentage. The names sit centred above the bars, the current one with a dot; the bars line up even when
 * a name wraps.
 */
export function ShipmentProgress({ shipment }: { shipment: ShipmentItem }) {
  const { byKey } = useShipmentTasks(shipment.id);
  const taskList = getTasksForDirection(shipment.tradeDirection);
  const activeIndex = getActiveStageFromTasks(taskList, (key) => !!byKey.get(key)?.completed);

  return (
    <ol
      aria-label="Shipment progress"
      className="bg-white border border-slate-300 rounded-xl shadow-sm list-none grid grid-cols-3 md:grid-cols-6 gap-x-1 gap-y-3 px-5 pt-3 pb-3.5"
    >
      {SHIPMENT_STAGES.map((label, i) => {
        const done = i < activeIndex;
        const current = i === activeIndex;
        return (
          <li key={label} className="min-w-0 flex flex-col justify-end" aria-current={current ? "step" : undefined}>
            <div
              title={label}
              className={`mb-1.5 flex items-start justify-center gap-1 text-center text-[12px] leading-4 ${
                done ? "text-slate-700" : current ? "text-indigo-700 font-semibold" : "text-slate-500"
              }`}
            >
              {/* The current stage carries a dot; every name sits centred over its bar. */}
              {current && (
                <span aria-hidden className="relative flex h-4 w-2.5 shrink-0 items-center justify-center">
                  <span className="absolute size-2.5 rounded-full bg-indigo-100" />
                  <span className="relative size-1.5 rounded-full bg-indigo-600" />
                </span>
              )}
              <span className="min-w-0">
                {label}
                {/* The bar's colour says it on screen; a screen reader is told in words. */}
                <span className="sr-only">{done ? " (done)" : current ? " (in progress)" : ""}</span>
              </span>
            </div>
            {/* Every segment is full length: solid = done, light indigo = in progress, grey = not yet. Never a fraction. */}
            <div
              className={`h-1.5 w-full rounded-full ${
                done ? "bg-indigo-500" : current ? "bg-indigo-300" : "bg-slate-200"
              }`}
            />
          </li>
        );
      })}
    </ol>
  );
}

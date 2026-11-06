"use client";

import Link from "next/link";
import { getFieldValue, type ShipmentItem } from "@/hooks/useShipments";
import { useShipmentTasks } from "@/hooks/useShipmentTasks";
import { formatDate } from "@/lib/date";
import { StatusBadge } from "@/components/StatusBadge";
import { CopyButton } from "@/components/CopyButton";
import { CUSTOMS_CLEARED, getActiveStage, getTasksForDirection } from "./taskDefinitions";
import { EMPTY } from "./detailStyles";
import { CARD, LABEL_TEXT, LINK, PAGE_TITLE, REF } from "@/styles/ui";

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
  className?: string;
  children: React.ReactNode;
}

// One fact of the summary: a small caps label over its value.
function Fact({ label, className = "", children }: FactProps) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className={`${LABEL_TEXT} break-words`}>{label}</div>
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
    // The first column is never narrower than the job number (they run up to CZPROJECT00000023),
    // and only the job number sizes it: a long POL below stays cut. Below xl six columns would
    // leave the others too narrow for a date, so the job number has a row of its own there.
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-[minmax(max-content,1.1fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.85fr)_minmax(0,0.9fr)_minmax(0,1.45fr)] 2xl:grid-cols-[minmax(max-content,1fr)_minmax(0,1fr)_minmax(0,1.05fr)_minmax(0,0.8fr)_minmax(0,1.25fr)_minmax(0,1.35fr)] gap-x-6 gap-y-3 xl:gap-y-1.5 xl:[&>*:not(:first-child)]:[contain:inline-size] xl:[&>*:nth-child(n+7)]:pt-1.5 xl:[&>*:nth-child(n+7)]:border-t xl:[&>*:nth-child(n+7)]:border-indigo-100">
      <Fact label="Job" className="col-span-full xl:col-span-1">
        {/* The job number is the page's title. */}
        <div className="flex items-center gap-1 min-w-0">
          <h1 className={`${PAGE_TITLE} ${REF} truncate`} title={job}>
            {job}
          </h1>
          <CopyButton text={job} what="job number" />
        </div>
      </Fact>
      <Fact label="Customer">
        {shipment.customer ? (
          shipment.customerId ? (
            <Link href={`/customers/${shipment.customerId}`} className={`${LINK} truncate`} title={shipment.customer}>
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
          <StatusBadge status={status} className="max-w-full truncate" />
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
          <span className={`${REF} truncate text-[12px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600`} title={container}>
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
 * The shipment's progress through the six stages, driven by the completed tasks and its dated facts
 * (either only pushes it forward). Every segment is full length - solid indigo done, light indigo in
 * progress, grey not yet - so none reads as a percentage. The names sit centred above the bars, the
 * current one with a dot; the bars line up even when a name wraps.
 */
export function ShipmentProgress({ shipment }: { shipment: ShipmentItem }) {
  const { byKey } = useShipmentTasks(shipment.id);
  const taskList = getTasksForDirection(shipment.tradeDirection);
  const activeIndex = getActiveStage(taskList, (key) => !!byKey.get(key)?.completed, shipment);
  // Which fact a stage rests on, when it rests on one.
  const factOf: Record<string, string> = {
    "In transit": shipment.actualDeparture ? `ATD ${formatDate(shipment.actualDeparture)}` : "",
    "Arrive at POD": shipment.actualArrival ? `ATA ${formatDate(shipment.actualArrival)}` : "",
    "Customs clearance": shipment.customsStatus === CUSTOMS_CLEARED ? CUSTOMS_CLEARED : "",
    Delivered: shipment.actualDeliveryDate ? `Delivered ${formatDate(shipment.actualDeliveryDate)}` : "",
  };

  return (
    <ol
      aria-label="Shipment progress"
      className={`${CARD} list-none grid grid-cols-3 md:grid-cols-6 gap-x-1 gap-y-3 px-5 pt-3 pb-3.5`}
    >
      {SHIPMENT_STAGES.map((label, i) => {
        const done = i < activeIndex;
        const current = i === activeIndex;
        return (
          <li key={label} className="min-w-0 flex flex-col justify-end" aria-current={current ? "step" : undefined}>
            <div
              title={factOf[label] ? `${label}: ${factOf[label]}` : label}
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

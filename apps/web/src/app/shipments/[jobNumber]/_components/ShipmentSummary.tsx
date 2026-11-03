"use client";

import Link from "next/link";
import { Tag } from "antd";
import { CheckOutlined } from "@ant-design/icons";
import { getFieldValue, type ShipmentItem } from "@/hooks/useShipments";
import { useShipmentTasks } from "@/hooks/useShipmentTasks";
import { formatDate } from "@/lib/date";
import { statusLabel, statusTagColor } from "@/lib/shipmentStatus";
import { CopyButton } from "@/components/CopyButton";
import { getActiveStageFromTasks, getTasksForDirection } from "./taskDefinitions";
import { CARD, EMPTY } from "./detailStyles";

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
      <div className="text-[11px] leading-[14px] font-semibold uppercase tracking-[.04em] text-slate-500 break-words">{label}</div>
      <div className="mt-1 min-h-6 flex items-center text-[13px] font-medium text-slate-900 min-w-0">{children}</div>
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
    // Two rows of six on a wide screen; the columns line up across both rows.
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-3.5">
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
      <Fact label="ETD Estimated">
        <span className="tabular-nums">{formatDate(shipment.estimatedDeparture) || dash}</span>
      </Fact>
      <Fact label="ETA Estimated">
        <span className="tabular-nums">{formatDate(shipment.estimatedArrival) || dash}</span>
      </Fact>
      <Fact label="Shipping line / Coloader">{text(getFieldValue(shipment, "shippingLine"))}</Fact>
      <Fact label="Container Number">
        {container ? (
          // The same chip the Container Details tab gives a container number.
          <span className="truncate font-mono text-[12px] font-bold tracking-wide px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600" title={container}>
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
 * The shipment's progress through the six stages, driven by the completed tasks: done stages
 * filled, the current one half-filled and in bold, the rest grey. On top of Shipment Details.
 */
export function ShipmentProgress({ shipment }: { shipment: ShipmentItem }) {
  const { byKey } = useShipmentTasks(shipment.id);
  const taskList = getTasksForDirection(shipment.tradeDirection);
  const activeIndex = getActiveStageFromTasks(taskList, (key) => !!byKey.get(key)?.completed);

  return (
    <div className={`${CARD} grid grid-cols-3 md:grid-cols-6 gap-x-1.5 gap-y-3 px-5 pt-3.5 pb-3`}>
      {SHIPMENT_STAGES.map((label, i) => {
        const done = i < activeIndex;
        const current = i === activeIndex;
        return (
          <div key={label} className="min-w-0">
            <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
              <div className={`h-full rounded-full ${done ? "w-full bg-indigo-500" : current ? "w-1/2 bg-indigo-500" : "w-0"}`} />
            </div>
            <div
              title={label}
              className={`mt-1.5 flex items-start gap-1 text-[12px] leading-4 ${
                done ? "text-indigo-600" : current ? "text-slate-900 font-semibold" : "text-slate-400"
              }`}
            >
              {done && <CheckOutlined className="text-[10px] mt-[3px] shrink-0" />}
              <span className="min-w-0">{label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

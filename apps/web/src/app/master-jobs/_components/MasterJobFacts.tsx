"use client";

import { CopyButton } from "@/components/CopyButton";
import { formatDate } from "@/lib/date";
import { loadTypeLabel } from "@/lib/enums";
import { EMPTY, LABEL_TEXT, PAGE_TITLE, REF } from "@/styles/ui";
import type { MasterJobItem, MasterJobShipmentItem } from "@/hooks/useMasterJobs";
import { linkedCount } from "@/app/shipments/_components/MasterJobDialog";
import { MJ_ANCHORS } from "./MblDetailsTab";
import { jumpTo } from "./MasterJobFields";

interface FactProps {
  label: string;
  className?: string;
  children: React.ReactNode;
}

// One fact of the summary: a small caps label over its value (as ShipmentFacts has it).
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
const text = (v: string | null | undefined) => (v ? <span className="truncate" title={v}>{v}</span> : dash);

interface MasterJobFactsProps {
  masterJob: MasterJobItem;
  shipments: MasterJobShipmentItem[];
  /** How a count reaches its tab, and a date its row on MBL Details; by default it jumps on the page as it is. */
  onJump?: (target: string) => void;
}

/**
 * The master job at a glance, in the page header on every tab, in the shipment header's shape:
 * which master job and MBL, how it goes and with whom; then from where to where, when, and what
 * it holds. Read-only: every value is changed in the MBL Details cards.
 */
// A date that jumps to its row: it reads as the bold date it is, a link only on hover.
const DATE_JUMP = "tabular-nums text-[14px] font-semibold text-slate-900 bg-transparent border-0 p-0 cursor-pointer hover:text-indigo-600 hover:underline";

// The chip the shipment's summary gives its container number; here it holds the linked shipments.
const CHIP = `${REF} truncate text-[12px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600`;

export function MasterJobFacts({ masterJob: mj, shipments, onJump = jumpTo }: MasterJobFactsProps) {
  return (
    // The shipment header's columns (ShipmentFacts), so Port of Loading, ETD, Port of Discharge and ETA stay where they are
    // when you go from a house to its master job.
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-[minmax(max-content,1.1fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.85fr)_minmax(0,0.9fr)_minmax(0,1.45fr)] 2xl:grid-cols-[minmax(max-content,1fr)_minmax(0,1fr)_minmax(0,1.05fr)_minmax(0,0.8fr)_minmax(0,1.25fr)_minmax(0,1.35fr)] gap-x-6 gap-y-3 xl:gap-y-1.5 xl:[&>*:not(:first-child)]:[contain:inline-size] xl:[&>*:nth-child(n+7)]:pt-1.5 xl:[&>*:nth-child(n+7)]:border-t xl:[&>*:nth-child(n+7)]:border-indigo-100">
      <Fact label="Master Job" className="col-span-full xl:col-span-1">
        {/* The master job number is the page's title, as the job number is on a shipment. */}
        <div className="flex items-center gap-1 min-w-0">
          <h1 className={`${PAGE_TITLE} ${REF} truncate`} title={mj.mczNumber}>
            {mj.mczNumber}
          </h1>
          <CopyButton text={mj.mczNumber} what="master job number" />
        </div>
      </Fact>
      <Fact label="Master BoL Number">
        {mj.masterBolNumber ? (
          <span className={`${REF} truncate`} title={mj.masterBolNumber}>
            {mj.masterBolNumber}
          </span>
        ) : (
          dash
        )}
      </Fact>
      <Fact label="Trade Direction">{text(mj.tradeDirection)}</Fact>
      <Fact label="Freight Mode">{text(mj.freightMode)}</Fact>
      <Fact label="Load Type">{text(mj.loadType ? loadTypeLabel(mj.loadType, mj.freightMode) : "")}</Fact>
      <Fact label="Shipping line / Coloader">{text(mj.shippingLine)}</Fact>
      <Fact label="Port of Loading">{text(mj.pol)}</Fact>
      {/* The dates jump to their rows in MBL Details, as the old summary tiles did. */}
      <Fact label="ETD Estimated">
        <button type="button" onClick={() => onJump(MJ_ANCHORS.etd)} title="Go to ETD Estimated" className={DATE_JUMP}>
          {formatDate(mj.estimatedDeparture) || dash}
        </button>
      </Fact>
      <Fact label="Port of Discharge">
        <span className="min-w-0">
          {mj.pod ? <span className="block truncate" title={mj.pod}>{mj.pod}</span> : dash}
          {/* the final destination, as the shipment header's Port of Discharge fact shows it */}
          {mj.destination && mj.destination !== mj.pod && (
            <span className="block truncate text-[12px] font-normal text-slate-500" title={mj.destination}>
              Destination: {mj.destination}
            </span>
          )}
        </span>
      </Fact>
      <Fact label="ETA Estimated">
        <button type="button" onClick={() => onJump(MJ_ANCHORS.eta)} title="Go to ETA Estimated" className={DATE_JUMP}>
          {formatDate(mj.estimatedArrival) || dash}
        </button>
      </Fact>
      <Fact label="ETA Warehouse/HUB">
        <span className="tabular-nums">{formatDate(mj.etaWarehouse) || dash}</span>
      </Fact>
      {/* Where the shipment shows its container number in a chip, the master job shows its houses:
          the same chip, which opens Linked Shipments. */}
      <Fact label="Linked Shipments">
        <button
          type="button"
          onClick={() => onJump(MJ_ANCHORS.shipments)}
          title="Go to Linked Shipments"
          className={`${CHIP} border-0 cursor-pointer transition-colors hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500`}
        >
          {linkedCount(shipments.length)}
        </button>
      </Fact>
    </div>
  );
}

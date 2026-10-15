"use client";

import Link from "next/link";
import { Tooltip } from "antd";
import { StarFilled } from "@ant-design/icons";
import { SectionCard } from "@/components/SectionCard";
import type { TripDetail } from "@/hooks/useTruckingConsignments";
import { formatDate, formatDateTime } from "@/lib/date";
import { btnDefault, btnPrimary } from "@/app/warehouse/gate-log/_components/job/fields";
import { TRIP_STATUS_CHIP, tripHref, type ActionState, type ConsignmentActions } from "../../_lib/consignments";
import { TERMS } from "../../_lib/glossary";
import { formatMoney, versionLabel } from "../../_lib/tariffs";
import { HaulierIssueList } from "../../_components/HaulierIssueList";
import { HaulierStatusChip } from "../../_components/HaulierStatusChip";
import { PriceSnapshotTable } from "../../_components/PriceSnapshotTable";
import { TruckingStatusChip } from "../../_components/TruckingStatusChip";
import type { TripDialog } from "./TripDialogs";
import { TripVehicleForm } from "./TripVehicleForm";

const Line = ({ k, v }: { k: string; v: string }) => (
  <div className="flex items-baseline gap-2 border-b border-slate-100 py-1 text-xs last:border-b-0">
    <span className="w-[150px] shrink-0 text-[11px] font-bold uppercase tracking-wide text-slate-500">{k}</span>
    <span className={`min-w-0 flex-1 font-medium ${v ? "text-slate-900" : "text-slate-300"}`}>{v || "—"}</span>
  </div>
);

interface ActionButtonProps {
  state: ActionState;
  label: string;
  primary?: boolean;
  onClick: () => void;
}

// A button that, when it cannot be used now, says why on hover.
const ActionButton = ({ state, label, primary, onClick }: ActionButtonProps) => (
  <Tooltip title={state.allowed ? undefined : state.reason}>
    <span className="inline-flex">
      <button type="button" className={primary ? btnPrimary : btnDefault} disabled={!state.allowed} onClick={onClick} aria-label={state.allowed ? undefined : `${label} — ${state.reason}`}>
        {label}
      </button>
    </span>
  </Tooltip>
);

interface TripPanelProps {
  trip: TripDetail;
  /** What the trip's transport order allows now (an FTL trip: its consignment's actions); null while it loads (buttons then wait). */
  actions: Pick<ConsignmentActions, "printOrder" | "sendOrder" | "recordConfirmation"> | null;
  manager: boolean;
  /** Shown on the consignment page: the trip's ref links to its own page. */
  linkToTrip?: boolean;
  onDialog: (dialog: TripDialog) => void;
}

// A trip as Trip & haulier shows it: the haulier and its status, the truck and driver, the transport
// order (sent, recorded only, confirmed, the haulier's link), the buy price and the hauliers the
// engine offered when it was planned.
export const TripPanel = ({ trip, actions, manager, linkToTrip = false, onDialog }: TripPanelProps) => {
  const order = trip.transportOrder;
  const closed = trip.status === "CANCELLED" || trip.status === "DONE";
  const waiting: ActionState = { allowed: false, reason: "Loading…" };
  const print = actions?.printOrder ?? waiting;
  const send = actions?.sendOrder ?? waiting;
  const confirm = actions?.recordConfirmation ?? waiting;
  const sent = !!order?.sentAt;

  let orderState = "Not sent yet";
  if (order?.rejectedAt) orderState = `Rejected by the haulier ${formatDateTime(order.rejectedAt)}${order.rejectReason ? `: “${order.rejectReason}”` : ""}`;
  else if (order?.confirmedAt) orderState = `Confirmed ${formatDateTime(order.confirmedAt)} ${order.confirmedVia === "LINK" ? "by the haulier through the link" : "— recorded by a user"}`;
  else if (sent) orderState = "Waiting for the haulier to confirm";

  return (
    <div className="flex flex-col gap-4">
      <SectionCard
        title={`${TERMS.trip} · ${TERMS.haulier}`}
        extra={
          <span className="flex items-center gap-2">
            {linkToTrip ? (
              <Link href={tripHref(trip.id)} className="font-mono text-xs font-semibold text-indigo-600 hover:underline">
                {trip.ref}
              </Link>
            ) : (
              <span className="font-mono text-xs font-semibold text-slate-700">{trip.ref}</span>
            )}
            <TruckingStatusChip chip={TRIP_STATUS_CHIP[trip.status]} />
          </span>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/trucking/hauliers/${trip.haulierCustomerId}`} className="text-[15px] font-semibold text-indigo-600 hover:underline">
              {trip.haulierName}
            </Link>
            <HaulierStatusChip status={trip.haulierStatus} />
            <span className="text-xs text-slate-500">
              {trip.kind === "FTL" ? "Planned pick-up" : "Date"} {formatDate(trip.plannedPickupDate)}
            </span>
            {manager && !closed && (
              <button type="button" className={`${btnDefault} ml-auto`} onClick={() => onDialog("cancel")}>
                Cancel trip…
              </button>
            )}
          </div>
          {trip.haulierIssues.length > 0 && <HaulierIssueList issues={trip.haulierIssues} />}
          <TripVehicleForm trip={trip} readOnly={closed} />
        </div>
      </SectionCard>

      <SectionCard title={TERMS.transportOrder}>
        <div className="flex flex-col gap-3">
          <div>
            <Line k="Number" v={order?.number ?? ""} />
            <Line k="State" v={orderState} />
            <Line k="Sent" v={sent ? `${formatDateTime(order?.sentAt)}${order?.sentBy ? ` · ${order.sentBy}` : ""}${order?.recordedOnly ? " · recorded only (not e-mailed)" : ""}` : ""} />
            <Line k="Pick-up PIN" v={order ? (order.pinPrinted ? "Printed on the order (not kept)" : "Not printed") : ""} />
            <Line k="Haulier's link" v={order?.podLinkExpiresAt ? `In the PDF · valid to ${formatDate(order.podLinkExpiresAt)}` : sent ? "" : "Made when the order is sent"} />
          </div>
          {!closed && (
            <div className="flex flex-wrap gap-2">
              <ActionButton state={print} label="Print…" onClick={() => onDialog("print")} />
              <ActionButton state={send} label={sent ? "Send again…" : "Send…"} primary={!sent} onClick={() => onDialog("send")} />
              <ActionButton state={confirm} label="Record confirmation…" primary={sent && confirm.allowed} onClick={() => onDialog("confirm")} />
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Buy price">
        {trip.buy ? <PriceSnapshotTable price={trip.buy} /> : <p className="m-0 text-[13px] text-slate-500">No buy price.</p>}
      </SectionCard>

      {trip.buyCandidates.length > 0 && (
        <SectionCard title="Hauliers offered when planned">
          <table className="w-full border-collapse text-[12px]">
            <tbody>
              {trip.buyCandidates.map((b, i) => (
                <tr key={`${b.ownerCustomerId}-${i}`} className={`border-b border-slate-50 ${b.ownerCustomerId === trip.haulierCustomerId ? "font-semibold" : ""}`}>
                  <td className="px-2 py-1 w-5">{b.preferred && <StarFilled className="text-amber-500" aria-label="Preferred lane" />}</td>
                  <td className="px-2 py-1 text-slate-800">
                    {b.ownerName}
                    {i === 0 ? <span className="ml-1.5 text-[11px] font-normal text-indigo-600">suggested</span> : null}
                    {b.ownerCustomerId === trip.haulierCustomerId ? <span className="ml-1.5 text-[11px] font-normal text-emerald-700">chosen</span> : null}
                  </td>
                  <td className="px-2 py-1 text-slate-500">
                    {b.tariffName} {versionLabel(b)}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">{formatMoney(b.total, b.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      )}
    </div>
  );
};

"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Tooltip } from "antd";
import { CameraOutlined, PaperClipOutlined, PlusOutlined } from "@ant-design/icons";
import type { DeliveryException } from "@/hooks/useTruckingControl";
import type { ConsignmentDetail } from "@/hooks/useTruckingConsignments";
import { formatDateTime } from "@/lib/date";
import { remeasurementHref } from "@/app/warehouse/_components/remeasurementLinks";
import { btnDefault, btnPrimary } from "@/app/warehouse/gate-log/_components/job/fields";
import { CAUSE_LABELS, DECISION_LABELS, EXCEPTION_KIND_LABELS, FAILED_REASON_LABELS, closeState, decideState, exceptionChip } from "../../_lib/exceptions";
import type { ActionState } from "../../_lib/consignments";
import { formatMoney } from "../../_lib/tariffs";
import { TruckingStatusChip } from "../../_components/TruckingStatusChip";

export type ExceptionAction = "decide" | "close" | "photo";

const ActionButton = ({ state, label, onClick, icon }: { state: ActionState; label: string; onClick: () => void; icon?: ReactNode }) => (
  <Tooltip title={state.allowed ? undefined : state.reason}>
    <span className="inline-flex">
      <button type="button" className={btnDefault} disabled={!state.allowed} onClick={onClick}>
        {icon} {label}
      </button>
    </span>
  </Tooltip>
);

const Fact = ({ k, v }: { k: string; v: ReactNode }) => (
  <span>
    <span className="text-slate-500">{k}</span> <span className="font-semibold text-slate-800">{v}</span>
  </span>
);

const ExceptionCard = ({ e, legText, onAction }: { e: DeliveryException; legText: string | null; onAction: (e: DeliveryException, action: ExceptionAction) => void }) => {
  const open = !e.closedAt;
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <header className="flex flex-wrap items-center gap-2">
        <TruckingStatusChip chip={exceptionChip(e)} />
        <span className="text-[14px] font-semibold text-slate-800">
          {EXCEPTION_KIND_LABELS[e.kind]}
          {e.failedReason ? ` — ${FAILED_REASON_LABELS[e.failedReason]}` : ""}
        </span>
        <span className="text-xs text-slate-400">
          raised {formatDateTime(e.createdAt)}
          {e.createdBy ? ` by ${e.createdBy}` : ""}
        </span>
        {open && (
          <span className="ml-auto flex flex-wrap gap-2">
            <ActionButton state={decideState(e)} label={e.decision === "PENDING" ? "Decide…" : "Change decision…"} onClick={() => onAction(e, "decide")} />
            <ActionButton state={closeState(e)} label="Close…" onClick={() => onAction(e, "close")} />
            <ActionButton state={{ allowed: true, reason: "" }} label="Add photo…" icon={<CameraOutlined />} onClick={() => onAction(e, "photo")} />
          </span>
        )}
      </header>
      <p className="mt-2 mb-2 whitespace-pre-wrap text-[13px] text-slate-700">{e.description}</p>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
        <Fact k="Cause" v={CAUSE_LABELS[e.cause]} />
        <Fact k="Decision" v={DECISION_LABELS[e.decision]} />
        {e.amount != null && <Fact k="Amount" v={formatMoney(e.amount, e.currency)} />}
        {e.pieces != null && <Fact k="Pieces" v={e.pieces} />}
        {e.waitingMinutes != null && <Fact k="Waited" v={`${e.waitingMinutes} min`} />}
        {legText && <Fact k="Leg" v={legText} />}
        {e.decidedAt && <Fact k="Decided" v={`${formatDateTime(e.decidedAt)}${e.decidedBy ? ` · ${e.decidedBy}` : ""}`} />}
        {e.closedAt && <Fact k="Closed" v={formatDateTime(e.closedAt)} />}
        {e.warehouseExceptionId && <Fact k="From" v="a Warehouse exception" />}
      </div>
      {e.photos.length > 0 && (
        <ul className="mt-2 mb-0 flex list-none flex-wrap gap-2 p-0">
          {e.photos.map((p) => (
            <li key={p.id} className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-0.5 text-[11.5px] text-slate-600">
              <PaperClipOutlined aria-hidden /> {p.fileName}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
};

interface ConsignmentExceptionsTabProps {
  c: ConsignmentDetail;
  onCreate: () => void;
  onAction: (e: DeliveryException, action: ExceptionAction) => void;
}

// What went wrong at delivery and who bears it; the Warehouse's damage / short / over records of
// the job are shown below, read-only (they are handled in Warehouse).
export const ConsignmentExceptionsTab = ({ c, onCreate, onAction }: ConsignmentExceptionsTabProps) => {
  const legText = (legId: string | null) => {
    const leg = legId ? c.legs.find((l) => l.id === legId) : null;
    return leg ? `${leg.fromText} → ${leg.toText}` : null;
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="m-0 flex-1 text-[13px] text-slate-500">
          An open exception keeps {c.ref} from Ready to bill until it is decided and closed. Charging the customer, claiming from the haulier or absorbing a cost above 0 is a
          manager&apos;s decision.
        </p>
        {c.status !== "CANCELLED" && (
          <button type="button" className={btnPrimary} onClick={onCreate}>
            <PlusOutlined /> New exception…
          </button>
        )}
      </div>

      {c.exceptions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-8 text-center text-[13px] text-slate-400">No exceptions on this consignment.</div>
      ) : (
        c.exceptions.map((e) => <ExceptionCard key={e.id} e={e} legText={legText(e.legId)} onAction={onAction} />)
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="m-0 text-[11px] font-bold uppercase tracking-wide text-slate-500">Warehouse exceptions (read-only)</h3>
          <Link href={remeasurementHref(c.shipmentId)} className="ml-auto text-[12px] font-semibold text-indigo-600 hover:underline">
            Open in Warehouse
          </Link>
        </div>
        {c.warehouseExceptions.length === 0 ? (
          <p className="mt-2 mb-0 text-[12.5px] text-slate-400">None recorded at our warehouse for job {c.jobNumber}.</p>
        ) : (
          <table className="mt-2 w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="py-1.5 pr-3">Kind</th>
                <th className="py-1.5 pr-3">Pieces</th>
                <th className="py-1.5 pr-3">Note</th>
                <th className="py-1.5 pr-3">Status</th>
                <th className="py-1.5">Recorded</th>
              </tr>
            </thead>
            <tbody>
              {c.warehouseExceptions.map((w) => (
                <tr key={w.id} className="border-b border-slate-100 last:border-b-0 align-top">
                  <td className="py-1.5 pr-3 font-semibold text-slate-800">{w.kind}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{w.pieces ?? "—"}</td>
                  <td className="py-1.5 pr-3">{w.note || "—"}</td>
                  <td className="py-1.5 pr-3">{w.status}</td>
                  <td className="py-1.5">{formatDateTime(w.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
};

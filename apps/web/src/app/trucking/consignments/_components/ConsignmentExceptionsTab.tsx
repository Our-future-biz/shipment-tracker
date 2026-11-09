"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Tooltip } from "antd";
import { CameraOutlined, PaperClipOutlined, PlusOutlined } from "@ant-design/icons";
import type { DeliveryException } from "@/hooks/useTruckingControl";
import { fetchTruckingDocument, type ConsignmentDetail } from "@/hooks/useTruckingConsignments";
import { useFilePreview } from "@/hooks/useFilePreview";
import { businessDateTime } from "@/lib/date";
import { remeasurementHref } from "@/app/warehouse-concept/_components/remeasurementLinks";
import { btnDefault, btnPrimary } from "@/components/buttons";
import { SectionCard } from "@/components/SectionCard";
import { CARD, EMPTY, HINT, LINK, TD, TH } from "@/styles/ui";
import { CAUSE_LABELS, DECISION_LABELS, EXCEPTION_KIND_LABELS, FAILED_REASON_LABELS, closeState, decideState, exceptionChip } from "../../_lib/exceptions";
import type { ActionState } from "../../_lib/consignments";
import { truckingFileSource } from "../../_lib/fileSource";
import { formatMoney } from "../../_lib/tariffs";
import { TruckingStatusChip } from "../../_components/TruckingStatusChip";

export type ExceptionAction = "decide" | "close" | "photo";
type Photo = DeliveryException["photos"][number];

// A cell of the Warehouse exceptions table: a note may run onto several lines, so the row keeps to the top.
const CELL = `${TD} !align-top`;

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
    <span className="text-slate-500">{k}</span> <span className="font-semibold text-slate-900">{v}</span>
  </span>
);

const ExceptionCard = ({
  e,
  legText,
  onAction,
  onPhoto,
}: {
  e: DeliveryException;
  legText: string | null;
  onAction: (e: DeliveryException, action: ExceptionAction) => void;
  onPhoto: (p: Photo) => void;
}) => {
  const open = !e.closedAt;
  return (
    <article className={`${CARD} p-4`}>
      <header className="flex flex-wrap items-center gap-2">
        <TruckingStatusChip chip={exceptionChip(e)} />
        <span className="text-[14px] font-semibold text-slate-900">
          {EXCEPTION_KIND_LABELS[e.kind]}
          {e.failedReason ? ` — ${FAILED_REASON_LABELS[e.failedReason]}` : ""}
        </span>
        <span className={HINT}>
          raised {businessDateTime(e.createdAt)}
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
        {e.decidedAt && <Fact k="Decided" v={`${businessDateTime(e.decidedAt)}${e.decidedBy ? ` · ${e.decidedBy}` : ""}`} />}
        {e.closedAt && <Fact k="Closed" v={businessDateTime(e.closedAt)} />}
        {e.warehouseExceptionId && <Fact k="From" v="a Warehouse exception" />}
      </div>
      {e.photos.length > 0 && (
        <ul className="mt-2 mb-0 flex list-none flex-wrap gap-2 p-0">
          {e.photos.map((p) => (
            <li key={p.id} className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-0.5 text-[12px] text-slate-700">
              <PaperClipOutlined aria-hidden />
              <button type="button" className={`${LINK} bg-transparent border-0 p-0 cursor-pointer text-left`} onClick={() => onPhoto(p)}>
                {p.fileName}
              </button>
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
  // A photo (or PDF) of an exception is kept with the consignment's documents, under the same id.
  const preview = useFilePreview();
  const showPhoto = (p: Photo) => void preview.open(truckingFileSource(p.fileName, () => fetchTruckingDocument(p.id)));
  const legText = (legId: string | null) => {
    const leg = legId ? c.legs.find((l) => l.id === legId) : null;
    return leg ? `${leg.fromText} → ${leg.toText}` : null;
  };
  return (
    <div className="flex flex-col gap-4">
      {preview.modal}
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
        <div className={`${CARD} px-6 py-8 text-center text-[13px] text-slate-500`}>No exceptions on this consignment.</div>
      ) : (
        c.exceptions.map((e) => <ExceptionCard key={e.id} e={e} legText={legText(e.legId)} onAction={onAction} onPhoto={showPhoto} />)
      )}

      <SectionCard
        title="Warehouse exceptions (read-only)"
        extra={
          <Link href={remeasurementHref(c.shipmentId)} className={`${LINK} text-[12px] font-semibold`}>
            Open in Warehouse
          </Link>
        }
      >
        {c.warehouseExceptions.length === 0 ? (
          <p className="m-0 text-[13px] text-slate-500">None recorded at our warehouse for job {c.jobNumber}.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={TH}>Kind</th>
                <th className={TH}>Pieces</th>
                <th className={TH}>Note</th>
                <th className={TH}>Status</th>
                <th className={TH}>Recorded</th>
              </tr>
            </thead>
            <tbody className="[&>tr:last-child>td]:border-b-0">
              {c.warehouseExceptions.map((w) => (
                <tr key={w.id}>
                  <td className={`${CELL} font-semibold text-slate-900`}>{w.kind}</td>
                  <td className={`${CELL} tabular-nums`}>{w.pieces ?? <span className={EMPTY}>—</span>}</td>
                  <td className={CELL}>{w.note || <span className={EMPTY}>—</span>}</td>
                  <td className={CELL}>{w.status}</td>
                  <td className={CELL}>{businessDateTime(w.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
    </div>
  );
};

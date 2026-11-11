"use client";

import { businessDateTime } from "@/lib/date";
import { formatQty } from "@/app/trucking/_lib/tariffs";
import { HINT, LABEL_TEXT, REF } from "@/styles/ui";
import type { BiText } from "../_lib/publicOrder";
import { DELIVER_AFTER_LOADING, POD_RULE, stopAddress, type PortalOrder, type PortalStop } from "../_lib/portal";
import { Bi } from "./Bi";
import { HaulierPodForm } from "./HaulierPodForm";
import { PortalCard } from "./PortalCard";
import { PortalDeliveredForm } from "./PortalDeliveredForm";

interface PortalStopCardProps {
  order: PortalOrder;
  stop: PortalStop;
  index: number;
  busy: boolean;
  onDelivered: (req: { at: string | null; receiverName: string }) => Promise<unknown>;
  onUploadPod: (req: { fileName: string; fileBase64: string; receiverName: string; deliveredAt: string | null }) => Promise<unknown>;
}

const Row = ({ label, value }: { label: BiText; value: string }) =>
  value ? (
    <div className="py-1">
      <div className={LABEL_TEXT}>
        <Bi text={label} />
      </div>
      <div className="whitespace-pre-wrap break-words text-[14px] text-slate-900">{value}</div>
    </div>
  ) : null;

// One stop of the order as the driver needs it — where, when, whom to call, what is loaded — and,
// at a delivery stop, Delivered and the POD upload where the server says they may be done now (a
// line haul's drop at a partner's depot is no hand-over: it has neither).
export const PortalStopCard = ({ order, stop, index, busy, onDelivered, onUploadPod }: PortalStopCardProps) => {
  const isDelivery = stop.kind === "DELIVERY";
  const handsOver = isDelivery && order.kind !== "LINEHAUL";
  const load = stop.load;

  return (
    <PortalCard
      title={
        <>
          {index + 1}. <Bi text={isDelivery ? { cs: "Vykládka", en: "Delivery" } : { cs: "Nakládka", en: "Pick-up" }} />
        </>
      }
      extra={<span className={`${REF} ${HINT}`}>{stop.consignmentRef}</span>}
    >
      <div className="text-[14px] font-semibold text-slate-900">{stop.name}</div>
      <Row label={{ cs: "Adresa", en: "Address" }} value={stopAddress(stop)} />
      <Row label={{ cs: "Časové okno", en: "Time window" }} value={stop.windowText} />
      <Row label={{ cs: "Kontakt", en: "Contact" }} value={stop.contact} />
      {stop.avizaceRequired && (
        <div className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-[13px] font-semibold text-amber-800">
          <Bi text={{ cs: "Avizovat předem telefonem", en: "Call before arriving" }} />
        </div>
      )}
      <Row label={{ cs: "Reference", en: "Reference" }} value={stop.reference} />
      <Row label={{ cs: "Poznámka", en: "Notes" }} value={stop.notes} />

      <div className="mt-2 grid grid-cols-2 gap-1 text-[14px] text-slate-900">
        <div>
          <Bi text={{ cs: "Kusy", en: "Pieces" }} />: <b>{formatQty(load.pieces)}</b>
        </div>
        <div>
          <Bi text={{ cs: "Palet. místa", en: "Pallet places" }} />: <b>{formatQty(load.palletPlaces)}</b>
        </div>
        <div>
          LDM: <b>{formatQty(load.ldm)}</b>
        </div>
        <div>
          <Bi text={{ cs: "Hmotnost", en: "Weight" }} />: <b>{formatQty(load.weightKg)} kg</b>
        </div>
      </div>
      {load.adr && <div className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-[14px] font-semibold text-amber-800">ADR · {load.adr}</div>}
      {load.tailLift && (
        <div className="mt-1 text-[14px] text-slate-700">
          <Bi text={{ cs: "Hydraulické čelo", en: "Tail-lift" }} />
        </div>
      )}

      {handsOver && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          {stop.deliveredAt && (
            <div className="text-[14px] font-semibold text-emerald-700">
              ✓ <Bi text={{ cs: `Doručeno ${businessDateTime(stop.deliveredAt)}`, en: `Delivered ${businessDateTime(stop.deliveredAt)}` }} />
            </div>
          )}
          {stop.podUploaded && (
            <div className="text-[14px] font-semibold text-emerald-700">
              ✓ <Bi text={{ cs: "POD nahrán", en: "POD uploaded" }} />
            </div>
          )}
          {stop.canDeliver && <PortalDeliveredForm busy={busy} onDelivered={onDelivered} />}
          {!stop.canDeliver && !stop.deliveredAt && order.confirmation.status !== "REJECTED" && (
            <p className="mb-0 text-[13px] text-amber-700">
              <Bi text={DELIVER_AFTER_LOADING} />
            </p>
          )}
          {stop.canUploadPod && (
            <div className="mt-3">
              <HaulierPodForm busy={busy} onUpload={onUploadPod} accept="image/*,application/pdf" withCamera />
            </div>
          )}
          {!stop.podUploaded && (
            <p className="mb-0 mt-2 text-[13px] text-slate-500">
              <Bi text={POD_RULE} />
            </p>
          )}
        </div>
      )}
    </PortalCard>
  );
};

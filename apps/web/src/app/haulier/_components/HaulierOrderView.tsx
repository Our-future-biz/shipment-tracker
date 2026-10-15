"use client";

import { Spin } from "antd";
import { isNotFound, apiErrorMessage } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { usePublicTransportOrder } from "@/hooks/useTruckingConsignments";
import { formatMoney, formatQty } from "@/app/trucking/_lib/tariffs";
import { LINK_INVALID, PUBLIC_STATUS, canRespond, canUploadPod } from "../_lib/publicOrder";
import { Bi } from "./Bi";
import { HaulierPodForm } from "./HaulierPodForm";
import { HaulierRespondForm } from "./HaulierRespondForm";
import { HaulierStopCard } from "./HaulierStopCard";

const TONE_CLASS = {
  amber: "bg-amber-100 text-amber-800",
  green: "bg-emerald-100 text-emerald-800",
  red: "bg-red-100 text-red-800",
  blue: "bg-blue-100 text-blue-800",
} as const;

interface HaulierOrderViewProps {
  token: string;
}

// The page a haulier opens from the link printed on the transport order — no sign-in, no app
// around it, built for a phone: the order (no customer prices, only the agreed buy price), Confirm
// or Reject once, then the POD upload. Czech and English side by side.
export const HaulierOrderView = ({ token }: HaulierOrderViewProps) => {
  const { order, isLoading, error, respond, isResponding, uploadPod, isUploading } = usePublicTransportOrder(token);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Spin size="large" />
      </div>
    );
  }
  if (!order) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <p className="m-0 max-w-sm text-center text-[16px] text-slate-700">{isNotFound(error) ? <Bi text={LINK_INVALID} /> : apiErrorMessage(error)}</p>
      </main>
    );
  }

  const status = PUBLIC_STATUS[order.status];
  const load = order.load;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-5">
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        <header>
          <div className="text-[13px] text-slate-500">{order.ourCompany}</div>
          <h1 className="m-0 text-[20px] font-bold text-slate-900">
            <Bi text={{ cs: "Přepravní příkaz", en: "Transport order" }} /> <span className="font-mono">{order.orderNumber}</span>
          </h1>
          <div className="mt-1 text-[14px] text-slate-700">
            {order.haulierName} · <Bi text={{ cs: "Nakládka", en: "Pick-up" }} /> {formatDate(order.plannedPickupDate)}
          </div>
          <span className={`mt-2 inline-block rounded-full px-3 py-1 text-[13px] font-semibold ${TONE_CLASS[status.tone]}`}>
            <Bi text={status} />
          </span>
        </header>

        {canRespond(order) && <HaulierRespondForm busy={isResponding} onRespond={respond} />}
        {canUploadPod(order) && <HaulierPodForm busy={isUploading} onUpload={uploadPod} />}
        {order.podUploaded && (
          <div className="rounded-xl bg-emerald-50 p-4 text-[15px] font-semibold text-emerald-800">
            <Bi text={{ cs: "POD jsme obdrželi. Děkujeme!", en: "We have received the POD. Thank you!" }} />
          </div>
        )}

        <HaulierStopCard title={{ cs: "Nakládka", en: "Pick-up" }} stop={order.pickup} />
        <HaulierStopCard title={{ cs: "Vykládka", en: "Delivery" }} stop={order.delivery} />

        <section className="rounded-xl border border-slate-200 bg-white p-4 text-[15px] text-slate-900">
          <h2 className="m-0 mb-2 text-[13px] font-bold uppercase tracking-wide text-indigo-700">
            <Bi text={{ cs: "Zboží", en: "Goods" }} />
          </h2>
          <div className="grid grid-cols-2 gap-2">
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
          {load.adr && (
            <div className="mt-2 rounded-md bg-amber-50 px-2 py-1 font-semibold text-amber-800">
              ADR · UN {load.adrUn} · <Bi text={{ cs: "třída", en: "class" }} /> {load.adrClass}
              {load.adrPackingGroup ? ` · PG ${load.adrPackingGroup}` : ""}
            </div>
          )}
          {(load.tailLift || load.nonStackable) && (
            <div className="mt-2 text-[14px] text-slate-700">
              {load.tailLift && <Bi text={{ cs: "Hydraulické čelo", en: "Tail-lift" }} />}
              {load.tailLift && load.nonStackable ? " · " : ""}
              {load.nonStackable && <Bi text={{ cs: "Nestohovatelné", en: "Non-stackable" }} />}
            </div>
          )}
          {load.description && <div className="mt-2 whitespace-pre-wrap text-[14px] text-slate-700">{load.description}</div>}
        </section>

        {order.agreedPrice && (
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-[13px] font-bold uppercase tracking-wide text-indigo-700">
              <Bi text={{ cs: "Sjednaná cena", en: "Agreed price" }} />
            </div>
            <div className="text-[20px] font-bold text-slate-900">{formatMoney(order.agreedPrice.total, order.agreedPrice.currency)}</div>
          </section>
        )}

        <footer className="pb-6 text-center text-[12px] text-slate-400">
          <Bi text={{ cs: `Odkaz platí do ${formatDate(order.linkExpiresAt)}`, en: `Link valid until ${formatDate(order.linkExpiresAt)}` }} />
        </footer>
      </div>
    </main>
  );
};

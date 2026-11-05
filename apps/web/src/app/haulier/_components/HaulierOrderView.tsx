"use client";

import { Spin } from "antd";
import { Badge } from "@/components/Badge";
import { isNotFound, apiErrorMessage } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { usePublicTransportOrder } from "@/hooks/useTruckingConsignments";
import { formatMoney, formatQty } from "@/app/trucking/_lib/tariffs";
import { HINT, KPI_VALUE, PAGE_SUBTITLE, PAGE_TITLE, REF } from "@/styles/ui";
import { LINK_INVALID, LINK_POD_RULE, PUBLIC_STATUS, canRespond, canUploadPod } from "../_lib/publicOrder";
import { PORTAL_BADGE_TONE } from "../_lib/portalStyles";
import { Bi } from "./Bi";
import { HaulierPodForm } from "./HaulierPodForm";
import { HaulierRespondForm } from "./HaulierRespondForm";
import { HaulierStopCard } from "./HaulierStopCard";
import { PortalCard } from "./PortalCard";

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
        <p className="m-0 max-w-sm text-center text-[14px] text-slate-700">{isNotFound(error) ? <Bi text={LINK_INVALID} /> : apiErrorMessage(error)}</p>
      </main>
    );
  }

  const status = PUBLIC_STATUS[order.status];
  const load = order.load;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-5">
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        <header>
          <div className={PAGE_SUBTITLE}>{order.ourCompany}</div>
          <h1 className={PAGE_TITLE}>
            <Bi text={{ cs: "Přepravní příkaz", en: "Transport order" }} /> <span className={REF}>{order.orderNumber}</span>
          </h1>
          <div className={`mt-1 ${PAGE_SUBTITLE}`}>
            {order.haulierName} · <Bi text={{ cs: "Nakládka", en: "Pick-up" }} /> {formatDate(order.plannedPickupDate)}
          </div>
          <Badge tone={PORTAL_BADGE_TONE[status.tone]} className="mt-2">
            <Bi text={status} />
          </Badge>
        </header>

        {canRespond(order) && <HaulierRespondForm busy={isResponding} onRespond={respond} />}
        {canUploadPod(order) && <HaulierPodForm busy={isUploading} onUpload={uploadPod} />}
        {!order.podUploaded && order.status !== "REJECTED" && (
          <p className="m-0 text-[13px] text-slate-500">
            <Bi text={LINK_POD_RULE} />
          </p>
        )}
        {order.podUploaded && (
          <div className="rounded-xl bg-emerald-50 p-4 text-[14px] font-semibold text-emerald-700">
            <Bi text={{ cs: "POD jsme obdrželi. Děkujeme!", en: "We have received the POD. Thank you!" }} />
          </div>
        )}

        <HaulierStopCard title={{ cs: "Nakládka", en: "Pick-up" }} stop={order.pickup} />
        <HaulierStopCard title={{ cs: "Vykládka", en: "Delivery" }} stop={order.delivery} />

        <PortalCard title={<Bi text={{ cs: "Zboží", en: "Goods" }} />}>
          <div className="grid grid-cols-2 gap-2 text-[14px] text-slate-900">
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
            <div className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-[14px] font-semibold text-amber-800">
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
        </PortalCard>

        {order.agreedPrice && (
          <PortalCard title={<Bi text={{ cs: "Sjednaná cena", en: "Agreed price" }} />}>
            <div className={KPI_VALUE}>{formatMoney(order.agreedPrice.total, order.agreedPrice.currency)}</div>
          </PortalCard>
        )}

        <footer className={`pb-6 text-center ${HINT}`}>
          <Bi text={{ cs: `Odkaz platí do ${formatDate(order.linkExpiresAt)}`, en: `Link valid until ${formatDate(order.linkExpiresAt)}` }} />
        </footer>
      </div>
    </main>
  );
};

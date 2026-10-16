"use client";

import { useState } from "react";
import Link from "next/link";
import { Spin } from "antd";
import { apiErrorMessage, isNotFound } from "@/lib/api";
import { businessDateTime, formatDate } from "@/lib/date";
import { fetchPortalTransportOrderPdf, usePortalOrder } from "@/hooks/useHaulierPortal";
import { formatMoney, formatQty } from "@/app/trucking/_lib/tariffs";
import { savePdf } from "@/app/trucking/_lib/pdfFile";
import { CONFIRMATION, ORDER_KIND, canRespond, needsActionText, orderStatusText } from "../_lib/portal";
import { PortalSignedOutError } from "../_lib/portalClient";
import { PORTAL_CARD, PORTAL_CARD_TITLE, PORTAL_SECONDARY, PORTAL_TONE } from "../_lib/portalStyles";
import { Bi } from "./Bi";
import { PortalRespondCard } from "./PortalRespondCard";
import { PortalStampCard } from "./PortalStampCard";
import { PortalStopCard } from "./PortalStopCard";

interface PortalOrderViewProps {
  id: string;
}

// One order in the portal: confirm or reject it, stamp the trip, deliver each stop with its POD,
// download the transport order and read what happened. No customer prices, only the agreed price.
export const PortalOrderView = ({ id }: PortalOrderViewProps) => {
  const o = usePortalOrder(id);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  if (o.isLoading || o.error instanceof PortalSignedOutError) {
    return (
      <div className="flex justify-center py-10">
        <Spin size="large" />
      </div>
    );
  }
  if (!o.order) {
    return (
      <p className="m-0 text-center text-[15px] text-slate-700">
        {isNotFound(o.error) ? <Bi text={{ cs: "Objednávka nenalezena.", en: "Order not found." }} /> : apiErrorMessage(o.error)}{" "}
        <Link href="/haulier/portal" className="text-indigo-600">
          <Bi text={{ cs: "Zpět na objednávky", en: "Back to orders" }} />
        </Link>
      </p>
    );
  }

  const order = o.order;
  const confirmation = CONFIRMATION[order.confirmation.status];
  const action = needsActionText(order.needsAction);
  const busy = o.isMarkingDelivered || o.isUploading;

  const handlePdf = async () => {
    setPdfBusy(true);
    setPdfError(null);
    try {
      savePdf(await fetchPortalTransportOrderPdf(order.id), `${order.ref}.pdf`);
    } catch (e) {
      if (!(e instanceof PortalSignedOutError)) setPdfError(apiErrorMessage(e));
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <>
      <Link href="/haulier/portal" className="text-[14px] font-semibold text-indigo-600 no-underline">
        ← <Bi text={{ cs: "Objednávky", en: "Orders" }} />
      </Link>

      <header>
        <h1 className="m-0 text-[20px] font-bold text-slate-900">
          <span className="font-mono">{order.ref}</span> <span className="text-[15px] font-semibold text-slate-500">· <Bi text={ORDER_KIND[order.kind]} /></span>
        </h1>
        <div className="mt-1 text-[14px] text-slate-700">
          {formatDate(order.date)} · {order.from} → {order.to}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <span className={`rounded-full px-3 py-1 text-[13px] font-semibold ${PORTAL_TONE.slate}`}>
            <Bi text={orderStatusText(order.status)} />
          </span>
          {order.kind !== "PARTNER_DELIVERY" && (
            <span className={`rounded-full px-3 py-1 text-[13px] font-semibold ${PORTAL_TONE[confirmation.tone]}`}>
              <Bi text={confirmation} />
            </span>
          )}
        </div>
        {action && (
          <div className={`mt-2 rounded-lg px-3 py-2 text-[14px] font-semibold ${PORTAL_TONE.amber}`}>
            <Bi text={action} />
          </div>
        )}
      </header>

      {canRespond(order) && <PortalRespondCard busy={o.isResponding} onRespond={o.respond} />}

      <PortalStampCard order={order} loadedAt={o.loadedAt} stampingKind={o.stampingKind} onStamp={o.stamp} />

      <section className={PORTAL_CARD}>
        <h2 className={PORTAL_CARD_TITLE}>
          <Bi text={{ cs: "Vozidlo a náklad", en: "Vehicle and load" }} />
        </h2>
        <div className="flex flex-col gap-1 text-[15px] text-slate-900">
          {order.vehicleText && <div>{order.vehicleText}</div>}
          {order.plates && (
            <div>
              <Bi text={{ cs: "SPZ", en: "Plates" }} />: <b>{order.plates}</b>
            </div>
          )}
          {order.driver && (
            <div>
              <Bi text={{ cs: "Řidič", en: "Driver" }} />: <b>{order.driver}</b>
            </div>
          )}
          <div>
            {formatQty(order.palletPlaces)} <Bi text={{ cs: "pal. míst", en: "pallet places" }} /> · {formatQty(order.weightKg)} kg
          </div>
          {order.agreedPrice && (
            <div>
              <Bi text={{ cs: "Sjednaná cena", en: "Agreed price" }} />: <b>{formatMoney(order.agreedPrice.total, order.agreedPrice.currency)}</b>
            </div>
          )}
        </div>
        <button type="button" disabled={pdfBusy} onClick={handlePdf} className={`${PORTAL_SECONDARY} mt-3`}>
          <Bi text={{ cs: "Stáhnout přepravní příkaz (PDF)", en: "Download the transport order (PDF)" }} />
        </button>
        {pdfError && <p className="mb-0 mt-2 text-[13px] text-red-600">{pdfError}</p>}
      </section>

      {order.stops.map((stop, i) => (
        <PortalStopCard
          key={`${stop.consignmentId}-${stop.kind}`}
          order={order}
          stop={stop}
          index={i}
          busy={busy}
          onDelivered={(req) => o.markDelivered({ consignmentId: stop.consignmentId, ...req })}
          onUploadPod={(req) => o.uploadPod({ consignmentId: stop.consignmentId, ...req })}
        />
      ))}

      {order.history.length > 0 && (
        <section className={PORTAL_CARD}>
          <h2 className={PORTAL_CARD_TITLE}>
            <Bi text={{ cs: "Historie", en: "History" }} />
          </h2>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {order.history.map((h, i) => (
              <li key={`${h.at}-${i}`} className="text-[14px] text-slate-800">
                <span className="mr-2 whitespace-nowrap text-[12px] text-slate-500">{businessDateTime(h.at)}</span>
                {h.text}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
};

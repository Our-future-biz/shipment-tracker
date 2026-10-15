import Link from "next/link";
import { formatDate } from "@/lib/date";
import { formatMoney, formatQty } from "@/app/trucking/_lib/tariffs";
import { ORDER_KIND, needsActionText, orderStatusText, type PortalOrderItem } from "../_lib/portal";
import { PORTAL_TONE } from "../_lib/portalStyles";
import { Bi } from "./Bi";

interface PortalOrderCardProps {
  order: PortalOrderItem;
}

// One order in the portal's list, the whole card a link to the order: what, when, where, and what
// the haulier still has to do.
export const PortalOrderCard = ({ order }: PortalOrderCardProps) => {
  const action = needsActionText(order.needsAction);
  return (
    <Link href={`/haulier/portal/orders/${encodeURIComponent(order.id)}`} className="block rounded-xl border border-slate-200 bg-white p-4 text-slate-900 no-underline hover:border-indigo-300">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[15px] font-bold">{order.ref}</span>
        <span className="text-[13px] text-slate-500">
          <Bi text={ORDER_KIND[order.kind]} />
        </span>
        <span className={`ml-auto rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${PORTAL_TONE.slate}`}>
          <Bi text={orderStatusText(order.status)} />
        </span>
      </div>
      <div className="mt-1 text-[14px]">
        {formatDate(order.date)} · {order.from} → {order.to}
      </div>
      <div className="mt-1 text-[13px] text-slate-600">
        {order.stops} <Bi text={{ cs: "zast.", en: "stops" }} /> · {formatQty(order.palletPlaces)} <Bi text={{ cs: "pal. míst", en: "pallet places" }} /> ·{" "}
        {formatQty(order.weightKg)} kg
        {order.agreedPrice ? ` · ${formatMoney(order.agreedPrice.total, order.agreedPrice.currency)}` : ""}
      </div>
      {action && (
        <div className={`mt-2 inline-block rounded-full px-3 py-1 text-[13px] font-semibold ${PORTAL_TONE.amber}`}>
          <Bi text={action} />
        </div>
      )}
    </Link>
  );
};

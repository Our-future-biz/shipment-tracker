import Link from "next/link";
import { Badge } from "@/components/Badge";
import { formatDate } from "@/lib/date";
import { CARD, REF } from "@/styles/ui";
import { formatMoney, formatQty } from "@/app/trucking/_lib/tariffs";
import { ORDER_KIND, needsActionText, orderStatusText, type PortalOrderItem } from "../_lib/portal";
import { Bi } from "./Bi";

interface PortalOrderCardProps {
  order: PortalOrderItem;
}

// One order in the portal's list, the whole card a link to the order: what, when, where, and what
// the haulier still has to do.
export const PortalOrderCard = ({ order }: PortalOrderCardProps) => {
  const action = needsActionText(order.needsAction);
  return (
    <Link href={`/haulier/portal/orders/${encodeURIComponent(order.id)}`} className={`${CARD} block p-4 !text-slate-900 hover:!text-slate-900 no-underline transition-colors hover:border-indigo-300`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`${REF} text-[14px] font-bold`}>{order.ref}</span>
        <span className="text-[13px] text-slate-500">
          <Bi text={ORDER_KIND[order.kind]} />
        </span>
        <Badge className="ml-auto">
          <Bi text={orderStatusText(order.status)} />
        </Badge>
      </div>
      <div className="mt-1 text-[14px]">
        {formatDate(order.date)} · {order.from} → {order.to}
      </div>
      <div className="mt-1 text-[13px] text-slate-500">
        {order.stops} <Bi text={{ cs: "zast.", en: "stops" }} /> · {formatQty(order.palletPlaces)} <Bi text={{ cs: "pal. míst", en: "pallet places" }} /> ·{" "}
        {formatQty(order.weightKg)} kg
        {order.agreedPrice ? ` · ${formatMoney(order.agreedPrice.total, order.agreedPrice.currency)}` : ""}
      </div>
      {action && (
        <Badge tone="a" className="mt-2">
          <Bi text={action} />
        </Badge>
      )}
    </Link>
  );
};

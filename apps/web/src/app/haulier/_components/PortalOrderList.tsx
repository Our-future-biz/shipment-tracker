"use client";

import { useState } from "react";
import { Spin } from "antd";
import { apiErrorMessage } from "@/lib/api";
import { usePortalOrders } from "@/hooks/useHaulierPortal";
import type { BiText } from "../_lib/publicOrder";
import { PortalSignedOutError } from "../_lib/portalClient";
import { Bi } from "./Bi";
import { PortalOrderCard } from "./PortalOrderCard";

type View = "open" | "done";

const VIEWS: { key: View; label: BiText }[] = [
  { key: "open", label: { cs: "Otevřené", en: "Open" } },
  { key: "done", label: { cs: "Hotové", en: "Done" } },
];

// The haulier's orders, open or done; each says what still needs doing.
export const PortalOrderList = () => {
  const [view, setView] = useState<View>("open");
  const { orders, isLoading, error, reload, isFetching } = usePortalOrders(view);
  const needing = orders.filter((o) => o.needsAction).length;

  return (
    <>
      <div className="flex items-center gap-2">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            aria-pressed={view === v.key}
            onClick={() => setView(v.key)}
            className={`rounded-lg border px-3 py-2 text-[14px] font-semibold ${view === v.key ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-300 bg-white text-slate-600"}`}
          >
            <Bi text={v.label} />
            {v.key === "open" && view === "open" && needing > 0 && <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-[12px] text-white">{needing}</span>}
          </button>
        ))}
        <button type="button" disabled={isFetching} onClick={() => reload()} className="ml-auto rounded-lg px-2 py-2 text-[13px] font-semibold text-indigo-600 disabled:opacity-50">
          <Bi text={{ cs: "Obnovit", en: "Refresh" }} />
        </button>
      </div>

      {isLoading || error instanceof PortalSignedOutError ? (
        <div className="flex justify-center py-10">
          <Spin />
        </div>
      ) : error ? (
        <p className="m-0 text-[14px] text-red-600">{apiErrorMessage(error)}</p>
      ) : orders.length === 0 ? (
        <p className="m-0 py-6 text-center text-[14px] text-slate-500">
          <Bi text={view === "open" ? { cs: "Žádné otevřené objednávky.", en: "No open orders." } : { cs: "Žádné hotové objednávky.", en: "No finished orders." }} />
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {orders.map((o) => (
            <PortalOrderCard key={o.id} order={o} />
          ))}
        </div>
      )}
    </>
  );
};

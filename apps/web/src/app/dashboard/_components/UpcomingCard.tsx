"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Tag } from "antd";
import { AppCard } from "@/components/AppCard";
import { StatusBadge } from "@/components/StatusBadge";
import type { ShipmentItem } from "@/hooks/useShipments";
import { shipmentsInWindow, daysLabel } from "../_lib/eta";

interface UpcomingCardProps {
  shipments: ShipmentItem[];
}

// 7–0 days until departure (export) / arrival (import).
export function UpcomingCard({ shipments }: UpcomingCardProps) {
  const router = useRouter();
  const items = useMemo(() => shipmentsInWindow(shipments, 0, 7), [shipments]);

  return (
    <AppCard title="Upcoming This Week">
      {items.length === 0 ? (
        <div className="text-slate-400 text-sm py-3 text-center">Nothing scheduled this week.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map(({ s, eta }) => (
            <div
              key={s.id}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-md bg-neutral-50 cursor-pointer hover:bg-neutral-100"
              onClick={() => router.push(`/shipments/${s.id}`)}
            >
              <span className="text-sm font-semibold text-indigo-600 whitespace-nowrap">{s.jobNumber}</span>
              <Tag color={eta.direction === "Export" ? "blue" : "green"} className="m-0">
                {eta.direction === "Export" ? "EXP" : "IMP"}
              </Tag>
              <span className="text-xs text-slate-500 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                {eta.direction === "Export" ? "Departs" : "Arrives"} {eta.date}
              </span>
              <span className="text-[11px] text-slate-400 whitespace-nowrap">{daysLabel(eta.days)}</span>
              <StatusBadge status={s.status} />
            </div>
          ))}
        </div>
      )}
    </AppCard>
  );
}

"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { AppCard } from "@/components/AppCard";
import { StatusBadge } from "@/components/StatusBadge";
import { isActiveStatus } from "@/lib/enums";
import { parseDateMMDDYY } from "@/lib/columnConfig";
import type { ShipmentItem } from "@/hooks/useShipments";

interface NeedsAttentionCardProps {
  shipments: ShipmentItem[];
}

interface AttentionItem {
  id: string;
  jobNumber: string;
  reason: string;
  severity: "red" | "amber";
  status: string;
}

function getAttentionItems(shipments: ShipmentItem[]): AttentionItem[] {
  const now = new Date();
  const items: AttentionItem[] = [];

  for (const s of shipments) {
    if (!isActiveStatus(s.status)) continue;
    if (!s.estimatedArrival) continue;

    const eta = parseDateMMDDYY(s.estimatedArrival);
    if (!eta) continue;

    const diffMs = eta.getTime() - now.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffDays < 0) {
      items.push({
        id: s.id,
        jobNumber: s.jobNumber,
        reason: `ETA overdue by ${Math.abs(Math.round(diffDays))} day(s)`,
        severity: "red",
        status: s.status,
      });
    } else if (diffDays <= 2) {
      items.push({
        id: s.id,
        jobNumber: s.jobNumber,
        reason: "ETA is within 2 days",
        severity: "amber",
        status: s.status,
      });
    }
  }

  // Red items first, then amber
  items.sort((a, b) => (a.severity === "red" ? 0 : 1) - (b.severity === "red" ? 0 : 1));
  return items.slice(0, 8);
}

export function NeedsAttentionCard({ shipments }: NeedsAttentionCardProps) {
  const router = useRouter();
  const items = useMemo(() => getAttentionItems(shipments), [shipments]);

  return (
    <AppCard title="Needs Attention">
      {items.length === 0 ? (
        <div className="text-slate-400 text-sm py-3 text-center">
          Nothing needs attention right now.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-md bg-neutral-50 cursor-pointer"
              onClick={() => router.push(`/shipments/${item.id}`)}
            >
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  item.severity === "red" ? "bg-red-500" : "bg-amber-500"
                }`}
              />
              <span className="text-sm font-semibold text-indigo-600 whitespace-nowrap">
                {item.jobNumber}
              </span>
              <span className="text-xs text-slate-500 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                {item.reason}
              </span>
              <StatusBadge status={item.status} />
            </div>
          ))}
        </div>
      )}
    </AppCard>
  );
}

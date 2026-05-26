"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { AppCard } from "@/components/AppCard";
import { isActiveStatus } from "@/lib/enums";
import { parseDateMMDDYY } from "@/lib/columnConfig";
import type { ShipmentItem } from "@/hooks/useShipments";

interface UpcomingCardProps {
  shipments: ShipmentItem[];
}

interface UpcomingItem {
  id: string;
  jobNumber: string;
  description: string;
  relativeDate: string;
}

function formatRelative(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  return `In ${diffDays} days`;
}

function getUpcomingItems(shipments: ShipmentItem[]): UpcomingItem[] {
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const items: UpcomingItem[] = [];

  for (const s of shipments) {
    if (!isActiveStatus(s.status)) continue;
    if (!s.estimatedArrival) continue;

    const eta = parseDateMMDDYY(s.estimatedArrival);
    if (!eta) continue;

    if (eta.getTime() >= now.getTime() && eta.getTime() <= weekFromNow.getTime()) {
      items.push({
        id: s.id,
        jobNumber: s.jobNumber,
        description: `Arrives ${s.pod || "\u2014"}`,
        relativeDate: formatRelative(eta),
      });
    }
  }

  items.sort((a, b) => a.relativeDate.localeCompare(b.relativeDate));
  return items.slice(0, 8);
}

export function UpcomingCard({ shipments }: UpcomingCardProps) {
  const router = useRouter();
  const items = useMemo(() => getUpcomingItems(shipments), [shipments]);

  return (
    <AppCard title="Upcoming This Week">
      {items.length === 0 ? (
        <div className="text-slate-400 text-sm py-3 text-center">
          No upcoming arrivals this week.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-md bg-neutral-50 cursor-pointer"
              onClick={() => router.push(`/shipments/${item.id}`)}
            >
              <span className="text-sm font-semibold text-indigo-600 whitespace-nowrap">
                {item.jobNumber}
              </span>
              <span className="text-xs text-slate-500 flex-1">{item.description}</span>
              <span className="text-[11px] text-slate-400 whitespace-nowrap">{item.relativeDate}</span>
            </div>
          ))}
        </div>
      )}
    </AppCard>
  );
}

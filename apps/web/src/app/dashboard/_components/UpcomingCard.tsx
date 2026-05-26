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
        description: `Arrives ${s.pod || "—"}`,
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
        <div style={{ color: "#94a3b8", fontSize: 13, padding: "12px 0", textAlign: "center" }}>
          No upcoming arrivals this week.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                borderRadius: 6,
                background: "#fafafa",
                cursor: "pointer",
              }}
              onClick={() => router.push(`/shipments/${item.id}`)}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: "#4f46e5", whiteSpace: "nowrap" }}>
                {item.jobNumber}
              </span>
              <span style={{ fontSize: 12, color: "#64748b", flex: 1 }}>{item.description}</span>
              <span style={{ fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap" }}>{item.relativeDate}</span>
            </div>
          ))}
        </div>
      )}
    </AppCard>
  );
}

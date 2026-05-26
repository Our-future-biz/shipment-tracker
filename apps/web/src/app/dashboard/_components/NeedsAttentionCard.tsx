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
        <div style={{ color: "#94a3b8", fontSize: 13, padding: "12px 0", textAlign: "center" }}>
          Nothing needs attention right now.
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
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  flexShrink: 0,
                  background: item.severity === "red" ? "#ef4444" : "#f59e0b",
                }}
              />
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#4f46e5",
                  whiteSpace: "nowrap",
                }}
              >
                {item.jobNumber}
              </span>
              <span style={{ fontSize: 12, color: "#64748b", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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

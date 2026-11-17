"use client";

import type { ShipmentItem } from "@/hooks/useShipments";
import { SectionCard } from "@/components/SectionCard";
import { summaryRows } from "../_lib/summaryRows";

interface SummaryPanelProps {
  shipment: ShipmentItem;
}

export function SummaryPanel({ shipment }: SummaryPanelProps) {
  return (
    <div className="w-[260px] shrink-0">
      <div className="sticky top-[76px]">
        <SectionCard title="Summary" bodyClassName="px-4 py-2.5">
          {summaryRows(shipment).map((row) =>
            row.value ? (
              <div key={row.label} className="flex justify-between py-1.5 text-xs">
                <span className="text-slate-500">{row.label}</span>
                <span className="text-slate-900 font-medium text-right max-w-[60%]">{row.value}</span>
              </div>
            ) : null
          )}
        </SectionCard>
      </div>
    </div>
  );
}

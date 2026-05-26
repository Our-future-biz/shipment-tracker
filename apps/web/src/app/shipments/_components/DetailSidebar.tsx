"use client";

import { useRouter } from "next/navigation";
import { CollapsibleSidebar } from "@/components/CollapsibleSidebar";
import { StatusBadge } from "@/components/StatusBadge";
import { useSidebarState } from "@/hooks/useSidebarState";
import type { ShipmentItem } from "@/hooks/useShipments";

interface DetailSidebarProps {
  shipment: ShipmentItem;
  activeSection: string;
  onSelectSection: (key: string) => void;
}

export function DetailSidebar({ shipment, activeSection, onSelectSection }: DetailSidebarProps) {
  const router = useRouter();
  const { collapsed, toggle } = useSidebarState();
  const jobNumber = shipment.jobNumber ?? shipment.id;
  const status = shipment.status ?? "";

  const sectionItems = [
    { key: "customer", icon: "\uD83D\uDC64", label: "Customer" },
    { key: "shipment-info", icon: "\uD83D\uDCCB", label: "Shipment Info" },
    { key: "routing", icon: "\uD83D\uDEA2", label: "Routing" },
    { key: "cargo", icon: "\uD83D\uDCE6", label: "Cargo" },
    { key: "compliance", icon: "\uD83D\uDCC4", label: "Compliance" },
    { key: "costs", icon: "\uD83D\uDCB0", label: "Costs" },
  ];

  const toolItems = [
    { key: "chat", icon: "\uD83D\uDCAC", label: "Chat" },
    { key: "attachments", icon: "\uD83D\uDCCE", label: "Attachments" },
    { key: "tracking", icon: "\uD83D\uDCCA", label: "Tracking" },
    { key: "tasks", icon: "\u26A1", label: "Tasks" },
  ];

  return (
    <CollapsibleSidebar
      collapsed={collapsed}
      onToggle={toggle}
      items={sectionItems}
      bottomItems={toolItems}
      activeKey={activeSection}
      onSelect={onSelectSection}
      header={
        <div className="px-1">
          <div
            className="text-xs text-indigo-500 cursor-pointer mb-3"
            onClick={() => router.push("/shipments")}
          >
            &larr; Back to Shipments
          </div>
          <div className="border-b border-slate-200 pb-3">
            <div className="text-[15px] font-bold text-slate-800">{jobNumber}</div>
            {status && <div className="mt-1"><StatusBadge status={status} /></div>}
          </div>
        </div>
      }
    />
  );
}

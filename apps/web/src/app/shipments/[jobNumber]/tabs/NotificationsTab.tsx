"use client";

import { RightOutlined } from "@ant-design/icons";
import type { ShipmentItem } from "@/hooks/useShipments";
import { useShipmentAlerts } from "@/hooks/useShipmentAlerts";
import { CountChip, SectionCard } from "@/components/SectionCard";
import { formatDateTime } from "@/lib/date";
import { CustomsPill } from "./docsShared";

interface NotificationsTabProps {
  shipment: ShipmentItem;
  /** Opens the tab an alert is about. */
  onOpen: (tab: string) => void;
}

// The shipment's Alerts: what changed that the operations team should know about - for now customs'
// verdict on a document. Only the fact that something changed is told, newest first: a click
// leads to the Documents tab, where the whole of it (the reason for a decline, ...) is.
export function NotificationsTab({ shipment, onOpen }: NotificationsTabProps) {
  const { alerts: reviewed, isLoading, isError } = useShipmentAlerts(shipment.id);

  let empty = "No alerts yet";
  if (isLoading) empty = "Loading alerts…";
  if (isError) empty = "Could not load alerts.";

  return (
    <SectionCard title="Alerts" bodyClassName="p-2" extra={reviewed.length > 0 && <CountChip count={reviewed.length} />}>
      {reviewed.length === 0 ? (
        <p className="text-center text-slate-400 text-sm py-8">{empty}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {reviewed.map((doc) => (
            <li key={doc.id}>
              <button
                type="button"
                onClick={() => onOpen("documents")}
                className="w-full flex items-center gap-4 px-3 py-3 text-left rounded-md hover:bg-slate-50 border-0 bg-transparent cursor-pointer"
              >
                <CustomsPill status={doc.customsStatus} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] text-slate-800">
                    Customs {doc.customsStatus} <span className="font-semibold">{doc.fileName}</span>
                  </span>
                  <span className="block truncate text-[12px] text-slate-500">
                    {[doc.documentType, doc.customsReviewedByName, formatDateTime(doc.customsReviewedAt)].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="shrink-0 flex items-center gap-1.5 text-[12.5px] font-semibold text-indigo-600">
                  Open in Documents <RightOutlined className="text-[10px]" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

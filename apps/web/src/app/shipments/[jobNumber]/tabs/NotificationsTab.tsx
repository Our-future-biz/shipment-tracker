"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageOutlined, PaperClipOutlined, RightOutlined } from "@ant-design/icons";
import { apiFileUrl } from "@/lib/api";
import type { ShipmentItem } from "@/hooks/useShipments";
import { useShipmentAlerts } from "@/hooks/useShipmentAlerts";
import { CountChip, SectionCard } from "@/components/SectionCard";
import { formatDateTime } from "@/lib/date";
import { CustomsPill } from "./docsShared";
import { ShipmentChatDrawer, initials, shipmentChatQuery, toneFor } from "../../_components/ChatPanel";

interface NotificationsTabProps {
  shipment: ShipmentItem;
  /** Opens the tab an alert is about. */
  onOpen: (tab: string) => void;
}

// The shipment's Alerts: what changed that the operations team should know about - for now customs'
// verdict on a document. Only the fact that something changed is told, newest first: a click
// leads to the Documents tab, where the whole of it (the reason for a decline, ...) is.
// Beside them, Communication: the shipment's chat messages.
export function NotificationsTab({ shipment, onOpen }: NotificationsTabProps) {
  const { alerts: reviewed, isLoading, isError } = useShipmentAlerts(shipment.id);

  let empty = "No alerts yet";
  if (isLoading) empty = "Loading alerts…";
  if (isError) empty = "Could not load alerts.";

  return (
    // Alerts and Communication side by side (one under the other on a narrow screen).
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
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
                    <span className="block truncate text-[14px] text-slate-800">
                      Customs {doc.customsStatus} <span className="font-semibold">{doc.fileName}</span>
                    </span>
                    <span className="block truncate text-[12px] text-slate-500">
                      {[doc.documentType, doc.customsReviewedByName, formatDateTime(doc.customsReviewedAt)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 flex items-center gap-1.5 text-[13px] font-semibold text-indigo-600">
                    Open in Documents <RightOutlined className="text-[10px]" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      <CommunicationCard shipment={shipment} />
    </div>
  );
}

// Every message of the shipment's chat (the one opened from the Shipments list), newest first, to
// read here. It is the chat's own list (same query), so both always agree; reading it here does not
// mark the chat read - that stays with opening the chat, which "Open chat" does, in a drawer on
// this page (as on the Shipments list), so the shipment stays open.
function CommunicationCard({ shipment }: { shipment: ShipmentItem }) {
  const [chatOpen, setChatOpen] = useState(false);
  const { data, isLoading, isError } = useQuery({ ...shipmentChatQuery(shipment.id), refetchInterval: 10000 });
  const messages = [...(data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  let empty = "No messages yet";
  if (isLoading) empty = "Loading messages…";
  if (isError) empty = "Could not load messages.";

  return (
    <>
      <ShipmentChatDrawer
        shipment={chatOpen ? { id: shipment.id, jobNumber: shipment.jobNumber ?? "" } : null}
        onClose={() => setChatOpen(false)}
      />
      <SectionCard
        title="Communication"
        bodyClassName="p-2"
        extra={
          <>
            {messages.length > 0 && <CountChip count={messages.length} />}
            <button
              type="button"
              onClick={() => setChatOpen(true)}
              className="inline-flex items-center gap-1.5 p-0 border-0 bg-transparent cursor-pointer text-[13px] font-semibold text-indigo-600 hover:text-indigo-700"
            >
              <MessageOutlined aria-hidden /> Open chat
            </button>
          </>
        }
      >
        {messages.length === 0 ? (
          <p className="text-center text-slate-400 text-sm py-8">{empty}</p>
        ) : (
          // About ten messages tall; older ones scroll inside the card, under its bar.
          <ul className="divide-y divide-slate-100 max-h-[560px] overflow-y-auto overscroll-contain">
            {messages.map((m) => (
              <li key={m.id} className="flex items-start gap-3 px-3 py-3">
                <span
                  aria-hidden
                  className={`shrink-0 grid place-items-center w-8 h-8 rounded-full text-[11px] font-bold ${toneFor(m.authorId)}`}
                >
                  {initials(m.authorName)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-[13px] font-semibold text-slate-900">{m.authorName}</span>
                    <span className="ml-auto shrink-0 text-[12px] text-slate-500 tabular-nums">{formatDateTime(m.createdAt)}</span>
                  </div>
                  {m.message && (
                    <p className="m-0 mt-0.5 text-[14px] leading-5 text-slate-800 whitespace-pre-wrap break-words">{m.message}</p>
                  )}
                  {m.attachments.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {m.attachments.map((f) => (
                        <a
                          key={f.id}
                          href={apiFileUrl(f.contentUrl)}
                          target="_blank"
                          rel="noreferrer"
                          title={f.fileName}
                          className="inline-flex items-center gap-1.5 max-w-[260px] rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[12px] text-indigo-600 hover:bg-slate-100"
                        >
                          <PaperClipOutlined aria-hidden className="text-slate-400" />
                          <span className="truncate">{f.fileName}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}

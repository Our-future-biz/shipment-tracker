"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Spin, Switch } from "antd";
import { PillTabs } from "@/components/SectionCard";
import type { ShipmentItem } from "@/hooks/useShipments";
import { useShipmentTracking, useTrackingBell, useTrackingMarkRead } from "@/hooks/useShipmentTracking";
import { apiErrorMessage } from "@/lib/api";
import { CARD, HINT } from "@/styles/ui";
import { FRAMED_BTN, MAIN_BTN } from "./tracking/trackingUi";
import { AttentionCard } from "./tracking/AttentionCard";
import { ChangesCard } from "./tracking/ChangesCard";
import { ChecklistCard } from "./tracking/ChecklistCard";
import { CustomerLinkModal } from "./tracking/CustomerLinkModal";
import { CustomerNoticesCard } from "./tracking/CustomerNoticesCard";
import type { NoticeKindValue } from "./tracking/customerDraft";
import { EventsCard } from "./tracking/EventsCard";
import { FreeTimeCard } from "./tracking/FreeTimeCard";
import { ReadNoticeModal } from "./tracking/ReadNoticeModal";
import { RecordEventModal } from "./tracking/RecordEventModal";
import { TellCustomerModal } from "./tracking/TellCustomerModal";
import { TimelineCard } from "./tracking/TimelineCard";
import { mayRecordKind } from "./tracking/trackingText";

type View = "all" | "actuals" | "changes";

const VIEWS: readonly { key: View; label: string; title: string }[] = [
  { key: "all", label: "All", title: "Everything planned and recorded" },
  { key: "actuals", label: "Actuals", title: "Only what has happened" },
  { key: "changes", label: "Changes", title: "Only the logged changes of dates and routing" },
];

/** The dated facts of a shipment: where the cargo is, what moved and who recorded it. */
export function TrackingTab({ shipment, onOpen }: { shipment: ShipmentItem; onOpen: (tab: string) => void }) {
  const [view, setView] = useState<View>("all");
  const [customerView, setCustomerView] = useState(false);
  const [recording, setRecording] = useState(false);
  const [reading, setReading] = useState(false);
  const [linking, setLinking] = useState(false);
  const [telling, setTelling] = useState<NoticeKindValue | null>(null);
  // Opening the tab is seeing what the bell says about this shipment, and so is having it open
  // when something new about it arrives.
  const { mutate: markRead } = useTrackingMarkRead();
  const { notices } = useTrackingBell();
  const unreadHere = notices
    .filter((n) => n.unread && n.shipmentId === shipment.id)
    .map((n) => `${n.key}:${n.at}`)
    .join("|");
  const markedFor = useRef<string | null>(null);
  useEffect(() => {
    const opened = markedFor.current === null;
    if (!opened && (!unreadHere || unreadHere === markedFor.current)) return;
    markedFor.current = unreadHere;
    markRead(shipment.id);
  }, [markRead, shipment.id, unreadHere]);
  const { data, isLoading, error } = useShipmentTracking(shipment.id);

  if (isLoading) {
    return (
      <div className={`${CARD} p-8 flex justify-center`}>
        <Spin />
      </div>
    );
  }
  if (!data) {
    return <Alert type="error" showIcon message={`Could not load the tracking: ${apiErrorMessage(error)}`} />;
  }

  const mayRecord = (kind: string) => mayRecordKind(data, kind);
  const showChanges = !customerView && view !== "actuals";
  const showTimeline = customerView || view !== "changes";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {customerView ? <span className={HINT}>What can be told to the customer: no names, no internal marks.</span> : <PillTabs tabs={VIEWS} active={view} onChange={setView} />}
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-[13px] text-slate-700 cursor-pointer">
            <Switch size="small" checked={customerView} onChange={setCustomerView} />
            Customer view
          </label>
          {!customerView && (
            <button type="button" onClick={() => setTelling("status")} className={`${FRAMED_BTN}`}>
              Tell the customer
            </button>
          )}
          {!customerView && data.mayChangeDetails && (
            <button type="button" onClick={() => setLinking(true)} className={`${FRAMED_BTN}`}>
              Customer link
            </button>
          )}
          {!customerView && data.mayChangeDetails && data.recordable.length > 0 && (
            <button type="button" onClick={() => setReading(true)} className={`${FRAMED_BTN}`}>
              Read a notice
            </button>
          )}
          {!customerView &&
            (data.recordable.length > 0 ? (
              <button type="button" onClick={() => setRecording(true)} className={`${MAIN_BTN}`}>
                Record an event
              </button>
            ) : (
              <span className={HINT}>A road job&apos;s stamps are set in Trucking.</span>
            ))}
        </div>
      </div>

      {!customerView && view === "all" && <AttentionCard shipmentId={shipment.id} items={data.attention} mayRecord={mayRecord} onTell={setTelling} />}
      {showTimeline && (
        <TimelineCard shipment={shipment} milestones={data.milestones} actualsOnly={!customerView && view === "actuals"} customerView={customerView} onOpen={onOpen} onTellPod={() => setTelling("pod_sent")} />
      )}
      {!customerView && view === "all" && data.containerClocks.length > 0 && <FreeTimeCard shipment={shipment} clocks={data.containerClocks} mayChangeDetails={data.mayChangeDetails} onOpen={onOpen} />}
      {!customerView && view === "all" && <EventsCard shipmentId={shipment.id} events={data.events} mayChangeDetails={data.mayChangeDetails} mayRecord={mayRecord} containers={(shipment.containers ?? []).map((c) => c.containerNumber).filter(Boolean)} />}
      {!customerView && view === "all" && data.customerNotices.length > 0 && <CustomerNoticesCard notices={data.customerNotices} />}
      {showChanges && <ChangesCard changes={data.changes} capped={data.changesCapped} />}
      {!customerView && view === "all" && <ChecklistCard tradeDirection={shipment.tradeDirection} freightMode={shipment.freightMode ?? ""} ticks={data.ticks} />}
      {recording && <RecordEventModal shipment={shipment} tracking={data} onClose={() => setRecording(false)} />}
      {linking && <CustomerLinkModal shipment={shipment} onClose={() => setLinking(false)} />}
      {reading && <ReadNoticeModal shipment={shipment} onClose={() => setReading(false)} />}
      {telling && <TellCustomerModal shipment={shipment} tracking={data} initialKind={telling} onClose={() => setTelling(null)} />}
    </div>
  );
}

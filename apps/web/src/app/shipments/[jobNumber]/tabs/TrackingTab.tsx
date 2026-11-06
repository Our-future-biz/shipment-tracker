"use client";

import { useState } from "react";
import { Alert, Spin, Switch } from "antd";
import { CopyButton } from "@/components/CopyButton";
import { PillTabs } from "@/components/SectionCard";
import { useJobFxRates } from "@/hooks/useFx";
import type { ShipmentItem } from "@/hooks/useShipments";
import { useShipmentTracking } from "@/hooks/useShipmentTracking";
import { apiErrorMessage } from "@/lib/api";
import { CARD, HINT } from "@/styles/ui";
import { jobFxDates } from "./costsRows";
import { AttentionCard } from "./tracking/AttentionCard";
import { ChangesCard } from "./tracking/ChangesCard";
import { ChecklistCard } from "./tracking/ChecklistCard";
import { RecordedBy } from "./tracking/RecordedBy";
import { TimelineCard } from "./tracking/TimelineCard";
import { taxDateParts, trackingStatusLine } from "./tracking/trackingText";

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
  const { data, isLoading, error } = useShipmentTracking(shipment.id);
  const { data: rates } = useJobFxRates(shipment.id, jobFxDates(shipment));

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

  const statusLine = trackingStatusLine(shipment, data.milestones);
  const showChanges = !customerView && view !== "actuals";
  const showTimeline = customerView || view !== "changes";

  return (
    <div className="space-y-4">
      <div className={`${CARD} px-4 py-2.5 flex items-center gap-2`}>
        <p className="m-0 min-w-0 flex-1 text-[13px] text-slate-700 tabular-nums">{statusLine}</p>
        <CopyButton text={statusLine} what="status line" />
      </div>

      {!customerView && (
        <p className={`${CARD} m-0 px-4 py-2.5 text-[13px] text-slate-700 tabular-nums`}>
          {taxDateParts(data.taxDate, rates).join(" · ")}
          {/* Who set the date it goes by; an invoiced job goes by its invoice, not by that estimate. */}
          {data.taxDate.recorded && (data.taxDate.actual || !data.taxDate.invoiced) && (
            <>
              {" · "}
              <RecordedBy recorded={data.taxDate.recorded} />
            </>
          )}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {customerView ? <span className={HINT}>What can be told to the customer: no names, no internal marks.</span> : <PillTabs tabs={VIEWS} active={view} onChange={setView} />}
        <label className="flex items-center gap-2 text-[13px] text-slate-700 cursor-pointer">
          <Switch size="small" checked={customerView} onChange={setCustomerView} />
          Customer view
        </label>
      </div>

      {!customerView && view === "all" && <AttentionCard items={data.attention} />}
      {showTimeline && (
        <TimelineCard shipment={shipment} milestones={data.milestones} actualsOnly={!customerView && view === "actuals"} customerView={customerView} onOpen={onOpen} />
      )}
      {showChanges && <ChangesCard changes={data.changes} capped={data.changesCapped} />}
      {!customerView && view === "all" && <ChecklistCard tradeDirection={shipment.tradeDirection} ticks={data.ticks} />}
    </div>
  );
}

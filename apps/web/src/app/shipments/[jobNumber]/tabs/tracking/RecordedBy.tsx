import type { TrackingRecorded } from "@/hooks/useShipmentTracking";
import { businessDateTime } from "@/lib/date";
import { CELL_LINE } from "./trackingUi";

/** The name of whoever the log says did it. A system write and a user who left have none. */
export const personOrSystem = (by: string): string => by || "System or a former user";

/** Who put a value there and when, or that the log has no change of it. */
export function RecordedBy({ recorded }: { recorded: TrackingRecorded | null }) {
  if (!recorded) return <span className={CELL_LINE}>No change logged</span>;
  const who = recorded.by || (recorded.source ? "" : personOrSystem(""));
  const text = [recorded.source, who, businessDateTime(recorded.at)].filter(Boolean).join(" · ");
  // the grid's 13px text on one line; the whole of it on hover where the column cuts it
  return (
    <span className={CELL_LINE} title={text}>
      {text}
    </span>
  );
}

import type { TrackingRecorded } from "@/hooks/useShipmentTracking";
import { businessDateTime } from "@/lib/date";
import { HINT } from "@/styles/ui";

/** The name of whoever the log says did it. A system write and a user who left have none. */
export const personOrSystem = (by: string): string => by || "System or a former user";

/** Who put a value there and when, or that the log has no change of it. */
export function RecordedBy({ recorded }: { recorded: TrackingRecorded | null }) {
  if (!recorded) return <span className={HINT}>No change logged</span>;
  const who = recorded.by || (recorded.source ? "" : personOrSystem(""));
  return <span className={HINT}>{[recorded.source, who, businessDateTime(recorded.at)].filter(Boolean).join(" · ")}</span>;
}

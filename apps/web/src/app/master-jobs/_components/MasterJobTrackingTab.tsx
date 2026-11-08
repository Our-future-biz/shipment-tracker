"use client";

import { CARD, EMPTY_STATE } from "@/styles/ui";

/**
 * The master job's Tracking tab, kept for the container's transport milestones. It is empty for now:
 * where each linked shipment stands is in Linked Shipments → Status.
 */
export function MasterJobTrackingTab() {
  return (
    <div className={CARD}>
      <p className={`m-0 ${EMPTY_STATE}`}>Nothing here yet.</p>
    </div>
  );
}

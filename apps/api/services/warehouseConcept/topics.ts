import { Topic } from "encore.dev/pubsub";

/**
 * A gate stamp that moved cargo in or out of our warehouse, or the void of one. Trucking listens
 * (LTL consignments: AT_HUB on gateIn, ON_LINEHAUL / OUT_FOR_DELIVERY on gateOut, the step reverted
 * on voided). Warehouse keeps owning the stamps; this only tells.
 *
 *   kind       gateIn — the gate-in column was stamped (by the gate-in itself, or by the first
 *              export arrival stamp, stampKind expDraft / expReceipt); gateOut — the gate-out
 *              column was stamped (by the gate-out, or by the WH release that stamps it too,
 *              stampKind impRelease); voided — a manager voided the gate-in or the gate-out
 *              (stampKind gateIn / gateOut), `at` is then the time of the void.
 *   positionId the warehouse position (warehouse task id); wczRef its WCZ reference.
 *   userId     who stamped (or voided).
 *
 * Published only AFTER the stamp's transaction committed: the event is written to the
 * warehouse_gate_event_outbox in that same transaction and published from there (straight
 * after the commit, then retried by the warehouse-shipment-outbox cron). A stamp that rolls back
 * leaves no row, so it never publishes. At-least-once: subscribers stay idempotent by
 * (positionId, kind, at).
 */
export interface WarehouseGateStampedEvent {
  companyId: string;
  shipmentId: string | null;
  positionId: string;
  wczRef: string;
  kind: "gateIn" | "gateOut" | "voided";
  stampKind: string;
  /** ISO */
  at: string;
  userId: string;
}

export const warehouseGateStamped = new Topic<WarehouseGateStampedEvent>("warehouse-gate-stamped", {
  deliveryGuarantee: "at-least-once",
});

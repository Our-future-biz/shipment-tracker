import { CANCELLED_STATUS } from "@/lib/enums";
import { isDetailsManager } from "@/lib/shipmentEditRule";
import type { controllers } from "@/lib/api/client";

// Cancelling a shipment asks why (Council Outlay 11, D22): the server refuses a write that sets
// "Cancelled Shipment" on a job that was not cancelled unless the reason comes in the same write.
// The grid's status cell and the shipment's page ask for it in one dialog (CancelReasonDialog).
// Pure, so it is unit-tested.

/** The server's longest reason (ShipmentUpdateRequest.cancelReason). */
export const CANCEL_REASON_MAX = 1000;

/** Whether this edit cancels a job that was not cancelled: the reason is then asked before anything is saved. */
export function asksCancelReason(fieldKey: string, value: string, statusBefore: string | null | undefined): boolean {
  return fieldKey === "status" && value.trim() === CANCELLED_STATUS && (statusBefore ?? "").trim() !== CANCELLED_STATUS;
}

/** Whether a reason can be sent: something besides spaces, within the server's length. */
export const cancelReasonOk = (reason: string): boolean => reason.trim().length > 0 && reason.trim().length <= CANCEL_REASON_MAX;

/** The one write that cancels the job with its reason. */
export const cancelUpdate = (reason: string): controllers.ShipmentUpdateRequest => ({ status: CANCELLED_STATUS, cancelReason: reason.trim() });

/** Whether the job is cancelled, so its page shows why. */
export const isCancelled = (status: string | null | undefined): boolean => (status ?? "").trim() === CANCELLED_STATUS;

/**
 * Whether this viewer is offered Cancelled Shipment on this job (council finding K22, mock test
 * council n34): a job that reads Invoiced is cancelled only by a manager, an admin or a superadmin,
 * so a user is not offered what the server refuses. The server still decides for a job with an open
 * invoice whose status does not read Invoiced.
 */
export const cancelOffered = (role: string | null | undefined, invoicingStatus: string | null | undefined): boolean =>
  isDetailsManager(role ?? "") || (invoicingStatus ?? "").trim().toLowerCase() !== "invoiced";

/** The statuses offered: without Cancelled Shipment when it is not offered, unless the job already is (its value still shows). */
export const offeredStatuses = (options: readonly string[], offered: boolean, current: string | null | undefined): string[] =>
  offered || isCancelled(current) ? [...options] : options.filter((o) => o !== CANCELLED_STATUS);

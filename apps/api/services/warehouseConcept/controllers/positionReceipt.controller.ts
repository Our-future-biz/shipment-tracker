import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { requireRole } from "../../../lib/rbac";
import type { GateMovementItem } from "../interfaces/gate.interfaces";
import { positionReceiptService, type PositionReceiptInput } from "../services/positionReceipt.service";

interface PositionReceiptRequest {
  id: string;
  receipt: PositionReceiptInput;
}

interface PositionReceiptResponse {
  movement: GateMovementItem;
  /** done · already_done (this request came before) · done_by_someone_else (received meanwhile; only with a clientRequestId). */
  outcome: "done" | "already_done" | "done_by_someone_else";
  /** Text for a toast (an exception to offer, already received); "" when nothing to say. */
  notice: string;
  /**
   * What the receipt found that the client may offer as an OS&D exception (POST
   * /warehouse-concept/gate/:id/exceptions): a count that differs (Short / Over, with the pieces)
   * and a condition that is not Good (Damaged, pieces null — the person enters how many).
   */
  suggestExceptions: { type: "Short" | "Over" | "Damaged"; pieces: number | null }[];
}

// The receipt of loose import cargo (an outbound position with no container): pieces counted,
// condition and location, as a stripping tally tick keeps them. Receives the position (its free
// time starts, the stock line opens at the location) and sends its shipment the received date and
// the WCZ reference. LCL cargo is re-weighed first. Any user.
export const gateMovementReceipt = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-concept/gate/:id/receipt" },
  async ({ id, receipt }: PositionReceiptRequest): Promise<PositionReceiptResponse> => {
    const { companyID, userID, role } = getAuthData()!;
    return positionReceiptService.record(id, companyID, userID, role, receipt);
  },
);

// Manager: voids the receipt with a reason. The typed received date it replaced comes back; the
// shipment is not changed back (logged).
export const gateMovementVoidReceipt = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-concept/gate/:id/void-receipt" },
  async ({ id, reason }: { id: string; reason: string }): Promise<{ movement: GateMovementItem; notice: string }> => {
    const { companyID, userID, role } = requireRole("superadmin", "admin", "manager");
    return positionReceiptService.voidReceipt(id, companyID, userID, role, reason);
  },
);

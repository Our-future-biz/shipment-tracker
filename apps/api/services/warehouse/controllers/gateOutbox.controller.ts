import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { gateSendAgain, gateUnsent, type GateUnsent } from "../services/gateSendAgain.service";
import type { GateMovementItem } from "../interfaces/gate.interfaces";

interface GateUnsentResponse {
  /** What the record failed to send for good; null when nothing */
  unsent: GateUnsent | null;
}

// Managers: the shipment updates and events for Trucking a gate record failed to send ("Not sent").
export const gateMovementUnsent = api(
  { expose: true, auth: true, method: "GET", path: "/warehouse-gate/:id/unsent" },
  async ({ id }: { id: string }): Promise<GateUnsentResponse> => {
    const { companyID, role } = requireRole();
    return { unsent: await gateUnsent(id, companyID, role) };
  },
);

interface GateSendAgainResponse {
  movement: GateMovementItem;
  /** What is still failed afterwards; null when nothing */
  unsent: GateUnsent | null;
}

// Managers: "Send again" for a gate record's failed shipment updates and events (logged).
export const gateMovementSendAgain = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-gate/:id/send-again" },
  async ({ id }: { id: string }): Promise<GateSendAgainResponse> => {
    const { companyID, userID, role } = requireRole();
    return gateSendAgain(id, companyID, userID, role);
  },
);

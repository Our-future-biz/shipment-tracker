import { APIError } from "encore.dev/api";
import { auth, shipments } from "~encore/clients";

// Sends a ShipmentUpdate owed by an outbox row as the user who caused it. Encore passes that
// identity on the internal call (`authData`), so Shipments checks it exactly as for the user's own
// request; nothing goes through the public gateway. The user's role as it is now counts (a role
// changed or the user removed since the row was written), not the role stored with the row.

export interface ShipmentUpdateOwed {
  companyId: string;
  shipmentId: string;
  /** Exactly the ShipmentUpdate fields to send (besides shipmentId). */
  payload: Record<string, string>;
  actingUserId: string;
  actingRole: string;
}

async function actingRoleNow(row: ShipmentUpdateOwed): Promise<string | null> {
  const authData = { userID: row.actingUserId, companyID: row.companyId, role: row.actingRole };
  const { users } = await auth.userLookup({ ids: [row.actingUserId] }, { authData });
  return users.find((u) => u.id === row.actingUserId)?.role ?? null;
}

/** Throws the upstream error when Shipments does not take the update. */
export async function sendShipmentUpdateAs(row: ShipmentUpdateOwed): Promise<void> {
  const role = await actingRoleNow(row);
  if (!role) throw APIError.permissionDenied("the acting user no longer exists");
  await shipments.shipmentUpdate(
    { shipmentId: row.shipmentId, ...row.payload },
    { authData: { userID: row.actingUserId, companyID: row.companyId, role } },
  );
}

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

// The acting user as they are now: a user of the row's company, or a superadmin who worked as it
// (X-Acting-Company) - their record is in their own company, which the call then carries as the
// auth handler would (homeCompanyID).
async function actingUserNow(row: Pick<ShipmentUpdateOwed, "companyId" | "actingUserId" | "actingRole">): Promise<{ role: string; homeCompanyId?: string } | null> {
  const authData = { userID: row.actingUserId, companyID: row.companyId, role: row.actingRole };
  const { users } = await auth.userLookup({ ids: [row.actingUserId], orSuperadmin: true }, { authData });
  const user = users.find((u) => u.id === row.actingUserId);
  return user ? { role: user.role, homeCompanyId: user.homeCompanyId } : null;
}

/** Who an owed call is made as: the acting user with their role now; permission_denied when the user is gone. */
export async function actingAuthNow(row: Pick<ShipmentUpdateOwed, "companyId" | "actingUserId" | "actingRole">) {
  const user = await actingUserNow(row);
  if (!user) throw APIError.permissionDenied("the acting user no longer exists");
  return { userID: row.actingUserId, companyID: row.companyId, role: user.role, ...(user.homeCompanyId ? { homeCompanyID: user.homeCompanyId } : {}) };
}

/** Throws the upstream error when Shipments does not take the update. */
export async function sendShipmentUpdateAs(row: ShipmentUpdateOwed): Promise<void> {
  const authData = await actingAuthNow(row);
  // The app's own update, not the user's edit: it isn't held to who may change the shipment's details.
  await shipments.shipmentUpdate({ shipmentId: row.shipmentId, ...row.payload }, { authData: { ...authData, appWrite: true } });
}

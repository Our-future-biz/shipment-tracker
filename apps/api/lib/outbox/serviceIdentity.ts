import { auth } from "~encore/clients";

// The service identity "Trucking (system)": one app user per company (in the auth service) that
// can never sign in and is not listed. What the system or a haulier causes in another service
// (a deleted job's re-settled trips, a gate event's promised date, a haulier's stamp or POD) is
// written as this user, with the real cause in the event text, so such an update never fails
// because a staff user left.

export interface ServiceActor {
  userID: string;
  companyID: string;
  role: string;
}

/** The service identity's role: the least one. */
export const SERVICE_ROLE = "user";

// The user id per company; created once by the auth service and never changes.
const ids = new Map<string, Promise<string>>();

const callerOf = (companyId: string) => ({ userID: "", companyID: companyId, role: SERVICE_ROLE });

/** The company's service identity as an acting user (created on first use; cached). */
export async function serviceActor(companyId: string): Promise<ServiceActor> {
  let id = ids.get(companyId);
  if (!id) {
    id = auth._internalServiceUser({ authData: callerOf(companyId) }).then((r) => r.userId);
    ids.set(companyId, id);
    // A failed call is not cached: the next one asks again.
    id.catch(() => ids.delete(companyId));
  }
  return { userID: await id, companyID: companyId, role: SERVICE_ROLE };
}

/** Of `userIds`, those that are no live user of the company now ("" included). */
export async function goneUsers(companyId: string, userIds: string[]): Promise<string[]> {
  const wanted = [...new Set(userIds)];
  const real = wanted.filter(Boolean);
  if (!real.length) return wanted;
  const { users } = await auth.userLookup({ ids: real }, { authData: callerOf(companyId) });
  const live = new Set(users.map((u) => u.id));
  return wanted.filter((id) => !live.has(id));
}

/** Forgets the cached identities (tests). */
export const resetServiceActors = () => ids.clear();

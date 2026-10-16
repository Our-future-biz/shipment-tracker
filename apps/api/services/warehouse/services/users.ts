import { userRefs } from "../../../lib/userNames";

// Roles that may void a stamp, archive or restore a stamped gate record, repair missing gate
// rows and override the release box — the same set as the supervisor override.
export const MANAGER_ROLES = ["superadmin", "admin", "manager"] as const;
export const isManager = (role: string | undefined | null) => (MANAGER_ROLES as readonly string[]).includes(role ?? "");

// Display name of a user for the gate log. Users live in the auth service; "" when unknown
// (a failed lookup is logged by userRefs).
export async function userName(userId: string): Promise<string> {
  if (!userId) return "";
  return (await userRefs([userId])).get(userId)?.name ?? "";
}

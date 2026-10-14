import { auth } from "~encore/clients";

// Roles that may void a stamp, archive or restore a stamped gate record, repair missing gate
// rows and override the release box — the same set as the supervisor override.
export const MANAGER_ROLES = ["superadmin", "admin", "manager"] as const;
export const isManager = (role: string | undefined | null) => (MANAGER_ROLES as readonly string[]).includes(role ?? "");

// Display name of a user for the gate log. Users live in the auth service; "" when unknown.
export async function userName(userId: string): Promise<string> {
  if (!userId) return "";
  try {
    const { users } = await auth.usersList();
    const me = users.find((u) => u.id === userId);
    return me?.displayName || me?.email || "";
  } catch {
    return "";
  }
}

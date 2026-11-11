// Who may change whom in a company's users list: the server's rules (updateUser and deactivateUser
// in apps/api/services/auth/services/auth.service.ts), so the list does not offer what the server
// would refuse. apps/web has no shared copy of them - keep the two in step.

interface Person {
  id: string;
  role: string;
}

/** Why each action on a user is not offered to the actor; null where it is. */
export interface UserActionRefusals {
  edit: string | null;
  editRole: string | null;
  deactivate: string | null;
}

const isAdminLevel = (role: string) => role === "admin" || role === "superadmin";
// Ids compared as the database compares uuids, without regard to case.
const sameUser = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** What `actor` may not do to `target`, and why (the server's own words where it has them). */
export function userActionRefusals(actor: Person, target: Person): UserActionRefusals {
  const self = sameUser(actor.id, target.id);
  const notChangeable =
    target.role === "superadmin" && actor.role !== "superadmin"
      ? "Only a superadmin can change a superadmin's account"
      : !isAdminLevel(actor.role) && target.role !== "user"
        ? "Managers can only change standard users"
        : null;
  return {
    edit: notChangeable,
    editRole: notChangeable ?? (self ? "You cannot change your own role" : !isAdminLevel(actor.role) ? "Only admins can change roles" : null),
    deactivate: notChangeable ?? (self ? "You can't deactivate yourself" : null),
  };
}

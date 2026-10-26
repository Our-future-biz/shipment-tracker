import type { PickableUser } from "@/lib/people";

/**
 * Who did something on a quote - a line of its history, who asked the warehouse or answered - as
 * every person is shown: by the e-mail the user has now. Older records hold a display name, and
 * somebody no longer among the users (or the users not loaded yet) keeps what was recorded.
 */
export function whoDid(userId: string | null | undefined, recorded: string | null | undefined, users: readonly PickableUser[]): string {
  return (userId && users.find((u) => u.id === userId)?.email) || (recorded ?? "").trim();
}

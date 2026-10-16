import { vi } from "vitest";

/** Current role of a user as auth reports it (a user demoted after a stamp). */
export const fakeRoles = new Map<string, string>();

type FakeUser = { id: string; email?: string; displayName?: string; role?: string };

// The auth client as the tests' vi.mock("~encore/clients") factories answer it: the listed users
// by name; any other id as a live user with no name (role "user"), so deliveries made as
// the stamping user go through.
export function authFake(users: FakeUser[] = []) {
  return {
    usersList: vi.fn(async () => ({ users })),
    userLookup: vi.fn(async ({ ids }: { ids: string[] }) => ({
      users: ids.map((id) => {
        const u = users.find((x) => x.id === id);
        return { id, name: u?.displayName || u?.email || "", role: fakeRoles.get(id) ?? u?.role ?? "user" };
      }),
    })),
  };
}

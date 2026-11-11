import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { invalidateUserLists } from "./useUserAdmin";
import { usersKey } from "./useUsers";

vi.mock("@/lib/api", () => ({ api: {} }));

describe("invalidateUserLists", () => {
  it("marks the admin list and the list the pickers read out of date, so a renamed or new user shows in both", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["company-users"], { users: [] });
    queryClient.setQueryData(usersKey, { users: [] });
    await invalidateUserLists(queryClient, ["company-users"]);
    expect(queryClient.getQueryState(["company-users"])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(usersKey)?.isInvalidated).toBe(true);
  });
});

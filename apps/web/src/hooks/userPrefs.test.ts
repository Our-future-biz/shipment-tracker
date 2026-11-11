import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { changeUserPref, userPrefKey } from "./userPrefs";
import { parseFilterTemplates, type FilterTemplate } from "./useFilterTemplates";

const userPrefGet = vi.fn();
const userPrefSet = vi.fn();
vi.mock("@/lib/api", () => ({ api: { shipments: { userPrefGet: (k: string) => userPrefGet(k), userPrefSet: (k: string, b: unknown) => userPrefSet(k, b) } } }));

const template = (id: string): FilterTemplate => ({ id, name: `Template ${id}`, filters: [{ key: "status", value: id }] });
const KEY = "shipment-filter-templates";
const addC = (list: FilterTemplate[]) => [...list, template("c")];
const savedList = () => JSON.parse((userPrefSet.mock.calls[0]![1] as { value: string }).value).map((t: FilterTemplate) => t.id);

describe("changeUserPref", () => {
  beforeEach(() => {
    userPrefGet.mockReset();
    userPrefSet.mockReset().mockResolvedValue({});
  });

  it("keeps every saved template when the page's own copy is still empty (loading, or its read failed)", async () => {
    const queryClient = new QueryClient();
    userPrefGet.mockResolvedValue({ value: JSON.stringify([template("a"), template("b")]) });
    await changeUserPref(queryClient, KEY, parseFilterTemplates, addC);
    expect(savedList()).toEqual(["a", "b", "c"]);
  });

  it("keeps a template another tab saved since the page read its copy", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(userPrefKey(KEY), { value: JSON.stringify([template("a")]) });
    userPrefGet.mockResolvedValue({ value: JSON.stringify([template("a"), template("b")]) });
    const next = await changeUserPref(queryClient, KEY, parseFilterTemplates, addC);
    expect(savedList()).toEqual(["a", "b", "c"]);
    expect(next.map((t) => t.id)).toEqual(["a", "b", "c"]);
    expect(parseFilterTemplates(queryClient.getQueryData<{ value: string }>(userPrefKey(KEY))?.value).map((t) => t.id)).toEqual(["a", "b", "c"]);
  });

  it("writes nothing when the saved value cannot be read", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    userPrefGet.mockRejectedValue(new Error("offline"));
    await expect(changeUserPref(queryClient, KEY, parseFilterTemplates, addC)).rejects.toThrow("offline");
    expect(userPrefSet).not.toHaveBeenCalled();
  });
});

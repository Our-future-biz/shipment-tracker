import { describe, expect, it, vi } from "vitest";
import { fetchAllPages } from "./fetchAllPages";

const row = (id: string) => ({ id });
const page = (ids: string[], limit = 2, total = 9) => ({ pagination: { total, limit }, data: ids.map(row) });

describe("fetchAllPages", () => {
  it("walks by id until a short page and reports progress", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page(["a", "b"]))
      .mockResolvedValueOnce(page(["c", "d"]))
      .mockResolvedValueOnce(page(["e"]));
    const progress = vi.fn();
    const rows = await fetchAllPages(fetchPage, progress);
    expect(rows.map((r) => r.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(fetchPage.mock.calls.map((c) => c[0])).toEqual(["00000000-0000-0000-0000-000000000000", "b", "d"]);
    expect(progress).toHaveBeenLastCalledWith({ loaded: 5, total: 9 });
  });

  it("stops on an empty page", async () => {
    const fetchPage = vi.fn().mockResolvedValueOnce(page([]));
    expect(await fetchAllPages(fetchPage)).toEqual([]);
  });

  it("fails instead of looping when a page does not advance", async () => {
    const fetchPage = vi.fn().mockResolvedValueOnce(page(["b", "c"])).mockResolvedValueOnce(page(["b", "c"]));
    await expect(fetchAllPages(fetchPage)).rejects.toThrow("did not advance");
  });

  it("fails the whole load when a page fails", async () => {
    const fetchPage = vi.fn().mockResolvedValueOnce(page(["a", "b"])).mockRejectedValueOnce(new Error("boom"));
    await expect(fetchAllPages(fetchPage)).rejects.toThrow("boom");
  });
});

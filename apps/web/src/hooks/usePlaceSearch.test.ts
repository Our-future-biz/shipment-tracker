import { beforeEach, describe, expect, it, vi } from "vitest";

const placeSearch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: { auth: { placeSearch } } }));

import { placeSearchQuery } from "./usePlaceSearch";

// User council O1 / S10, owner's answer Q3: a sea quote's or job's POL / POD lists the seaports first.
describe("placeSearchQuery", () => {
  beforeEach(() => {
    placeSearch.mockReset();
    placeSearch.mockResolvedValue({ places: [] });
  });

  it("asks for the seaports first by sea, cached apart from the plain list of the same text", async () => {
    const query = placeSearchQuery("Hamburg", true);
    expect(query.queryKey).toEqual(["places", "Hamburg", "sea"]);
    await query.queryFn();
    expect(placeSearch).toHaveBeenCalledWith({ q: "Hamburg", mode: "sea" });
  });

  it("asks as before everywhere else, under the key the code lookups share", async () => {
    const query = placeSearchQuery("Hamburg");
    expect(query.queryKey).toEqual(["places", "Hamburg"]);
    await query.queryFn();
    expect(placeSearch).toHaveBeenCalledWith({ q: "Hamburg" });
  });
});

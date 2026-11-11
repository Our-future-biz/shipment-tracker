import { describe, expect, it } from "vitest";
import { hitToOpen } from "./searchPick";
import type { SearchGroup, SearchHit } from "./searchTypes";

const hit = (key: string): SearchHit => ({ key, href: `/${key}`, title: key, subtitle: "" });
const group = (kind: SearchGroup["kind"], keys: string[], isLoading = false): SearchGroup => ({
  kind,
  label: kind,
  hits: keys.map(hit),
  total: keys.length,
  isLoading,
  isError: false,
});

describe("hitToOpen", () => {
  const groups = [group("pages", ["dashboard"]), group("shipments", ["SCZ1", "SCZ2"]), group("customers", ["acme"])];

  it("opens the picked hit, counted across the groups, once the results are those of the typed text", () => {
    expect(hitToOpen(groups, 0, true)?.key).toBe("dashboard");
    expect(hitToOpen(groups, 2, true)?.key).toBe("SCZ2");
    expect(hitToOpen(groups, 3, true)?.key).toBe("acme");
  });

  it("opens none while the typed text is still being waited for: the list is the text before's", () => {
    expect(hitToOpen(groups, 2, false)).toBeNull();
  });

  it("opens none of a group still showing the answer for the text before", () => {
    const asking = [group("pages", ["dashboard"]), group("shipments", ["SCZ1", "SCZ2"], true)];
    expect(hitToOpen(asking, 1, true)).toBeNull();
    expect(hitToOpen(asking, 0, true)?.key).toBe("dashboard");
  });

  it("opens none with nothing picked, or with the row of all results picked", () => {
    expect(hitToOpen(groups, -1, true)).toBeNull();
    expect(hitToOpen(groups, 4, true)).toBeNull();
  });
});

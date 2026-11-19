import { describe, expect, it } from "vitest";
import { columnsFromLayout, parseColumnLayout } from "@/components/gridLayout";
import { carryPositionsLayout, POSITIONS_STORAGE_KEY, POSITIONS_STORAGE_KEY_BEFORE } from "./positionsLayout";

// A Storage stand-in over a map, in insertion order (as localStorage lists its keys).
function memoryStore(entries: Record<string, string> = {}) {
  const map = new Map(Object.entries(entries));
  return {
    map,
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

const v2 = POSITIONS_STORAGE_KEY_BEFORE;
const v3 = POSITIONS_STORAGE_KEY;

describe("the Positions layout carried to its v3 key", () => {
  it("copies the shown columns and every user's widths - not the known columns - once", () => {
    const store = memoryStore({
      [`${v2}:columns`]: JSON.stringify(["ref", "customer"]),
      [`${v2}:columns-known`]: JSON.stringify(["ref", "customer", "etaWarehouse", "notes"]),
      [`${v2}:columnWidths:u-1`]: JSON.stringify({ ref: 120 }),
      [`${v2}:columnWidths:u-2`]: JSON.stringify({ customer: 200 }),
      "other:grid:columns": "[]",
    });
    expect(carryPositionsLayout(store)).toBe(true);
    expect(store.getItem(`${v3}:columns`)).toBe(JSON.stringify(["ref", "customer"]));
    expect(store.getItem(`${v3}:columns-known`)).toBeNull();
    expect(store.getItem(`${v3}:columnWidths:u-1`)).toBe(JSON.stringify({ ref: 120 }));
    expect(store.getItem(`${v3}:columnWidths:u-2`)).toBe(JSON.stringify({ customer: 200 }));
    // Once: a layout changed under v3 since is never written over.
    store.setItem(`${v3}:columns`, JSON.stringify(["customer"]));
    expect(carryPositionsLayout(store)).toBe(false);
    expect(store.getItem(`${v3}:columns`)).toBe(JSON.stringify(["customer"]));
  });

  it("carries the widths of a browser whose columns were never changed (they are kept apart), once", () => {
    const store = memoryStore({ [`${v2}:columnWidths:u-1`]: '{"ref":120}' });
    expect(carryPositionsLayout(store)).toBe(true);
    expect(store.getItem(`${v3}:columnWidths:u-1`)).toBe('{"ref":120}');
    // No columns of its own: the grid's defaults, with ETA Warehouse/HUB.
    expect(store.getItem(`${v3}:columns`)).toBeNull();
    // Once: widths the user cleared since (useColumnWidths removes the key) are not brought back.
    store.map.delete(`${v3}:columnWidths:u-1`);
    expect(carryPositionsLayout(store)).toBe(false);
    expect(store.getItem(`${v3}:columnWidths:u-1`)).toBeNull();
  });

  it("leaves a browser with no layout before as it is", () => {
    const store = memoryStore({ "other:grid:columns": "[]" });
    expect(carryPositionsLayout(store)).toBe(false);
    expect(store.map.size).toBe(1);
  });

  it("takes a layout carried before the copy was marked as done, widths cleared since staying cleared", () => {
    const store = memoryStore({ [`${v2}:columns`]: '["ref"]', [`${v2}:columnWidths:u-1`]: '{"ref":120}', [`${v3}:columns`]: '["ref"]' });
    expect(carryPositionsLayout(store)).toBe(false);
    expect(store.getItem(`${v3}:columnWidths:u-1`)).toBeNull();
  });

  it("does not write over widths a user has under v3 already", () => {
    const store = memoryStore({ [`${v2}:columns`]: "[]", [`${v2}:columnWidths:u-1`]: '{"ref":120}', [`${v3}:columnWidths:u-1`]: '{"ref":90}' });
    carryPositionsLayout(store);
    expect(store.getItem(`${v3}:columnWidths:u-1`)).toBe('{"ref":90}');
  });

  it("shows ETA Warehouse/HUB once on a layout whose known columns already named it, the user's hidden column staying hidden", () => {
    const columns = [{ key: "ref" }, { key: "customer" }, { key: "notes" }, { key: "etaWarehouse" }];
    const store = memoryStore({
      [`${v2}:columns`]: JSON.stringify(["ref", "customer"]),
      [`${v2}:columns-known`]: JSON.stringify(["ref", "customer", "notes", "etaWarehouse"]),
    });
    // Under v2 the column counted as one the user hid.
    const before = parseColumnLayout(store.getItem(`${v2}:columns`), store.getItem(`${v2}:columns-known`))!;
    expect(columnsFromLayout(before, columns, ["etaWarehouse"])).toEqual(["ref", "customer"]);
    carryPositionsLayout(store);
    const after = parseColumnLayout(store.getItem(`${v3}:columns`), store.getItem(`${v3}:columns-known`))!;
    expect(columnsFromLayout(after, columns, ["etaWarehouse"])).toEqual(["ref", "customer", "etaWarehouse"]);
  });
});

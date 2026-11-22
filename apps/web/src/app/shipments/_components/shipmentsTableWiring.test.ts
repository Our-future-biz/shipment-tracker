import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The Shipments list's column wiring, read from its source (review of system-22).
describe("the Shipments list's columns", () => {
  const table = readFileSync(join(__dirname, "ShipmentsTable.tsx"), "utf8");
  const pinned = (key: string) => table.slice(table.indexOf(`key: "${key}"`), table.indexOf("render:", table.indexOf(`key: "${key}"`)));

  it("pins the icon columns on the right with their own paddings, which the list's cell padding leaves alone", () => {
    for (const key of ["__docs", "__chat", "__alert"]) {
      expect(pinned(key)).toMatch(/fixed: "right"/);
      expect(pinned(key)).toMatch(/className: "!pl-/);
    }
  });

  it("wraps a column's title by a class, with no inline style, and keeps it wrapping once the column is dragged", () => {
    expect(table).toMatch(/onHeaderCell: \(\) => \(\{ id: col\.key, className: "!whitespace-normal" \}\)/);
    expect(table).not.toMatch(/whiteSpace:/);
    expect(table).toMatch(/resizableColumns\(cols, \{ widthOf, resizeProps \}, \{ fixedLayout: true \}\)/);
  });
});

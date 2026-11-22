import { describe, expect, it } from "vitest";
import { COLUMN_MAP } from "@/lib/columnConfig";
import { DEFAULT_SHIPMENT_COLUMNS } from "@/hooks/useColumnPrefs";
import { CELL_PADDING, CELL_PADDING_CLASS, LIST_ROOM_AT_1440, PINNED_ICON_WIDTHS, TICK_BOX_WIDTH, shipmentsTableWidth } from "./listLayout";

const widthOf = (key: string) => {
  const col = COLUMN_MAP.get(key);
  if (!col) throw new Error(`no column ${key}`);
  return col.width;
};

describe("Shipments list layout at 1440 px (mock test S21-058)", () => {
  it("is the room the app measured: 1440 less the menu, the page sides and the card border", () => {
    expect(LIST_ROOM_AT_1440).toBe(1440 - 260 - 2 * 32 - 2);
  });

  it("fits the default columns from Internal Reference through ETA left of the pinned icons, with a few px to spare", () => {
    const throughEta = DEFAULT_SHIPMENT_COLUMNS.slice(0, DEFAULT_SHIPMENT_COLUMNS.indexOf("estimatedArrival") + 1);
    expect(throughEta).toEqual(["jobNumber", "customer", "status", "pol", "pod", "closingDate", "estimatedDeparture", "estimatedArrival"]);
    const used = shipmentsTableWidth(throughEta.map(widthOf));
    expect(used).toBeLessThanOrEqual(LIST_ROOM_AT_1440 - 4);
  });

  it("keeps each date column wide enough for a date (\"28.12.2026\", about 68 px) and the cell's padding", () => {
    expect(CELL_PADDING).toBe(12);
    for (const key of ["closingDate", "estimatedDeparture", "estimatedArrival"]) expect(widthOf(key) - CELL_PADDING).toBeGreaterThanOrEqual(68);
  });

  it("holds the longest references whole: CZPROJECT00000023 (148 px in bold) and MCZPROJECT00000004 (157 px)", () => {
    expect(widthOf("jobNumber") - CELL_PADDING).toBeGreaterThanOrEqual(148);
    expect(widthOf("masterJob") - CELL_PADDING).toBeGreaterThanOrEqual(157);
  });

  it("pads every cell 6 px a side but the pinned icon cells, which keep their own tuned paddings (review of system-22)", () => {
    // `.list .ant-table-cell` with !important outranks a cell's own `!pl-0`: the pinned (fixed right) cells are left out.
    expect(CELL_PADDING_CLASS).toBe("[&_.ant-table-cell:not(.ant-table-cell-fix-right)]:!px-1.5");
  });

  it("counts the tick box and the three pinned icon columns", () => {
    expect(shipmentsTableWidth([])).toBe(TICK_BOX_WIDTH + PINNED_ICON_WIDTHS.docs + PINNED_ICON_WIDTHS.chat + PINNED_ICON_WIDTHS.alert);
    expect(shipmentsTableWidth([100, 50])).toBe(shipmentsTableWidth([]) + 150);
  });
});

import { isValidElement } from "react";
import { describe, expect, it } from "vitest";
import { FadeText } from "@/components/FadeText";
import { MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH, clampColumnWidth, parseColumnWidths, resizableColumns } from "./useColumnWidths";

describe("clampColumnWidth", () => {
  it("keeps a width between the narrowest and the widest, in whole pixels", () => {
    expect(clampColumnWidth(10)).toBe(MIN_COLUMN_WIDTH);
    expect(clampColumnWidth(5000)).toBe(MAX_COLUMN_WIDTH);
    expect(clampColumnWidth(212.6)).toBe(213);
  });
});

describe("parseColumnWidths", () => {
  it("reads the stored widths", () => {
    expect(parseColumnWidths('{"customer":260,"pol":90}')).toEqual({ customer: 260, pol: 90 });
  });

  it("drops what is not a width and clamps the rest", () => {
    expect(parseColumnWidths('{"customer":"wide","pol":null,"pod":2,"eta":9999}')).toEqual({ pod: MIN_COLUMN_WIDTH, eta: MAX_COLUMN_WIDTH });
  });

  it("gives no widths for nothing stored or something broken", () => {
    expect(parseColumnWidths(null)).toEqual({});
    expect(parseColumnWidths("not json")).toEqual({});
    expect(parseColumnWidths("[120, 80]")).toEqual({});
  });
});

describe("resizableColumns", () => {
  type Row = { id: string };
  const sizing = (widths: Record<string, number>) => ({
    widthOf: (key: string) => widths[key],
    resizeProps: (key: string) => ({ onResizeWidth: () => key, onResetWidth: () => key }),
  });

  it("gives each titled column a handle and leaves an untitled one as it is", () => {
    const icon = { key: "__docs", title: "", width: 30 };
    const cols = resizableColumns<Row>([{ key: "pol", title: "POL", width: 150 }, icon], sizing({}));
    const named = cols[0]!;
    expect(cols[1]).toBe(icon);
    const header = named.onHeaderCell?.({} as never) as Record<string, unknown>;
    expect(typeof header.onResizeWidth).toBe("function");
    expect(named.width).toBe(150);
  });

  it("holds a sized column at its width on the header and every cell, keeping their own props", () => {
    const col = resizableColumns<Row>(
      [
        {
          dataIndex: "pol",
          title: "POL",
          width: 150,
          onHeaderCell: () => ({ id: "pol" }) as never,
          onCell: () => ({ style: { backgroundImage: "x" }, className: "tint" }),
        },
      ],
      sizing({ pol: 90 }),
    )[0]!;
    expect(col.width).toBe(90);
    const header = col.onHeaderCell?.({} as never) as { id?: string; style?: object };
    expect(header.id).toBe("pol");
    expect(header.style).toEqual({ width: 90, minWidth: 90, maxWidth: 90 });
    expect(col.onCell?.({ id: "1" }, 0)).toEqual({ className: "tint", style: { backgroundImage: "x", width: 90, minWidth: 90, maxWidth: 90 } });
  });

  it("fades the cells and the title of a sized column only", () => {
    const own = (v: unknown) => `<${String(v)}>`;
    const [sized, other] = resizableColumns<Row>(
      [
        { key: "pol", dataIndex: "pol", title: "POL", render: own },
        { key: "pod", dataIndex: "pod", title: "POD", render: own },
      ],
      sizing({ pol: 90 }),
    ) as { title?: unknown; render?: (v: unknown, r: Row, i: number) => unknown }[];
    const cell = sized!.render?.("Hamburg", { id: "1" }, 0);
    expect(isValidElement(cell) && cell.type).toBe(FadeText);
    expect(isValidElement(cell) && (cell.props as { children?: unknown }).children).toBe("<Hamburg>");
    expect(isValidElement(sized!.title) && sized!.title.type).toBe(FadeText);
    expect(other!.render).toBe(own);
    expect(other!.title).toBe("POD");
  });
});

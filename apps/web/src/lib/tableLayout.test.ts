import { describe, expect, it } from "vitest";
import { layoutWithoutSticky } from "./tableLayout";

type Row = { a: string };

describe("layoutWithoutSticky", () => {
  it("keeps a plain table sized by what its columns hold", () => {
    expect(layoutWithoutSticky<Row>({ columns: [{ title: "A", dataIndex: "a" }] })).toBe("auto");
    expect(layoutWithoutSticky<Row>({ columns: [{ title: "A", dataIndex: "a" }], scroll: { x: "max-content" } })).toBe("auto");
  });

  it("keeps the layout a table asks for", () => {
    expect(layoutWithoutSticky<Row>({ tableLayout: "fixed", columns: [] })).toBe("fixed");
  });

  it("leaves antd its own choice where it chose fixed without the kept titles", () => {
    expect(layoutWithoutSticky<Row>({ scroll: { y: 400 }, columns: [] })).toBeUndefined();
    expect(layoutWithoutSticky<Row>({ columns: [{ title: "A", ellipsis: true }] })).toBeUndefined();
    expect(layoutWithoutSticky<Row>({ columns: [{ title: "G", children: [{ title: "A", ellipsis: true }] }] })).toBeUndefined();
    expect(layoutWithoutSticky<Row>({ scroll: { x: 1600 }, columns: [{ title: "A", fixed: "left" }] })).toBeUndefined();
  });

  it("keeps auto for fixed columns in a table as wide as its content", () => {
    expect(layoutWithoutSticky<Row>({ scroll: { x: "max-content" }, columns: [{ title: "A", fixed: "left" }] })).toBe("auto");
  });
});

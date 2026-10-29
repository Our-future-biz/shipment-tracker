import { describe, expect, it } from "vitest";
import { cellRender } from "./gridColumns";

interface Row {
  name: string;
  city: string;
}

const row: Row = { name: "METRANS a.s.", city: "Praha" };
const city = (r: Row) => r.city;

describe("cellRender", () => {
  it("shows a column's text when it has no cells of its own", () => {
    expect(cellRender<Row>({}, city)?.(undefined, row, 0)).toBe("Praha");
  });

  it("keeps a column's own render", () => {
    const render = (_: unknown, r: Row) => r.name.toUpperCase();
    expect(cellRender<Row>({ render }, city)).toBe(render);
  });

  it("leaves a column with a dataIndex to antd", () => {
    expect(cellRender<Row>({ dataIndex: "city" }, city)).toBeUndefined();
  });
});

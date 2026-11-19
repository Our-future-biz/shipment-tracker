import { describe, expect, it } from "vitest";
import { columnsFromLayout, knownColumns, legacyKnown, parseColumnLayout } from "./gridLayout";

const cols = [{ key: "ref" }, { key: "customer" }, { key: "notes", defaultVisible: false }, { key: "eta" }];

describe("columnsFromLayout", () => {
  it("shows a column added after the layout was saved, at the end", () => {
    expect(columnsFromLayout({ visible: ["customer", "ref"], known: ["ref", "customer", "notes"] }, cols)).toEqual(["customer", "ref", "eta"]);
  });

  it("keeps a column the user hid hidden", () => {
    expect(columnsFromLayout({ visible: ["ref"], known: ["ref", "customer", "notes", "eta"] }, cols)).toEqual(["ref"]);
  });

  it("does not show a new column that is hidden by default", () => {
    expect(columnsFromLayout({ visible: ["ref"], known: ["ref", "customer", "eta"] }, cols)).toEqual(["ref"]);
  });

  it("keeps the place of a column the grid does not have now", () => {
    expect(columnsFromLayout({ visible: ["ref", "away"], known: ["ref", "away", "customer", "notes", "eta"] }, cols)).toEqual(["ref", "away"]);
  });

  it("leaves a layout saved without the known columns as it was, when the grid names no column added later", () => {
    expect(columnsFromLayout({ visible: ["ref"], known: null }, cols)).toEqual(["ref"]);
  });

  it("shows once a column the grid added after layouts saved without the known columns - and keeps the user's other choices (P7)", () => {
    // Customer was hidden by the user, ETA was added later: ETA shows, Customer stays hidden.
    expect(columnsFromLayout({ visible: ["ref"], known: null }, cols, ["eta"])).toEqual(["ref", "eta"]);
    // Already shown: not twice.
    expect(columnsFromLayout({ visible: ["eta", "ref"], known: null }, cols, ["eta"])).toEqual(["eta", "ref"]);
    // Hidden by default: not shown.
    expect(columnsFromLayout({ visible: ["ref"], known: null }, cols, ["notes"])).toEqual(["ref"]);
    // A layout with its known list goes by that list.
    expect(columnsFromLayout({ visible: ["ref"], known: ["ref", "customer", "notes", "eta"] }, cols, ["eta"])).toEqual(["ref"]);
  });
});

describe("legacyKnown", () => {
  it("is the grid's columns but those added later", () => {
    expect(legacyKnown(cols, ["eta"])).toEqual(["ref", "customer", "notes"]);
    expect(legacyKnown(cols, [])).toEqual(["ref", "customer", "notes", "eta"]);
  });
});

describe("knownColumns", () => {
  it("keeps a column known while the grid does not show it, and adds the grid's columns", () => {
    expect(knownColumns(["ref", "later"], [{ key: "ref" }, { key: "eta" }])).toEqual(["ref", "later", "eta"]);
    expect(knownColumns(null, [{ key: "ref" }])).toEqual(["ref"]);
  });
});

describe("parseColumnLayout", () => {
  it("reads the shown and known lists", () => {
    expect(parseColumnLayout('["a"]', '["a","b"]')).toEqual({ visible: ["a"], known: ["a", "b"] });
  });

  it("has no known list for an old layout or a broken one", () => {
    expect(parseColumnLayout('["a"]', null)).toEqual({ visible: ["a"], known: null });
    expect(parseColumnLayout('["a"]', "{oops")).toEqual({ visible: ["a"], known: null });
  });

  it("is nothing without a shown list", () => {
    expect(parseColumnLayout(null, '["a"]')).toBeNull();
    expect(parseColumnLayout('{"a":1}', null)).toBeNull();
  });
});

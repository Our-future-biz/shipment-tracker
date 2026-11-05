import { describe, expect, it } from "vitest";
import { compareJobNumbers } from "./jobNumber";

describe("compareJobNumbers", () => {
  it("orders references by their number, whatever their letters", () => {
    const refs = ["CZROAD00000025", "CZAIR00000024", "CZFCL00000023", "CZ00000026", "CZPROJECT00000002"];
    expect([...refs].sort(compareJobNumbers)).toEqual(["CZPROJECT00000002", "CZFCL00000023", "CZAIR00000024", "CZROAD00000025", "CZ00000026"]);
  });

  it("puts text that is no reference after the references", () => {
    expect(["CZQ1", "CZ00000001"].sort(compareJobNumbers)).toEqual(["CZ00000001", "CZQ1"]);
  });
});

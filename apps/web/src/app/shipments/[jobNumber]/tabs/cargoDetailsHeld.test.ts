import { describe, expect, it } from "vitest";
import type { CargoDimensionLine } from "@/lib/cargo";
import { heldDims, redrawsDims } from "./CargoDetailsTab";

// After a "changed meanwhile" refusal, Cargo Details' next save of its dimension lines is held to
// the lines the table was drawn from - never to fresher lines it did not show (round-4 review: an
// open row's save would then write the old lines over a colleague's save, unasked).

const line = (pieces: string): CargoDimensionLine => ({ containerId: null, pieces, lengthCm: "100", widthCm: "100", heightCm: "50", weightPerPcKg: "120", volumePerPcM3: "", packageType: "", stackable: "" });
const base = [line("10")];
const server = [line("12")];

describe("heldDims", () => {
  it("takes the server's lines when the table is redrawn with them", () => {
    expect(heldDims(base, server, { redraw: true })).toBe(server);
  });

  it("keeps the lines drawn while the table is not redrawn (a row open)", () => {
    expect(heldDims(base, server, { redraw: false })).toBe(base);
  });
});

describe("redrawsDims", () => {
  const at = { differs: true, forced: false, openRows: 1, refusedSinceSave: false };
  it("does not redraw over an open row normally", () => {
    expect(redrawsDims(at)).toBe(false);
  });
  it("redraws the lines read again after a refusal, also with a row open", () => {
    expect(redrawsDims({ ...at, refusedSinceSave: true })).toBe(true);
    expect(redrawsDims({ ...at, forced: true })).toBe(true);
  });
  it("redraws with no row open, never when nothing differs", () => {
    expect(redrawsDims({ ...at, openRows: 0 })).toBe(true);
    expect(redrawsDims({ ...at, differs: false, refusedSinceSave: true })).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { placeListsOf } from "./EditableCell";

// What a job's place cell offers by its Freight Mode (user council O1, owner's answer Q3).
describe("placeListsOf", () => {
  it("lists the seaports first in a sea job's POL and POD", () => {
    expect(placeListsOf("pol", "Sea Freight")).toEqual({ airports: false, terminals: false, seaports: true });
    expect(placeListsOf("pod", "Sea Freight")).toEqual({ airports: false, terminals: false, seaports: true });
  });

  it("offers terminals, not seaports first, in a sea job's Origin and Destination", () => {
    expect(placeListsOf("origin", "Sea Freight")).toEqual({ airports: false, terminals: true, seaports: false });
    expect(placeListsOf("destination", "Sea Freight")).toEqual({ airports: false, terminals: true, seaports: false });
  });

  it("keeps airports first by air, and plain places without a mode", () => {
    expect(placeListsOf("pol", "Air Freight")).toEqual({ airports: true, terminals: false, seaports: false });
    expect(placeListsOf("pod", undefined)).toEqual({ airports: false, terminals: false, seaports: false });
    expect(placeListsOf("pod", "Rail Freight")).toEqual({ airports: false, terminals: false, seaports: false });
  });
});

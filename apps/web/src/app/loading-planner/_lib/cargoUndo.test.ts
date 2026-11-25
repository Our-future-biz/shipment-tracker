import { describe, expect, it } from "vitest";
import { stillTheList } from "./cargoUndo";

const line = (id: string, colli = 1) => ({ id, colli });

describe("the cargo table's Undo (Council Outlay 14, P5)", () => {
  const after = [line("a"), line("c")];

  it("holds while the list is the one the removal left, its figures typed into or not", () => {
    expect(stillTheList(after, [line("a"), line("c")])).toBe(true);
    expect(stillTheList(after, [line("a", 9), line("c")])).toBe(true);
  });

  it("is dropped once the list is replaced from outside: the job's cargo loaded, a colleague's version taken over, lines read from a file", () => {
    // Reload cargo / Link with cargo: lines of new ids.
    expect(stillTheList(after, [line("x"), line("y")])).toBe(false);
    // Load their version: the stored list, which still has the line removed here - Undo would make it two.
    expect(stillTheList(after, [line("a"), line("b"), line("c")])).toBe(false);
    // Lines read from a file join the list.
    expect(stillTheList(after, [line("a"), line("c"), line("r1")])).toBe(false);
  });

  it("is dropped once the lines move, or the list is emptied", () => {
    expect(stillTheList(after, [line("c"), line("a")])).toBe(false);
    expect(stillTheList(after, [])).toBe(false);
  });
});

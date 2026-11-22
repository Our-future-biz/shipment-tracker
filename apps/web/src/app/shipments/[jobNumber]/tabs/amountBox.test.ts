import { describe, expect, it, vi } from "vitest";
import { amountLeft, amountLoaded, amountRefused, onAmountBlur, type ShownAmount } from "./amountBox";

// A blur of an amount box, as the cost tables get it: the box is its target.
const blur = (value: string) => ({ target: { value } });

describe("onAmountBlur", () => {
  it("saves another amount and writes it the way figures are", () => {
    const save = vi.fn();
    const e = blur("1250,5");
    onAmountBlur("100.00", save)(e);
    expect(save).toHaveBeenCalledWith("1250,5", expect.any(Function));
    expect(e.target.value).toBe("1,250.50");
  });

  it("saves nothing when the amount is the stored one", () => {
    const save = vi.fn();
    onAmountBlur("1250.50", save)(blur("1 250,50"));
    expect(save).not.toHaveBeenCalled();
  });

  it("shows the stored amount again when the save is refused", () => {
    const e = blur("2 x 40HC");
    onAmountBlur("100.00", (_typed, refused) => refused())(e);
    expect(e.target.value).toBe("100.00");
  });

  it("empties the box again when an amount typed into an empty one is refused", () => {
    const e = blur("999");
    onAmountBlur(null, (_typed, refused) => refused())(e);
    expect(e.target.value).toBe("");
  });
});

// A real-cost box (Qty, Real Cost) of a buying line: what it shows of the line beyond its text (review of system-22).
describe("a real-cost box", () => {
  const box = (over: Partial<ShownAmount> = {}): ShownAmount => ({ drawn: "1000.00", focusText: null, saving: 0, ...over });

  it("redraws a box not in use from a stored change, not one being typed in", () => {
    expect(amountLoaded(box(), "1,000.00", "1200.00")).toEqual({ write: "1,200.00", drawn: "1200.00" });
    expect(amountLoaded(box({ focusText: "1,000.00" }), "1,1", "1200.00")).toEqual({ write: null, drawn: "1000.00" });
  });

  it("leaves the box alone while the stored value is the one it shows", () => {
    expect(amountLoaded(box(), "1,000.00", "1000.00")).toEqual({ write: null, drawn: "1000.00" });
  });

  it("takes one's own save loaded back as shown, without writing over the text", () => {
    // Back in the box while its 1450 still saved: the reload is what it showed when the user went in.
    expect(amountLoaded(box({ focusText: "1,450.00" }), "1,5", "1450.00")).toEqual({ write: null, drawn: "1450.00" });
    // Left with 1000 typed while the 1450 before it still saves: that 1450 loaded back is not drawn over the 1000.
    expect(amountLoaded(box({ saving: 2 }), "1,000.00", "1450.00")).toEqual({ write: null, drawn: "1000.00" });
    expect(amountLoaded(box({ saving: 1 }), "1,450.00", "1450.00")).toEqual({ write: null, drawn: "1450.00" });
  });

  it("saves what differs from what the box showed when the user went in, on the value it showed", () => {
    // Someone else's 1200 came while 1100 was typed: the save is sent on the 1000 the box showed.
    expect(amountLeft(box({ focusText: "1,000.00" }), "1100", "1200.00")).toEqual({ save: "1100", write: "1,100.00", drawn: "1000.00" });
  });

  it("saves 1000 retyped while the 1450 typed over it still saves (1000 → 1450 → 1000)", () => {
    expect(amountLeft(box({ focusText: "1,000.00" }), "1450", "1000.00").save).toBe("1450");
    // The row still reads 1000 until that save is loaded back - the box showed 1450.
    expect(amountLeft(box({ focusText: "1,450.00", saving: 1 }), "1000", "1000.00")).toEqual({ save: "1000", write: "1,000.00", drawn: "1000.00" });
  });

  it("shows a value loaded while the user was in the box once they leave it without typing", () => {
    expect(amountLeft(box({ focusText: "1,000.00" }), "1,000.00", "1200.00")).toEqual({ save: null, write: "1,200.00", drawn: "1200.00" });
    // …but not while its own save still runs: that save's reload, or its refusal, puts the box right.
    expect(amountLeft(box({ focusText: "1,450.00", saving: 1 }), "1,450.00", "1200.00")).toEqual({ save: null, write: "1,450.00", drawn: "1000.00" });
    expect(amountLeft(box({ focusText: "1,000.00" }), "1000", "1000.00")).toEqual({ save: null, write: "1,000.00", drawn: "1000.00" });
  });

  it("shows the reloaded real cost after a refusal, and sends the next save on it (mock test run F1)", () => {
    // A sees 1000; B saved 1200. A types 1100: sent on 1000, refused as changed meanwhile.
    let shown = box({ focusText: "1,000.00" });
    expect(amountLeft(shown, "1100", "1000.00")).toMatchObject({ save: "1100", drawn: "1000.00" });
    shown = { ...shown, focusText: null, saving: 1 };
    // Refused before the reload is in: the stored 1000 again.
    const refused = amountRefused("1000.00");
    expect(refused).toEqual({ write: "1,000.00", drawn: "1000.00" });
    shown = { ...shown, drawn: refused.drawn, saving: 0 };
    // The reload brings B's 1200: the box shows it, and the next save is sent on it.
    const loaded = amountLoaded(shown, refused.write, "1200.00");
    expect(loaded).toEqual({ write: "1,200.00", drawn: "1200.00" });
    shown = { ...shown, drawn: loaded.drawn, focusText: "1,200.00" };
    expect(amountLeft(shown, "1100", "1200.00")).toMatchObject({ save: "1100", drawn: "1200.00" });
  });
});

import { describe, expect, it } from "vitest";
import { QUOTE_STATUS_LABELS, quoteStatusLabel } from "../quoteStatusLabel";

describe("quoteStatusLabel", () => {
  it("names every status of a quote as the screens do, the derived Expired and Replaced too", () => {
    expect(Object.keys(QUOTE_STATUS_LABELS).sort()).toEqual(
      ["draft", "ready_to_send", "quoted", "feedback", "revised", "won", "lost", "expired", "replaced"].sort(),
    );
    expect(quoteStatusLabel("ready_to_send")).toBe("Ready to Send");
    expect(quoteStatusLabel("replaced")).toBe("Replaced");
  });

  it("quotes a status it does not know as it is, a name of Object.prototype too", () => {
    expect(quoteStatusLabel("on_hold")).toBe('"on_hold"');
    expect(quoteStatusLabel("toString")).toBe('"toString"');
  });
});

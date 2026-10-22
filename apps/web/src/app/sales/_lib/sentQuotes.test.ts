import { describe, expect, it } from "vitest";
import { isSentQuote, QUOTE_STATUSES } from "./types";

describe("isSentQuote", () => {
  it("counts the quotes that went to the customer, answered or not", () => {
    expect(["quoted", "feedback", "won", "lost", "expired", "replaced"].every(isSentQuote)).toBe(true);
  });

  it("leaves out drafts, quotes ready to send and revisions not sent yet", () => {
    expect(["draft", "ready_to_send", "revised"].some(isSentQuote)).toBe(false);
  });

  it("knows every status the app shows", () => {
    expect(QUOTE_STATUSES.filter((s) => isSentQuote(s.key)).map((s) => s.key)).toEqual(["quoted", "feedback", "won", "lost", "expired", "replaced"]);
  });
});

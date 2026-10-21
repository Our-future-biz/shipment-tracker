import { describe, expect, it } from "vitest";
import { exportClosesQuote } from "./exportClose";

describe("exportClosesQuote", () => {
  it("closes a quote that has not gone out yet; one that went out or is decided is printed as it is", () => {
    for (const status of ["draft", "ready_to_send", "revised"]) expect(exportClosesQuote(status), status).toBe(true);
    for (const status of ["quoted", "feedback", "won", "lost", "expired", "replaced"]) expect(exportClosesQuote(status), status).toBe(false);
  });
});

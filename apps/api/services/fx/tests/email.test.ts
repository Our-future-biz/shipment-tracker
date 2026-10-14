import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/log", () => ({ default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { EMAIL_DISABLED, sendEmail } from "../../../lib/email";

afterEach(() => vi.unstubAllGlobals());

describe("sendEmail (disabled)", () => {
  it("never calls out and reports why it did not send", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendEmail({ to: ["a@x.cz", " a@x.cz "], subject: "Test", text: "Body" })).toEqual({
      sent: false,
      error: EMAIL_DISABLED,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says when there is nobody to send to", async () => {
    expect(await sendEmail({ to: ["", " "], subject: "Test", text: "Body" })).toEqual({ sent: false, error: "No recipients" });
  });
});

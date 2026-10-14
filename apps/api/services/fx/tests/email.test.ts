import { afterEach, describe, expect, it, vi } from "vitest";

const key = vi.hoisted(() => ({ value: "" as string | null, throws: false }));
vi.mock("encore.dev/log", () => ({ default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("encore.dev/config", () => ({
  secret: () => () => {
    if (key.throws) throw new Error("secret not set");
    return key.value;
  },
}));

import { sendEmail } from "../../../lib/email";

const msg = { to: ["a@x.cz", " a@x.cz ", ""], subject: "Test", text: "Body" };

afterEach(() => {
  vi.unstubAllGlobals();
  key.value = "";
  key.throws = false;
});

describe("sendEmail", () => {
  it("does not send and says why when no Resend key is set", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    key.throws = true;
    expect(await sendEmail(msg)).toEqual({ sent: false, error: "E-mail sending is off (no Resend API key set)" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends once per unique recipient list through Resend", async () => {
    key.value = "re_test";
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendEmail(msg)).toEqual({ sent: true, error: "" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(JSON.parse(init.body as string)).toMatchObject({ to: ["a@x.cz"], subject: "Test" });
  });

  it("reports a rejected send", async () => {
    key.value = "re_test";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("domain not verified", { status: 403 })));
    expect(await sendEmail(msg)).toEqual({ sent: false, error: "Resend answered 403: domain not verified" });
  });
});

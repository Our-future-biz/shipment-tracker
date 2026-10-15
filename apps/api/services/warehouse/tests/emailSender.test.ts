import { afterEach, describe, expect, it, vi } from "vitest";

// The warehouse's supplier e-mail sender (a copy of lib/email.ts with Cc, reply-to, attachments
// and an idempotency key). Sending is off (no RESEND_API_KEY is declared, like lib/email.ts);
// the Resend call itself is tested through sendWithKey. Resend is never called: fetch is stubbed.
vi.mock("encore.dev/log", () => ({ default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { emailConfigured, NO_KEY_TEXT, sendSupplierMail, sendWithKey } from "../services/emailSender";

const msg = {
  to: ["a@x.cz", " a@x.cz ", ""],
  cc: ["a@x.cz", "b@y.cz"],
  replyTo: "me@wh.cz",
  subject: "VGM — WCZ1",
  text: "Body",
  attachments: [{ filename: "scale.jpg", content: "AAAA" }],
  idempotencyKey: "warehouse-supplier-1",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sendSupplierMail", () => {
  it("does not send and says why while sending is off (no crash)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(emailConfigured()).toBe(false);
    expect(await sendSupplierMail(msg)).toEqual({ sent: false, error: NO_KEY_TEXT, providerId: "" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends To, Cc (without the To addresses), reply-to, attachments and the idempotency key", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "em_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendWithKey("re_test", msg)).toEqual({ sent: true, error: "", providerId: "em_1" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("warehouse-supplier-1");
    expect(JSON.parse(init.body as string)).toMatchObject({
      to: ["a@x.cz"],
      cc: ["b@y.cz"],
      reply_to: "me@wh.cz",
      subject: "VGM — WCZ1",
      attachments: [{ filename: "scale.jpg", content: "AAAA" }],
    });
  });

  it("reports a rejected send and a network error without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("domain not verified", { status: 403 })));
    expect(await sendWithKey("re_test", msg)).toEqual({ sent: false, error: "The e-mail provider answered 403: domain not verified", providerId: "" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("getaddrinfo ENOTFOUND");
      }),
    );
    expect(await sendWithKey("re_test", msg)).toEqual({ sent: false, error: "getaddrinfo ENOTFOUND", providerId: "" });
  });

  it("refuses a message without recipients", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await sendSupplierMail({ ...msg, to: [" "] })).error).toBe("No recipients");
    expect((await sendWithKey("re_test", { ...msg, to: [" "] })).error).toBe("No recipients");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

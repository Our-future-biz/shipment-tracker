import { describe, expect, it, vi } from "vitest";
import {
  LINK_SHOWN_ONCE,
  PIN_EXPLANATION,
  RECORDED_AS_SENT,
  copyText,
  invalidRecipients,
  orderRecipientsOf,
  parseRecipients,
  pinProblem,
  pinValue,
  recordAsSentLabel,
  afterRecordedSend,
  linkViewText,
  pdfNotDownloadedText,
  sendDialogText,
} from "./transportOrder";

describe("pick-up PIN field", () => {
  it("prints no PIN when the field is empty", () => {
    expect(pinProblem("")).toBeNull();
    expect(pinValue("  ")).toBeNull();
  });

  it("takes 4 to 6 digits, spaces ignored", () => {
    expect(pinProblem("123 456")).toBeNull();
    expect(pinValue("123 456")).toBe("123456");
    expect(pinProblem("123")).toBe("The PIN has 4 to 6 digits");
    expect(pinProblem("1234567")).toBe("The PIN has 4 to 6 digits");
    expect(pinProblem("12a4")).toBe("The PIN has digits only");
  });

  it("explains why the PIN is typed", () => {
    expect(PIN_EXPLANATION).toBe("Shown once in Shipments — type it to print it; it is not stored.");
  });
});

describe("recipients", () => {
  it("splits on commas, semicolons and lines, without repeats", () => {
    expect(parseRecipients("a@x.cz, b@y.cz;\nA@x.cz  ")).toEqual(["a@x.cz", "b@y.cz"]);
  });
  it("finds what is not an e-mail address", () => {
    expect(invalidRecipients(["a@x.cz", "dispecink", "b@y"])).toEqual(["dispecink", "b@y"]);
  });
});

describe("To starts with the haulier's contacts (T8)", () => {
  const contact = (email: string, role: string, isMain = false) => ({ email, role, isMain });

  it("takes the Dispatch / Operations contacts, the main one first", () => {
    expect(
      orderRecipientsOf([contact("boss@bravo.cz", "Owner", true), contact("dispo@bravo.cz", "Dispatch / Operations"), contact("noc@bravo.cz", "Dispatch / Operations", true)]),
    ).toBe("noc@bravo.cz, dispo@bravo.cz");
  });

  it("falls back to the main contact, else the first with an e-mail", () => {
    expect(orderRecipientsOf([contact("a@bravo.cz", "Sales"), contact("boss@bravo.cz", "Owner", true)])).toBe("boss@bravo.cz");
    expect(orderRecipientsOf([contact("", "Owner", true), contact("a@bravo.cz", "Sales")])).toBe("a@bravo.cz");
    // A dispatch contact with no e-mail does not count.
    expect(orderRecipientsOf([contact(" ", "Dispatch / Operations"), contact("a@bravo.cz", "Sales")])).toBe("a@bravo.cz");
  });

  it("starts empty with no contact e-mail", () => {
    expect(orderRecipientsOf([])).toBe("");
    expect(orderRecipientsOf([contact("", "Dispatch / Operations")])).toBe("");
  });
});

describe("the haulier's link shown once (T8/E1)", () => {
  it("says it is shown once and how a new one is made", () => {
    expect(LINK_SHOWN_ONCE).toBe("Shown once: copy it now. Record as sent again makes a new link that replaces this one.");
    expect(LINK_SHOWN_ONCE).toContain(recordAsSentLabel(true).replace("…", ""));
  });

  it("copies to the clipboard, and says when it could not", async () => {
    const writeText = vi.fn(async () => undefined);
    expect(await copyText("https://x/haulier/order/t", { writeText })).toBe(true);
    expect(writeText).toHaveBeenCalledWith("https://x/haulier/order/t");
    expect(await copyText("t", { writeText: vi.fn(async () => Promise.reject(new Error("denied"))) })).toBe(false);
    expect(await copyText("t", undefined)).toBe(false);
  });
});

describe("recording a transport order as sent", () => {
  it("never says Send: e-mail is off, the order is recorded as sent", () => {
    expect(recordAsSentLabel(false)).toBe("Record as sent…");
    expect(recordAsSentLabel(true)).toBe("Record as sent again…");
    expect(RECORDED_AS_SENT).toBe("Recorded as sent");
  });
});

describe("after a send is recorded", () => {
  it("shows the haulier's link before the PDF downloads, so a failed download cannot lose it", () => {
    const steps: string[] = [];
    expect(afterRecordedSend(() => steps.push("link"), () => steps.push("pdf"))).toBe(true);
    expect(steps).toEqual(["link", "pdf"]);
  });

  it("keeps the send recorded when the download fails, and says so", () => {
    const showLink = vi.fn();
    expect(
      afterRecordedSend(showLink, () => {
        throw new Error("blocked");
      }),
    ).toBe(false);
    expect(showLink).toHaveBeenCalledOnce();
    expect(pdfNotDownloadedText(true)).toBe("Recorded as sent; the PDF did not download — copy the link below, or Record as sent again for a new PDF");
    expect(pdfNotDownloadedText(false)).toBe("Recorded as sent; the PDF did not download — Record as sent again for a new PDF");
  });

  it("says the order was not e-mailed only when it was not", () => {
    expect(linkViewText("TO-1", true, true)).toEqual({
      message: "TO-1 is recorded as sent — the PDF is downloaded",
      description: "Send the PDF, or this link, to the haulier yourself: it was not e-mailed. Through the link the haulier confirms the order and uploads the POD.",
    });
    expect(linkViewText("TO-1", false, true).message).toBe("TO-1 is e-mailed to the haulier — the PDF is downloaded");
    expect(linkViewText("TO-1", false, true).description).not.toMatch(/not e-mailed|off/);
    expect(linkViewText("TO-1", true, false)).toMatchObject({ message: "TO-1 is recorded as sent", description: expect.stringMatching(/^Send this link to the haulier yourself/) });
  });
});

describe("Record as sent before it is pressed", () => {
  it("says e-mail sending is off only when the server really cannot e-mail", () => {
    const off = sendDialogText(false, 2, true);
    expect(off.banner?.message).toBe("E-mail sending is off in this app");
    expect(off.banner?.description).toMatch(/haulier's link/);
    expect(off.toHint).toMatch(/not e-mailed/);
    expect(off.button).toBe("Record as sent and download PDF");
    expect(sendDialogText(false, 0, false).banner?.description).not.toMatch(/haulier's link/);

    const on = sendDialogText(true, 2, true);
    expect(on.banner).toBeNull();
    expect(on.toHint).not.toMatch(/not e-mailed/);
    expect(on.button).toBe("Send and download PDF");
  });

  it("says that with e-mail on and no address in To the order is only recorded", () => {
    const none = sendDialogText(true, 0, true);
    expect(none.banner?.message).toBe("No address in To");
    expect(none.banner?.message).not.toMatch(/off/);
    expect(none.button).toBe("Record as sent and download PDF");
  });

  it("claims nothing while the settings are still read", () => {
    expect(sendDialogText(null, 2, true)).toEqual({ banner: null, toHint: "The haulier's addresses, recorded with the order", button: "Record as sent and download PDF" });
  });
});

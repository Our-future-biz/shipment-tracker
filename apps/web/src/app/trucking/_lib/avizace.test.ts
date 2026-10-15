import { describe, expect, it } from "vitest";
import { agreedWindowText, avizaceCopyText, avizaceRecordProblems, avizaceState, avizaceWarning, withoutPin } from "./avizace";

const record = { at: "2026-10-15T08:00:00Z", by: "Jana", channel: "PHONE" as const, contact: "+420 777 111 222", agreedFrom: null, agreedTo: null, note: "" };

describe("avizace state", () => {
  it("is done once recorded, pending while needed, else not needed", () => {
    expect(avizaceState({ avizaceNeeded: true, avizace: null })).toBe("pending");
    expect(avizaceState({ avizaceNeeded: true, avizace: record })).toBe("done");
    expect(avizaceState({ avizaceNeeded: false, avizace: null })).toBe("notNeeded");
  });
});

describe("avizace text to copy", () => {
  const template = { cs: "Dobrý den,\ndoručíme zásilku TCZ2026000001.\nPIN: 1234\nDěkujeme", en: "Hello,\nwe deliver TCZ2026000001.\nDěkujeme", subject: "Avizace TCZ2026000001", to: "+420 777 111 222" };

  it("never carries a line naming a PIN", () => {
    expect(withoutPin("a\nPick-up PIN 1234\nb")).toBe("a\nb");
    expect(withoutPin("pinned pallets stay")).toBe("pinned pallets stay");
    expect(avizaceCopyText(template, "cs")).not.toMatch(/PIN/);
  });

  it("puts the subject on top of the chosen language", () => {
    expect(avizaceCopyText(template, "en")).toBe("Avizace TCZ2026000001\n\nHello,\nwe deliver TCZ2026000001.\nDěkujeme");
    expect(avizaceCopyText({ ...template, subject: "" }, "cs").startsWith("Dobrý den")).toBe(true);
  });
});

describe("avizace record", () => {
  it("needs who was reached and a window that does not end before it starts", () => {
    expect(avizaceRecordProblems({ contact: " ", agreedFrom: null, agreedTo: null })).toEqual(["Say who was reached (name, phone or e-mail)"]);
    expect(avizaceRecordProblems({ contact: "Novák", agreedFrom: "2026-10-16T10:00:00Z", agreedTo: "2026-10-16T08:00:00Z" })).toEqual(["The agreed window ends before it starts"]);
    expect(avizaceRecordProblems({ contact: "Novák", agreedFrom: "2026-10-16T06:00:00Z", agreedTo: "2026-10-16T10:00:00Z" })).toEqual([]);
  });

  it("shows the agreed window in Prague time", () => {
    expect(agreedWindowText("2026-10-16T06:00:00Z", "2026-10-16T10:00:00Z")).toBe("16.10.2026 08:00–12:00");
    expect(agreedWindowText("2026-10-16T06:00:00Z", null)).toBe("from 16.10.2026 08:00");
    expect(agreedWindowText(null, null)).toBe("");
  });
});

describe("avizace warning on a trip", () => {
  const ids = ["c1", "c2", "c2"];
  const pending = new Map([
    ["c2", "TCZ2"],
    ["c9", "TCZ9"],
  ]);

  it("names the consignments of a delivering trip still waiting for avizace", () => {
    expect(avizaceWarning({ kind: "DELIVERY_RUN", consignmentIds: ids, warnings: [] }, pending)).toBe("Avizace not recorded: TCZ2");
    expect(avizaceWarning({ kind: "FTL", consignmentIds: ids, warnings: [] }, pending)).toBe("Avizace not recorded: TCZ2");
  });

  it("says nothing for pick-up runs and line hauls, when none is pending, or when the server already warns", () => {
    expect(avizaceWarning({ kind: "PICKUP_RUN", consignmentIds: ids, warnings: [] }, pending)).toBeNull();
    expect(avizaceWarning({ kind: "LINEHAUL", consignmentIds: ids, warnings: [] }, pending)).toBeNull();
    expect(avizaceWarning({ kind: "DELIVERY_RUN", consignmentIds: ids, warnings: [] }, new Map())).toBeNull();
    expect(avizaceWarning({ kind: "DELIVERY_RUN", consignmentIds: ids, warnings: ["Avizace missing: TCZ2"] }, pending)).toBeNull();
  });
});

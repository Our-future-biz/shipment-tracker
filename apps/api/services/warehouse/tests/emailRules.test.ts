import { describe, expect, it } from "vitest";
import {
  activeRecipients,
  cleanAddressList,
  cleanDocks,
  cleanRecipients,
  DEFAULT_DOCKS,
  DEFAULT_SUPPLIER_EMAIL,
  isEmailAddress,
  readSupplierEmail,
  settingsChanges,
} from "../services/settingsRules";
import { emailSubject, emailText, MAX_ATTACHMENT_BYTES, pickAttachments, type ComposeInput, type EmailPosition } from "../services/emailCompose";

// Pure rules of the supplier e-mail: recipients, docks, subject / body and the attachment limits.
// No database (runs with a plain vitest too).

describe("supplier e-mail recipients", () => {
  it("accepts plain addresses and refuses anything else", () => {
    for (const a of ["ops@cto.cz", "a.b+vgm@sub.example.com", "x_y@a-b.de"]) expect(isEmailAddress(a)).toBe(true);
    for (const a of ["", "ops", "ops@", "@x.cz", "a b@x.cz", "a@x", "a..b@x.cz", "a@-x.cz", "Ops <ops@x.cz>", "a@x.cz,b@x.cz"]) expect(isEmailAddress(a)).toBe(false);
  });

  it("trims, lower-cases and de-duplicates; names the bad address", () => {
    expect(cleanAddressList([" Ops@X.cz ", "ops@x.cz", "", "b@y.cz"], "VGM To")).toEqual(["ops@x.cz", "b@y.cz"]);
    expect(() => cleanAddressList(["ok@x.cz", "not an address"], "VGM To")).toThrow('VGM To: "not an address" is not a valid e-mail address');
    expect(() => cleanAddressList(Array.from({ length: 21 }, (_, i) => `a${i}@x.cz`), "VGM To")).toThrow(/at most 20/);
  });

  it("keeps an address in To only, needs a To to switch on, limits To + Cc to 50", () => {
    expect(cleanRecipients({ enabled: true, to: ["a@x.cz"], cc: ["A@x.cz", "c@x.cz"] }, "vgm")).toEqual({ enabled: true, to: ["a@x.cz"], cc: ["c@x.cz"] });
    expect(() => cleanRecipients({ enabled: true, to: [], cc: ["c@x.cz"] }, "survey")).toThrow("Survey: add at least one To address before switching e-mail on");
    expect(cleanRecipients({ enabled: false, to: [], cc: [] }, "survey")).toEqual({ enabled: false, to: [], cc: [] });
    const many = (p: string) => Array.from({ length: 20 }, (_, i) => `${p}${i}@x.cz`);
    expect(() => cleanRecipients({ enabled: true, to: many("t"), cc: [...many("c"), ...many("d")].slice(0, 20) }, "vgm")).not.toThrow();
    expect(() => cleanRecipients({ to: many("t"), cc: many("c").concat(many("d")).slice(0, 31) }, "vgm")).toThrow(/at most 20/);
  });

  it("e-mails a type only when it is on and has a To address", () => {
    const s = { ...DEFAULT_SUPPLIER_EMAIL, vgm: { enabled: true, to: ["a@x.cz"], cc: ["b@x.cz"] }, survey: { enabled: false, to: ["a@x.cz"], cc: [] } };
    expect(activeRecipients(s, "vgm")).toEqual({ to: ["a@x.cz"], cc: ["b@x.cz"] });
    expect(activeRecipients(s, "survey")).toBeNull();
    expect(activeRecipients(s, "remeasurement")).toBeNull();
  });

  it("reads broken stored values as the defaults", () => {
    expect(readSupplierEmail(null)).toEqual(DEFAULT_SUPPLIER_EMAIL);
    expect(readSupplierEmail({ vgm: { enabled: true, to: ["bad"], cc: [] } }).vgm).toEqual(DEFAULT_SUPPLIER_EMAIL.vgm);
    expect(readSupplierEmail({ vgm: { enabled: true, to: [], cc: ["c@x.cz"] } }).vgm).toEqual({ enabled: true, to: [], cc: ["c@x.cz"] });
  });
});

describe("docks", () => {
  it("checks names, hours and working days", () => {
    expect(cleanDocks({ docks: [" Dock 1 ", "", "Dock 2"], opensAt: "06:00", closesAt: "19:00", workingDays: [5, 1, 1] })).toEqual({
      docks: ["Dock 1", "Dock 2"],
      opensAt: "06:00",
      closesAt: "19:00",
      workingDays: [1, 5],
    });
    expect(() => cleanDocks({ ...DEFAULT_DOCKS, docks: ["A", "a"] })).toThrow(/listed twice/);
    expect(() => cleanDocks({ ...DEFAULT_DOCKS, docks: [] })).toThrow(/at least one dock/);
    expect(() => cleanDocks({ ...DEFAULT_DOCKS, opensAt: "6:00" })).toThrow(/times like 06:00/);
    expect(() => cleanDocks({ ...DEFAULT_DOCKS, opensAt: "19:00", closesAt: "06:00" })).toThrow(/after opening/);
    expect(() => cleanDocks({ ...DEFAULT_DOCKS, workingDays: [0] })).toThrow(/1 \(Monday\) to 7/);
  });
});

describe("settings change log", () => {
  it("says what changed in plain English", () => {
    const a = { supplierEmail: DEFAULT_SUPPLIER_EMAIL, docks: DEFAULT_DOCKS };
    const b = {
      supplierEmail: { ...DEFAULT_SUPPLIER_EMAIL, vgm: { enabled: true, to: ["a@x.cz", "b@y.cz"], cc: [] } },
      docks: { ...DEFAULT_DOCKS, closesAt: "18:00", workingDays: [1, 2, 3, 4, 5, 6] },
    };
    expect(settingsChanges(a, b)).toEqual([
      "Supplier e-mail VGM: e-mail on",
      "Supplier e-mail VGM: To none → a@x.cz, b@y.cz",
      "Dock hours: 06:00–19:00 → 06:00–18:00",
      "Dock working days: Mon Tue Wed Thu Fri → Mon Tue Wed Thu Fri Sat",
    ]);
    expect(settingsChanges(a, a)).toEqual([]);
  });
});

const position: EmailPosition = {
  wczRef: "WCZ2026101500012",
  jobNumber: "SEA-001234",
  customer: "ACME s.r.o.",
  containerNumber: "MSKU1234565",
  sealNumber: "SL998",
  bookingNumber: "BK77",
  hblNumber: "",
  colli: 10,
  packing: "PLT",
  weightKg: 1000,
  measureCbm: 4.2,
};
const noFiles = { attached: [], linked: [], listed: [], linkDays: 7, photoCount: 0 };
const base = (content: ComposeInput["content"], extra: Partial<ComposeInput> = {}): ComposeInput => ({
  position,
  content,
  files: noFiles,
  note: "",
  senderName: "Jana Nováková",
  signature: "",
  ...extra,
});

describe("supplier e-mail text", () => {
  it("subject carries the WCZ ref and the Job no.", () => {
    expect(emailSubject("vgm", position)).toBe("VGM — WCZ2026101500012 · Job no. SEA-001234");
    expect(emailSubject("remeasurement", { wczRef: "WCZ1", jobNumber: "" })).toBe("Remeasurement — WCZ1");
  });

  it("VGM: re-weighed weight against the declared one, with the variance", () => {
    const text = emailText(
      base(
        {
          kind: "vgm",
          needsReweigh: true,
          reweigh: { weighedKg: 1290, weighedAt: "2026-10-15T08:30:00Z", weighedBy: "Petr", declaredKg: 1200, declaredSource: "shipment", variancePct: 0.075, flagged: true, note: "scale 2" },
        },
        { note: "Please update the VGM." },
      ),
    );
    expect(text).toContain("Re-weighed gross weight: 1 290 kg");
    expect(text).toContain("Weighed: 15.10.2026 10:30 by Petr");
    expect(text).toContain("Declared gross weight: 1 200 kg (from the shipment)");
    expect(text).toContain("Difference: 90 kg heavier (+7.5 %) — more than 5 %, please check the declared weight");
    expect(text).toContain("not a signed SOLAS VGM declaration");
    expect(text).toContain("Warehouse ref.: WCZ2026101500012");
    expect(text).toContain("Job no.: SEA-001234");
    expect(text).toContain("Please update the VGM.");
    expect(text).toContain("Jana Nováková");
  });

  it("VGM: says so when the cargo is not re-weighed yet", () => {
    expect(emailText(base({ kind: "vgm", needsReweigh: true, reweigh: null }))).toContain("has not been re-weighed by the warehouse yet");
  });

  it("Survey: damaged / short / over, the lines and the photo count", () => {
    const text = emailText(
      base(
        {
          kind: "survey",
          surveys: [
            {
              container: "MSKU1234565",
              phase: "Stripping",
              damaged: 2,
              lost: 1,
              lines: [{ qty: 8, outerPacking: "PLT", visual: ["Wet"], inner: [] }, { qty: 2, outerPacking: "CTN", visual: [], inner: [] }],
              driverNote: "",
              warehouseNote: "Corner crushed",
              surveyedAt: "2026-10-15T07:00:00Z",
              surveyedBy: "Petr",
            },
          ],
          exceptions: [
            { type: "Damaged", pieces: 2, status: "open", container: "MSKU1234565", note: "wet", resolutionNote: "" },
            { type: "Short", pieces: 1, status: "resolved", container: "", note: "", resolutionNote: "found" },
          ],
        },
        { files: { attached: ["a.jpg", "b.jpg"], linked: [{ name: "c.jpg", url: "https://files/c" }], listed: [], linkDays: 7, photoCount: 3 } },
      ),
    );
    expect(text).toContain("Container MSKU1234565 — Stripping · surveyed 15.10.2026 09:00 by Petr");
    expect(text).toContain("Damaged: 2 · Short (lost): 1");
    expect(text).toContain("- 8 × PLT: Wet");
    expect(text).toContain("- 2 × CTN: no remarks");
    expect(text).toContain("Damaged: 2 pieces (1 open, 0 resolved)");
    expect(text).toContain("Short: 1 piece (0 open, 1 resolved)");
    expect(text).toContain("Photos on file: 3");
    expect(text).toContain("Attached: a.jpg, b.jpg");
    expect(text).toContain("c.jpg: https://files/c");
  });

  it("Remeasurement: each line, the totals and the comparison with declared and gate", () => {
    const text = emailText(
      base({
        kind: "remeasurement",
        lines: [{ pieces: 10, lengthCm: 120, widthCm: 80, heightCm: 100, weightPerPcKg: 110 }],
        totals: { pieces: 10, kg: 1100, cbm: 9.6 },
        declared: { pieces: 10, kg: 1000, cbm: 9.5 },
        savedAt: "",
      }),
    );
    expect(text).toContain("1. Qty 10 · 120 × 80 × 100 cm · 110 kg per piece");
    expect(text).toContain("Remeasured total: 10 pieces · 1 100 kg · 9.600 cbm");
    expect(text).toContain("Declared (shipment): 10 pieces · 1 000 kg · 9.500 cbm");
    expect(text).toContain("Compared with the declared figures: pieces match, weight +10.0 % (more than 5 %), volume +1.1 %");
    expect(text).toContain("Warehouse gate record: 10 pieces · 1 000 kg · 4.200 cbm");
  });
});

describe("attachment limits", () => {
  it("attaches at most 5 files and 10 MB in total, in the given order", () => {
    const f = (id: string, mb: number) => ({ id, name: `${id}.jpg`, size: mb * 1024 * 1024 });
    const { attach, rest } = pickAttachments([f("a", 4), f("b", 4), f("c", 3), f("d", 1), f("e", 0.5), f("g", 0.2), f("h", 0.1)]);
    expect(attach.map((x) => x.id)).toEqual(["a", "b", "d", "e", "g"]);
    expect(rest.map((x) => x.id)).toEqual(["c", "h"]);
    expect(attach.reduce((n, x) => n + x.size, 0)).toBeLessThanOrEqual(MAX_ATTACHMENT_BYTES);
    expect(pickAttachments([f("big", 11)]).attach).toEqual([]);
  });
});

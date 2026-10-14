import { describe, expect, it } from "vitest";
import { gateSteps, pinCheckMessage, voidBlocked, voidsGateOutToo } from "./steps";

type M = Parameters<typeof gateSteps>[0];
const T = "2026-10-14T08:00:00.000Z";
const base = (over: Partial<M> = {}): M => ({
  visit: "příjem",
  status: "Expected",
  armed: false,
  releaseGates: [],
  gateIn: null,
  gateOut: null,
  impRelease: null,
  expDraft: null,
  expReceipt: null,
  events: [],
  ...over,
});
const brief = (m: M) => gateSteps(m).map((s) => `${s.label}:${s.state}`);

describe("gateSteps", () => {
  it("orders inbound steps, one next, the rest later", () => {
    expect(brief(base())).toEqual(["Gate-in:next", "Draft receipt:later", "Receipt:later", "Gate-out:later"]);
    const s = gateSteps(base({ gateIn: T, events: [{ kind: "gateIn", label: "Gate-in", at: T, by: "Eva" }] }));
    expect(s[0]).toMatchObject({ state: "done", at: T, by: "Eva" });
    expect(s[1]!.state).toBe("next");
    expect(s[2]).toMatchObject({ state: "later", reason: "Stamp Draft receipt first" });
  });

  it("orders outbound steps and blocks WH release until the release gates are clear", () => {
    const m = base({
      visit: "výdej",
      gateIn: T,
      releaseGates: [
        { g: "Customs", s: "Pending", note: "" },
        { g: "Charges", s: "OK", note: "" },
        { g: "Empty return planned", s: "Pending", note: "" },
      ],
    });
    expect(brief(m)).toEqual(["Gate-in (truck):done", "WH release:blocked", "Gate-out:later"]);
    expect(gateSteps(m)[1]!.reason).toBe("Release gates blocked — waiting for: Customs");
    expect(brief({ ...m, armed: true })).toEqual(["Gate-in (truck):done", "WH release:next", "Gate-out:later"]);
  });

  it("takes the outbound gate-out from the WH release", () => {
    const m = base({
      visit: "výdej",
      armed: true,
      gateIn: T,
      impRelease: T,
      gateOut: T,
      events: [{ kind: "impRelease", label: "WH release", at: T, by: "Jan" }],
    });
    const out = gateSteps(m)[2]!;
    expect(out).toMatchObject({ state: "done", by: "Jan", note: "Stamped with WH release" });
  });

  it("blocks every open step on a refused movement", () => {
    const s = gateSteps(base({ status: "Refused", gateIn: T }));
    expect(s.map((x) => x.state)).toEqual(["done", "blocked", "blocked", "blocked"]);
    expect(s[1]!.reason).toBe("Refused — see Release gates");
  });

  it("keeps stamps of the other direction as legacy steps", () => {
    const s = gateSteps(base({ impRelease: T }));
    expect(s.at(-1)).toMatchObject({ kind: "impRelease", legacy: true, state: "done" });
    const o = gateSteps(base({ visit: "výdej", expDraft: T }));
    expect(o.filter((x) => x.legacy).map((x) => x.kind)).toEqual(["expDraft"]);
  });

  it("uses the latest event of the kind for who stamped", () => {
    const s = gateSteps(
      base({
        gateIn: T,
        events: [
          { kind: "gateIn", label: "Gate-in", at: T, by: "Old" },
          { kind: "gateIn", label: "Gate-in", at: T, by: "New" },
        ],
      }),
    );
    expect(s[0]!.by).toBe("New");
  });
});

describe("pinCheckMessage", () => {
  it("says match, tries left, locked or no PIN", () => {
    expect(pinCheckMessage("match", 0)).toEqual({ tone: "g", text: "Match — Pick-up PIN verified is OK" });
    expect(pinCheckMessage("no_match", 1).text).toBe("No match — 2 tries left");
    expect(pinCheckMessage("no_match", 2).text).toBe("No match — 1 try left");
    expect(pinCheckMessage("locked", 3)).toMatchObject({ tone: "r", text: expect.stringMatching(/^Locked after 3 wrong tries — ask operations for a new PIN/) });
    expect(pinCheckMessage("no_pin", 0).text).toMatch(/^No pick-up PIN yet/);
  });
});

describe("voidBlocked", () => {
  it("voids later steps first", () => {
    const m = base({ gateIn: T, expDraft: T, expReceipt: T });
    expect(voidBlocked(m, "gateIn")).toBe("Void the Receipt and the Draft receipt first");
    expect(voidBlocked(m, "expDraft")).toBe("Void the Receipt first");
    expect(voidBlocked(m, "expReceipt")).toBeNull();
    expect(voidBlocked(base({ gateIn: T, expDraft: T }), "expDraft")).toBeNull();
    expect(voidBlocked(base({ gateIn: T, impRelease: T, gateOut: T }), "gateIn")).toBe("Void the WH release first");
    expect(voidBlocked(base({ gateIn: T, gateOut: T }), "gateIn")).toBe("Void the Gate-out first");
    expect(voidBlocked(base({ gateIn: T }), "gateIn")).toBeNull();
    expect(voidBlocked(base(), "gateOut")).toBe("Not stamped");
  });

  it("keeps a released record's gate-out and release consistent", () => {
    // A gate-out stamped with the WH release goes only with it.
    expect(voidBlocked(base({ impRelease: T, gateOut: T }), "gateOut")).toBe("The Gate-out was stamped with the WH release — void the WH release instead");
    // An outgoing gate-out stamped on its own is voided before its release.
    const later = "2026-10-14T09:00:00.000Z";
    expect(voidBlocked({ ...base({ impRelease: T, gateOut: later }), visit: "výdej" }, "impRelease")).toBe("Void the Gate-out first");
    expect(voidBlocked({ ...base({ impRelease: T, gateOut: later }), visit: "výdej" }, "gateOut")).toBeNull();
    expect(voidBlocked({ ...base({ impRelease: T, gateOut: T }), visit: "výdej" }, "impRelease")).toBeNull();
  });

  it("takes the gate-out stamped with the WH release along", () => {
    expect(voidsGateOutToo(base({ impRelease: T, gateOut: T }), "impRelease")).toBe(true);
    expect(voidsGateOutToo(base({ impRelease: T, gateOut: "2026-10-14T09:00:00.000Z" }), "impRelease")).toBe(false);
    expect(voidsGateOutToo(base({ impRelease: T, gateOut: T }), "gateOut")).toBe(false);
  });
});

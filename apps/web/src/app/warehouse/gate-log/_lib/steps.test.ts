import { describe, expect, it } from "vitest";
import { gateSteps } from "./steps";

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

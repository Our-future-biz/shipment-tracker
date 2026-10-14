import { describe, expect, it } from "vitest";
import { QUEUEABLE_STAMPS, REWEIGH_FIRST, containerHoldsRelease, gateSteps, isQueueableStamp, pinCheckMessage, stampConfirmText, stampPrecheck, voidBlocked, voidsGateOutToo, writesBack } from "./steps";

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

describe("stamp confirmation (gate job and floor mode)", () => {
  const inbound = { visit: "příjem", gateIn: null, impRelease: null, gateRef: "WCZ2026000001" };
  const outbound = { ...inbound, visit: "výdej" };
  it("says what the stamp writes to the shipment: received date inbound only, released date on the release", () => {
    expect(writesBack(inbound, "gateIn")).toBe("received date");
    expect(writesBack(inbound, "expDraft")).toBe("received date");
    expect(writesBack({ ...inbound, gateIn: T }, "expDraft")).toBeNull();
    expect(writesBack(outbound, "gateIn")).toBeNull();
    expect(writesBack(outbound, "impRelease")).toBe("released date and plate");
    expect(writesBack(inbound, "gateOut")).toBeNull();
  });
  it("words the confirmation as the gate job always did", () => {
    expect(stampConfirmText(inbound, "gateIn", "Gate-in")).toBe(
      "Stamp the Gate-in on WCZ2026000001? The stamp cannot be taken back and sets the linked shipment's received date (if any).",
    );
    expect(stampConfirmText({ ...inbound, gateIn: T }, "expReceipt", "Receipt")).toBe("Stamp the Receipt on WCZ2026000001? The stamp cannot be taken back.");
  });
  it("answers an already stamped step or an outbound gate-out with information, not a confirmation", () => {
    expect(stampPrecheck(inbound, "gateIn", "Gate-in", T, () => "14 Oct 10:00")).toBe("Gate-in was already stamped 14 Oct 10:00");
    expect(stampPrecheck(outbound, "gateOut", "Gate-out", null, String)).toMatch(/leaves through WH release/);
    expect(stampPrecheck(inbound, "gateOut", "Gate-out", null, String)).toBeNull();
  });
  it("queues offline every stamp but the WH release and the outbound gate-out it stamps", () => {
    expect([...QUEUEABLE_STAMPS]).toEqual(["gateIn", "expDraft", "expReceipt", "gateOut"]);
    expect(isQueueableStamp(inbound, "gateOut")).toBe(true);
    expect(isQueueableStamp(outbound, "gateIn")).toBe(true);
    expect(isQueueableStamp(outbound, "impRelease")).toBe(false);
    expect(isQueueableStamp(outbound, "gateOut")).toBe(false);
  });
});

describe("re-weigh and the container hold the steps", () => {
  const container = (over: Record<string, unknown> = {}) =>
    ({
      id: "c1",
      number: "MSKU1234565",
      equipment: "40' HC",
      direction: "Loading",
      kind: "export",
      status: "Stuffing",
      seal: "",
      gateInAt: T,
      gateOutAt: null,
      stuffedAt: null,
      stuffedBy: "",
      tallyOutcome: "",
      tallyPieces: null,
      tickedAt: null,
      tickedBy: "",
      tallyRequired: false,
      ...over,
    }) as NonNullable<M["container"]>;
  const reweigh = { id: "r", movementId: "m", weighedKg: 1200, declaredKg: 1180, declaredSource: "shipment", variancePct: 0.0169, flagged: false, weighedBy: "Eva", weighedAt: T, fileIds: [], note: "", createdAt: T };

  it("blocks the receipt of LCL cargo until it is re-weighed", () => {
    const lcl = base({ gateIn: T, expDraft: T, needsReweigh: true, reweigh: null });
    const receipt = gateSteps(lcl).find((s) => s.kind === "expReceipt")!;
    expect(receipt).toMatchObject({ state: "blocked", reason: REWEIGH_FIRST, needs: "reweigh" });
    expect(gateSteps({ ...lcl, reweigh }).find((s) => s.kind === "expReceipt")!.state).toBe("next");
    // FCL cargo is not re-weighed here.
    expect(gateSteps(base({ gateIn: T, expDraft: T, needsReweigh: false })).find((s) => s.kind === "expReceipt")!.state).toBe("next");
  });

  it("keeps stuffed inbound cargo off the WH release: it leaves with its container", () => {
    expect(containerHoldsRelease({ visit: "příjem", container: container({ stuffedAt: T }) })?.reason).toMatch(/leaves with the container's gate-out/);
    expect(containerHoldsRelease({ visit: "příjem", container: container() })).toBeNull();
    expect(containerHoldsRelease({ visit: "příjem", leftAt: T, container: container({ stuffedAt: T }) })?.reason).toMatch(/Left the warehouse in container MSKU1234565/);
  });

  it("holds the WH release of an import house until it is ticked off at the tally", () => {
    const house = container({ direction: "Unloading", kind: "import", tallyRequired: true });
    const out = base({ visit: "výdej", gateIn: T, armed: true, container: house });
    const release = gateSteps(out).find((s) => s.kind === "impRelease")!;
    expect(release).toMatchObject({ state: "blocked", needs: "tally" });
    expect(release.reason).toMatch(/tick this house off at the stripping tally of container MSKU1234565/);
    expect(gateSteps({ ...out, container: { ...house, tallyOutcome: "received" } }).find((s) => s.kind === "impRelease")!.state).toBe("next");
    // An old one-position container (linked by the migration) keeps the received date typed by hand.
    expect(gateSteps({ ...out, container: { ...house, tallyRequired: false } }).find((s) => s.kind === "impRelease")!.state).toBe("next");
  });
});

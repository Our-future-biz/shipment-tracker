import { describe, expect, it } from "vitest";
import type { interfaces } from "@/lib/api/client";
import { ScanBurst, containerHref, isEditable, matchScanned, scanCandidates, scanHref, scannedContainer, type BurstStep } from "./scanner";

// Feeds `text` then the terminator, `gap` ms apart; returns each step.
function type(burst: ScanBurst, text: string, gap: number, { start = 1000, end = "Enter" } = {}): BurstStep[] {
  const steps: BurstStep[] = [];
  let t = start;
  for (const key of text) {
    steps.push(burst.feed({ key, timeStamp: t }));
    t += gap;
  }
  steps.push(burst.feed({ key: end, timeStamp: t }));
  return steps;
}
const last = (steps: BurstStep[]) => steps[steps.length - 1]!;

describe("ScanBurst — scanner or person", () => {
  it("takes a fast burst ending with Enter as a scan", () => {
    const steps = type(new ScanBurst(), "WCZ2026000123", 8);
    expect(last(steps)).toEqual({ kind: "scan", value: "WCZ2026000123" });
    // The first two keys pass (nothing is sure yet), from the third on the burst is claimed.
    expect(steps.slice(0, 2).map((s) => s.kind)).toEqual(["pass", "pass"]);
    expect(steps.slice(2, -1).every((s) => s.kind === "claim")).toBe(true);
  });

  it("leaves a person typing alone", () => {
    const steps = type(new ScanBurst(), "WCZ2026000123", 150);
    expect(steps.every((s) => s.kind === "pass")).toBe(true);
  });

  it("starts again after a pause, so slow keys before a scan do not spoil it", () => {
    const burst = new ScanBurst();
    burst.feed({ key: "x", timeStamp: 0 });
    burst.feed({ key: "y", timeStamp: 200 });
    expect(last(type(burst, "MSCU1234567", 5, { start: 500 }))).toEqual({ kind: "scan", value: "MSCU1234567" });
  });

  it("needs at least 4 characters", () => {
    expect(last(type(new ScanBurst(), "ABC", 5))).toEqual({ kind: "pass" });
    expect(last(type(new ScanBurst(), "ABCD", 5))).toEqual({ kind: "scan", value: "ABCD" });
  });

  it("refuses a burst that is too slow on average or ends late", () => {
    // 40 ms apart: each gap is under the reset limit but the average is too slow for a scanner.
    expect(last(type(new ScanBurst(), "WCZ2026000123", 40))).toEqual({ kind: "pass" });
    const burst = new ScanBurst();
    type(burst, "WCZ2026", 5, { end: "Shift" });
    expect(burst.feed({ key: "Enter", timeStamp: 5000 })).toEqual({ kind: "pass" });
  });

  it("ignores Ctrl / Alt / Meta combinations and keeps Shift", () => {
    const burst = new ScanBurst();
    burst.feed({ key: "W", timeStamp: 0 });
    burst.feed({ key: "c", timeStamp: 5, ctrlKey: true });
    expect(burst.buffer).toBe("");
    const b2 = new ScanBurst();
    let t = 0;
    for (const key of "WCZ1") {
      b2.feed({ key: "Shift", timeStamp: t });
      b2.feed({ key, timeStamp: t + 2 });
      t += 6;
    }
    expect(b2.feed({ key: "Enter", timeStamp: t })).toEqual({ kind: "scan", value: "WCZ1" });
  });

  it("never claims a held-down key (Space to scroll, a letter held) — auto-repeat comes ~30 ms apart", () => {
    const burst = new ScanBurst();
    const steps: BurstStep[] = [];
    steps.push(burst.feed({ key: " ", timeStamp: 1000 }));
    for (let i = 1; i <= 10; i++) steps.push(burst.feed({ key: " ", timeStamp: 1000 + i * 30, repeat: true }));
    for (let i = 0; i <= 10; i++) steps.push(burst.feed({ key: "a", timeStamp: 2000 + i * 30, repeat: i > 0 }));
    expect(steps.every((s) => s.kind === "pass")).toBe(true);
    // A scan right after still works.
    expect(last(type(burst, "WCZ2026000123", 8, { start: 3000 }))).toEqual({ kind: "scan", value: "WCZ2026000123" });
  });

  it("does not start a scan with a space, but keeps one inside a code (container number)", () => {
    expect(last(type(new ScanBurst(), "TGHU 220553-9", 8))).toEqual({ kind: "scan", value: "TGHU 220553-9" });
    const steps = type(new ScanBurst(), "    ", 8);
    expect(steps.every((s) => s.kind === "pass")).toBe(true);
  });

  it("accepts Tab as the terminator, and a lone Enter is the page's", () => {
    expect(last(type(new ScanBurst(), "TGHU2205539", 6, { end: "Tab" }))).toEqual({ kind: "scan", value: "TGHU2205539" });
    expect(new ScanBurst().feed({ key: "Enter", timeStamp: 1 })).toEqual({ kind: "pass" });
  });
});

describe("scanCandidates", () => {
  it("normalises, then reads the Czech number row and swaps Y / Z", () => {
    expect(scanCandidates(" wcz 2026 000123 ")[0]).toBe("WCZ2026000123");
    // US scanner on a Czech keyboard: digits come as +ěščřžýáíé and Z as Y.
    const c = scanCandidates("WCYěéěžééé+ěš");
    expect(c).toContain("WCZ2026000123");
    expect(c.indexOf("WCY2026000123")).toBeLessThan(c.indexOf("WCZ2026000123"));
    expect(scanCandidates("")).toEqual([]);
  });
  it("has no repeats", () => {
    expect(scanCandidates("ABC1")).toEqual(["ABC1"]);
  });
});

describe("matchScanned", () => {
  const mv = (over: Partial<interfaces.GateMovementItem>) =>
    ({ id: "m", gateRef: "", positionRef: "", jobNumber: "", containerNumber: "", plate: "", containers: [], transportLegs: [], ...over }) as interfaces.GateMovementItem;
  const a = mv({ id: "a", gateRef: "WCZ2026000123", positionRef: "WCZ2026000123" });
  const b = mv({ id: "b", containerNumber: "MSCU1234567" });
  it("opens the position of a label scanned with the wrong keyboard layout", () => {
    expect(matchScanned("WCYěéěžééé+ěš", [a, b])).toEqual({ value: "WCZ2026000123", result: { kind: "open", movement: a } });
  });
  it("opens by container number, and says none for an unknown code", () => {
    expect(matchScanned("mscu 1234567", [a, b]).result).toEqual({ kind: "open", movement: b });
    expect(matchScanned("WCZ2099000001", [a, b])).toEqual({ value: "WCZ2099000001", result: { kind: "none" } });
  });
});

describe("isEditable", () => {
  const el = (tagName: string, attrs: Record<string, string> = {}, isContentEditable = false) => ({ tagName, isContentEditable, getAttribute: (n: string) => attrs[n] ?? null });
  it("knows fields from buttons and the page", () => {
    expect(isEditable(el("INPUT"))).toBe(true);
    expect(isEditable(el("textarea"))).toBe(true);
    expect(isEditable(el("SELECT"))).toBe(true);
    expect(isEditable(el("DIV", {}, true))).toBe(true);
    expect(isEditable(el("DIV", { role: "combobox" }))).toBe(true);
    expect(isEditable(el("BUTTON"))).toBe(false);
    expect(isEditable(el("BODY"))).toBe(false);
    expect(isEditable(null)).toBe(false);
  });
  it("links to the gate job or the floor screen", () => {
    expect(scanHref("gate", "x")).toBe("/warehouse-concept/gate-log/x");
    expect(scanHref("floor", "x")).toBe("/warehouse-concept/floor/x");
  });
});

describe("scannedContainer", () => {
  const mv = (over: Partial<interfaces.GateMovementItem>) =>
    ({ id: "m", gateRef: "", positionRef: "", jobNumber: "", containerNumber: "", plate: "", containers: [], transportLegs: [], container: null, ...over }) as interfaces.GateMovementItem;
  const box = { id: "c1", number: "MSKU1234565" } as NonNullable<interfaces.GateMovementItem["container"]>;
  it("opens the container of a scanned container number (floor mode), even with one house", () => {
    expect(scannedContainer("msku 123456 5", [mv({ id: "a", container: box })])).toEqual({ id: "c1", number: "MSKU1234565" });
    expect(containerHref("floor", "c1")).toBe("/warehouse-concept/floor/container/c1");
    expect(containerHref("gate", "c1")).toBe("/warehouse-concept/containers/c1");
  });
  it("lets a position's own ref win", () => {
    expect(scannedContainer("WCZ2026000123", [mv({ positionRef: "WCZ2026000123", container: box })])).toBeNull();
    expect(scannedContainer("TGHU0000000", [mv({ container: box })])).toBeNull();
  });
});

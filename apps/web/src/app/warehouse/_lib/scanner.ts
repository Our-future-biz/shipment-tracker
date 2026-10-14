import { normalizeScan, scanMatch, type ScanResult } from "./worklist";

// Handheld scanners in "keyboard wedge" mode type the barcode / QR value as very fast key
// presses and finish with Enter (or Tab). People type with 100–250 ms between keys; scanners send
// keys 2–20 ms apart. Pure helpers (tested in scanner.test.ts); the listener is useWedgeScanner.

/** A gap longer than this between two keys starts a new burst. */
export const SCAN_MAX_GAP_MS = 50;
/** A burst is a scan when its keys came this fast on average (or faster). */
export const SCAN_MAX_AVG_GAP_MS = 35;
export const SCAN_MIN_LENGTH = 4;
export const SCAN_MAX_LENGTH = 64;
/** From this many fast keys on, the burst is taken as a scan and its keys are kept from the page. */
export const SCAN_CLAIM_AFTER = 3;

export type ScanKey = { key: string; timeStamp: number; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean; repeat?: boolean };

/** What one key press did to the burst. */
export type BurstStep =
  /** Not part of a scan (a modifier, a slow key, a lone Enter): let the page have it. */
  | { kind: "pass" }
  /** Part of a burst that is fast enough to be a scan: keep it from the page. */
  | { kind: "claim" }
  /** The terminator of a scan: the scanned value. */
  | { kind: "scan"; value: string };

/**
 * Detects a keyboard-wedge scan from key presses (key + event time). Feed every keydown; it
 * answers whether the key belongs to a scan. Ctrl / Alt / Meta combinations are never part of a
 * scan; Shift is (upper-case letters). A held-down key (auto-repeat, e.g. Space to scroll) never
 * is, and a scan never starts with a space.
 */
export class ScanBurst {
  private chars = "";
  private first = 0;
  private last = 0;

  reset() {
    this.chars = "";
    this.first = 0;
    this.last = 0;
  }

  /** Characters collected so far (for tests). */
  get buffer() {
    return this.chars;
  }

  private fast(len = this.chars.length) {
    if (len < 2) return true;
    return (this.last - this.first) / (len - 1) <= SCAN_MAX_AVG_GAP_MS;
  }

  feed(e: ScanKey): BurstStep {
    if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) {
      this.reset();
      return { kind: "pass" };
    }
    const gap = this.chars ? e.timeStamp - this.last : 0;
    if (e.key === "Enter" || e.key === "Tab") {
      const value = this.chars;
      const ok = value.length >= SCAN_MIN_LENGTH && value.length <= SCAN_MAX_LENGTH && gap <= SCAN_MAX_GAP_MS && this.fast();
      this.reset();
      return ok ? { kind: "scan", value } : { kind: "pass" };
    }
    if (e.key.length !== 1) {
      // Shift, arrows, etc.: Shift comes with every upper-case letter of a scan and is ignored.
      if (e.key !== "Shift") this.reset();
      return { kind: "pass" };
    }
    if (!this.chars || gap > SCAN_MAX_GAP_MS) {
      if (e.key === " ") {
        this.reset();
        return { kind: "pass" };
      }
      this.chars = e.key;
      this.first = this.last = e.timeStamp;
      return { kind: "pass" };
    }
    this.chars += e.key;
    this.last = e.timeStamp;
    if (this.chars.length > SCAN_MAX_LENGTH) {
      this.reset();
      return { kind: "pass" };
    }
    return this.chars.length >= SCAN_CLAIM_AFTER && this.fast() ? { kind: "claim" } : { kind: "pass" };
  }
}

// A scanner set to a US keyboard on a phone or PC set to Czech (QWERTZ) types the number row as
// "+ěščřžýáíé" and swaps Y and Z — "WCZ2026000123" arrives as "WCYěéěžééé+ěš".
const CZ_NUMBER_ROW: Record<string, string> = { "+": "1", ě: "2", š: "3", č: "4", ř: "5", ž: "6", ý: "7", á: "8", í: "9", é: "0" };
const swapYZ = (v: string) => v.replace(/[YZ]/g, (c) => (c === "Y" ? "Z" : "Y"));

/**
 * The values a scanned code may stand for, most likely first: as scanned, with the Czech number
 * row read as digits, and with Y and Z swapped (keyboard layout mismatch). Normalised (upper
 * case, no spaces) and without repeats.
 */
export function scanCandidates(raw: string): string[] {
  const base = normalizeScan(raw);
  if (!base) return [];
  const digits = normalizeScan(
    raw
      .toLowerCase()
      .split("")
      .map((c) => CZ_NUMBER_ROW[c] ?? c)
      .join(""),
  );
  return [...new Set([base, digits, swapYZ(digits), swapYZ(base)])].filter(Boolean);
}

type Matchable = Parameters<typeof scanMatch>[1][number];

/** The first candidate of a scanned value that finds something (see scanMatch), with the value used. */
export function matchScanned<M extends Matchable>(raw: string, movements: M[]): { value: string; result: ScanResult<M> } {
  const candidates = scanCandidates(raw);
  for (const value of candidates) {
    const result = scanMatch(value, movements);
    if (result.kind !== "none") return { value, result };
  }
  return { value: candidates[0] ?? "", result: { kind: "none" } };
}

type ElementLike = { tagName?: string; isContentEditable?: boolean; getAttribute?: (name: string) => string | null } | null | undefined;

/** Whether keys typed now go into a field (input, textarea, select, editable text, a text box / combo box). */
export function isEditable(el: ElementLike): boolean {
  if (!el) return false;
  const tag = (el.tagName ?? "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  const role = el.getAttribute?.("role") ?? "";
  return role === "textbox" || role === "combobox" || role === "searchbox" || role === "spinbutton";
}

/** Where a scan opens a movement: its gate job, or its floor mode screen. */
export type ScanTarget = "gate" | "floor";
export const scanHref = (target: ScanTarget, id: string) => (target === "floor" ? `/warehouse/floor/${id}` : `/warehouse/gate-log/${id}`);

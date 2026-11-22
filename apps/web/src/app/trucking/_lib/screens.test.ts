import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Trucking shows every stored time on the company's clock (Prague), as the portal, the avizace
// and the server do: never the browser's local time (formatDateTime of lib/date).
const ROOTS = [join(__dirname, "..")];

const filesOf = (path: string): string[] =>
  statSync(path).isDirectory() ? readdirSync(path).flatMap((name) => filesOf(join(path, name))) : /\.tsx?$/.test(path) && !/\.test\.ts$/.test(path) ? [path] : [];

describe("Trucking times", () => {
  it("are shown in Prague time everywhere", () => {
    const local = ROOTS.flatMap(filesOf).filter((f) => /\bformatDateTime\b/.test(readFileSync(f, "utf8")));
    expect(local).toEqual([]);
  });
});

// The English screens call it a delivery notice (TERMS.avizace); "Record avizace…" was left on the
// text drawer (mock test S21-094). The Czech word stays in the bilingual e-mail text, built in _lib.
// Shown: in JSX text, or in a string after a space - or opening it (review of system-22: title="Avizace",
// "Avizace recorded" and `Avizace ${x}` passed), capitalised or followed by more words, as no key, import
// path or identifier ("avizace", key: "avizace", "../_lib/avizace", "avizaceRecord", TERMS.avizace) is.
const AVIZACE_SHOWN = [
  /<[^<>]*>[^<>{}]*\bavizace\b[^<>{}]*</i,
  /"[^"\n]* avizace\b[^"\n]*"|`[^`]* avizace\b[^`]*`/i,
  /"(?:Avizace\b|AVIZACE\b|avizace\s)[^"\n]*"|`(?:Avizace\b|AVIZACE\b|avizace\s)[^`]*`/,
];
const showsAvizace = (code: string) => AVIZACE_SHOWN.some((re) => re.test(code));

describe("Trucking's English screens", () => {
  it("tell the word avizace shown from a key or a term (review of system-22)", () => {
    for (const shown of [
      '<Button title="Avizace" />',
      'toast.success("Avizace recorded");',
      "const t = `Avizace ${x}`;",
      'message="Record avizace text"',
      "<span>Avizace</span>",
      "<b>Record avizace</b>",
      'label: "avizace needed"',
    ]) {
      expect(showsAvizace(shown), shown).toBe(true);
    }
    for (const notShown of [
      '{ key: "avizace", title: "Delivery notice" }',
      '{ key: "avizace", label: TERMS.avizace }',
      "<span>{TERMS.avizace}</span>",
      "title={`${TERMS.avizace} text`}",
      'import { avizaceText } from "../_lib/avizace";',
      'import { AvizaceRecordModal } from "./AvizaceRecordModal";',
      'setOpen("avizaceRecord")',
      "c.avizaceDone ? 1 : 0",
      'const TERMS = { avizace: "Delivery notice" };',
    ]) {
      expect(showsAvizace(notShown), notShown).toBe(false);
    }
  });

  it("never show the word avizace", () => {
    const code = (f: string) => readFileSync(f, "utf8").replace(/\/\/.*|\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}/g, "");
    const wrong = ROOTS.flatMap(filesOf).filter((f) => f.endsWith(".tsx") && showsAvizace(code(f)));
    expect(wrong).toEqual([]);
  });
});

describe("Trucking's links to a job", () => {
  it("never ask for a tab the job page doesn't have (user council T12)", () => {
    const wrong = ROOTS.flatMap(filesOf).filter((f) => /\?tab=trucking/.test(readFileSync(f, "utf8").replace(/\/\/.*|\/\*[\s\S]*?\*\//g, "")));
    expect(wrong).toEqual([]);
  });
});

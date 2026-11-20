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

describe("Trucking's links to a job", () => {
  it("never ask for a tab the job page doesn't have (user council T12)", () => {
    const wrong = ROOTS.flatMap(filesOf).filter((f) => /\?tab=trucking/.test(readFileSync(f, "utf8").replace(/\/\/.*|\/\*[\s\S]*?\*\//g, "")));
    expect(wrong).toEqual([]);
  });
});

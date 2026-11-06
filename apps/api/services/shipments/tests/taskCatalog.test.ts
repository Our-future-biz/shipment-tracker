import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { IMPORT_TASK_KEYS, EXPORT_TASK_KEYS } from "../taskCatalog";
import { SELF_TICKS, TICK_EVENTS } from "../lib/trackingEvents";
import { TICK_NOTICES } from "../lib/customerNotice";

/**
 * The backend's task key lists have to match the frontend's task definitions.
 * This test is the guard against the two drifting apart.
 */

const FRONTEND_TASK_DEFINITIONS = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../web/src/app/shipments/[jobNumber]/_components/taskDefinitions.ts",
);

/** Pulls the `key:` values out of one exported array literal in the frontend file. */
function frontendKeys(exportName: string): string[] {
  const source = readFileSync(FRONTEND_TASK_DEFINITIONS, "utf8");
  const start = source.indexOf(`export const ${exportName}`);
  expect(start, `${exportName} not found in taskDefinitions.ts`).toBeGreaterThan(-1);

  const open = source.indexOf("[", start);
  const close = source.indexOf("\n];", open);
  expect(close, `end of ${exportName} not found`).toBeGreaterThan(open);

  const block = source.slice(open, close);
  return [...block.matchAll(/\bkey:\s*"([^"]+)"/g)].map((m) => m[1]!);
}

describe("task catalogue parity with the frontend", () => {
  it("import task keys match taskDefinitions.ts", () => {
    expect(frontendKeys("IMPORT_TASKS")).toEqual([...IMPORT_TASK_KEYS]);
  });

  it("export task keys match taskDefinitions.ts", () => {
    expect(frontendKeys("EXPORT_TASKS")).toEqual([...EXPORT_TASK_KEYS]);
  });

  it("the ticks that record an event match taskDefinitions.ts, and are real tasks", () => {
    const source = readFileSync(FRONTEND_TASK_DEFINITIONS, "utf8");
    const block = source.slice(source.indexOf("export const TICK_EVENTS"), source.indexOf("};", source.indexOf("export const TICK_EVENTS")));
    const frontend = Object.fromEntries([...block.matchAll(/^\s*(\w+): "(\w+)",$/gm)].map((m) => [m[1]!, m[2]!]));
    expect(frontend).toEqual(TICK_EVENTS);
    const all: readonly string[] = [...IMPORT_TASK_KEYS, ...EXPORT_TASK_KEYS];
    for (const key of Object.keys(TICK_EVENTS)) expect(all).toContain(key);
  });

  it("the ticks the app writes itself match taskDefinitions.ts", () => {
    const source = readFileSync(FRONTEND_TASK_DEFINITIONS, "utf8");
    const block = source.slice(source.indexOf("export const SELF_TICKS"), source.indexOf("};", source.indexOf("export const SELF_TICKS")));
    const frontend = Object.fromEntries([...block.matchAll(/^\s*(\w+): "([^"]+)",$/gm)].map((m) => [m[1]!, m[2]!]));
    expect(frontend).toEqual(SELF_TICKS);
  });

  it("the ticks that record a notice match taskDefinitions.ts, and are real tasks", () => {
    const source = readFileSync(FRONTEND_TASK_DEFINITIONS, "utf8");
    const block = source.slice(source.indexOf("export const TICK_NOTICES"), source.indexOf("};", source.indexOf("export const TICK_NOTICES")));
    const frontend = Object.fromEntries([...block.matchAll(/^\s*(\w+): "(\w+)",$/gm)].map((m) => [m[1]!, m[2]!]));
    expect(frontend).toEqual(TICK_NOTICES);
    const all: readonly string[] = [...IMPORT_TASK_KEYS, ...EXPORT_TASK_KEYS];
    for (const key of Object.keys(TICK_NOTICES)) expect(all).toContain(key);
  });

  it("keys are unique across both directions", () => {
    const all = [...IMPORT_TASK_KEYS, ...EXPORT_TASK_KEYS];
    expect(new Set(all).size).toBe(all.length);
  });
});

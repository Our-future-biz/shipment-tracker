import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { IMPORT_TASK_KEYS, EXPORT_TASK_KEYS } from "../taskCatalog";

/**
 * The "Needs Attention" tile counts completed tasks against the number of tasks
 * the shipment's direction defines, so the backend's key list has to match the
 * frontend's. This test is the guard against the two drifting apart.
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

  it("keys are unique across both directions", () => {
    const all = [...IMPORT_TASK_KEYS, ...EXPORT_TASK_KEYS];
    expect(new Set(all).size).toBe(all.length);
  });
});

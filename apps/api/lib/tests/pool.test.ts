import { describe, expect, it, vi } from "vitest";

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock("encore.dev/log", () => ({ default: { warn } }));

import { servicePool } from "../db/pool";

describe("a service's database pool", () => {
  it("logs a connection the database dropped, rather than ending the process", async () => {
    // Never connects: no query is made.
    const pool = servicePool("postgres://nobody@127.0.0.1:1/none");
    const dropped = new Error("Connection terminated unexpectedly");
    // An "error" nobody listens to is thrown, which ends a Node process.
    expect(() => pool.emit("error", dropped)).not.toThrow();
    expect(warn).toHaveBeenCalledWith(dropped, expect.stringContaining("dropped"));
    await pool.end();
  });
});

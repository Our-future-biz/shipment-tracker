import { describe, expect, it } from "vitest";
import { isUuid, uuid } from "./uuid";

describe("uuid", () => {
  it("makes v4 UUIDs, a new one each time", () => {
    const id = uuid();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(isUuid(id)).toBe(true);
    expect(uuid()).not.toBe(id);
  });
});

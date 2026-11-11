import { describe, expect, it } from "vitest";
import { writeIdFor } from "./writeId";

describe("writeIdFor", () => {
  let n = 0;
  const make = () => `id-${++n}`;

  it("sends the same write again with the same id", () => {
    const first = writeIdFor(null, '[1200,""]', make);
    expect(writeIdFor(first, '[1200,""]', make)).toBe(first);
  });

  it("gives a changed write a new id", () => {
    const first = writeIdFor(null, '[1200,""]', make);
    const corrected = writeIdFor(first, '[1250,""]', make);
    expect(corrected.id).not.toBe(first.id);
    expect(corrected.key).toBe('[1250,""]');
  });
});

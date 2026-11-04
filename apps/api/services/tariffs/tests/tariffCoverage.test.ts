import { describe, expect, it } from "vitest";
import { coveredUntil } from "../lib/tariffCoverage";

const v = (validFrom: string, validTo: string | null, status = "active") => ({ status, validFrom, validTo }) as never;
const TODAY = "2026-11-04";

describe("the last day a supplier's tariffs cover (Council Review 5, K12)", () => {
  it("is the end of the version pricing today when nothing follows it", () => {
    expect(coveredUntil([v("2026-10-01", "2026-11-20")], TODAY)).toBe("2026-11-20");
  });

  it("goes on through a version that starts by the next day, however many follow", () => {
    expect(coveredUntil([v("2026-10-01", "2026-11-20"), v("2026-11-21", "2026-12-31"), v("2027-01-01", "2027-03-31")], TODAY)).toBe("2027-03-31");
    // An overlap carries on too; a gap of a day stops it.
    expect(coveredUntil([v("2026-10-01", "2026-11-20"), v("2026-11-15", "2026-12-31")], TODAY)).toBe("2026-12-31");
    expect(coveredUntil([v("2026-10-01", "2026-11-20"), v("2026-11-22", "2026-12-31")], TODAY)).toBe("2026-11-20");
  });

  it("has no end once a version pricing on or following never ends", () => {
    expect(coveredUntil([v("2026-10-01", "2026-11-20"), v("2026-01-01", null)], TODAY)).toBeNull();
    expect(coveredUntil([v("2026-10-01", "2026-11-20"), v("2026-11-21", null)], TODAY)).toBeNull();
  });

  it("leaves out drafts and versions that are not active, and is null when nothing prices today", () => {
    expect(coveredUntil([v("2026-10-01", "2026-11-20"), v("2026-11-21", "2026-12-31", "draft")], TODAY)).toBe("2026-11-20");
    expect(coveredUntil([v("2026-12-01", "2026-12-31")], TODAY)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { COLUMNS } from "@/lib/columnConfig";
import { isPersonField, personChange, splitPersonStamp, PERSON_FIELDS } from "./personFields";

describe("person fields", () => {
  it("are the grid's user columns, plus the Sales Person the grid does not show", () => {
    const userColumns = COLUMNS.filter((c) => c.type === "user").map((c) => c.key);
    expect(userColumns.sort()).toEqual([...PERSON_FIELDS].filter((k) => k !== "salesPerson").sort());
    expect(isPersonField("salesPerson")).toBe(true);
    // Stamps the server writes are read-only text, not picked.
    expect(isPersonField("createdBy")).toBe(false);
    expect(isPersonField("houseBolRelease")).toBe(false);
  });

  it("are never edited as free text in the grid", () => {
    for (const key of PERSON_FIELDS) {
      const col = COLUMNS.find((c) => c.key === key);
      if (col) expect(col.type).toBe("user");
    }
  });
});

describe("splitPersonStamp", () => {
  it("splits the server's approval stamp into who and when", () => {
    expect(splitPersonStamp("lukas@ourfuture.biz — 26. 10. 2026 14:03:05")).toEqual({
      person: "lukas@ourfuture.biz",
      when: "26. 10. 2026 14:03:05",
    });
  });

  it("reads a stamp with nobody in it as the date alone", () => {
    expect(splitPersonStamp("26. 10. 2026 14:03:05")).toEqual({ person: "", when: "26. 10. 2026 14:03:05" });
  });

  it("leaves a plain value, or a dash that is not followed by a date, whole", () => {
    expect(splitPersonStamp(" martin@ourfuture.biz ")).toEqual({ person: "martin@ourfuture.biz", when: "" });
    expect(splitPersonStamp("Lukáš — boss")).toEqual({ person: "Lukáš — boss", when: "" });
    expect(splitPersonStamp(null)).toEqual({ person: "", when: "" });
  });
});

describe("personChange", () => {
  it("saves the picked user's e-mail in lower case", () => {
    expect(personChange("Lukáš", "Martin@OurFuture.biz")).toBe("martin@ourfuture.biz");
    expect(personChange("", "martin@ourfuture.biz")).toBe("martin@ourfuture.biz");
  });

  it("changes nothing when the same user is picked again, so a stamp keeps its date", () => {
    expect(personChange("martin@ourfuture.biz", "martin@ourfuture.biz")).toBeNull();
    expect(personChange("martin@ourfuture.biz — 26. 10. 2026 14:03:05", "MARTIN@ourfuture.biz")).toBeNull();
  });

  it("replaces a stamp with the user picked instead", () => {
    expect(personChange("martin@ourfuture.biz — 26. 10. 2026 14:03:05", "lukas@ourfuture.biz")).toBe("lukas@ourfuture.biz");
  });

  it("clears to nobody, and leaves an empty field empty", () => {
    expect(personChange("Lukáš", "")).toBe("");
    expect(personChange("martin@ourfuture.biz — 26. 10. 2026 14:03:05", "")).toBe("");
    expect(personChange("", "")).toBeNull();
  });
});

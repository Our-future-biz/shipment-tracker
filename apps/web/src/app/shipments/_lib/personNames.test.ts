import { describe, expect, it } from "vitest";
import { foldIncludes } from "@/lib/fold";
import { emailBehind, nameOf, namesOf, NO_NAMES, personShown, personText } from "./personNames";

const names = namesOf([
  { email: "Claude-Test@local.test", displayName: "Claude Test" },
  { email: "noname@ourfuture.biz", displayName: "  " },
]);

describe("person names (x4)", () => {
  it("shows a user by name, whatever the case of the stored e-mail", () => {
    expect(nameOf("claude-test@local.test", names)).toBe("Claude Test");
    expect(nameOf(" CLAUDE-TEST@local.test ", names)).toBe("Claude Test");
    expect(emailBehind("claude-test@local.test", names)).toBe("claude-test@local.test");
  });

  it("keeps a value no named user has as it is stored", () => {
    expect(nameOf("noname@ourfuture.biz", names)).toBe("noname@ourfuture.biz");
    expect(nameOf("Old Name", names)).toBe("Old Name");
    expect(emailBehind("Old Name", names)).toBe("");
    expect(nameOf("lukas@ourfuture.biz", NO_NAMES)).toBe("lukas@ourfuture.biz");
  });

  it("keeps nobody as nobody", () => {
    expect(nameOf("", names)).toBe("");
    expect(nameOf(null, names)).toBe("");
  });
});

describe("personShown", () => {
  const names = namesOf([{ email: "Eva@Firm.cz", displayName: "Eva Malá" }]);

  it("shows the user's name, the e-mail for the hover", () => {
    expect(personShown("eva@firm.cz", names)).toEqual({ text: "Eva Malá", email: "eva@firm.cz" });
  });

  it("keeps a stamp's date after the name", () => {
    expect(personShown("eva@firm.cz — 26. 10. 2026 14:03:05", names)).toEqual({ text: "Eva Malá — 26. 10. 2026 14:03:05", email: "eva@firm.cz" });
  });

  it("shows anything else as it is stored, with no e-mail", () => {
    expect(personShown("old.colleague@firm.cz", names)).toEqual({ text: "old.colleague@firm.cz", email: "" });
    expect(personShown("26. 10. 2026 14:03:05", names)).toEqual({ text: "26. 10. 2026 14:03:05", email: "" });
    expect(personShown("", names)).toEqual({ text: "", email: "" });
    expect(personShown(null, names)).toEqual({ text: "", email: "" });
  });
});

describe("personText (mock test S21-061)", () => {
  const names = namesOf([{ email: "Eva@Firm.cz", displayName: "Eva Malá" }]);

  it("gives the name with the e-mail in brackets, for the CSV export", () => {
    expect(personText("eva@firm.cz", names)).toBe("Eva Malá (eva@firm.cz)");
  });

  it("lets the Filters find the person by name or by e-mail", () => {
    const text = personText("eva@firm.cz", names);
    expect(foldIncludes(text, "eva mala")).toBe(true);
    expect(foldIncludes(text, "Malá")).toBe(true);
    expect(foldIncludes(text, "eva@firm")).toBe(true);
    expect(foldIncludes(text, "petr")).toBe(false);
  });

  it("keeps a value no named user has as it is stored", () => {
    expect(personText("old.colleague@firm.cz", names)).toBe("old.colleague@firm.cz");
    expect(personText("", names)).toBe("");
    expect(personText(null, names)).toBe("");
  });
});

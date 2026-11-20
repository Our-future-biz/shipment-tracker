import { describe, expect, it } from "vitest";
import { emailBehind, nameOf, namesOf, NO_NAMES, personShown } from "./personNames";

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

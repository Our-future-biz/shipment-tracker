import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));

import { normaliseName } from "../../../../lib/personName";
import { matchOwnerLabel } from "../../utils/ownerMatch.utils";

const user = (id: string, displayName: string, email: string) => ({ id, displayName, email });

const martin = user("u-martin", "Martin Koubek", "martin@forwarder.cz");
const lukas = user("u-lukas", "Lukáš", "lukas.novak@forwarder.cz");
const jana = user("u-jana", "", "jana@forwarder.cz");

describe("normaliseName", () => {
  it("ignores case, diacritics and extra spaces", () => {
    expect(normaliseName("Lukáš")).toBe("lukas");
    expect(normaliseName("  Martin   KOUBEK ")).toBe("martin koubek");
    expect(normaliseName("Žofie Řeháková")).toBe("zofie rehakova");
    expect(normaliseName("")).toBe("");
    expect(normaliseName("   ")).toBe("");
  });
});

describe("matchOwnerLabel", () => {
  const users = [martin, lukas, jana];

  it("finds the user by display name", () => {
    expect(matchOwnerLabel("Martin Koubek", users)).toBe("u-martin");
    expect(matchOwnerLabel("martin koubek ", users)).toBe("u-martin");
  });

  it("reads 'lukas' as 'Lukáš'", () => {
    expect(matchOwnerLabel("lukas", users)).toBe("u-lukas");
    expect(matchOwnerLabel("LUKÁŠ", users)).toBe("u-lukas");
  });

  it("finds the user by e-mail or by the part before the @", () => {
    expect(matchOwnerLabel("jana@forwarder.cz", users)).toBe("u-jana");
    expect(matchOwnerLabel("Jana", users)).toBe("u-jana");
    expect(matchOwnerLabel("lukas.novak", users)).toBe("u-lukas");
  });

  it("matches the whole label only", () => {
    // A first name is not a user whose display name is the full name.
    expect(matchOwnerLabel("Koubek", users)).toBeNull();
    expect(matchOwnerLabel("Martin K.", users)).toBeNull();
  });

  it("matches nobody when two users fit", () => {
    const twoMartins = [user("u-1", "Martin", "martin.a@forwarder.cz"), user("u-2", "Martin", "martin.b@forwarder.cz")];
    expect(matchOwnerLabel("Martin", twoMartins)).toBeNull();
    // One by name, another by the start of the e-mail.
    expect(matchOwnerLabel("Martin", [user("u-1", "Martin", "m@forwarder.cz"), user("u-2", "Somebody", "martin@forwarder.cz")])).toBeNull();
  });

  it("counts a user who fits in several ways once", () => {
    expect(matchOwnerLabel("Martin", [user("u-1", "Martin", "martin@forwarder.cz"), lukas])).toBe("u-1");
  });

  it("matches nobody for an empty label or an unknown name", () => {
    expect(matchOwnerLabel("", users)).toBeNull();
    expect(matchOwnerLabel("   ", users)).toBeNull();
    expect(matchOwnerLabel("Petr", users)).toBeNull();
    expect(matchOwnerLabel("Martin", [])).toBeNull();
  });

  it("does not match a user without a display name through the empty name", () => {
    expect(matchOwnerLabel("", [jana])).toBeNull();
  });
});

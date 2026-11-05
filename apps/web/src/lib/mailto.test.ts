import { describe, expect, it } from "vitest";
import { mailtoLink } from "./mailto";

describe("mailtoLink", () => {
  it("is the address alone when nothing else is given", () => {
    expect(mailtoLink({ to: "lukfuk@carymary.com" })).toBe("mailto:lukfuk@carymary.com");
  });

  it("encodes the subject, a space as %20 and not a plus", () => {
    expect(mailtoLink({ to: "a@b.cz", subject: "CZLCL00000035 // 1234" })).toBe("mailto:a@b.cz?subject=CZLCL00000035%20%2F%2F%201234");
  });

  it("keeps a subject's & and + from breaking the link", () => {
    expect(mailtoLink({ to: "a@b.cz", subject: "A&B + C" })).toBe("mailto:a@b.cz?subject=A%26B%20%2B%20C");
  });

  it("puts several copied addresses comma-separated, before the subject", () => {
    expect(mailtoLink({ to: "a@b.cz", cc: "c@b.cz, d@b.cz", subject: "S" })).toBe("mailto:a@b.cz?cc=c@b.cz,d@b.cz&subject=S");
  });

  it("sends the line breaks of a message as CRLF", () => {
    expect(mailtoLink({ to: "a@b.cz", message: "one\ntwo" })).toBe("mailto:a@b.cz?body=one%0D%0Atwo");
  });
});

import { describe, expect, it } from "vitest";
import { canBeCopied, otherContacts, shipmentEmailSubject } from "./shipmentEmail";

describe("shipmentEmailSubject", () => {
  it("is the Internal Reference // the Customer Reference", () => {
    expect(shipmentEmailSubject({ jobNumber: "CZLCL00000035", customerReference: "1234" })).toBe("CZLCL00000035 // 1234");
  });

  it("is the Internal Reference alone without a Customer Reference, with no separator left over", () => {
    expect(shipmentEmailSubject({ jobNumber: "CZLCL00000035", customerReference: "" })).toBe("CZLCL00000035");
    expect(shipmentEmailSubject({ jobNumber: "CZLCL00000035", customerReference: "   " })).toBe("CZLCL00000035");
    expect(shipmentEmailSubject({ jobNumber: "CZLCL00000035", customerReference: null })).toBe("CZLCL00000035");
  });

  it("trims what it joins", () => {
    expect(shipmentEmailSubject({ jobNumber: " CZ1 ", customerReference: " 1234 " })).toBe("CZ1 // 1234");
  });
});

describe("who can be copied in", () => {
  const to = { email: "lukfuk@carymary.com" };

  it("takes a contact with its own address", () => {
    expect(canBeCopied({ email: "anna@alza.cz" }, to)).toBe(true);
  });

  it("leaves out a contact with no address, or the one the email already goes to", () => {
    expect(canBeCopied({ email: "" }, to)).toBe(false);
    expect(canBeCopied({ email: "  " }, to)).toBe(false);
    expect(canBeCopied({ email: " LUKFUK@carymary.com " }, to)).toBe(false);
  });

  it("lists the customer's contacts without the one the email goes to", () => {
    const a = { id: "a" };
    const b = { id: "b" };
    expect(otherContacts([a, b], a)).toEqual([b]);
    expect(otherContacts([a], a)).toEqual([]);
  });
});

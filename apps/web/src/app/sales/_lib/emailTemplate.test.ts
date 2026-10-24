import { describe, expect, it } from "vitest";
import { asTemplate, fillPlaceholders, filledTemplate, quoteValues, STANDARD_TEMPLATE } from "./emailTemplate";

const data = { customerContact: "Eiko Kadono", customerName: "Ghibli", origin: "Tokyo (JPTYO)", destination: "Ostrava (CZOSR)", salesOwner: "Austromar" };
const values = quoteValues("QCZ20261020002-2", data, "2026-11-30");

describe("quoteValues", () => {
  it("takes the quote's values, Sir/Madam without a contact and Sales without an owner", () => {
    expect(values).toMatchObject({ contact: "Eiko Kadono", reference: "QCZ20261020002-2", route: "Tokyo (JPTYO) → Ostrava (CZOSR)", validUntil: "30.11.2026", sender: "Austromar" });
    expect(quoteValues("Q1", {}, null)).toMatchObject({ contact: "Sir/Madam", sender: "Sales", validUntil: "" });
  });
});

describe("fillPlaceholders", () => {
  it("fills what it knows and leaves the rest", () => {
    expect(fillPlaceholders("Dear {contact}, {reference} {unknown}", values)).toBe("Dear Eiko Kadono, QCZ20261020002-2 {unknown}");
  });

  it("gives the standard template the message the dialog always had", () => {
    expect(filledTemplate(STANDARD_TEMPLATE, values)).toEqual({
      subject: "Freight quotation QCZ20261020002-2",
      message: "Dear Eiko Kadono,\n\nPlease find our quotation QCZ20261020002-2 for your shipment Tokyo (JPTYO) → Ostrava (CZOSR).\n\nBest regards,\nAustromar",
    });
  });
});

describe("asTemplate", () => {
  it("turns this quote's values back into placeholders, the route as a whole", () => {
    const { message } = filledTemplate(STANDARD_TEMPLATE, values);
    expect(asTemplate(message, values)).toBe(STANDARD_TEMPLATE.message);
    expect(asTemplate("Hallo Eiko Kadono, Angebot QCZ20261020002-2 ab Tokyo (JPTYO).", values)).toBe("Hallo {contact}, Angebot {reference} ab {origin}.");
  });

  it("leaves values too short to tell from words", () => {
    expect(asTemplate("Dear Al, at", quoteValues("Q1", { customerContact: "Al", origin: "at" }, null))).toBe("Dear Al, at");
  });
});

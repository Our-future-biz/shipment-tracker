import { describe, expect, it } from "vitest";
import { customerStateName } from "@/app/shipments/[jobNumber]/tabs/tracking/trackingText";
import { asOfText, cargoText, contactText, kindText, routeText, stateText, stepText } from "./statusText";

const status = { origin: "", pol: "Ningbo (CNNBO)", pod: "Hamburg (DEHAM)", destination: "Praha" };

describe("the customer's tracking page (user council E10)", () => {
  it("shows the whole route, the final destination included", () => {
    expect(routeText(status)).toBe("Ningbo (CNNBO) → Hamburg (DEHAM) → Praha");
    expect(routeText({ ...status, origin: "Yiwu" })).toBe("Yiwu → Ningbo (CNNBO) → Hamburg (DEHAM) → Praha");
    // A place the port already names is said once, by its longer name.
    expect(routeText({ ...status, destination: "Hamburg" })).toBe("Ningbo (CNNBO) → Hamburg (DEHAM)");
    expect(routeText({ origin: "Praha", pol: "", pod: "", destination: "Brno" })).toBe("Praha → Brno");
    expect(routeText({ origin: "", pol: "", pod: "", destination: "" })).toBe("");
  });

  it("says what travels: pieces with their package type, and the weight", () => {
    expect(cargoText({ pieces: "3", packageType: "Pallets", weightKg: "1,200" })).toBe("3 Pallets · 1,200 kg");
    expect(cargoText({ pieces: "3", packageType: "", weightKg: "" })).toBe("3 ks / pcs");
    expect(cargoText({ pieces: "", packageType: "Pallets", weightKg: "450" })).toBe("450 kg");
    expect(cargoText({ pieces: "", packageType: "", weightKg: "" })).toBe("");
  });

  it("names whom to ask: our company, its phone and e-mail, never a person", () => {
    expect(contactText({ ourCompany: "Austromar s.r.o.", ourPhone: " +420 222 333 444 ", ourEmail: "ops@austromar.test", reference: "CZLCL00000054" })).toEqual({
      lead: { cs: "Dotazy k zásilce CZLCL00000054: Austromar s.r.o.", en: "Questions about CZLCL00000054: Austromar s.r.o." },
      ways: ["+420 222 333 444", "ops@austromar.test"],
    });
    expect(contactText({ ourCompany: "Austromar s.r.o.", ourPhone: "", ourEmail: "", reference: "X" })?.ways).toEqual([]);
    expect(contactText({ ourCompany: "", ourPhone: "+420 1", ourEmail: "", reference: "X" })).toBeNull();
  });

  it("speaks Czech and English, the states in the words of the staff's customer preview", () => {
    const states = [
      ["done", true],
      ["next", true],
      ["unconfirmed", true],
      ["open", true],
      ["open", false],
    ] as const;
    for (const [state, planned] of states) {
      const text = stateText(state, planned);
      expect(text.en).toBe(customerStateName(state, planned));
      expect(text.cs).not.toBe("");
    }
    expect(stepText("Departed")).toEqual({ cs: "Odjezd", en: "Departed" });
    expect(stepText("Customs cleared").cs).toBe("Celně odbaveno");
    // A step this page doesn't know stays in English only.
    expect(stepText("Something new")).toEqual({ cs: "", en: "Something new" });
    expect(kindText({ direction: "Import", freightMode: "Sea Freight" })).toEqual({ cs: "Import · Námořní přeprava", en: "Import · Sea Freight" });
    expect(kindText({ direction: "", freightMode: "Barge" })).toEqual({ cs: "Barge", en: "Barge" });
    expect(asOfText("20.11.2026 10:00").cs).toMatch(/^Stav k 20\.11\.2026 10:00/);
  });
});

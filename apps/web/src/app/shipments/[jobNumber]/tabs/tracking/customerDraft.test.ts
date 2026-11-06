import { describe, expect, it } from "vitest";
import type { ShipmentItem } from "@/hooks/useShipments";
import type { TrackingMilestone } from "@/hooks/useShipmentTracking";
import { NOTICE_KIND_OPTIONS, draftValues, fillDraft, standardDraft, toTemplate } from "./customerDraft";

const shipment = {
  jobNumber: "CZ42",
  customerReference: "4711",
  freightMode: "Sea Freight",
  tradeDirection: "Import",
  pol: "Bremerhaven",
  pod: "Charleston",
  etaWarehouse: "2026-10-20",
  containers: [{ containerNumber: "MSDU2778315" }],
} as ShipmentItem;
const milestones = [
  { key: "departed", planned: "2026-09-19", actual: "2026-09-20" },
  { key: "arrived", planned: "2026-10-16", actual: null },
  { key: "delivered", planned: "2026-10-22", actual: null },
] as TrackingMilestone[];
const values = draftValues(shipment, milestones, "en", "Jana Nováková", "Lukas Slavik");

describe("what fills the draft", () => {
  it("takes the shipment's facts, the actual date where there is one", () => {
    expect(values.reference).toBe("CZ42 // 4711");
    expect(values.eta).toBe("16.10.2026");
    expect(values.facts).toBe(
      "Mode: Sea Freight Import\nContainers: MSDU2778315\nRoute: Bremerhaven → Charleston\nATD: 20.09.2026\nETA: 16.10.2026\nETA warehouse: 20.10.2026\nPlanned delivery: 22.10.2026",
    );
  });

  it("leaves out what the job doesn't have", () => {
    const bare = draftValues({ jobNumber: "CZ1" } as ShipmentItem, [], "en", "", "");
    expect(bare.facts).toBe("");
  });

  it("speaks Czech when asked", () => {
    expect(draftValues(shipment, milestones, "cs", "", "").facts).toContain("Trasa: Bremerhaven → Charleston");
  });
});

describe("the standard wording", () => {
  it("exists for every kind in both languages, with nothing left unfilled", () => {
    for (const { value } of NOTICE_KIND_OPTIONS) {
      for (const language of ["en", "cs"] as const) {
        const { subject, message } = fillDraft(standardDraft(value, language), values);
        expect(subject).toContain("CZ42 // 4711");
        expect(message).toContain("Lukas Slavik");
        expect(`${subject}${message}`).not.toMatch(/\{\w+\}/);
      }
    }
  });

  it("reads right for an ETA change", () => {
    const { subject, message } = fillDraft(standardDraft("eta_change", "en"), values);
    expect(subject).toBe("CZ42 // 4711 · new ETA 16.10.2026");
    expect(message).toContain("Dear Jana Nováková,");
    expect(message).toContain("has changed to 16.10.2026.");
  });

  it("copes with no contact name, in both languages", () => {
    const en = draftValues(shipment, milestones, "en", "", "Eva");
    expect(fillDraft(standardDraft("status", "en"), en).message.startsWith("Dear Sir or Madam,")).toBe(true);
    const cs = draftValues(shipment, milestones, "cs", "", "Eva");
    expect(fillDraft(standardDraft("status", "cs"), cs).message.startsWith("Dobrý den,")).toBe(true);
  });
});

describe("keeping one's own wording", () => {
  it("turns this shipment's values back into placeholders, and fills in for the next one", () => {
    const written = { subject: "CZ42 // 4711 update", message: "Hello Jana Nováková, new date 16.10.2026.\n\nLukas Slavik" };
    const template = toTemplate(written, values);
    expect(template).toEqual({ subject: "{reference} update", message: "Hello {contact}, new date {eta}.\n\n{sender}" });
    const other = { ...values, reference: "CZ43", contact: "Petr", eta: "01.12.2026", sender: "Eva" };
    expect(fillDraft(template, other)).toEqual({ subject: "CZ43 update", message: "Hello Petr, new date 01.12.2026.\n\nEva" });
  });

  it("swaps whole words only, never a name inside a word", () => {
    const short = { ...values, sender: "Eva", contact: "Jan" };
    const template = toTemplate({ subject: "", message: "Dear Jan, the evaluation by Jana is done.\n\nEva" }, short);
    expect(template.message).toBe("Dear {contact}, the evaluation by Jana is done.\n\n{sender}");
  });

  it("leaves a date two placeholders share as written: which one was meant can't be told", () => {
    const same = { ...values, eta: "22.10.2026", delivery: "22.10.2026" };
    const template = toTemplate({ subject: "CZ42 // 4711 · 22.10.2026", message: "Arrives and is delivered on 22.10.2026." }, same);
    expect(template).toEqual({ subject: "{reference} · 22.10.2026", message: "Arrives and is delivered on 22.10.2026." });
  });

  it("puts the facts block back whole, before the dates inside it", () => {
    const template = toTemplate({ subject: "", message: `ETA ${values.eta}\n\n${values.facts}` }, values);
    expect(template.message).toBe("ETA {eta}\n\n{facts}");
  });

  it("takes a value with regular-expression marks as plain text", () => {
    const marked = { ...values, reference: "CZ42 (4711)+" };
    expect(toTemplate({ subject: "CZ42 (4711)+ update", message: "" }, marked).subject).toBe("{reference} update");
  });

  it("leaves a placeholder it doesn't know alone", () => {
    expect(fillDraft({ subject: "{unknown}", message: "" }, values).subject).toBe("{unknown}");
  });
});

import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { defaultReleaseGates, gateMovementService, isArmed, needsAttention } from "../services/gateMovement.service";
import { warehouseTaskRepository } from "../repositories/warehouseTask.repository";
import { gateMovementRepository } from "../repositories/gateMovement.repository";
import { warehouseImportService } from "../services/warehouseImport.service";
import { gateAdminService } from "../services/gateAdmin.service";
import { reweighService } from "../services/reweigh.service";
import {
  customerTermsOf,
  gateDaysAsked,
  jobsWithNoCustomer,
  overrideKeys,
  passesClosed,
  passesGivenBack,
  passesNotGivenBack,
  releaseChecks,
  releasedInShipmentsOf,
  releasePasses,
  shipmentOverrides,
  uncheckedRecorded,
} from "./shipmentFakes";
import { shipments } from "~encore/clients";
import { eq } from "drizzle-orm";
import { db } from "../db/db";
import { shipmentOutboxRepository } from "../repositories/shipmentOutbox.repository";
import { shipmentOutboxTable } from "../schemas/shipmentOutbox.schema";
import { deliverDue } from "../services/shipmentOutbox.service";

// Shipments answer from the fakes (the real service needs an authenticated caller).
vi.mock("~encore/clients", async () => {
  const { getShipment, releasePassFakes } = await import("./shipmentFakes");
  return {
    shipments: { shipmentUpdate: vi.fn(async () => ({})), shipmentGet: vi.fn(getShipment), ...releasePassFakes, ...(await import("./shipmentFakes")).shipmentBasicsFake },
    invoicing: (await import("./shipmentFakes")).invoicingFake,
    customers: (await import("./shipmentFakes")).customersFake,
    auth: (await import("./authFake")).authFake([]),
  };
});

const company = () => randomUUID();
const user = randomUUID();
const allOk = (gates: ReturnType<typeof defaultReleaseGates>) => gates.map((g) => ({ ...g, s: "OK" as const }));

// A shipment's outbound record (imported with its position), every release gate OK: ready for its WH release.
async function linkedOutbound(c: string, shipmentId: string) {
  const [r] = await warehouseImportService.importShipments(c, user, [shipmentId]);
  const m = await gateMovementService.get(r!.movementId!, c);
  await gateMovementRepository.update(m.id, c, { releaseGates: allOk(m.releaseGates) });
  return m;
}

describe("release gates", () => {
  it("uses the LCL set for consolidation and the FCL set for full boxes", () => {
    expect(defaultReleaseGates("Import", "LCL consolidation", "Under Customs Clearance").map((g) => [g.g, g.s])).toEqual([
      ["B/L / release order", "Pending"],
      ["Customs", "Pending"],
      ["Charges", "OK"],
      ["Storage settled", "OK"],
    ]);
    expect(defaultReleaseGates("Export", "LCL consolidation", "Customs Cleared/Released").find((g) => g.g === "Customs")!.s).toBe("OK");
    expect(defaultReleaseGates("Export", "FCL stuffing", "Paperwork Verified").map((g) => g.g)).toContain("VGM submitted");
  });

  it("arms only when every gate except the empty return is OK, or on override", () => {
    const gates = allOk(defaultReleaseGates("Import", "FCL stripping", "Customs Cleared/Released"));
    expect(isArmed({ status: "Expected", overridden: false, releaseGates: gates })).toBe(true);
    const emptyPending = gates.map((g) => (/empty return/i.test(g.g) ? { ...g, s: "Pending" as const } : g));
    expect(isArmed({ status: "Expected", overridden: false, releaseGates: emptyPending })).toBe(true);
    const customsPending = gates.map((g) => (g.g === "Customs" ? { ...g, s: "Blocked" as const } : g));
    expect(isArmed({ status: "Expected", overridden: false, releaseGates: customsPending })).toBe(false);
    expect(isArmed({ status: "Expected", overridden: true, releaseGates: customsPending })).toBe(true);
    expect(isArmed({ status: "Refused", overridden: false, releaseGates: gates })).toBe(false);
  });

  it("flags only outgoing cargo: release blocked, or no MRN while customs is not cleared", () => {
    const gates = defaultReleaseGates("Import", "LCL consolidation", "Under Customs Clearance");
    const base = { status: "In Warehouse", overridden: false, releaseGates: gates, mrn: "", customsStatus: "Under Customs Clearance" as const, impRelease: null, gateOut: null };
    expect(needsAttention({ ...base, visit: "příjem" })).toBe(false);
    expect(needsAttention({ ...base, visit: "výdej" })).toBe(true);
    expect(needsAttention({ ...base, visit: "výdej", overridden: true })).toBe(true);
    expect(needsAttention({ ...base, visit: "výdej", overridden: true, mrn: "26CZ1" })).toBe(false);
    expect(needsAttention({ ...base, visit: "výdej", overridden: true, customsStatus: "Customs Cleared/Released" })).toBe(false);
    // Released or gone out: nothing left to attend to.
    expect(needsAttention({ ...base, visit: "výdej", gateOut: new Date() })).toBe(false);
    expect(needsAttention({ ...base, visit: "výdej", impRelease: new Date() })).toBe(false);
  });
});

describe("gate movement flow", () => {
  it("blocks WH release until armed, then stamps release and gate-out", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091601-1", visit: "výdej", handling: "Import", customsMode: "T1", mrn: "26CZ1" });
    expect(m.armed).toBe(false);
    expect(m.needsAttention).toBe(true);
    await expect(gateMovementService.stamp(m.id, c, user, "impRelease")).rejects.toThrow(/NOT armed/);

    await gateMovementRepository.update(m.id, c, { releaseGates: allOk(m.releaseGates) });
    const released = await gateMovementService.stamp(m.id, c, user, "impRelease");
    expect(released).toMatchObject({ status: "Released", armed: true, needsAttention: false });
    expect(released.impRelease).not.toBeNull();
    expect(released.gateOut).not.toBeNull();
    await expect(gateMovementService.stamp(m.id, c, user, "impRelease")).rejects.toThrow(/already/);
  });

  it("stops the WH release of a job on prepayment that is not paid: a user is refused, a manager lets it out with a reason, recorded", async () => {
    const c = company();
    const shipmentId = randomUUID();
    const m = await linkedOutbound(c, shipmentId);
    releaseChecks.set(shipmentId, { prepaymentUnpaid: true, unpaid: [{ number: "FV2026001", leftToPay: 1200, currency: "EUR" }] });
    try {
      await expect(gateMovementService.stamp(m.id, c, user, "impRelease")).rejects.toThrow(
        "The WH release can't be stamped: the job is on prepayment and not paid - FV2026001 (1,200.00 EUR left to pay). A manager can release it with a reason",
      );
      await expect(gateMovementService.stamp(m.id, c, user, "impRelease", "manager", { paymentOverrideReason: "ok" })).rejects.toThrow(/give a reason \(at least 3 characters\)/);
      expect((await gateMovementService.get(m.id, c)).impRelease).toBeNull();

      const released = await gateMovementService.stamp(m.id, c, user, "impRelease", "manager", { paymentOverrideReason: "Paid in cash at the gate" });
      expect(released.impRelease).not.toBeNull();
      expect(released.events.find((e) => e.kind === "paymentOverride")).toMatchObject({
        label: "WH release on prepayment (unpaid: FV2026001 (1,200.00 EUR left to pay)) - reason: Paid in cash at the gate",
      });
      // Recorded on the shipment too, as Shipments records any override.
      expect(shipmentOverrides.filter((o) => o.shipmentId === shipmentId)).toEqual([
        { shipmentId, kind: "warehouse_released", reason: "Paid in cash at the gate", invoices: [{ number: "FV2026001", leftToPay: 1200, currency: "EUR" }], checked: true },
      ]);
    } finally {
      releaseChecks.delete(shipmentId);
    }
  });

  it("lets a user's WH release through on a release a manager approved on request, used once and recorded with who asked and who approved", async () => {
    const c = company();
    const shipmentId = randomUUID();
    const m = await linkedOutbound(c, shipmentId);
    releaseChecks.set(shipmentId, { prepaymentUnpaid: true, unpaid: [], prepaymentUninvoiced: [{ currency: "EUR", amount: 800 }] });
    const reason = "Asked by Jan Novák: customer pays on Friday — approved by Eva Malá: agreed with the owner";
    releasePasses.set(shipmentId, { requestId: randomUUID(), reason });
    try {
      const released = await gateMovementService.stamp(m.id, c, user, "impRelease", "user");
      expect(released.impRelease).not.toBeNull();
      expect(released.events.find((e) => e.kind === "paymentOverride")?.label).toBe(`WH release on prepayment (not invoiced: 800.00 EUR not invoiced yet) - reason: ${reason}`);
      expect(shipmentOverrides.filter((o) => o.shipmentId === shipmentId)).toEqual([
        { shipmentId, kind: "warehouse_released", reason, invoices: [{ number: "Not invoiced yet", leftToPay: 800, currency: "EUR" }], checked: true },
      ]);
    } finally {
      releaseChecks.delete(shipmentId);
      releasePasses.delete(shipmentId);
    }
  });

  it("refuses as before when no approval is there, or Shipments can't be asked for one; and gives a used approval back when nothing was stamped", async () => {
    const c = company();
    const shipmentId = randomUUID();
    const m = await linkedOutbound(c, shipmentId);
    releaseChecks.set(shipmentId, { prepaymentUnpaid: true, unpaid: [{ number: "FV2026001", leftToPay: 1200, currency: "EUR" }] });
    try {
      await expect(gateMovementService.stamp(m.id, c, user, "impRelease")).rejects.toThrow(/A manager can release it with a reason$/);
      releasePasses.set(shipmentId, new Error("shipments down"));
      await expect(gateMovementService.stamp(m.id, c, user, "impRelease")).rejects.toThrow(/A manager can release it with a reason$/);
      // The stamp's own update stamps nothing (somebody else was first): the approval it used is given back.
      const requestId = randomUUID();
      releasePasses.set(shipmentId, { requestId, reason: "Asked by Jan Novák: x — approved by Eva Malá: y" });
      const lost = vi.spyOn(gateMovementRepository, "conditionalUpdate").mockResolvedValueOnce(null);
      await expect(gateMovementService.stamp(m.id, c, user, "impRelease")).rejects.toThrow();
      lost.mockRestore();
      expect(passesGivenBack.filter((p) => p.requestId === requestId)).toHaveLength(1);
      expect(shipmentOverrides.some((o) => o.shipmentId === shipmentId)).toBe(false);
      expect((await gateMovementService.get(m.id, c)).impRelease).toBeNull();
    } finally {
      releaseChecks.delete(shipmentId);
      releasePasses.delete(shipmentId);
    }
  });

  it("closes the approval it used, not gives it back, when somebody else's WH release of the record was first (review)", async () => {
    const c = company();
    const shipmentId = randomUUID();
    const m = await linkedOutbound(c, shipmentId);
    releaseChecks.set(shipmentId, { prepaymentUnpaid: true, unpaid: [{ number: "FV2026001", leftToPay: 1200, currency: "EUR" }] });
    const requestId = randomUUID();
    releasePasses.set(shipmentId, { requestId, reason: "Asked by Jan Novák: x — approved by Eva Malá: y" });
    // A manager's release of the same record commits first: this stamp's own update then stamps nothing.
    const update = gateMovementRepository.conditionalUpdate.bind(gateMovementRepository);
    const lost = vi.spyOn(gateMovementRepository, "conditionalUpdate").mockImplementationOnce(async (...args: Parameters<typeof update>) => {
      await update(...args);
      return null;
    });
    try {
      await expect(gateMovementService.stamp(m.id, c, user, "impRelease")).rejects.toThrow();
      lost.mockRestore();
      expect((await gateMovementService.get(m.id, c)).impRelease).not.toBeNull();
      const back = (await shipmentOutboxRepository.forMovement(m.id, c)).find((r) => r.kind === "passBack")!;
      expect(back).toMatchObject({ status: "sent", payload: { requestId, releasedMeanwhile: "true" } });
      expect(passesClosed.filter((p) => p.requestId === requestId)).toHaveLength(1);
      expect(passesGivenBack.some((p) => p.requestId === requestId)).toBe(false);
    } finally {
      lost.mockRestore();
      releaseChecks.delete(shipmentId);
      releasePasses.delete(shipmentId);
    }
  });

  it("refuses the WH release when Invoicing can't be asked, and lets a manager out with a reason, recorded as unchecked", async () => {
    const c = company();
    const shipmentId = randomUUID();
    const m = await linkedOutbound(c, shipmentId);
    releaseChecks.set(shipmentId, new Error("invoicing down"));
    try {
      await expect(gateMovementService.stamp(m.id, c, user, "impRelease")).rejects.toThrow(/Whether the job is paid could not be checked/);
      const released = await gateMovementService.stamp(m.id, c, user, "impRelease", "admin", { paymentOverrideReason: "Customer paid, bank slow" });
      expect(released.events.find((e) => e.kind === "paymentOverride")?.label).toBe("WH release on prepayment (payment not checked) - reason: Customer paid, bank slow");
    } finally {
      releaseChecks.delete(shipmentId);
    }
  });

  it("does not stop again a job Shipments released first, says so on the record, and leaves its day as set there (Y6)", async () => {
    const c = company();
    const shipmentId = randomUUID();
    const m = await linkedOutbound(c, shipmentId);
    releaseChecks.set(shipmentId, { prepaymentUnpaid: true, unpaid: [{ number: "FV2026001", leftToPay: 1200, currency: "EUR" }] });
    releasedInShipmentsOf.set(shipmentId, { date: "2026-11-18", by: "eva@firma.cz" });
    const requestId = randomUUID();
    releasePasses.set(shipmentId, { requestId, reason: "Asked by Jan: x — approved by Eva: y" });
    try {
      const released = await gateMovementService.stamp(m.id, c, user, "impRelease", "user");
      expect(released.impRelease).not.toBeNull();
      expect(released.events.find((e) => e.kind === "releasedInShipments")?.label).toBe("Released in Shipments on 18.11.2026 by eva@firma.cz");
      expect(released.events.some((e) => e.kind === "paymentOverride")).toBe(false);
      // No approval used, no override recorded, and no day sent over the one set in Shipments.
      expect(releasePasses.has(shipmentId)).toBe(true);
      expect(shipmentOverrides.some((o) => o.shipmentId === shipmentId)).toBe(false);
      const rows = await shipmentOutboxRepository.forMovement(m.id, c);
      expect(rows.some((r) => "warehouseReleasedDate" in r.payload)).toBe(false);
      const sent = vi.mocked(shipments.shipmentUpdate).mock.calls.map((call) => call[0] as { shipmentId: string; warehouseReleasedDate?: string });
      expect(sent.some((u) => u.shipmentId === shipmentId && u.warehouseReleasedDate !== undefined)).toBe(false);
    } finally {
      releaseChecks.delete(shipmentId);
      releasedInShipmentsOf.delete(shipmentId);
      releasePasses.delete(shipmentId);
    }
  });

  it("keeps the stop when whether Shipments released the job can't be read (Y6)", async () => {
    const c = company();
    const shipmentId = randomUUID();
    const m = await linkedOutbound(c, shipmentId);
    releaseChecks.set(shipmentId, { prepaymentUnpaid: true, unpaid: [{ number: "FV2026001", leftToPay: 1200, currency: "EUR" }] });
    releasedInShipmentsOf.set(shipmentId, new Error("shipments down"));
    try {
      await expect(gateMovementService.stamp(m.id, c, user, "impRelease")).rejects.toThrow(/A manager can release it with a reason$/);
    } finally {
      releaseChecks.delete(shipmentId);
      releasedInShipmentsOf.delete(shipmentId);
    }
  });

  it("records the override on the shipment through the outbox, ahead of the released day (n27)", async () => {
    const c = company();
    const shipmentId = randomUUID();
    const m = await linkedOutbound(c, shipmentId);
    releaseChecks.set(shipmentId, { prepaymentUnpaid: true, unpaid: [{ number: "FV2026001", leftToPay: 1200, currency: "EUR" }] });
    try {
      await gateMovementService.stamp(m.id, c, user, "impRelease", "manager", { paymentOverrideReason: "Paid in cash at the gate" });
      const rows = (await shipmentOutboxRepository.forMovement(m.id, c)).filter((r) => r.kind === "override" || r.kind === "released");
      expect(rows.map((r) => [r.kind, r.status])).toEqual([
        ["override", "sent"],
        ["released", "sent"],
      ]);
    } finally {
      releaseChecks.delete(shipmentId);
    }
  });

  it("when Invoicing can't be asked, stops only a customer on prepayment by the Customer Database's terms (P17)", async () => {
    const c = company();
    const onTerms = randomUUID();
    const onPrepayment = randomUUID();
    const a = await linkedOutbound(c, onTerms);
    const b = await linkedOutbound(c, onPrepayment);
    releaseChecks.set(onTerms, new Error("invoicing down"));
    releaseChecks.set(onPrepayment, new Error("invoicing down"));
    customerTermsOf.set(onTerms, "14 days net");
    customerTermsOf.set(onPrepayment, "Prepayment");
    try {
      expect((await gateMovementService.stamp(a.id, c, user, "impRelease", "user")).impRelease).not.toBeNull();
      await expect(gateMovementService.stamp(b.id, c, user, "impRelease", "user")).rejects.toThrow(/Whether the job is paid could not be checked/);
    } finally {
      for (const id of [onTerms, onPrepayment]) {
        releaseChecks.delete(id);
        customerTermsOf.delete(id);
      }
    }
  });

  it("lets a customer not on prepayment through unchecked, saying so on the record and on the shipment once (P17)", async () => {
    const c = company();
    const shipmentId = randomUUID();
    const m = await linkedOutbound(c, shipmentId);
    releaseChecks.set(shipmentId, new Error("invoicing down"));
    customerTermsOf.set(shipmentId, "14 days net");
    try {
      const released = await gateMovementService.stamp(m.id, c, user, "impRelease", "user");
      expect(released.impRelease).not.toBeNull();
      expect(released.events.find((e) => e.kind === "paymentNotChecked")?.label).toBe("WH release: payment not checked");
      expect(released.events.some((e) => e.kind === "paymentOverride")).toBe(false);
      const rows = await shipmentOutboxRepository.forMovement(m.id, c);
      const note = rows.find((r) => r.kind === "override");
      expect(note).toMatchObject({ payload: { note: "prepaymentUnchecked" }, status: "sent" });
      // Ahead of the day, as an override is; and no override recorded on the shipment.
      expect(rows.filter((r) => r.kind === "override" || r.kind === "released").map((r) => r.kind)).toEqual(["override", "released"]);
      expect(uncheckedRecorded.filter((r) => r.shipmentId === shipmentId)).toEqual([{ shipmentId, idempotencyKey: note!.id }]);
      expect(shipmentOverrides.some((o) => o.shipmentId === shipmentId)).toBe(false);
    } finally {
      releaseChecks.delete(shipmentId);
      customerTermsOf.delete(shipmentId);
    }
  });

  it("lets a job through unchecked when Invoicing could not hold its work not invoiced against the customer's terms, saying why (P10, review)", async () => {
    const c = company();
    const shipmentId = randomUUID();
    const m = await linkedOutbound(c, shipmentId);
    releaseChecks.set(shipmentId, { prepaymentUnpaid: false, unpaid: [], prepaymentUninvoicedUnchecked: true });
    try {
      const released = await gateMovementService.stamp(m.id, c, user, "impRelease", "user");
      expect(released.impRelease).not.toBeNull();
      expect(released.events.find((e) => e.kind === "paymentNotChecked")).toMatchObject({
        label: "WH release: payment not checked",
        detail: expect.stringMatching(/^the Customer Database could not be read/),
      });
      const note = (await shipmentOutboxRepository.forMovement(m.id, c)).find((r) => r.kind === "override");
      expect(note).toMatchObject({ payload: { note: "prepaymentUnchecked", why: "customerDatabase" }, status: "sent" });
      expect(uncheckedRecorded.filter((r) => r.shipmentId === shipmentId)).toEqual([{ shipmentId, idempotencyKey: note!.id, why: "customerDatabase" }]);
    } finally {
      releaseChecks.delete(shipmentId);
    }
  });

  it("stops a job with no customer when Invoicing can't be asked: a user is refused, a manager releases it with a reason", async () => {
    const c = company();
    const shipmentId = randomUUID();
    const m = await linkedOutbound(c, shipmentId);
    releaseChecks.set(shipmentId, new Error("invoicing down"));
    jobsWithNoCustomer.add(shipmentId);
    try {
      await expect(gateMovementService.stamp(m.id, c, user, "impRelease", "user")).rejects.toThrow(/has no customer whose payment terms could tell/);
      const released = await gateMovementService.stamp(m.id, c, user, "impRelease", "manager", { paymentOverrideReason: "Customer named on the phone" });
      expect(released.events.find((e) => e.kind === "paymentOverride")?.label).toBe("WH release on prepayment (payment not checked) - reason: Customer named on the phone");
    } finally {
      releaseChecks.delete(shipmentId);
      jobsWithNoCustomer.delete(shipmentId);
    }
  });

  it("runs the stop again on a release after a voided one: the day the voided release wrote is the gate's, not Shipments'", async () => {
    const c = company();
    const shipmentId = randomUUID();
    const m = await linkedOutbound(c, shipmentId);
    releaseChecks.set(shipmentId, { prepaymentUnpaid: true, unpaid: [{ number: "FV2026001", leftToPay: 1200, currency: "EUR" }] });
    try {
      await gateMovementService.stamp(m.id, c, user, "impRelease", "manager", { paymentOverrideReason: "Paid in cash at the gate" });
      const day = (await shipmentOutboxRepository.forMovement(m.id, c)).find((r) => r.kind === "released")!.payload.warehouseReleasedDate!;
      // The shipment now holds the gate's day, and a void does not take it back.
      releasedInShipmentsOf.set(shipmentId, { date: day, by: "clerk@firma.cz" });
      await gateAdminService.voidStamp(m.id, c, user, "manager", "impRelease", "Wrong pallet");
      await expect(shipmentOutboxRepository.sentReleasedDays(c, m.id, shipmentId)).resolves.toEqual([day]);
      // A user's release is stopped again - not "Released in Shipments" on the voided day.
      await expect(gateMovementService.stamp(m.id, c, user, "impRelease", "user")).rejects.toThrow(/A manager can release it with a reason$/);
      expect(gateDaysAsked.get(shipmentId)).toEqual([day]);
      expect((await gateMovementService.get(m.id, c)).events.some((e) => e.kind === "releasedInShipments")).toBe(false);
      // An approval is used for it as for any other release.
      const requestId = randomUUID();
      releasePasses.set(shipmentId, { requestId, reason: "Asked by Jan: x — approved by Eva: y" });
      const again = await gateMovementService.stamp(m.id, c, user, "impRelease", "user");
      expect(again.events.filter((e) => e.kind === "paymentOverride")).toHaveLength(2);
      expect(releasePasses.has(shipmentId)).toBe(false);
    } finally {
      releaseChecks.delete(shipmentId);
      releasedInShipmentsOf.delete(shipmentId);
      releasePasses.delete(shipmentId);
    }
  });

  it("keeps a day set in Shipments while the gate's released row waited in the outbox: only the plate goes, and the record says so", async () => {
    const c = company();
    const shipmentId = randomUUID();
    const m = await linkedOutbound(c, shipmentId);
    // Empty when the release is stamped; set in Shipments before the row is delivered.
    const read = vi.spyOn(shipments, "_internalWarehouseReleasedOf").mockImplementationOnce(async () => {
      releasedInShipmentsOf.set(shipmentId, { date: "2026-11-18", by: "eva@firma.cz" });
      return { warehouseReleased: null };
    });
    try {
      const released = await gateMovementService.stamp(m.id, c, user, "impRelease", "user");
      expect(released.impRelease).not.toBeNull();
      const sent = vi.mocked(shipments.shipmentUpdate).mock.calls.map((call) => call[0] as { shipmentId: string; warehouseReleasedDate?: string });
      expect(sent.some((u) => u.shipmentId === shipmentId && u.warehouseReleasedDate !== undefined)).toBe(false);
      const row = (await shipmentOutboxRepository.forMovement(m.id, c)).find((r) => r.kind === "released")!;
      expect(row.status).toBe("sent");
      const line = (await gateMovementService.get(m.id, c)).events.find((e) => e.kind === "releasedInShipments" && e.by === "Shipments");
      expect(line).toMatchObject({ label: "Released in Shipments on 18.11.2026 by eva@firma.cz", detail: expect.stringMatching(/is not sent over it/) });
      // The day it did not write never counts as the gate's own later (round-4 review): a void and restamp still stops.
      expect((await shipmentOutboxRepository.forMovement(m.id, c)).find((r) => r.kind === "released")!.payload.dayKept).toBe("true");
      await expect(shipmentOutboxRepository.sentReleasedDays(c, m.id, shipmentId)).resolves.toEqual([]);
    } finally {
      read.mockRestore();
      releasedInShipmentsOf.delete(shipmentId);
    }
  });

  it("counts its own day as the gate's when an earlier try wrote it and the answer was lost: never kept as Shipments', and the stop runs again after a void (review)", async () => {
    const c = company();
    const shipmentId = randomUUID();
    const m = await linkedOutbound(c, shipmentId);
    releaseChecks.set(shipmentId, { prepaymentUnpaid: true, unpaid: [{ number: "FV2026001", leftToPay: 1200, currency: "EUR" }] });
    // Shipments writes the day each time, and its first answer does not come back.
    let lost = false;
    vi.mocked(shipments.shipmentUpdate).mockImplementation(async (req) => {
      const update = req as { shipmentId: string; warehouseReleasedDate?: string };
      if (update.shipmentId === shipmentId && update.warehouseReleasedDate) {
        releasedInShipmentsOf.set(shipmentId, { date: update.warehouseReleasedDate, by: "clerk@firma.cz" });
        if (!lost) {
          lost = true;
          throw Object.assign(new Error("deadline exceeded"), { code: "deadline_exceeded" });
        }
      }
      return {} as never;
    });
    try {
      await gateMovementService.stamp(m.id, c, user, "impRelease", "manager", { paymentOverrideReason: "Paid in cash at the gate" });
      const waiting = (await shipmentOutboxRepository.forMovement(m.id, c)).find((r) => r.kind === "released")!;
      expect(waiting).toMatchObject({ status: "pending", attempts: 1 });
      // Tried again: the day on the shipment is the row's own, not one set in Shipments.
      await db.update(shipmentOutboxTable).set({ nextAttemptAt: new Date(0) }).where(eq(shipmentOutboxTable.id, waiting.id));
      await deliverDue(m.id);
      const row = (await shipmentOutboxRepository.forMovement(m.id, c)).find((r) => r.kind === "released")!;
      expect(row.status).toBe("sent");
      expect(row.payload.dayKept).toBeUndefined();
      expect((await gateMovementService.get(m.id, c)).events.some((e) => e.kind === "releasedInShipments")).toBe(false);
      const day = row.payload.warehouseReleasedDate!;
      await expect(shipmentOutboxRepository.sentReleasedDays(c, m.id, shipmentId)).resolves.toEqual([day]);
      // Voided: a user's release is stopped again, not let out as "Released in Shipments" on the gate's own day.
      await gateAdminService.voidStamp(m.id, c, user, "manager", "impRelease", "Wrong pallet");
      await expect(gateMovementService.stamp(m.id, c, user, "impRelease", "user")).rejects.toThrow(/A manager can release it with a reason$/);
    } finally {
      vi.mocked(shipments.shipmentUpdate).mockImplementation(async () => ({}) as never);
      releaseChecks.delete(shipmentId);
      releasedInShipmentsOf.delete(shipmentId);
    }
  });

  it("counts the day of a release voided while its row waited for another try as the gate's: it may have reached the shipment (review)", async () => {
    const c = company();
    const shipmentId = randomUUID();
    const m = await linkedOutbound(c, shipmentId);
    releaseChecks.set(shipmentId, { prepaymentUnpaid: true, unpaid: [{ number: "FV2026001", leftToPay: 1200, currency: "EUR" }] });
    // Shipments writes the day, and its answer does not come back.
    vi.mocked(shipments.shipmentUpdate).mockImplementation(async (req) => {
      const update = req as { shipmentId: string; warehouseReleasedDate?: string };
      if (update.shipmentId === shipmentId && update.warehouseReleasedDate) {
        releasedInShipmentsOf.set(shipmentId, { date: update.warehouseReleasedDate, by: "clerk@firma.cz" });
        throw Object.assign(new Error("unavailable"), { code: "unavailable" });
      }
      return {} as never;
    });
    try {
      await gateMovementService.stamp(m.id, c, user, "impRelease", "manager", { paymentOverrideReason: "Paid in cash at the gate" });
      const row = (await shipmentOutboxRepository.forMovement(m.id, c)).find((r) => r.kind === "released")!;
      expect(row).toMatchObject({ status: "pending", attempts: 1 });
      await gateAdminService.voidStamp(m.id, c, user, "manager", "impRelease", "Wrong pallet");
      expect((await shipmentOutboxRepository.forMovement(m.id, c)).find((r) => r.id === row.id)!.status).toBe("cancelled");
      await expect(shipmentOutboxRepository.sentReleasedDays(c, m.id, shipmentId)).resolves.toEqual([row.payload.warehouseReleasedDate]);
      await expect(gateMovementService.stamp(m.id, c, user, "impRelease", "user")).rejects.toThrow(/A manager can release it with a reason$/);
      expect((await gateMovementService.get(m.id, c)).events.some((e) => e.kind === "releasedInShipments")).toBe(false);
    } finally {
      vi.mocked(shipments.shipmentUpdate).mockImplementation(async () => ({}) as never);
      releaseChecks.delete(shipmentId);
      releasedInShipmentsOf.delete(shipmentId);
    }
  });

  it("does not say on a void that the day was set from the stamp when the release kept the day set in Shipments (review)", async () => {
    const c = company();
    const shipmentId = randomUUID();
    const m = await linkedOutbound(c, shipmentId);
    // Empty when the release is stamped; set in Shipments before the row is delivered, and kept.
    const read = vi.spyOn(shipments, "_internalWarehouseReleasedOf").mockImplementationOnce(async () => {
      releasedInShipmentsOf.set(shipmentId, { date: "2026-11-18", by: "eva@firma.cz" });
      return { warehouseReleased: null };
    });
    try {
      await gateMovementService.stamp(m.id, c, user, "impRelease", "user");
      expect((await shipmentOutboxRepository.forMovement(m.id, c)).find((r) => r.kind === "released")!.payload.dayKept).toBe("true");
      const { notice, movement } = await gateAdminService.voidStamp(m.id, c, user, "manager", "impRelease", "Wrong pallet");
      expect(notice).not.toMatch(/warehouse released date/);
      expect(movement.events.some((e) => e.kind === "shipmentMayNeedCorrecting" && /warehouse released date/.test(e.detail ?? ""))).toBe(false);
    } finally {
      read.mockRestore();
      releasedInShipmentsOf.delete(shipmentId);
    }
  });

  it("names the override recorded on the shipment when a release on prepayment is voided", async () => {
    const c = company();
    const shipmentId = randomUUID();
    const m = await linkedOutbound(c, shipmentId);
    releaseChecks.set(shipmentId, { prepaymentUnpaid: true, unpaid: [{ number: "FV2026001", leftToPay: 1200, currency: "EUR" }] });
    try {
      await gateMovementService.stamp(m.id, c, user, "impRelease", "manager", { paymentOverrideReason: "Paid in cash at the gate" });
      const { notice, movement } = await gateAdminService.voidStamp(m.id, c, user, "manager", "impRelease", "Wrong pallet");
      expect(notice).toMatch(/the release on prepayment recorded from this stamp \(reason: Paid in cash at the gate\) stays in its history/);
      expect(movement.events.find((e) => e.kind === "shipmentMayNeedCorrecting")?.detail).toMatch(/^its warehouse released date was set from this stamp .*; the release on prepayment recorded/);
    } finally {
      releaseChecks.delete(shipmentId);
    }
  });

  it("records an override once however often its outbox row is delivered (idempotency key)", async () => {
    const c = company();
    const shipmentId = randomUUID();
    const m = await linkedOutbound(c, shipmentId);
    releaseChecks.set(shipmentId, { prepaymentUnpaid: true, unpaid: [{ number: "FV2026001", leftToPay: 1200, currency: "EUR" }] });
    try {
      await gateMovementService.stamp(m.id, c, user, "impRelease", "manager", { paymentOverrideReason: "Paid in cash at the gate" });
      const row = (await shipmentOutboxRepository.forMovement(m.id, c)).find((r) => r.kind === "override")!;
      expect(overrideKeys).toContain(row.id);
      // Delivered again (a claim that outlived its run, or "Send again"): Shipments records nothing more.
      await db.update(shipmentOutboxTable).set({ status: "pending", nextAttemptAt: new Date(0), lockedUntil: null }).where(eq(shipmentOutboxTable.id, row.id));
      await deliverDue(m.id);
      expect(shipmentOverrides.filter((o) => o.shipmentId === shipmentId)).toHaveLength(1);
    } finally {
      releaseChecks.delete(shipmentId);
    }
  });

  it("shows an approval Shipments did not give back as not sent, never as sent", async () => {
    const c = company();
    const shipmentId = randomUUID();
    const m = await linkedOutbound(c, shipmentId);
    releaseChecks.set(shipmentId, { prepaymentUnpaid: true, unpaid: [{ number: "FV2026001", leftToPay: 1200, currency: "EUR" }] });
    const requestId = randomUUID();
    releasePasses.set(shipmentId, { requestId, reason: "Asked by Jan: x — approved by Eva: y" });
    passesNotGivenBack.add(requestId);
    try {
      const lost = vi.spyOn(gateMovementRepository, "conditionalUpdate").mockResolvedValueOnce(null);
      await expect(gateMovementService.stamp(m.id, c, user, "impRelease")).rejects.toThrow();
      lost.mockRestore();
      const back = (await shipmentOutboxRepository.forMovement(m.id, c)).find((r) => r.kind === "passBack")!;
      expect(back.status).toBe("failed");
      expect((await gateMovementService.get(m.id, c)).events.some((e) => e.kind === "shipmentUpdateFailed" && e.label === "Shipment not updated: approval given back")).toBe(true);
    } finally {
      releaseChecks.delete(shipmentId);
      releasePasses.delete(shipmentId);
      passesNotGivenBack.delete(requestId);
    }
  });

  it("does not stop a paid job, nor record a reason sent with it", async () => {
    const c = company();
    const shipmentId = randomUUID();
    const m = await linkedOutbound(c, shipmentId);
    const released = await gateMovementService.stamp(m.id, c, user, "impRelease", "user", { paymentOverrideReason: "not needed" });
    expect(released.impRelease).not.toBeNull();
    expect(released.events.some((e) => e.kind === "paymentOverride")).toBe(false);
  });

  it("clears the customs line of the release gate only when customs is released", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091606", visit: "výdej", handling: "Export", mrn: "26CZ2" });
    expect(m.customsStatus).toBe("Waiting For Commercial Paperwork");
    expect(m.releaseGates.find((g) => g.g === "Customs")!.s).toBe("Pending");
    expect(m.armed).toBe(false);
    const cleared = await gateMovementService.update(m.id, c, user, { customsStatus: "Customs Cleared/Released" });
    expect(cleared.releaseGates.find((g) => g.g === "Customs")).toEqual({ g: "Customs", s: "OK", note: "released" });
    expect(cleared.armed).toBe(true);
    const back = await gateMovementService.update(m.id, c, user, { customsStatus: "Under Customs Clearance" });
    expect(back.armed).toBe(false);
  });

  it("lets outgoing cargo leave only through WH release", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091620", visit: "výdej", mrn: "26CZ3" });
    await expect(gateMovementService.stamp(m.id, c, user, "gateOut")).rejects.toThrow(/WH release first/);
    await gateMovementRepository.update(m.id, c, { releaseGates: allOk(m.releaseGates) });
    // Armed but not released yet: still only through the release.
    await expect(gateMovementService.stamp(m.id, c, user, "gateOut")).rejects.toThrow(/WH release first/);
    expect((await gateMovementService.get(m.id, c)).gateOut).toBeNull();
    // Incoming cargo: the truck leaves on its own gate-out.
    const inc = await gateMovementService.create(c, user, { gateRef: "WCZ2026091621", visit: "příjem" });
    expect((await gateMovementService.stamp(inc.id, c, user, "gateOut")).gateOut).not.toBeNull();
  });

  it("checks the release gates at the moment of the release, not at load", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091622", visit: "výdej", mrn: "26CZ4" });
    // The row looks armed when loaded, but its gates change before the UPDATE runs.
    await gateMovementRepository.update(m.id, c, { releaseGates: allOk(m.releaseGates) });
    const load = gateMovementRepository.findById.bind(gateMovementRepository);
    const spy = vi.spyOn(gateMovementRepository, "findById").mockImplementationOnce(async (...args) => {
      const row = await load(...args);
      await gateMovementRepository.update(m.id, c, { releaseGates: m.releaseGates });
      return row;
    });
    await expect(gateMovementService.stamp(m.id, c, user, "impRelease")).rejects.toThrow(/NOT armed/);
    spy.mockRestore();
    expect((await gateMovementService.get(m.id, c)).impRelease).toBeNull();
  });

  it("does not let an export stamp undo a refusal", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091623", handling: "Export" });
    await gateMovementService.refuse(m.id, c, user, "wrong cargo");
    expect((await gateMovementService.stamp(m.id, c, user, "expDraft")).status).toBe("Refused");
  });

  it("keeps the export draft when the receipt is confirmed", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091602", handling: "Export" });
    await expect(gateMovementService.stamp(m.id, c, user, "expReceipt")).rejects.toThrow(/draft/);
    const draft = await gateMovementService.stamp(m.id, c, user, "expDraft");
    expect(draft.status).toBe("In Warehouse");
    // The draft receipt is the first arrival stamp, so it stamps gate-in too.
    expect(draft.gateIn).toBe(draft.expDraft);
    // LCL cargo is re-weighed before its receipt.
    await reweighService.record(m.id, c, user, { weighedKg: 500 });
    const receipt = await gateMovementService.stamp(m.id, c, user, "expReceipt");
    expect(receipt.status).toBe("In Warehouse");
    expect(receipt.expDraft).toBe(draft.expDraft);
    expect(receipt.gateIn).toBe(draft.gateIn);
    expect(receipt.events.map((e) => e.kind)).toEqual(["created", "gateIn", "expDraft", "reweighed", "expReceipt"]);
  });

  it("does not let the general update change status, release gates or the override", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091613", visit: "výdej" });
    const saved = await gateMovementService.update(m.id, c, user, {
      status: "Released",
      releaseGates: allOk(m.releaseGates),
      releaseStatus: "Released",
      overridden: true,
      note: "kept",
    } as never);
    expect(saved).toMatchObject({ status: m.status, releaseGates: m.releaseGates, overridden: false, armed: false, note: "kept" });
    expect(saved).not.toHaveProperty("releaseStatus");
  });

  it("requires a reason to refuse and to override; override re-arms a refused row", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091603", visit: "výdej", plate: "3AB 1234" });
    await expect(gateMovementService.refuse(m.id, c, user, "  ")).rejects.toThrow(/reason/);
    const refused = await gateMovementService.refuse(m.id, c, user, "customs not discharged");
    expect(refused).toMatchObject({ status: "Refused", armed: false });
    expect(refused.refusalLog).toMatch(/plate 3AB 1234 · REFUSED: customs not discharged/);

    await expect(gateMovementService.override(m.id, c, user, "")).rejects.toThrow(/reason/);
    const overridden = await gateMovementService.override(m.id, c, user, "duty paid, papers on the way");
    expect(overridden).toMatchObject({ status: "In Warehouse", overridden: true, armed: true });
    expect(overridden.overrideLog).toMatch(/gates at moment of override: .*reason: duty paid/);
  });

  it("verifies the PIN without revealing it and locks after three misses", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091604", visit: "výdej", pin: "4471" });
    expect(m.hasPin).toBe(true);
    expect(JSON.stringify(m)).not.toContain("4471");
    expect(await gateMovementService.verifyPin(m.id, c, user, "4471")).toEqual({ result: "match", tries: 0 });
    expect((await gateMovementService.verifyPin(m.id, c, user, "0000")).result).toBe("no_match");
    expect((await gateMovementService.verifyPin(m.id, c, user, "0000")).result).toBe("no_match");
    expect(await gateMovementService.verifyPin(m.id, c, user, "0000")).toEqual({ result: "locked", tries: 3 });
    expect((await gateMovementService.verifyPin(m.id, c, user, "4471")).result).toBe("locked");
    expect((await gateMovementService.get(m.id, c)).pinLocked).toBe(true);
  });

  it("creates walk-ins unlinked with no pre-advice and a gate-in time", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { walkIn: true, plate: "9C8 1122", colli: 3 });
    expect(m).toMatchObject({ gateRef: "— walk-in", status: "Expected", customer: "(unknown — no pre-advice)", positionRef: "", warehouseTaskId: null });
    expect(m.gateIn).not.toBeNull();
    await expect(gateMovementService.create(c, user, { plate: "X" })).rejects.toThrow(/Gate ref is required/);
  });

  it("keeps companies apart", async () => {
    const m = await gateMovementService.create(company(), user, { gateRef: "WCZ2026091605" });
    await expect(gateMovementService.get(m.id, company())).rejects.toThrow(/not found/);
  });
});

describe("direction", () => {
  it("moves the gate visit with the trade direction until the first stamp, then locks", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091640", visit: "výdej", handling: "Import" });
    const flipped = await gateMovementService.update(m.id, c, user, { handling: "Export" });
    expect(flipped).toMatchObject({ handling: "Export", visit: "příjem" });
    const back = await gateMovementService.update(m.id, c, user, { visit: "výdej" });
    expect(back).toMatchObject({ handling: "Import", visit: "výdej" });
    await gateMovementService.stamp(m.id, c, user, "gateIn");
    await expect(gateMovementService.update(m.id, c, user, { handling: "Export" })).rejects.toThrow(/cannot change/);
  });
});

describe("release gate lines", () => {
  it("arms an import release once every line is ticked, and logs each tick", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091630", visit: "výdej", handling: "Import", mrn: "26CZ9" });
    await gateMovementService.update(m.id, c, user, { customsStatus: "Customs Cleared/Released" });
    expect((await gateMovementService.get(m.id, c)).armed).toBe(false);
    const ticked = await gateMovementService.setReleaseGate(m.id, c, user, "B/L / release order", true);
    expect(ticked.releaseGates.find((g) => g.g === "B/L / release order")!.s).toBe("OK");
    expect(ticked.armed).toBe(true);
    expect(ticked.events.filter((e) => e.kind === "releaseGate").map((e) => e.label)).toEqual(["B/L / release order: OK"]);
    const back = await gateMovementService.setReleaseGate(m.id, c, user, "B/L / release order", false);
    expect(back.armed).toBe(false);
  });

  it("never ticks Customs by hand, nor lines after release", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091631", visit: "výdej", handling: "Import", mrn: "26CZ10" });
    await expect(gateMovementService.setReleaseGate(m.id, c, user, "Customs", true)).rejects.toThrow(/customs status/);
    await expect(gateMovementService.setReleaseGate(m.id, c, user, "No such gate", true)).rejects.toThrow(/No release gate/);
    await gateMovementRepository.update(m.id, c, { releaseGates: allOk(m.releaseGates) });
    await gateMovementService.stamp(m.id, c, user, "impRelease");
    await expect(gateMovementService.setReleaseGate(m.id, c, user, "Charges", false)).rejects.toThrow(/already released/);
  });

  it("keeps both changes when two lines are ticked at the same time", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091632", visit: "výdej", handling: "Import", operationType: "FCL stripping", mrn: "26CZ11" });
    const pending = m.releaseGates.filter((g) => g.s === "Pending" && g.g !== "Customs").map((g) => g.g);
    const results = await Promise.allSettled(pending.map((g) => gateMovementService.setReleaseGate(m.id, c, user, g, true)));
    // A tick that lost the race is refused, never silently dropped: retry those and all land.
    for (const [i, r] of results.entries()) if (r.status === "rejected") await gateMovementService.setReleaseGate(m.id, c, user, pending[i]!, true);
    const after = await gateMovementService.get(m.id, c);
    expect(after.releaseGates.filter((g) => pending.includes(g.g)).every((g) => g.s === "OK")).toBe(true);
    expect(after.events.filter((e) => e.kind === "releaseGate")).toHaveLength(pending.length);
  });
});

describe("parallel gate actions", () => {
  it("stamps gate-in once when ten clerks press it at the same time", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091614" });
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => gateMovementService.stamp(m.id, c, user, "gateIn")));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected).toHaveLength(9);
    expect(rejected.every((r) => /already/.test(String(r.reason)))).toBe(true);
    expect((await gateMovementService.get(m.id, c)).events.filter((e) => e.kind === "gateIn")).toHaveLength(1);
  });

  it("gives parallel wrong PINs no more than three tries and logs the lock once", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091615", visit: "výdej", pin: "4471" });
    const results = await Promise.all(Array.from({ length: 10 }, () => gateMovementService.verifyPin(m.id, c, user, "0000")));
    expect(results.filter((r) => r.result === "no_match")).toHaveLength(2);
    expect(results.filter((r) => r.result === "locked")).toHaveLength(8);
    const after = await gateMovementService.get(m.id, c);
    expect(after.pinTries).toBe(3);
    expect(after.events.filter((e) => e.kind === "pinLocked")).toHaveLength(1);
    expect((await gateMovementService.verifyPin(m.id, c, user, "4471")).result).toBe("locked");
  });

  it("does not report a lock while a right PIN only holds a try for a moment", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091624", visit: "výdej", pin: "4471" });
    expect((await gateMovementService.verifyPin(m.id, c, user, "0000")).result).toBe("no_match");
    expect((await gateMovementService.verifyPin(m.id, c, user, "0000")).result).toBe("no_match");
    const results = await Promise.all(Array.from({ length: 4 }, () => gateMovementService.verifyPin(m.id, c, user, "4471")));
    expect(results.every((r) => r.result === "match")).toBe(true);
    expect((await gateMovementService.get(m.id, c)).pinTries).toBe(2);
  });

  it("refuses once when five refusals arrive together", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091616", visit: "výdej" });
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => gateMovementService.refuse(m.id, c, user, "no papers")));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await gateMovementService.get(m.id, c)).events.filter((e) => e.kind === "refused")).toHaveLength(1);
  });

  it("keeps surveys of different containers saved at the same time", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091617", colli: 5 });
    const base = { phase: "Receipt — survey on gate in", damaged: 0, lost: 0, lines: [], driverNote: "", warehouseNote: "" };
    await Promise.all(["A", "B", "C", "D"].map((container) => gateMovementService.saveSurvey(m.id, c, user, { ...base, container })));
    expect((await gateMovementService.get(m.id, c)).surveys.map((s) => s.container).sort()).toEqual(["A", "B", "C", "D"]);
  });
});

describe("warehouse tasks in the gate log", () => {
  it("gives every imported shipment exactly one gate row, made with the position", async () => {
    const c = company();
    const shipmentId = randomUUID();
    const [r] = await warehouseImportService.importShipments(c, user, [shipmentId]);
    expect(r).toMatchObject({ outcome: "created", ref: expect.stringMatching(/^WCZ\d{4}000001$/) });
    const manual = await gateMovementService.create(c, user, { gateRef: "manual" });

    const first = await gateMovementService.list(c);
    const row = first.find((m) => m.warehouseTaskId === r!.taskId);
    expect(row).toMatchObject({ id: r!.movementId, gateRef: r!.ref, positionRef: r!.ref, shipmentId, status: "Expected", visit: "výdej", handling: "Import" });
    // Linked outbound: the release also waits for the pick-up PIN from Shipments.
    expect(row!.releaseGates.filter((g) => g.g === "Pick-up PIN verified")).toEqual([{ g: "Pick-up PIN verified", s: "Pending", note: "waiting for the driver's PIN" }]);
    expect(first.map((m) => m.id)).toContain(manual.id);

    await Promise.all([warehouseImportService.importShipments(c, user, [shipmentId]), warehouseImportService.importShipments(c, user, [shipmentId])]);
    expect((await gateMovementService.list(c)).filter((m) => m.shipmentId === shipmentId)).toHaveLength(1);
  });

  it("no longer makes gate rows while listing", async () => {
    const c = company();
    const { task } = await warehouseTaskRepository.createForShipment(c, randomUUID());
    expect((await gateMovementService.list(c)).some((m) => m.warehouseTaskId === task.id)).toBe(false);
  });

  it("archives the gate rows with their position: any user without stamps, a manager with a reason otherwise", async () => {
    const c = company();
    const [a, b] = await warehouseImportService.importShipments(c, user, [randomUUID(), randomUUID()]);
    await gateMovementService.stamp(b!.movementId!, c, user, "gateIn");

    await gateAdminService.removePosition(a!.taskId!, c, user, "user");
    await expect(gateAdminService.removePosition(b!.taskId!, c, user, "user", "wrong job")).rejects.toThrow(/only a manager/);
    await expect(gateAdminService.removePosition(b!.taskId!, c, user, "manager")).rejects.toThrow(/reason is required/);
    await gateAdminService.removePosition(b!.taskId!, c, user, "manager", "imported by mistake");

    const live = await gateMovementService.list(c);
    expect(live.some((m) => m.id === a!.movementId || m.id === b!.movementId)).toBe(false);
    const archived = await gateMovementService.list(c, { archived: true });
    expect(archived.find((m) => m.id === a!.movementId)).toMatchObject({ archiveReason: "Removed with its position", positionRef: a!.ref });
    expect(archived.find((m) => m.id === b!.movementId)).toMatchObject({ archiveReason: "imported by mistake", status: "In Warehouse" });
    expect((await gateMovementService.get(b!.movementId!, c)).archivedAt).not.toBeNull();
  });
});

describe("gate movement detail", () => {
  it("keeps the three transport legs and copies the gate leg to carrier / driver / plate", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091607", visit: "příjem" });
    expect(m.transportLegs.map((l) => l.leg)).toEqual(["IN", "OUT", "CFS"]);
    const saved = await gateMovementService.update(m.id, c, user, {
      transportLegs: [{ leg: "IN", company: "Pepa Transport s.r.o.", plate: "1A1 1122", driver: "Josef Svoboda", phone: "+420 777 111 222", gateTime: "" }],
    });
    expect(saved.transportLegs).toHaveLength(3);
    expect(saved).toMatchObject({ carrier: "Pepa Transport s.r.o.", plate: "1A1 1122", driver: "Josef Svoboda" });
    expect(saved.transportLegs.find((l) => l.leg === "IN")!.phone).toBe("+420 777 111 222");
  });

  it("limits sub-positions to ten, clears the VGM date when VGM is off and upgrades old drops", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091608" });
    const drop = {
      etw: "2026-08-24", qty: 2, packing: "Cartons", width: 120, length: 80, height: 145, description: "Electronic components",
      weight: 3900, measure: 4.2, totalGross: 3960, plate: "1A1 1122", driver: "Josef Svoboda", transport: "Pepa Transport s.r.o.",
      vgm: false, vgmDate: "2026-08-24", storageDays: 7,
    };
    const saved = await gateMovementService.update(m.id, c, user, { subPositions: [drop, { ...drop, vgm: true }] });
    expect(saved.subPositions.map((p) => p.vgmDate)).toEqual(["", "2026-08-24"]);
    expect(saved.subPositions[0]).toMatchObject({ width: 120, measure: 4.2, totalGross: 3960, storageDays: 7 });
    await expect(gateMovementService.update(m.id, c, user, { subPositions: Array(11).fill(drop) })).rejects.toThrow(/At most 10/);

    // A drop saved before the width / length / height columns existed.
    await gateMovementRepository.update(m.id, c, {
      subPositions: [{ qty: 1, etw: "35/2026", dimensions: "80 × 60 × 90 cm", whDate: "" } as never],
    });
    expect((await gateMovementService.get(m.id, c)).subPositions[0]).toMatchObject({ qty: 1, etw: "", width: null, measure: null, vgm: false });
  });

  it("saves one survey per container with its lines, capped to the pieces on the movement", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091609", colli: 5 });
    const line = { qty: 5, outerPacking: "Cartons", visual: ["Broken", "Dented"], inner: ["Not visible"] };
    const base = { phase: "Receipt — survey on gate in", lines: [line], driverNote: "", warehouseNote: "" };
    await gateMovementService.saveSurvey(m.id, c, user, { ...base, container: "MSKU 123456-7", damaged: 9, lost: 0 });
    await gateMovementService.saveSurvey(m.id, c, user, { ...base, container: "TCLU 765432-1", damaged: 1, lost: 1 });
    const again = await gateMovementService.saveSurvey(m.id, c, user, {
      ...base,
      container: "MSKU 123456-7",
      damaged: 2,
      lost: 0,
      lines: [line, { qty: 2, outerPacking: "Pallets", visual: [], inner: [] }],
    });
    expect(again.surveys).toHaveLength(2);
    expect(again.surveys.find((s) => s.container === "MSKU 123456-7")).toMatchObject({ damaged: 2, lines: [line, { qty: 2, outerPacking: "Pallets" }] });
    expect(again.surveys.every((s) => !!s.surveyedAt)).toBe(true);
    const capped = await gateMovementService.saveSurvey(m.id, c, user, { ...base, container: "X", damaged: 9, lost: -1, lines: [] });
    expect(capped.surveys.find((s) => s.container === "X")).toMatchObject({ damaged: 5, lost: 0, lines: [{ qty: null, outerPacking: "", visual: [], inner: [] }] });
  });

  it("keeps the receipt and the release survey of a container apart", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091618", colli: 4 });
    const base = { container: "MSKU 123456-7", lost: 0, lines: [], driverNote: "", warehouseNote: "" };
    await gateMovementService.saveSurvey(m.id, c, user, { ...base, phase: "Receipt — survey on gate in", damaged: 1 });
    await gateMovementService.saveSurvey(m.id, c, user, { ...base, phase: "Release — survey on gate out", damaged: 2 });
    const again = await gateMovementService.saveSurvey(m.id, c, user, { ...base, phase: "Release — survey on gate out", damaged: 3 });
    expect(again.surveys.map((s) => [s.phase, s.damaged])).toEqual([
      ["Receipt — survey on gate in", 1],
      ["Release — survey on gate out", 3],
    ]);
    await expect(gateMovementService.saveSurvey(m.id, c, user, { ...base, phase: "Both", damaged: 0 })).rejects.toThrow(/phase/);
  });

  it("records damage when the pieces on the movement are not known", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091619" });
    const saved = await gateMovementService.saveSurvey(m.id, c, user, {
      container: "", phase: "Receipt — survey on gate in", damaged: 3, lost: 1.7, lines: [], driverNote: "", warehouseNote: "",
    });
    expect(saved.surveys[0]).toMatchObject({ damaged: 3, lost: 1 });
  });

  it("reads a survey saved before survey lines as one line", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091611" });
    await gateMovementRepository.update(m.id, c, {
      surveys: [{ container: "", phase: "Both", damaged: 0, lost: 0, outerPacking: "Case", visual: ["Wet"], inner: [], driverNote: "", warehouseNote: "", surveyedAt: "x", surveyedBy: "" } as never],
    });
    expect((await gateMovementService.get(m.id, c)).surveys[0]!.lines).toEqual([{ qty: null, outerPacking: "Case", visual: ["Wet"], inner: [] }]);
  });

  it("clears the UN number when the cargo is no longer dangerous", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091612" });
    const dg = await gateMovementService.update(m.id, c, user, { dangerousGoods: true, unNumber: "UN 1263" });
    expect(dg.unNumber).toBe("UN 1263");
    expect((await gateMovementService.update(m.id, c, user, { dangerousGoods: false })).unNumber).toBe("");
  });
});

describe("standalone warehouse positions", () => {
  it("get their own WCZ reference and gate row without a shipment, in one go", async () => {
    const c = company();
    const { task, movement } = await warehouseImportService.createPosition(c, user, { customer: "Alpine Trading", handling: "Export" });
    expect(task).toMatchObject({ taskId: expect.stringMatching(/^WCZ\d{4}000001$/), shipmentId: null });
    expect(movement).toMatchObject({ gateRef: task.taskId, positionRef: task.taskId, customer: "Alpine Trading", visit: "příjem", shipmentId: null });

    const second = await warehouseImportService.createPosition(c, user, {});
    expect(second.task.taskId).toMatch(/000002$/);
    expect(second.movement.visit).toBe("výdej");
    const rows = await gateMovementService.list(c);
    expect(rows.filter((m) => m.warehouseTaskId === task.id)).toHaveLength(1);
  });

  it("uses no reference when the gate record cannot be made", async () => {
    const c = company();
    const spy = vi.spyOn(gateMovementRepository, "create").mockRejectedValueOnce(new Error("insert failed"));
    await expect(warehouseImportService.createPosition(c, user, { customer: "X" })).rejects.toThrow(/insert failed/);
    spy.mockRestore();
    expect((await warehouseImportService.createPosition(c, user, {})).task.taskId).toMatch(/000001$/);
    expect(await warehouseTaskRepository.listAll(c)).toHaveLength(1);
  });
});

describe("label prints", () => {
  it("logs the first print as printed and every later one as reprinted, changing nothing else", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091630", visit: "výdej" });
    const first = await gateMovementService.labelPrinted(m.id, c, user, 1);
    const second = await gateMovementService.labelPrinted(m.id, c, user, 12);
    expect(second.events.filter((e) => e.kind === "labelPrinted").map((e) => [e.label, e.detail])).toEqual([
      ["Label printed", "1 label"],
      ["Label reprinted", "12 labels"],
    ]);
    expect(first.events.at(-1)!.label).toBe("Label printed");
    const { events: _e, updatedAt: _u, ...before } = m;
    const { events: _e2, updatedAt: _u2, ...after } = second;
    expect(after).toEqual(before);
  });

  it("keeps every event when ten prints arrive together", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091631" });
    await Promise.all(Array.from({ length: 10 }, () => gateMovementService.labelPrinted(m.id, c, user, 2)));
    const prints = (await gateMovementService.get(m.id, c)).events.filter((e) => e.kind === "labelPrinted");
    expect(prints).toHaveLength(10);
    expect(prints.filter((e) => e.label === "Label printed").length).toBeGreaterThanOrEqual(1);
  });

  it("rejects copies outside 1–500 and rows that are gone", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091632" });
    for (const copies of [0, 501, 1.5, -1]) {
      await expect(gateMovementService.labelPrinted(m.id, c, user, copies)).rejects.toThrow(/whole number/);
    }
    await gateMovementService.remove(m.id, c, user);
    await expect(gateMovementService.labelPrinted(m.id, c, user, 1)).rejects.toThrow(/not found/);
    await expect(gateMovementService.labelPrinted(m.id, company(), user, 1)).rejects.toThrow(/not found/);
  });
});

describe("shipment link on the gate row", () => {
  it("carries the shipment id of a linked task and null otherwise", async () => {
    const c = company();
    const shipmentId = randomUUID();
    const [r] = await warehouseImportService.importShipments(c, user, [shipmentId]);
    const linked = (await gateMovementService.list(c)).find((m) => m.warehouseTaskId === r!.taskId)!;
    expect(linked.shipmentId).toBe(shipmentId);
    expect((await gateMovementService.get(linked.id, c)).shipmentId).toBe(shipmentId);
    const walkIn = await gateMovementService.create(c, user, { gateRef: "WCZ2026091633" });
    expect(walkIn.shipmentId).toBeNull();
  });
});

import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { gateMovementService } from "../services/gateMovement.service";
import { gateFileService } from "../services/gateFile.service";
import { reweighService } from "../services/reweigh.service";
import { warehouseService } from "../services/warehouse.service";
import { warehouseImportService } from "../services/warehouseImport.service";
import { gateMovementRepository } from "../repositories/gateMovement.repository";
import { settingsService } from "../services/settings.service";
import { emailSupplierService } from "../services/emailSupplier.service";
import type { SupplierMail, SupplierMailResult } from "../services/emailSender";
import { shipmentData } from "./shipmentFakes";

// Supplier e-mail (Send VGM / Survey / Remeasurement). Needs migration 0018 (warehouse_settings,
// warehouse_supplier_email). The provider is never called: the sender is mocked.
const mail = vi.hoisted(() => ({
  result: { sent: true, error: "", providerId: "em_1" } as SupplierMailResult,
  calls: [] as SupplierMail[],
  delayMs: 0,
}));
vi.mock("../services/emailSender", () => ({
  NO_KEY_TEXT: "E-mail sending is off — no Resend API key is set on this server",
  emailConfigured: () => false,
  sendSupplierMail: vi.fn(async (m: SupplierMail) => {
    mail.calls.push(m);
    if (mail.delayMs) await new Promise((r) => setTimeout(r, mail.delayMs));
    return mail.result;
  }),
}));

const user = randomUUID();
vi.mock("~encore/clients", async () => {
  const { getShipment } = await import("./shipmentFakes");
  return {
    shipments: { shipmentUpdate: vi.fn(async () => ({})), shipmentGet: vi.fn(getShipment) },
    auth: { usersList: vi.fn(async () => ({ users: [{ id: user, email: "jana@wh.cz", displayName: "Jana Nováková", role: "manager" }] })) },
  };
});

beforeEach(() => {
  mail.result = { sent: true, error: "", providerId: "em_1" };
  mail.calls = [];
  mail.delayMs = 0;
});

// An inbound LCL position linked to a shipment declaring 1.2 t, gated in.
async function position() {
  const c = randomUUID();
  const shipmentId = randomUUID();
  shipmentData.set(shipmentId, { totalWeightTons: "1.2", pcs: "10", totalVolumeCbm: "9.5" } as never);
  const [r] = await warehouseImportService.importShipments(c, user, [shipmentId]);
  const id = r!.movementId!;
  await gateMovementRepository.update(id, c, { visit: "příjem", handling: "Export", operationType: "LCL consolidation", weightKg: 1000, colli: 10 });
  await gateMovementService.stamp(id, c, user, "gateIn");
  const m = await gateMovementService.get(id, c);
  return { c, id, taskId: r!.taskId!, ref: m.positionRef ?? "", jobNumber: m.jobNumber };
}

const turnOn = (c: string, kind: "vgm" | "survey" | "remeasurement", to = ["ops@supplier.cz"], cc: string[] = []) =>
  settingsService.update(c, user, "manager", 0, { supplierEmail: { [kind]: { enabled: true, to, cc } } });

const sectionData = async (taskId: string, c: string) => ((await warehouseService.getSectionByTask(taskId, "job", c))?.data ?? {}) as Record<string, unknown>;

describe("supplier e-mail — not set up", () => {
  it("refuses when the type is off or has no recipients, and marks nothing", async () => {
    const { c, taskId } = await position();
    await expect(emailSupplierService.send(taskId, "vgm", "", randomUUID(), c, user)).rejects.toThrow(/Not set up — recorded only/);
    await settingsService.update(c, user, "manager", 0, { supplierEmail: { vgm: { enabled: false, to: ["ops@supplier.cz"], cc: [] } } });
    await expect(emailSupplierService.preview(taskId, "vgm", "", c, user)).rejects.toThrow(/Not set up/);
    expect(mail.calls).toHaveLength(0);
    expect((await sectionData(taskId, c)).vgm_sent).toBeUndefined();
    // "Mark as sent" (record only) keeps working.
    await warehouseService.markSent(taskId, "vgm", "by phone", c, user);
    expect((await sectionData(taskId, c)).vgm_sent).toBeDefined();
  });

  it("refuses an unknown type and a send without a request id", async () => {
    const { c, taskId } = await position();
    await turnOn(c, "vgm");
    await expect(emailSupplierService.send(taskId, "invoice", "", randomUUID(), c, user)).rejects.toThrow(/must be one of/);
    await expect(emailSupplierService.send(taskId, "vgm", "", "", c, user)).rejects.toThrow(/clientRequestId is required/);
  });
});

describe("supplier e-mail — VGM", () => {
  it("e-mails the re-weighed weight vs declared and only then marks as sent, with the recipients", async () => {
    const { c, id, taskId, ref, jobNumber } = await position();
    await reweighService.record(id, c, user, { weighedKg: 1290 });
    await turnOn(c, "vgm", ["ops@supplier.cz", "b@supplier.cz"], ["cc@cto.cz"]);

    const preview = await emailSupplierService.preview(taskId, "vgm", "please update", c, user);
    expect(preview.subject).toBe(`VGM — ${ref} · Job no. ${jobNumber}`);
    expect(preview.text).toContain("Re-weighed gross weight: 1 290 kg");
    expect(mail.calls).toHaveLength(0);

    const res = await emailSupplierService.send(taskId, "vgm", "please update", randomUUID(), c, user);
    expect(mail.calls).toHaveLength(1);
    const sent = mail.calls[0]!;
    expect(sent).toMatchObject({ to: ["ops@supplier.cz", "b@supplier.cz"], cc: ["cc@cto.cz"], replyTo: "jana@wh.cz", subject: `VGM — ${ref} · Job no. ${jobNumber}` });
    expect(sent.text).toContain("Declared gross weight: 1 200 kg (from the shipment)");
    expect(sent.text).toContain("(+7.5 %) — more than 5 %");
    expect(sent.text).toContain(`Warehouse ref.: ${ref}`);
    expect(sent.idempotencyKey).toMatch(/^warehouse-supplier-/);

    const data = res.section.data as Record<string, unknown>;
    expect(JSON.parse(data.vgm_sent as string)).toMatchObject({ note: "please update", by: "Jana Nováková", weighedKg: "1290", emailedTo: "ops@supplier.cz; b@supplier.cz", cc: "cc@cto.cz", emailId: "em_1" });
    expect((data.vgm_sent_history as Record<string, string>[]).at(-1)).toMatchObject({ emailedTo: "ops@supplier.cz; b@supplier.cz", attachments: "0" });
    expect(res.email).toMatchObject({ status: "sent", to: ["ops@supplier.cz", "b@supplier.cz"] });
    const last = (await gateMovementService.get(id, c)).events.at(-1)!;
    expect(last).toMatchObject({ kind: "sectionSent", label: "Shipment Details: VGM e-mailed to ops@supplier.cz, b@supplier.cz (Cc cc@cto.cz) (re-weighed 1 290 kg)" });
    expect((await emailSupplierService.list(taskId, c))[0]).toMatchObject({ status: "sent", requestedBy: "Jana Nováková" });
  });

  it("a failed send is not marked as sent, is logged and can be retried", async () => {
    const { c, id, taskId } = await position();
    await turnOn(c, "vgm");
    mail.result = { sent: false, error: "E-mail sending is off — no Resend API key is set on this server", providerId: "" };
    await expect(emailSupplierService.send(taskId, "vgm", "", randomUUID(), c, user)).rejects.toThrow(
      "VGM not e-mailed: E-mail sending is off — no Resend API key is set on this server — nothing was marked as sent",
    );
    expect((await sectionData(taskId, c)).vgm_sent).toBeUndefined();
    expect((await gateMovementService.get(id, c)).events.at(-1)).toMatchObject({ kind: "supplierEmailFailed", label: expect.stringMatching(/^Shipment Details: VGM e-mail failed — E-mail sending is off/) });
    expect((await emailSupplierService.list(taskId, c))[0]).toMatchObject({ status: "failed", error: expect.stringMatching(/no Resend API key/) });

    // Retry (a new request id) once the provider takes it.
    mail.result = { sent: true, error: "", providerId: "em_2" };
    await emailSupplierService.send(taskId, "vgm", "", randomUUID(), c, user);
    expect(JSON.parse((await sectionData(taskId, c)).vgm_sent as string)).toMatchObject({ emailId: "em_2" });
    expect((await emailSupplierService.list(taskId, c)).map((e) => e.status)).toEqual(["sent", "failed"]);
  });

  it("no answer from the provider in time: a distinct error (it may have gone out), nothing marked as sent", async () => {
    const { c, taskId } = await position();
    await turnOn(c, "vgm");
    mail.result = { sent: false, error: "The e-mail provider did not answer in time — the e-mail may still have gone out", providerId: "", timedOut: true };
    const err = await emailSupplierService.send(taskId, "vgm", "", randomUUID(), c, user).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "deadline_exceeded", message: expect.stringMatching(/check with the supplier before sending it again/) });
    expect((await sectionData(taskId, c)).vgm_sent).toBeUndefined();
    expect((await emailSupplierService.list(taskId, c))[0]).toMatchObject({ status: "failed", error: expect.stringMatching(/may still have gone out/) });
  });

  it("e-mailed but marking it as sent failed: no resend for a replay of the same request", async () => {
    const { c, taskId } = await position();
    await turnOn(c, "vgm");
    const spy = vi.spyOn(warehouseService, "markSent").mockRejectedValueOnce(new Error("database down"));
    const req = randomUUID();
    const err = await emailSupplierService.send(taskId, "vgm", "", req, c, user).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "internal", message: expect.stringMatching(/do not send it again/) });
    expect(mail.calls).toHaveLength(1);
    expect((await emailSupplierService.list(taskId, c))[0]).toMatchObject({ status: "sent", error: expect.stringMatching(/not marked as sent/) });
    const replay = await emailSupplierService.send(taskId, "vgm", "", req, c, user).catch((e: unknown) => e);
    expect(replay).toMatchObject({ code: "internal" });
    expect(mail.calls).toHaveLength(1);
    spy.mockRestore();
  });

  it("sends once for the same request id, also for a double click at the same time", async () => {
    const { c, taskId } = await position();
    await turnOn(c, "vgm");
    const req = randomUUID();
    mail.delayMs = 150;
    const results = await Promise.allSettled([
      emailSupplierService.send(taskId, "vgm", "", req, c, user),
      emailSupplierService.send(taskId, "vgm", "", req, c, user),
    ]);
    expect(mail.calls).toHaveLength(1);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const again = await emailSupplierService.send(taskId, "vgm", "", req, c, user);
    expect(again.email.status).toBe("sent");
    expect(mail.calls).toHaveLength(1);
    const hist = (await sectionData(taskId, c)).vgm_sent_history as unknown[];
    expect(hist).toHaveLength(1);
    // Another send of the same type while one is still going is refused.
    mail.delayMs = 150;
    const [a, b] = await Promise.allSettled([
      emailSupplierService.send(taskId, "vgm", "", randomUUID(), c, user),
      emailSupplierService.send(taskId, "vgm", "", randomUUID(), c, user),
    ]);
    expect([a.status, b.status].sort()).toEqual(["fulfilled", "rejected"]);
    expect(((a.status === "rejected" ? a : b) as PromiseRejectedResult).reason.message).toMatch(/being sent right now/);
  });
});

describe("supplier e-mail — Survey and Remeasurement", () => {
  it("Survey: damage / short / over and up to 5 photos attached, the rest linked or named", async () => {
    const { c, id, taskId } = await position();
    await turnOn(c, "survey");
    await gateMovementRepository.update(id, c, {
      surveys: [
        { container: "", phase: "Receipt", damaged: 1, lost: 0, lines: [{ qty: 10, outerPacking: "PLT", visual: ["Torn wrap"], inner: [] }], driverNote: "", warehouseNote: "", surveyedAt: new Date().toISOString(), surveyedBy: "Petr" },
      ],
    });
    for (let i = 0; i < 7; i++) {
      await gateFileService.upload(id, c, user, { fileName: `photo-${i}.jpg`, fileType: "image/jpeg", contentBase64: Buffer.from(`jpeg ${i}`).toString("base64") });
    }
    await gateFileService.upload(id, c, user, { fileName: "cmr.pdf", fileType: "application/pdf", contentBase64: Buffer.from("pdf").toString("base64") });
    const res = await emailSupplierService.send(taskId, "survey", "", randomUUID(), c, user);
    const sent = mail.calls[0]!;
    expect(sent.attachments).toHaveLength(5);
    expect(sent.text).toContain("Damaged: 1 · Short (lost): 0");
    expect(sent.text).toContain("Photos on file: 7");
    expect(res.email.attachments.filter((a) => a.how === "attached")).toHaveLength(5);
    expect(res.email.attachments.filter((a) => a.how !== "attached")).toHaveLength(2);
    expect(res.email.attachments.some((a) => a.fileName === "cmr.pdf")).toBe(false);
    expect((await gateMovementService.get(id, c)).events.at(-1)!.label).toBe("Shipment Details: Survey e-mailed to ops@supplier.cz (5 photos)");
  });

  it("Remeasurement: the lines and totals against declared; refused without saved lines", async () => {
    const { c, taskId } = await position();
    await turnOn(c, "remeasurement");
    await expect(emailSupplierService.send(taskId, "remeasurement", "", randomUUID(), c, user)).rejects.toThrow(/No remeasured lines/);
    await warehouseService.patchSectionByTask(taskId, "job", c, [
      { key: "remeasure_rows", value: JSON.stringify([{ pieces: "10", lengthCm: "120", widthCm: "80", heightCm: "100", weightPerPcKg: "110" }]), expected: "" },
    ], user);
    await emailSupplierService.send(taskId, "remeasurement", "", randomUUID(), c, user);
    const text = mail.calls[0]!.text;
    expect(text).toContain("1. Qty 10 · 120 × 80 × 100 cm · 110 kg per piece");
    expect(text).toContain("Remeasured total: 10 pieces · 1 100 kg · 9.600 cbm");
    expect(text).toContain("Declared (shipment): 10 pieces · 1 200 kg · 9.500 cbm");
    expect(JSON.parse((await sectionData(taskId, c)).remeasurement_sent as string)).toMatchObject({ emailedTo: "ops@supplier.cz" });
  });
});

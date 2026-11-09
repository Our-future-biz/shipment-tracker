import { beforeEach, describe, expect, it, vi } from "vitest";

// A new link where the database already keeps another live form for the shipment: the one-live-form
// index (shipment_import_instruction_live_uq) refuses it, and the repository says so instead of failing.
const transaction = vi.hoisted(() => vi.fn());
vi.mock("../../db/db", () => ({ db: { transaction } }));

import { LIVE_FORM_INDEX, shipmentImportInstructionRepository as repository } from "../../repositories/shipmentImportInstruction.repository";

const values = { companyId: "c", shipmentId: "s", tokenHash: "h", prefill: {}, createdByUserId: "u", expiresAt: new Date() } as never;
// Drizzle wraps the driver's error: the SQLSTATE and the constraint are on its cause.
const refused = (constraint: string) => Object.assign(new Error("duplicate key"), { cause: { code: "23505", constraint } });

beforeEach(() => {
  transaction.mockReset();
});

describe("replaceOpen", () => {
  it("answers null when another live form of the shipment is kept already", async () => {
    transaction.mockRejectedValue(refused(LIVE_FORM_INDEX));
    await expect(repository.replaceOpen(values)).resolves.toBeNull();
  });

  it("lets any other refusal through", async () => {
    transaction.mockRejectedValue(refused("shipment_import_instruction_token_idx"));
    await expect(repository.replaceOpen(values)).rejects.toThrow("duplicate key");
    transaction.mockRejectedValue(new Error("connection lost"));
    await expect(repository.replaceOpen(values)).rejects.toThrow("connection lost");
  });

  it("returns the new row", async () => {
    transaction.mockResolvedValue({ id: "r1" });
    await expect(repository.replaceOpen(values)).resolves.toEqual({ id: "r1" });
  });
});

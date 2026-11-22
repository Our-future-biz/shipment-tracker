import { beforeEach, describe, expect, it, vi } from "vitest";

// Review of system-22: a partial credit note request keeps what was owed on the job when it was asked (owedWhenAsked),
// read in the ask's transaction under the invoice's row lock and then the shipment's trucking-lines lock - the order an
// approval takes them - so a Trucking push or an invoice is in it or comes after it. Run against stand-ins that record
// what is done, in order; what the statements read from real rows needs a database (tests/db/truckingCredit).
const fake = vi.hoisted(() => {
  const state = { steps: [] as string[], inserted: null as Record<string, unknown> | null };
  const tx = {
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            state.steps.push("insert");
            state.inserted = values;
            return [{ id: "req1", ...values }];
          },
        }),
      }),
    }),
  };
  return { state, tx };
});
const step = (name: string, result?: unknown) =>
  vi.fn(async (...args: unknown[]) => {
    fake.state.steps.push(args[0] === fake.tx ? name : `${name} outside the transaction`);
    return result;
  });

vi.mock("../../db/db", () => ({ db: { transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(fake.tx) } }));
const owed = { id: "d1", ref: "trucking:consignment:c1:diff:1", currency: "EUR", amount: -20 };
const reads = vi.hoisted(() => ({ openCreditDiffs: vi.fn(), documentStatesOf: vi.fn(), truckingLinesLock: vi.fn(), lockInvoiceRow: vi.fn() }));
vi.mock("../../repositories/invoice.repository", () => ({ lockInvoiceRow: reads.lockInvoiceRow, invoiceRepository: { documentStatesOf: reads.documentStatesOf } }));
vi.mock("../../repositories/truckingLines.repository", () => ({ truckingLinesLock: reads.truckingLinesLock, truckingLinesRepository: { openCreditDiffs: reads.openCreditDiffs } }));

import { creditNoteRequestRepository } from "../../repositories/creditNoteRequest.repository";

const values = {
  companyId: "c1", shipmentId: "ship1", invoiceId: "inv1", invoiceNumber: "INV2026CZ00000028-001", currency: "EUR", lines: [],
  net: "50.00", vat: "0.00", gross: "50.00", invoiceGross: "363.00", reason: "Agreed discount", requestedById: "u-rep",
};

beforeEach(() => {
  fake.state.steps = [];
  fake.state.inserted = null;
  reads.lockInvoiceRow.mockImplementation(step("invoice row lock"));
  reads.truckingLinesLock.mockImplementation(step("trucking-lines lock"));
  reads.openCreditDiffs.mockImplementation(step("credits owed", new Map([["s1", [{ ...owed, updatedAt: new Date() }]]])));
  reads.documentStatesOf.mockImplementation(step("documents", [{ id: "inv1", status: "issued" }]));
});

describe("asking for a partial credit note", () => {
  it("keeps what is owed with the request, read under the invoice's lock and then the shipment's, after the guard", async () => {
    const guard = step("guard");
    await creditNoteRequestRepository.create(values, { creditedRows: ["s1"], guard: async (tx) => void (await guard(tx)) });
    expect(fake.state.steps).toEqual(["invoice row lock", "guard", "trucking-lines lock", "credits owed", "documents", "insert"]);
    expect(reads.lockInvoiceRow).toHaveBeenCalledWith(fake.tx, "c1", "inv1");
    expect(reads.truckingLinesLock).toHaveBeenCalledWith(fake.tx, "ship1");
    expect(reads.openCreditDiffs).toHaveBeenCalledWith(fake.tx, "c1", "ship1", ["s1"]);
    expect(reads.documentStatesOf).toHaveBeenCalledWith(fake.tx, "c1", "ship1");
    // What is compared, nothing more (no clock).
    expect(fake.state.inserted).toMatchObject({ ...values, owedWhenAsked: { credits: [["s1", [owed]]], documents: [{ id: "inv1", status: "issued" }] } });
  });

  it("reads nothing more and writes nothing when the guard refuses", async () => {
    const guard = vi.fn(async () => {
      throw new Error("A change of this invoice is waiting for approval");
    });
    await expect(creditNoteRequestRepository.create(values, { creditedRows: ["s1"], guard })).rejects.toThrow(/waiting for approval/);
    expect(fake.state.steps).toEqual(["invoice row lock"]);
  });

  it("keeps an empty record of what is owed when the job is owed nothing: a credit owed that comes after it makes the approval stale", async () => {
    reads.openCreditDiffs.mockImplementation(step("credits owed", new Map()));
    await creditNoteRequestRepository.create(values, { creditedRows: [] });
    expect(fake.state.inserted).toMatchObject({ owedWhenAsked: { credits: [], documents: [{ id: "inv1", status: "issued" }] } });
  });
});

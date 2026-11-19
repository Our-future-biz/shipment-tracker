import { APIError } from "encore.dev/api";
import type { Shipment } from "../services/warehouseImport.service";

// Shipments as the tests' mocked shipments service answers them. A test sets what a shipment
// looks like (`shipmentData`) or makes it fail (`failingShipments`); anything else is a blank
// import shipment. Used from the vi.mock("~encore/clients") factories.

export const shipmentData = new Map<string, Partial<Shipment>>();
export const failingShipments = new Map<string, Error>();

export function fakeShipment(id: string): Shipment {
  return {
    id,
    jobNumber: `SEA-${id.slice(0, 6)}`,
    tradeDirection: "",
    loadType: "",
    freightMode: "",
    containerNumber: "",
    customsProcedure: "",
    customsStatus: "Waiting For Commercial Paperwork",
    customer: "",
    ...shipmentData.get(id),
  } as unknown as Shipment;
}

export async function getShipment({ shipmentId }: { shipmentId: string }) {
  const err = failingShipments.get(shipmentId);
  if (err) throw err;
  return { shipment: fakeShipment(shipmentId) };
}

export const notFound = () => APIError.notFound("Shipment not found");

/**
 * Invoicing's release check as the tests' mocked invoicing answers it: every job is paid, unless a test sets its
 * answer (`releaseChecks`) or makes it fail (an Error). Used from the vi.mock("~encore/clients") factories.
 */
export const releaseChecks = new Map<
  string,
  | {
      prepaymentUnpaid: boolean;
      unpaid: { number: string; leftToPay: number; currency: string }[];
      prepaymentUninvoiced?: { currency: string; amount: number }[];
    }
  | Error
>();

export const invoicingFake = {
  _internalReleaseCheck: async ({ shipmentId }: { shipmentId: string }) => {
    const answer = releaseChecks.get(shipmentId);
    if (answer instanceof Error) throw answer;
    return answer ?? { prepaymentUnpaid: false, unpaid: [], prepaymentInvoices: [] };
  },
};

/**
 * Shipments' side of the gate's WH release on prepayment (shipments controllers/_internalReleasePass) as the
 * tests' mocked shipments answer it: a test sets a job's approved request (`releasePasses`, used once - or an
 * Error), and reads what was given back (`passesGivenBack`) and recorded on the shipment (`shipmentOverrides`).
 */
export const releasePasses = new Map<string, { requestId: string; reason: string } | Error>();
export const passesGivenBack: { requestId: string; usedAt: string }[] = [];
export const shipmentOverrides: { shipmentId: string; kind: string; reason: string; invoices: unknown[]; checked: boolean }[] = [];

export const releasePassFakes = {
  _internalReleasePassUse: async ({ shipmentId }: { shipmentId: string; kind: string }) => {
    const pass = releasePasses.get(shipmentId);
    if (pass instanceof Error) throw pass;
    if (!pass) return { pass: null };
    releasePasses.delete(shipmentId);
    return { pass: { ...pass, usedAt: new Date().toISOString() } };
  },
  _internalReleasePassGiveBack: async (used: { requestId: string; usedAt: string }) => {
    passesGivenBack.push(used);
    return { givenBack: true };
  },
  _internalReleaseOverrideRecord: async (record: (typeof shipmentOverrides)[number]) => {
    shipmentOverrides.push(record);
  },
};

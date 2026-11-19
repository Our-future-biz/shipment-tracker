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
/** A job's Warehouse Released set in Shipments already (Y6) - or an Error: Shipments can't be asked. None: empty. */
export const releasedInShipmentsOf = new Map<string, { date: string; by: string } | Error>();
/** A job's customer's payment terms in the Customer Database (P17) - or an Error: it can't be read. None: the job is not known. */
export const customerTermsOf = new Map<string, string | Error>();
/** Jobs Shipments knows with no customer at all. */
export const jobsWithNoCustomer = new Set<string>();

/** The days the gate sent as its own with each read of a job's Warehouse Released (item: a voided release's day). */
export const gateDaysAsked = new Map<string, string[]>();
/** Give-backs Shipments refuses, by request id: `stillUsed` true - the approval still carries the use. */
export const passesNotGivenBack = new Set<string>();
/** The idempotency keys the overrides came with, and the "Prepayment not checked" lines recorded (P17), by key. */
export const overrideKeys: string[] = [];
export const uncheckedRecorded: { shipmentId: string; idempotencyKey: string }[] = [];

// As Shipments answers it: a day the gate's own release wrote is not Shipments'.
const releasedOf = (shipmentId: string, gateDays: string[] = []) => {
  gateDaysAsked.set(shipmentId, gateDays);
  const released = releasedInShipmentsOf.get(shipmentId);
  if (released instanceof Error) throw released;
  return released && !gateDays.includes(released.date) ? released : null;
};

export const releasePassFakes = {
  _internalReleasePassUse: async ({ shipmentId, gateDays }: { shipmentId: string; kind: string; gateDays?: string[] }) => {
    const warehouseReleased = releasedOf(shipmentId, gateDays);
    if (warehouseReleased) return { pass: null, warehouseReleased };
    const pass = releasePasses.get(shipmentId);
    if (pass instanceof Error) throw pass;
    if (!pass) return { pass: null, warehouseReleased: null };
    releasePasses.delete(shipmentId);
    return { pass: { ...pass, usedAt: new Date().toISOString() }, warehouseReleased: null };
  },
  _internalWarehouseReleasedOf: async ({ shipmentId, gateDays }: { shipmentId: string; gateDays?: string[] }) => ({ warehouseReleased: releasedOf(shipmentId, gateDays) }),
  _internalReleasePassGiveBack: async ({ requestId, usedAt }: { requestId: string; usedAt: string; byMomentOnly?: boolean }) => {
    if (passesNotGivenBack.has(requestId)) return { givenBack: false, stillUsed: true };
    passesGivenBack.push({ requestId, usedAt });
    return { givenBack: true, stillUsed: false };
  },
  // Recorded once per idempotency key, as Shipments does (shipments migration 0090).
  _internalReleaseOverrideRecord: async ({ idempotencyKey, ...record }: (typeof shipmentOverrides)[number] & { idempotencyKey?: string }) => {
    if (idempotencyKey && overrideKeys.includes(idempotencyKey)) return;
    if (idempotencyKey) overrideKeys.push(idempotencyKey);
    shipmentOverrides.push(record);
  },
  _internalReleaseUncheckedRecord: async (record: { shipmentId: string; idempotencyKey: string }) => {
    if (!uncheckedRecorded.some((r) => r.idempotencyKey === record.idempotencyKey)) uncheckedRecorded.push(record);
  },
};

/** The jobs' customers as the tests' mocked shipments answer them (P17): only the jobs `customerTermsOf` names. */
export const shipmentBasicsFake = {
  _internalShipmentBasics: async ({ ids }: { ids: string[] }) => {
    for (const id of ids) {
      const terms = customerTermsOf.get(id);
      if (terms instanceof Error) throw terms;
    }
    return {
      shipments: ids
        .filter((id) => customerTermsOf.has(id) || jobsWithNoCustomer.has(id))
        .map((id) => ({ id, jobNumber: "", customerId: jobsWithNoCustomer.has(id) ? null : `customer-of-${id}`, status: "Booked" })),
    };
  },
};

/** The Customer Database as the tests' mocked customers answer it: each job's customer with the terms `customerTermsOf` gives. */
export const customersFake = {
  _internalCustomerReceivableFacts: async ({ ids }: { ids: string[] }) => ({
    customers: ids.map((id) => ({ id, paymentTerms: String(customerTermsOf.get(id.replace(/^customer-of-/, "")) ?? "") })),
  }),
};

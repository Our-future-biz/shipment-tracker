import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { requireRole } from "../../../lib/rbac";
import { receivableService } from "../services/receivable.service";
import type {
  ReceivableCustomerRowsResponse,
  ReceivableDetailResponse,
  ReceivableRowsResponse,
  ReceivablesAsAtResponse,
  ReceivableSettingsResponse,
  ReceivablesForMeResponse,
  ReceivablesResponse,
  ReceivableUnbilledResponse,
  ReceivableWaitingResponse,
  ReleaseCheckResponse,
} from "../interfaces/interfaces";

// Finance → Accounts Receivable (Council Outlay 10): one row per issued invoice, with its credit notes folded in.
// Everyone reads it; managers note payments, take them back and send an invoice again to the customer's list
// (services/receivable). Chase notes are for everyone; the final notice (reminder 3) for managers.

interface ListRequest {
  /** 90d (the default), 12m or all: how far back the invoices no longer owed are listed */
  period?: string & MaxLen<10>;
}

/** The page: every invoice still owed, the others issued in the period, the tiles and By customer. */
export const receivableList = api(
  { expose: true, auth: true, method: "GET", path: "/receivables" },
  async ({ period }: ListRequest): Promise<ReceivablesResponse> => receivableService.list(requireRole(), period),
);

/** The bell: overdue invoices (first day, 14, 30 days) and late ones paid, of the user's jobs and customers. */
export const receivableForMe = api(
  { expose: true, auth: true, method: "GET", path: "/receivables/for-me" },
  async (): Promise<ReceivablesForMeResponse> => receivableService.forMe(requireRole()),
);

export const receivableSeen = api(
  { expose: true, auth: true, method: "POST", path: "/receivables/seen" },
  async ({ keys }: { keys: (string & MaxLen<100>)[] & MaxLen<200> }): Promise<void> => {
    await receivableService.seen(requireRole(), keys);
  },
);

interface AsAtRequest {
  /** The day the receivables are read as at (yyyy-mm-dd), e.g. a month's last day */
  day?: string & MaxLen<20>;
}

/** Month-end: the receivables as they stood at the end of a day, per currency and in CZK at each invoice's own ČNB rate. */
export const receivableAsAt = api(
  { expose: true, auth: true, method: "GET", path: "/receivables/as-at" },
  async ({ day }: AsAtRequest): Promise<ReceivablesAsAtResponse> => receivableService.asAt(requireRole(), day),
);

/** The reminder settings, and whether e-mail from the app is on. */
export const receivableSettingsGet = api(
  { expose: true, auth: true, method: "GET", path: "/receivables/settings" },
  async (): Promise<ReceivableSettingsResponse> => receivableService.settings(requireRole()),
);

interface SettingsRequest {
  /** Reminders 1 and 2 sent by the app each day (only while e-mail from the app is on) */
  autoReminders: boolean;
  reminder1Days: number;
  reminder2Days: number;
  /** Where a customer's answer goes; "" = the sender's own address */
  replyTo: string & MaxLen<320>;
}

export const receivableSettingsSave = api(
  { expose: true, auth: true, method: "PUT", path: "/receivables/settings" },
  async (input: SettingsRequest): Promise<ReceivableSettingsResponse> => receivableService.saveSettings(requireRole(), input),
);

/** Write-offs and bank charges waiting for a second manager (the Billing approvals count). */
export const receivableWaiting = api(
  { expose: true, auth: true, method: "GET", path: "/receivables/waiting" },
  async (): Promise<ReceivableWaitingResponse> => receivableService.waiting(requireRole()),
);

interface BatchPaymentItem {
  invoiceId: string & MaxLen<64>;
  /** The receivable's version the manager saw */
  version: number;
  /** In the invoice's currency, at most 2 decimals */
  amount: number;
}

interface BatchPaymentRequest {
  /** The day it was paid (yyyy-mm-dd) */
  paidOn: string & MaxLen<20>;
  note?: string & MaxLen<1000>;
  /** The bank's reference: the same on every line */
  bankRef?: string & MaxLen<200>;
  /** The same key twice (a double click, a retry) notes the payment once */
  idempotencyKey?: string & MaxLen<200>;
  /** 1–100 invoices, each once */
  items: BatchPaymentItem[] & MaxLen<100>;
}

/** One bank payment over several invoices: all or nothing (managers). */
export const receivableBatchPayment = api(
  { expose: true, auth: true, method: "POST", path: "/receivables/payments/batch" },
  async (input: BatchPaymentRequest): Promise<ReceivableRowsResponse> => receivableService.batchPayment(requireRole(), input),
);

/** Work done on the customer's open jobs not yet invoiced (beside the credit limit). */
export const receivableCustomerUnbilled = api(
  { expose: true, auth: true, method: "GET", path: "/receivables/customer/:customerId/unbilled" },
  async ({ customerId }: { customerId: string }): Promise<ReceivableUnbilledResponse> => receivableService.unbilled(requireRole(), customerId),
);

/** The job's invoices, any status (the payment chip on the shipment's invoice panel). */
export const receivableShipmentRows = api(
  { expose: true, auth: true, method: "GET", path: "/receivables/shipment/:shipmentId" },
  async ({ shipmentId }: { shipmentId: string }): Promise<ReceivableRowsResponse> => receivableService.rowsOfShipment(requireRole(), shipmentId),
);

/** The invoices billed to a customer (its Finance tab). */
export const receivableCustomerRows = api(
  { expose: true, auth: true, method: "GET", path: "/receivables/customer/:customerId" },
  async ({ customerId }: { customerId: string }): Promise<ReceivableCustomerRowsResponse> => receivableService.rowsOfCustomer(requireRole(), customerId),
);

/** Whether releasing the job's cargo or documents should warn about payment (never a stop). */
export const receivableReleaseCheck = api(
  { expose: true, auth: true, method: "GET", path: "/receivables/release-check/:shipmentId" },
  async ({ shipmentId }: { shipmentId: string }): Promise<ReleaseCheckResponse> => receivableService.releaseCheck(requireRole(), shipmentId),
);

export const receivableGet = api(
  { expose: true, auth: true, method: "GET", path: "/receivables/:invoiceId" },
  async ({ invoiceId }: { invoiceId: string }): Promise<ReceivableDetailResponse> => receivableService.detail(requireRole(), invoiceId),
);

interface PaymentRequest {
  invoiceId: string;
  /** The receivable's version the manager saw: a change since is refused, to be looked at again */
  version: number;
  /** The day it was paid (yyyy-mm-dd) */
  paidOn: string & MaxLen<20>;
  /** In the invoice's currency, at most 2 decimals */
  amount: number;
  note?: string & MaxLen<1000>;
  /** The same key twice (a double click, a retry) notes one payment */
  idempotencyKey?: string & MaxLen<200>;
}

export const receivablePayment = api(
  { expose: true, auth: true, method: "POST", path: "/receivables/:invoiceId/payments" },
  async ({ invoiceId, ...input }: PaymentRequest): Promise<ReceivableDetailResponse> => receivableService.notePayment(requireRole(), invoiceId, input),
);

interface TakeBackRequest {
  invoiceId: string;
  paymentId: string;
  version: number;
  reason: string & MaxLen<1000>;
}

export const receivableTakeBackPayment = api(
  { expose: true, auth: true, method: "POST", path: "/receivables/:invoiceId/payments/:paymentId/take-back" },
  async ({ invoiceId, paymentId, version, reason }: TakeBackRequest): Promise<ReceivableDetailResponse> =>
    receivableService.takeBackPayment(requireRole(), invoiceId, paymentId, { version, reason }),
);

interface NoteRequest {
  invoiceId: string;
  kind: "note" | "promise" | "dispute" | "dispute_closed" | "reminder";
  text: string & MaxLen<2000>;
  /** A promise: the day it is promised by (yyyy-mm-dd) */
  promisedOn?: string & MaxLen<20>;
  /** A reminder: 1, 2 or 3 (the final notice, managers only) */
  reminderLevel?: number;
  /** A reminder: the e-mail it was sent to */
  recipient?: string & MaxLen<320>;
}

export const receivableNote = api(
  { expose: true, auth: true, method: "POST", path: "/receivables/:invoiceId/notes" },
  async ({ invoiceId, ...input }: NoteRequest): Promise<ReceivableDetailResponse> => receivableService.addNote(requireRole(), invoiceId, input),
);

/** Sends the invoice's failed hand-overs to the customer's list again (managers). */
export const receivableSendAgain = api(
  { expose: true, auth: true, method: "POST", path: "/receivables/:invoiceId/send-again" },
  async ({ invoiceId }: { invoiceId: string }): Promise<ReceivableDetailResponse> => receivableService.sendAgain(requireRole(), invoiceId),
);

interface WriteOffRequest {
  invoiceId: string;
  /** The receivable's version the manager saw */
  version: number;
  kind: "write_off" | "bank_charge";
  /** In the invoice's currency, at most 2 decimals; at most what is left to pay */
  amount: number;
  reason: string & MaxLen<1000>;
}

/** A manager closes what is left as a write-off or a bank charge; it counts once a second manager confirms it. */
export const receivableWriteOff = api(
  { expose: true, auth: true, method: "POST", path: "/receivables/:invoiceId/write-offs" },
  async ({ invoiceId, ...input }: WriteOffRequest): Promise<ReceivableDetailResponse> => receivableService.writeOff(requireRole(), invoiceId, input),
);

interface ConfirmWriteOffRequest {
  invoiceId: string;
  lineId: string;
  version: number;
}

/** Another manager confirms a waiting write-off or bank charge (the same one only when the company has no other manager). */
export const receivableConfirmWriteOff = api(
  { expose: true, auth: true, method: "POST", path: "/receivables/:invoiceId/write-offs/:lineId/confirm" },
  async ({ invoiceId, lineId, version }: ConfirmWriteOffRequest): Promise<ReceivableDetailResponse> =>
    receivableService.confirmWriteOff(requireRole(), invoiceId, lineId, { version }),
);

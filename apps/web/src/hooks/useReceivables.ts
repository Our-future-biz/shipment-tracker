"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, isNotFound } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api";
import { salesManagersKeys } from "./salesQueryKeys";

// Finance → Accounts Receivable (Council Outlay 10): what customers owe, read from the issued invoices (D8), on the
// page, the customer's Finance tab, the job's invoice panel, the bell and the release / credit warnings. Every write
// sends the receivable's version the user saw: one that changed meanwhile is refused, to be looked at again.

export type ReceivablesResponse = interfaces.ReceivablesResponse;
export type ReceivableItem = interfaces.ReceivableItem;
export type ReceivableDetail = interfaces.ReceivableDetailResponse;
export type ReceivableNotice = interfaces.ReceivableNoticeItem;
export type ReleaseCheck = interfaces.ReleaseCheckResponse;
export type CreditWarning = interfaces.CustomerCreditWarning;
export type ReceivablePeriod = interfaces.ReceivablePeriod;
export type ReceivableNoteRequest = controllers.NoteRequest;

/** The query keys: invalidating `all` refreshes every receivables view at once. */
export const receivableKeys = {
  all: ["receivables"] as const,
  list: (period: ReceivablePeriod) => ["receivables", "list", period] as const,
  detail: (id: string) => ["receivables", "detail", id] as const,
  customer: (customerId: string) => ["receivables", "customer", customerId] as const,
  shipment: (shipmentId: string) => ["receivables", "shipment", shipmentId] as const,
  releaseCheck: (shipmentId: string) => ["receivables", "release-check", shipmentId] as const,
  forMe: ["receivables", "for-me"] as const,
  // Step 7: under "receivables", so every write that refreshes the page refreshes these too.
  waiting: ["receivables", "waiting"] as const,
  mailAll: ["receivables", "mail"] as const,
  mail: (input: { invoiceId?: string; customerId?: string }) => ["receivables", "mail", input.invoiceId ?? "", input.customerId ?? ""] as const,
};

/** The Accounts Receivable page. Everyone reads it (D5); read again every minute, as Accounts Payable is. */
export const useReceivables = (period: ReceivablePeriod) => {
  const query = useQuery({
    queryKey: receivableKeys.list(period),
    queryFn: () => api.invoicing.receivableList({ period }),
    refetchInterval: 60_000,
  });
  return {
    data: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    // A failed load must not read as "nothing owed".
    isError: query.isError && !query.data,
  };
};

/** One invoice: lines, credit notes, payments, chase notes, history and the customer's facts. */
export const useReceivable = (invoiceId: string | null) =>
  useQuery({
    queryKey: receivableKeys.detail(invoiceId ?? ""),
    queryFn: () => api.invoicing.receivableGet(invoiceId!),
    enabled: !!invoiceId,
    // "Not there" is an answer (an invoice of another company, or a wrong id).
    retry: (failures, err) => !isNotFound(err) && failures < 1,
  });

/** The invoices billed to a customer (the customer's Finance tab, D19). */
export const useCustomerReceivables = (customerId: string | null | undefined) =>
  useQuery({
    queryKey: receivableKeys.customer(customerId ?? ""),
    queryFn: () => api.invoicing.receivableCustomerRows(customerId!),
    enabled: !!customerId,
  });

/** The job's invoices with their payment state (the chip on the shipment's invoice panel, D19). */
export const useShipmentReceivables = (shipmentId: string | null | undefined) =>
  useQuery({
    queryKey: receivableKeys.shipment(shipmentId ?? ""),
    queryFn: () => api.invoicing.receivableShipmentRows(shipmentId!),
    enabled: !!shipmentId,
  });

/**
 * Whether releasing the job's cargo or documents should warn about payment (D20: a warning, never a stop). Read
 * when the release is about to happen, so it is always fresh; `enabled` lets a caller read it only then.
 */
export const useReleaseCheck = (shipmentId: string | null | undefined, enabled = true) =>
  useQuery({
    queryKey: receivableKeys.releaseCheck(shipmentId ?? ""),
    queryFn: () => api.invoicing.receivableReleaseCheck(shipmentId!),
    enabled: !!shipmentId && enabled,
    staleTime: 0,
  });

/** The customer's credit warning's key (useCreditWarning). */
export const creditWarningKey = (customerId: string) => ["customers", customerId, "credit-warning"] as const;

/**
 * A customer's limit, what it owes and what is overdue (D21: the warning on a new quote / shipment, beside Credit
 * Check). Read afresh each time it is shown: a payment noted a moment ago must count.
 */
export const useCreditWarning = (customerId: string | null | undefined) =>
  useQuery({
    queryKey: creditWarningKey(customerId ?? ""),
    queryFn: () => api.customers.customerCreditWarning(customerId!),
    enabled: !!customerId,
    staleTime: 0,
  });

/**
 * How long after a payment the customer's credit is read once more. A payment reaches the customer's list (what
 * the credit warning and the Sales managers' cockpit count) through the outbox, a moment after the answer: read at
 * once, it may still find the list as it was.
 */
export const CREDIT_REREAD_MS = 3000;

/** What counts a customer's unpaid invoices outside Accounts Receivable: read again after a write that changes them. */
export const creditKeysOf = (customerId: string) => [["customers", customerId] as const, creditWarningKey(customerId), salesManagersKeys.cockpit] as const;

/** The bell (D18): overdue invoices of the user's jobs and customers, and late ones paid. */
export const useReceivableNotices = () =>
  useQuery({
    queryKey: receivableKeys.forMe,
    queryFn: () => api.invoicing.receivableForMe(),
    refetchInterval: 60_000,
  });

export const useReceivableSeen = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (keys: string[]) => api.invoicing.receivableSeen({ keys }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: receivableKeys.forMe }),
  });
};

type Target = { row: Pick<ReceivableItem, "id" | "version" | "customerId" | "shipmentId"> };

/**
 * The drawer's actions. The answer is the invoice as it is now: shown at once, then every receivables view is read
 * again, and so is the customer's credit (the Sales managers' cockpit and the warnings count what is owed). After a
 * payment or a take-back the credit is read once more CREDIT_REREAD_MS later, once the outbox has updated the
 * customer's list.
 */
export function settleReceivableWrite(queryClient: QueryClient, data: ReceivableDetail | undefined, customerId: string, paymentChanged: boolean): void {
  if (data) queryClient.setQueryData(receivableKeys.detail(data.row.id), data);
  void queryClient.invalidateQueries({ queryKey: receivableKeys.all });
  const credit = creditKeysOf(customerId);
  for (const queryKey of credit) void queryClient.invalidateQueries({ queryKey });
  // The query client outlives the drawer: the second read happens even when it is closed meanwhile.
  if (paymentChanged) setTimeout(() => credit.forEach((queryKey) => void queryClient.invalidateQueries({ queryKey })), CREDIT_REREAD_MS);
}

/** The drawer's writes: payment, take-back, note and send again, each settled by settleReceivableWrite. */
export const useReceivableActions = () => {
  const queryClient = useQueryClient();
  const settle = (data: ReceivableDetail | undefined, vars: Target, paymentChanged = false) => settleReceivableWrite(queryClient, data, vars.row.customerId, paymentChanged);
  // Settled, not only on success: a refusal for a changed version means what the user saw is stale.
  const notePayment = useMutation({
    mutationFn: ({ row, paidOn, amount, note, idempotencyKey }: Target & { paidOn: string; amount: number; note?: string; idempotencyKey?: string }) =>
      api.invoicing.receivablePayment(row.id, { version: row.version, paidOn, amount, note, idempotencyKey }),
    onSettled: (data, _e, vars) => settle(data, vars, true),
  });
  const takeBackPayment = useMutation({
    mutationFn: ({ row, paymentId, reason }: Target & { paymentId: string; reason: string }) =>
      api.invoicing.receivableTakeBackPayment(row.id, paymentId, { version: row.version, reason }),
    onSettled: (data, _e, vars) => settle(data, vars, true),
  });
  const addNote = useMutation({
    mutationFn: ({ row, note }: Target & { note: ReceivableNoteRequest }) => api.invoicing.receivableNote(row.id, note),
    onSettled: (data, _e, vars) => settle(data, vars),
  });
  const sendAgain = useMutation({
    mutationFn: ({ row }: Target) => api.invoicing.receivableSendAgain(row.id),
    // It too reaches the customer's list through the outbox.
    onSettled: (data, _e, vars) => settle(data, vars, true),
  });
  // Step 7 (D13): a write-off or bank charge counts for nothing until a second manager confirms it; the confirm
  // changes what is owed, so the customer's credit is read again as after a payment.
  const writeOff = useMutation({
    mutationFn: ({ row, kind, amount, reason }: Target & { kind: "write_off" | "bank_charge"; amount: number; reason: string }) =>
      api.invoicing.receivableWriteOff(row.id, { version: row.version, kind, amount, reason }),
    onSettled: (data, _e, vars) => settle(data, vars),
  });
  const confirmWriteOff = useMutation({
    mutationFn: ({ row, lineId }: Target & { lineId: string }) => api.invoicing.receivableConfirmWriteOff(row.id, lineId, { version: row.version }),
    onSettled: (data, _e, vars) => settle(data, vars, true),
  });
  const pending = [notePayment, takeBackPayment, addNote, sendAgain, writeOff, confirmWriteOff].some((m) => m.isPending);
  return { notePayment, takeBackPayment, addNote, sendAgain, writeOff, confirmWriteOff, pending };
};

/**
 * One bank payment over several invoices (step 7): managers, all or nothing, each invoice with the version the user
 * saw. Settled, not only on success: a refusal for a changed version means the list the user saw is stale.
 */
export const useReceivableBatchPayment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    // customerIds: whose credit to read again afterwards.
    mutationFn: ({ body }: { body: controllers.BatchPaymentRequest; customerIds: string[] }) => api.invoicing.receivableBatchPayment(body),
    onSettled: (_data, _e, vars) => {
      void queryClient.invalidateQueries({ queryKey: receivableKeys.all });
      const credit = [...new Set(vars.customerIds)].flatMap((id) => creditKeysOf(id));
      for (const queryKey of credit) void queryClient.invalidateQueries({ queryKey });
      setTimeout(() => credit.forEach((queryKey) => void queryClient.invalidateQueries({ queryKey })), CREDIT_REREAD_MS);
    },
  });
};

/** Write-offs and bank charges waiting for a second manager (Billing approvals counts them). */
export const useReceivableWaiting = (enabled = true) =>
  useQuery({
    queryKey: receivableKeys.waiting,
    queryFn: () => api.invoicing.receivableWaiting(),
    enabled,
    refetchInterval: 60_000,
  });

/** What the app e-mailed (reminders, statements) for an invoice or a customer, and whether e-mail is switched on. */
export const useReceivableMail = (input: { invoiceId?: string | null; customerId?: string | null }) => {
  const invoiceId = input.invoiceId || undefined;
  const customerId = input.customerId || undefined;
  return useQuery({
    queryKey: receivableKeys.mail({ invoiceId, customerId }),
    queryFn: () => api.invoicing.receivableMailLog({ invoiceId, customerId }),
    enabled: !!invoiceId || !!customerId,
  });
};

/** A customer's statement in one currency as a file (PDF or CSV), as at today. Read when asked for, never kept. */
export const fetchReceivableStatement = (customerId: string, currency: string, format: "pdf" | "csv") =>
  api.invoicing.receivableStatementFile(customerId, { currency, format });

/**
 * A manager e-mails a customer's statement (step 7). The answer says whether it was sent, failed, or e-mail from the
 * app is switched off ("off": nothing sent, nothing recorded). The mail log is read again either way.
 */
export const useReceivableStatementSend = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ customerId, currency, idempotencyKey }: { customerId: string; currency: string; idempotencyKey: string }) =>
      api.invoicing.receivableStatementSend(customerId, { currency, idempotencyKey }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: receivableKeys.mailAll }),
  });
};

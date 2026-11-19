"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, isNotFound } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api";
import { CREDIT_REREAD_MS, receivableKeys } from "./useReceivables";
import { salesManagersKeys } from "./salesQueryKeys";

// Finance → Accounts Receivable's tools (step 7): bank statements, month-end, the export to Pohoda and the reminder
// settings. Their keys sit under receivableKeys.all, so a payment noted anywhere reads them again too. Nothing here
// writes without a person's click: a bank entry is noted only when a manager confirms it.

export type BankStatementList = interfaces.BankStatementListResponse;
export type BankStatementSummary = interfaces.BankStatementSummary;
export type BankStatementDetail = interfaces.BankStatementDetailResponse;
export type BankStatementEntry = interfaces.BankStatementEntryItem;
export type BankEntryCandidate = interfaces.BankEntryCandidateItem;
export type ReceivablesAsAt = interfaces.ReceivablesAsAtResponse;
export type ReceivableAsAtRow = interfaces.ReceivableAsAtRow;
export type PohodaExport = interfaces.PohodaExportResponse;
export type AccountingExports = interfaces.AccountingExportsResponse;
export type AccountingExportFile = interfaces.AccountingExportFileResponse;
export type ReceivableSettings = interfaces.ReceivableSettingsResponse;
export type ReceivableSettingsInput = controllers.SettingsRequest;
export type BankConfirmItem = controllers.ConfirmRequest["items"][number];

export const receivableToolKeys = {
  bankStatements: [...receivableKeys.all, "bank-statements"] as const,
  bankStatement: (id: string) => [...receivableKeys.all, "bank-statements", id] as const,
  asAt: (day: string) => [...receivableKeys.all, "as-at", day] as const,
  exports: [...receivableKeys.all, "exports"] as const,
  settings: [...receivableKeys.all, "settings"] as const,
};

// ── Bank statements ──

/** A refusal for the user's role is the answer: asking again would only be refused again. */
export const noRetryWhenForbidden = (failures: number, err: unknown): boolean =>
  !(err && typeof err === "object" && (err as { code?: unknown }).code === "permission_denied") && failures < 3;

/** The statements read so far, the newest first (managers only, mock test council X6). */
export const useBankStatements = () =>
  useQuery({
    queryKey: receivableToolKeys.bankStatements,
    queryFn: () => api.invoicing.bankStatementList(),
    retry: noRetryWhenForbidden,
  });

/** One statement with its entries; an open entry's candidates are worked out again by the server at each read. */
export const useBankStatement = (id: string | null) =>
  useQuery({
    queryKey: receivableToolKeys.bankStatement(id ?? ""),
    queryFn: () => api.invoicing.bankStatementGet(id!),
    enabled: !!id,
    retry: (failures, err) => !isNotFound(err) && failures < 1,
  });

const owedOnly = (data: interfaces.ReceivablesResponse) => data.rows.filter((r) => r.leftToPay > 0 && (r.status === "unpaid" || r.status === "part_paid"));

/**
 * The invoices owed now, to put a bank entry on one the matching did not propose: Accounts Receivable's own list
 * (the same key and request as useReceivables, so one copy), read only while a manager has an entry to decide.
 */
export const useOwedInvoices = (enabled: boolean) =>
  useQuery({
    queryKey: receivableKeys.list("90d"),
    queryFn: () => api.invoicing.receivableList({ period: "90d" }),
    enabled,
    select: owedOnly,
  });

/**
 * After a statement is read, whatever its answer (exported for its test): every receivables view, the statements with
 * them. Its entries are open, and an open entry marks the invoices it may pay - "a payment may be waiting" in the
 * drawer, on the bell and in the reminder form - so these are read again, not left to the next minute's read.
 */
export function settleBankImport(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: receivableKeys.all });
}

/** A manager reads a statement file (sent as base64; the server keeps only what it read, not the file). */
export const useImportBankStatement = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { fileName: string; contentBase64: string }) => api.invoicing.bankStatementImport(input),
    onSuccess: (data) => queryClient.setQueryData(receivableToolKeys.bankStatement(data.statement.id), data),
    onSettled: () => settleBankImport(queryClient),
  });
};

/**
 * After payments were noted from the bank: every receivables view is read again, and so is every customer's credit
 * (the warnings and the Sales managers' cockpit count what is owed) - at once and once more when the outbox has
 * updated the customers' lists.
 */
function rereadAfterPayments(queryClient: QueryClient): void {
  const credit = () => {
    void queryClient.invalidateQueries({ queryKey: ["customers"] });
    void queryClient.invalidateQueries({ queryKey: salesManagersKeys.cockpit });
  };
  void queryClient.invalidateQueries({ queryKey: receivableKeys.all });
  credit();
  setTimeout(credit, CREDIT_REREAD_MS);
}

type EntryTarget = { statementId: string; entry: Pick<BankStatementEntry, "id" | "version"> };

/** After a decision on an entry: the statement as the answer has it (else read again), and the list of statements. */
function settleEntry(queryClient: QueryClient, data: BankStatementDetail | undefined, statementId: string): void {
  if (data) queryClient.setQueryData(receivableToolKeys.bankStatement(statementId), data);
  else void queryClient.invalidateQueries({ queryKey: receivableToolKeys.bankStatement(statementId) });
  void queryClient.invalidateQueries({ queryKey: receivableToolKeys.bankStatements });
}

/**
 * After a confirm, whatever its answer (exported for its test): the statement, and every receivables view and
 * customer's credit. A refusal means what the manager saw is stale; no answer (a lost one) may still have noted the
 * payments - so the re-reads never wait for a success, as useReceivableBatchPayment's do not.
 */
export function settleBankConfirm(queryClient: QueryClient, data: BankStatementDetail | undefined, statementId: string): void {
  settleEntry(queryClient, data, statementId);
  rereadAfterPayments(queryClient);
}

/**
 * After an entry is set aside, whatever its answer (exported for its test): the statement, and every receivables view -
 * the entry no longer marks the invoices it may pay ("a payment may be waiting" in the drawer, on the bell and in the
 * reminder form). Nothing was paid, so the customers' credit stays as it is.
 */
export function settleBankIgnore(queryClient: QueryClient, data: BankStatementDetail | undefined, statementId: string): void {
  settleEntry(queryClient, data, statementId);
  void queryClient.invalidateQueries({ queryKey: receivableKeys.all });
}

/**
 * Confirm an entry as payments, or set it aside. Each sends the entry's version the manager saw; the answer is the
 * statement as it is now. Settled, not only on success: a refusal (changed meanwhile, decided by someone else) means
 * what the manager saw is stale, so the statement is read again.
 */
export const useBankEntryActions = () => {
  const queryClient = useQueryClient();
  const confirm = useMutation({
    mutationFn: ({ statementId, entry, items }: EntryTarget & { items: BankConfirmItem[] }) =>
      api.invoicing.bankStatementConfirm(statementId, entry.id, { version: entry.version, items }),
    // Success or error: the re-reads run either way (settleBankConfirm).
    onSettled: (data, _err, vars) => settleBankConfirm(queryClient, data, vars.statementId),
  });
  const ignore = useMutation({
    mutationFn: ({ statementId, entry, reason }: EntryTarget & { reason: string }) => api.invoicing.bankStatementIgnore(statementId, entry.id, { version: entry.version, reason }),
    onSettled: (data, _e, vars) => settleBankIgnore(queryClient, data, vars.statementId),
  });
  return { confirm, ignore, pending: confirm.isPending || ignore.isPending };
};

// ── Month-end ──

/** The receivables as they stood at the end of a day (everyone reads). */
export const useReceivablesAsAt = (day: string | null) =>
  useQuery({
    queryKey: receivableToolKeys.asAt(day ?? ""),
    queryFn: () => api.invoicing.receivableAsAt({ day: day! }),
    enabled: !!day,
  });

// ── Export to Pohoda ──

/** The exports made so far, the newest first (managers only: anyone else is refused, and not asked again). */
export const useAccountingExports = () =>
  useQuery({
    queryKey: receivableToolKeys.exports,
    queryFn: () => api.invoicing.receivableAccountingExports(),
    retry: noRetryWhenForbidden,
  });

/**
 * "Download again" on a row of the exports (mock test council m1): the server builds the export's file again from the
 * documents it recorded, the same bytes; it records nothing, so it may be asked again freely.
 */
export const useAccountingExportFile = () =>
  useMutation({
    mutationFn: (exportId: string) => api.invoicing.receivableAccountingExportFile(exportId),
  });

/** A manager exports a period: the server builds the file and records the export, so it is never sent twice by itself. */
export const usePohodaExport = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: controllers.PohodaExportRequest) => api.invoicing.receivablePohodaExport(input),
    // Never retried: a second export would be a second record (and leave the first one's documents out).
    retry: false,
    onSettled: () => queryClient.invalidateQueries({ queryKey: receivableToolKeys.exports }),
  });
};

// ── Reminder settings ──

export const useReceivableSettings = () =>
  useQuery({
    queryKey: receivableToolKeys.settings,
    queryFn: () => api.invoicing.receivableSettingsGet(),
  });

export const useSaveReceivableSettings = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ReceivableSettingsInput) => api.invoicing.receivableSettingsSave(input),
    onSuccess: (data) => queryClient.setQueryData(receivableToolKeys.settings, data),
    onSettled: () => queryClient.invalidateQueries({ queryKey: receivableToolKeys.settings }),
  });
};

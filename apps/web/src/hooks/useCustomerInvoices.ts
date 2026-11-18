"use client";

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";
import { businessToday } from "@/lib/date";
import { handTyped, type CustomerLedger } from "@/app/customers/_lib/customerInvoices";
import { useCustomerReceivables, type ReceivableItem } from "./useReceivables";

export type InvoiceItem = interfaces.InvoiceItem;

const NO_ROWS: ReceivableItem[] = [];

/**
 * The customer's list of invoices (customers service). Since Accounts Receivable (Council Outlay 10, D9) it is
 * changed only for rows typed by hand, and only by managers: the server refuses the rest with its reason.
 */
export const useCustomerInvoices = (customerId: string) => {
  const queryClient = useQueryClient();
  const key = ["customer-invoices", customerId];

  const query = useQuery({
    queryKey: key,
    queryFn: () => api.customers.invoiceList(customerId),
    enabled: !!customerId,
  });

  // The Sales cockpit's credit facts and the credit warning read the same list.
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["customers", customerId, "credit-warning"] });
    return queryClient.invalidateQueries({ queryKey: key });
  };

  const updateMutation = useMutation({
    mutationFn: ({ id, params }: { id: string; params: controllers.InvoiceUpdateRequest }) =>
      api.customers.invoiceUpdate(id, params),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.customers.invoiceDelete(id),
    onSuccess: invalidate,
  });

  const invoices = useMemo(() => query.data?.data ?? [], [query.data]);

  return {
    invoices,
    isLoading: query.isLoading,
    // True only when the request failed and there is nothing to show; a failed background
    // refresh keeps the invoices already loaded.
    isError: query.isLoadingError,
    refetch: query.refetch,
    updateInvoice: updateMutation.mutateAsync,
    deleteInvoice: deleteMutation.mutateAsync,
  };
};

/**
 * What the customer owes, one truth with Finance → Accounts Receivable (D19): the invoices issued in Invoicing as
 * Accounts Receivable reads them, and the rows typed by hand into the customer's list. Every figure of the
 * customer's page is made from this; until both are in, nothing is said, and when either fails, an error is said -
 * never a customer who owes nothing.
 */
export const useCustomerOwed = (customerId: string) => {
  const list = useCustomerInvoices(customerId);
  const receivables = useCustomerReceivables(customerId);
  const isLoading = list.isLoading || receivables.isLoading;
  const isError = list.isError || (receivables.isError && !receivables.data);
  // Only both lists together say which typed rows are copies of issued invoices: until then nothing is counted.
  const ready = !isLoading && !isError && receivables.data !== undefined;
  const issued = (ready && receivables.data?.rows) || NO_ROWS;
  const ledger = useMemo<CustomerLedger>(
    () => (ready ? { issued, typed: handTyped(list.invoices, issued) } : { issued: NO_ROWS, typed: [] }),
    [ready, issued, list.invoices],
  );
  return {
    ledger,
    // The business day (Prague) a typed row's due day is compared with: the server's, as for the issued invoices,
    // so both lists call the same rows overdue; the browser's until the server has answered.
    today: receivables.data?.today ?? businessToday(),
    // A manager: marks a typed row paid or deletes it (the server checks again).
    canAct: receivables.data?.canAct ?? false,
    // More invoices than Accounts Receivable lists at once: the figures leave the rest out.
    truncated: receivables.data?.truncated ?? false,
    isLoading,
    isError,
    refetch: () => {
      void list.refetch();
      void receivables.refetch();
    },
  };
};

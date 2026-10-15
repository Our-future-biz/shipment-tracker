"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { truckingKeys } from "./truckingKeys";
import type { TruckingFile } from "./useTruckingConsignments";

// Haulier invoices and internal billing (Phase 6). Every shape is taken from the client methods,
// so the screens follow the API when the client is regenerated.

export type HaulierInvoice = Awaited<ReturnType<typeof api.trucking.truckingHaulierInvoiceGet>>["invoice"];
export type HaulierInvoiceStatus = HaulierInvoice["status"];
export type HaulierInvoiceLine = HaulierInvoice["lines"][number];
export type HaulierInvoiceCreate = Parameters<typeof api.trucking.truckingHaulierInvoiceCreate>[0];
export type HaulierInvoiceLineInput = HaulierInvoiceCreate["lines"][number];
export type HaulierInvoiceListRequest = Parameters<typeof api.trucking.truckingHaulierInvoiceList>[0];
export type InvoiceCandidate = Awaited<ReturnType<typeof api.trucking.truckingHaulierInvoiceCandidates>>["targets"][number];
export type InternalMonth = Awaited<ReturnType<typeof api.trucking.truckingInternalMonthList>>["months"][number];
export type InternalCharge = Awaited<ReturnType<typeof api.trucking.truckingInternalCharges>>["charges"][number];

const NO_INVOICES: HaulierInvoice[] = [];
const NO_CANDIDATES: InvoiceCandidate[] = [];
const NO_MONTHS: InternalMonth[] = [];
const NO_CHARGES: InternalCharge[] = [];

/** An approved invoice puts the real cost on the jobs: the jobs' costs and the trucking lists are read again. */
function useRefreshInvoices() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: truckingKeys.haulierInvoices() }),
      queryClient.invalidateQueries({ queryKey: truckingKeys.trips() }),
      queryClient.invalidateQueries({ queryKey: ["invoicing"] }),
    ]);
}

export function useHaulierInvoices(filters: HaulierInvoiceListRequest = {}) {
  const query = useQuery({
    queryKey: truckingKeys.haulierInvoiceList({ status: filters.status, haulierCustomerId: filters.haulierCustomerId }),
    queryFn: () => api.trucking.truckingHaulierInvoiceList(filters),
    placeholderData: keepPreviousData,
  });
  return { invoices: query.data?.invoices ?? NO_INVOICES, isLoading: query.isLoading, isError: query.isError };
}

/** The trips and partner legs of a haulier that can go on an invoice; nothing is asked until a haulier is chosen. */
export function useInvoiceCandidates(haulierCustomerId: string | null) {
  const query = useQuery({
    queryKey: truckingKeys.haulierInvoiceCandidates(haulierCustomerId ?? ""),
    queryFn: () => api.trucking.truckingHaulierInvoiceCandidates({ haulierCustomerId: haulierCustomerId as string }),
    enabled: !!haulierCustomerId,
  });
  return { targets: query.data?.targets ?? NO_CANDIDATES, isLoading: query.isLoading && !!haulierCustomerId, isError: query.isError };
}

export function useCreateHaulierInvoice() {
  const queryClient = useQueryClient();
  const refresh = useRefreshInvoices();
  const create = useMutation({
    mutationFn: (req: HaulierInvoiceCreate) => api.trucking.truckingHaulierInvoiceCreate(req),
    onSuccess: (res) => {
      queryClient.setQueryData(truckingKeys.haulierInvoice(res.invoice.id), res);
      return refresh();
    },
  });
  return { create: create.mutateAsync, isCreating: create.isPending };
}

export function useHaulierInvoice(id: string) {
  const queryClient = useQueryClient();
  const refresh = useRefreshInvoices();
  const query = useQuery({
    queryKey: truckingKeys.haulierInvoice(id),
    queryFn: () => api.trucking.truckingHaulierInvoiceGet(id),
    enabled: !!id,
    retry: false,
  });
  const onChanged = (res: { invoice: HaulierInvoice }) => {
    queryClient.setQueryData(truckingKeys.haulierInvoice(id), res);
    return refresh();
  };
  const approve = useMutation({ mutationFn: (reason: string) => api.trucking.truckingHaulierInvoiceApprove(id, { reason }), onSuccess: onChanged });
  const reject = useMutation({ mutationFn: (reason: string) => api.trucking.truckingHaulierInvoiceReject(id, { reason }), onSuccess: onChanged });
  return {
    invoice: query.data?.invoice ?? null,
    isLoading: query.isLoading,
    error: query.error,
    reload: query.refetch,
    approve: approve.mutateAsync,
    reject: reject.mutateAsync,
  };
}

/** The haulier's invoice file as uploaded, fetched on click. */
export const fetchHaulierInvoiceFile = async (id: string): Promise<TruckingFile> => (await api.trucking.truckingHaulierInvoiceFile(id)).file;

export function useInternalMonths() {
  const query = useQuery({ queryKey: truckingKeys.internalMonths(), queryFn: () => api.trucking.truckingInternalMonthList() });
  return { months: query.data?.months ?? NO_MONTHS, isLoading: query.isLoading, isError: query.isError };
}

/** The charges of one month and its close (manager). `month` null asks nothing. */
export function useInternalCharges(month: string | null) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: truckingKeys.internalCharges(month ?? ""),
    queryFn: () => api.trucking.truckingInternalCharges(month as string),
    enabled: !!month,
  });
  const close = useMutation({
    mutationFn: () => api.trucking.truckingInternalMonthClose(month as string),
    // The statements set the jobs' internal lines' invoice number.
    onSuccess: () => Promise.all([queryClient.invalidateQueries({ queryKey: truckingKeys.internal() }), queryClient.invalidateQueries({ queryKey: ["invoicing"] })]),
  });
  return {
    charges: query.data?.charges ?? NO_CHARGES,
    isLoading: query.isLoading && !!month,
    isError: query.isError,
    closeMonth: close.mutateAsync,
    isClosing: close.isPending,
  };
}

/** One internal statement as a PDF, made on click. */
export const fetchInternalStatementPdf = async (number: string): Promise<TruckingFile> => (await api.trucking.truckingInternalStatementPdf(number)).file;

/** A month's internal charges as an Excel workbook, made on click. */
export const fetchInternalMonthExport = async (month: string): Promise<TruckingFile> => (await api.trucking.truckingInternalMonthExport(month)).file;

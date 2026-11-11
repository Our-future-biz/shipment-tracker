"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api";
import { salesManagersKeys } from "@/hooks/salesQueryKeys";

export type MarginInquiryItem = interfaces.QuoteMarginInquiryItem;
export type MarginInquiryRow = interfaces.QuoteMarginInquiryRow;

// A rep's question to a manager about a margin below the floor (Council Outlay 6, step 3): asked
// from the quote's margin panel, answered on Sales → Managers → Quote inquiries, the answer under
// the bell of whoever asked and of the quote's owner.

export const marginInquiryKeys = {
  all: ["margin-inquiries"] as const,
  quote: (quoteNumber: string) => ["margin-inquiries", "quote", quoteNumber] as const,
  list: ["margin-inquiries", "list"] as const,
  forMe: ["margin-inquiries", "for-me"] as const,
};

// The server's INQUIRY_REASONS (apps/api/services/quotes/lib/marginInquiry.ts), which refuses any other: keep the two in step.
export const MARGIN_INQUIRY_REASONS = ["Competitor price", "Tender or volume", "New or strategic customer", "Retention", "Market drop", "Other"] as const;

/** The newest question of one quote, and the rep's ask and withdraw. */
export const useQuoteMarginInquiry = (quoteNumber: string, enabled: boolean) => {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: marginInquiryKeys.quote(quoteNumber),
    queryFn: async () => (await api.quotes.salesQuoteMarginInquiryGet(quoteNumber)).inquiry,
    enabled,
    // The manager's answer arrives while the quote is open; nothing else changes a question that
    // was answered or withdrawn, so only a waiting one is asked about again.
    refetchInterval: (q) => (q.state.data?.status === "pending" ? 30_000 : false),
  });
  // A question asked, withdrawn or answered also changes the managers' cockpit (its Awaiting
  // approval tile and the "Discount waiting" signal).
  const done = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: marginInquiryKeys.all }),
      queryClient.invalidateQueries({ queryKey: salesManagersKeys.cockpit }),
    ]);
  const ask = useMutation({
    mutationFn: (input: { reason: string; note?: string; needsBy?: string | null; competitorPrice?: string; volume?: string }) =>
      api.quotes.salesQuoteMarginInquiryAsk(quoteNumber, input),
    onSettled: done,
  });
  const withdraw = useMutation({
    mutationFn: (inquiryId: string) => api.quotes.salesQuoteMarginInquiryWithdraw(quoteNumber, { inquiryId }),
    onSettled: done,
  });
  return {
    inquiry: query.data ?? null,
    // The server has answered at least once: until then "no question" is not known yet.
    loaded: query.data !== undefined,
    ask,
    withdraw,
    // The question was closed by another action on the quote (a manager's direct approval of the
    // margin): read again wherever a question shows, as after an ask or a withdrawal.
    closed: done,
  };
};

/** The managers' Quote inquiries: what waits and what was answered in the last 30 days, and their answer. */
export const useMarginInquiries = ({ enabled = true }: { enabled?: boolean } = {}) => {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: marginInquiryKeys.list,
    queryFn: async () => (await api.quotes.salesQuoteMarginInquiryList()).inquiries,
    refetchInterval: 60_000,
    enabled,
  });
  const decide = useMutation({
    mutationFn: ({ quoteNumber, ...answer }: { quoteNumber: string; inquiryId: string; decision: "approve" | "counter" | "reject"; counterMarginCzk?: number | null; comment?: string }) =>
      api.quotes.salesQuoteMarginInquiryDecide(quoteNumber, answer),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: marginInquiryKeys.all });
      void queryClient.invalidateQueries({ queryKey: salesManagersKeys.cockpit });
    },
  });
  const inquiries = query.data ?? [];
  return {
    inquiries,
    waiting: inquiries.filter((r) => r.inquiry.status === "pending").length,
    isLoading: query.isLoading,
    // A failed load must not read as "nothing to answer".
    isError: query.isError && !query.data,
    decide,
  };
};

/** The bell: questions the user is told about, and answers to their questions or their quotes. */
export const useMarginInquiryBell = () => {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: marginInquiryKeys.forMe,
    queryFn: () => api.quotes.salesQuoteMarginInquiryForMe(),
    refetchInterval: 30_000,
  });
  const seen = useMutation({
    mutationFn: (ids: string[]) => api.quotes.salesQuoteMarginInquirySeen({ ids }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: marginInquiryKeys.forMe }),
  });
  return { waiting: query.data?.waiting ?? [], answers: query.data?.answers ?? [], hasLoaded: query.data !== undefined, seen };
};

"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api";
import { isAnswerLoading } from "@/app/shipments/managers/_lib/cockpitSignals";
import type { OpsCockpitFilter } from "./useShipmentsManagersCockpit";

export type ShipmentsManagersMoney = interfaces.ShipmentsManagersMoney;
export type OpsMoneyTiles = interfaces.OpsMoneyTiles;
export type OpsMoneyRow = interfaces.OpsMoneyRow;
export type OpsMoneyPerson = interfaces.OpsMoneyPerson;
export type MoneyAmount = interfaces.MoneyAmount;

/** How often the Money tab asks again: the server keeps an answer for five minutes, so asking sooner brings the same one. */
const MONEY_REFETCH_MS = 5 * 60_000;

// Beside the cockpit's key, not under it: a hand-over or a nudge moves no money, and the server
// would hand back the answer it keeps anyway.
const moneyKey = ({ mode, direction, handledBy, reports }: OpsCockpitFilter) => ["shipments-managers-money", mode, direction, handledBy, reports] as const;

/**
 * Shipments → Managers, the Money tab: work not yet invoiced, the money signals' tiles, the URGENT
 * and ATTENTION cards and each person's money, over the cockpit's own jobs and filters (mode,
 * Trade Direction, Handled By, "My reports"). Read-only, and asked only while the tab is shown
 * (`enabled`): on mount and then every five minutes - the server keeps an answer that long, and
 * its `asOf` says how fresh the money is.
 * The signal the cards are narrowed to (?msignal=) is not part of the question: the page narrows
 * the rows it already has.
 */
export const useShipmentsManagersMoney = (filter: OpsCockpitFilter, enabled: boolean) => {
  const query = useQuery({
    queryKey: moneyKey(filter),
    queryFn: async () =>
      (
        await api.shipments.shipmentManagersMoney({
          mode: filter.mode,
          direction: filter.direction,
          handledBy: filter.handledBy ?? undefined,
          // Left out for everyone, as the server reads it.
          reports: filter.reports === "mine" ? "mine" : undefined,
        })
      ).money,
    enabled,
    refetchInterval: MONEY_REFETCH_MS,
    // Opening the tab asks again (the app's queries otherwise trust an answer for a minute); what
    // was there shows until the new answer arrives.
    staleTime: 0,
    // Kept only for `people`: on the Money tab the Handled By select is filled from the answer, and
    // must not lose its names each time a filter is changed.
    placeholderData: keepPreviousData,
  });
  // The answer to an earlier filter is not this filter's: its figures stay off the screen.
  const waiting = query.isPlaceholderData;
  // A failed load must not read as "nothing urgent in the money".
  const isError = query.isError && !query.data;
  return {
    money: waiting ? null : (query.data ?? null),
    /** Who the Handled By filter is picked from on the Money tab; the earlier answer's while the next one loads. */
    people: query.data?.people ?? [],
    // Also while the request is held back (no connection): no answer yet is "…", never zeros.
    isLoading: isAnswerLoading({ enabled, isPending: query.isPending, isPlaceholderData: waiting }),
    isError,
    /** Why the load failed, for the page to word (the server says when "My reports" could not be answered). */
    error: isError ? (query.error as unknown) : null,
  };
};

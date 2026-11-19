"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api";
import { isAnswerLoading } from "@/app/shipments/managers/_lib/cockpitSignals";

export type ShipmentsManagersCockpit = interfaces.ShipmentsManagersCockpit;
export type OpsCockpitRow = interfaces.OpsCockpitRow;
export type OpsCockpitList = interfaces.OpsCockpitList;
export type OpsCockpitMode = interfaces.OpsCockpitMode;
export type OpsCockpitDirection = interfaces.OpsCockpitDirection;
export type OpsCockpitReports = interfaces.OpsCockpitReports;
export type OpsCockpitPerson = interfaces.OpsCockpitPerson;
export type OpsCockpitTiles = interfaces.OpsCockpitTiles;
export type OpsCockpitAudit = interfaces.OpsCockpitAudit;
export type OpsCockpitAuditItem = interfaces.OpsCockpitAuditItem;

/**
 * Which jobs the cockpit counts: `handledBy` is an e-mail, "nobody", or null for everyone;
 * `reports` "mine" keeps only the jobs of the users who report to whoever is signed in - and the
 * jobs whose Handled By is no longer a user, which are every manager's.
 */
export interface OpsCockpitFilter {
  mode: OpsCockpitMode;
  direction: OpsCockpitDirection;
  handledBy: string | null;
  reports: OpsCockpitReports;
}

// Not under "shipments": the shipment hooks read every cache there as a list of shipments.
// The first part is what the managers' actions invalidate (hand-over, nudge, dismissed cut-off).
// The signal is a part of its own: each one's answer is kept apart.
const cockpitKey = ({ mode, direction, handledBy, reports }: OpsCockpitFilter, signal: string | null) =>
  ["shipments-managers-cockpit", mode, direction, handledBy, reports, signal] as const;

/** The filter as one text: two answers to it narrowed to different signals have the same tiles, people and lines. */
const filterText = ({ mode, direction, handledBy, reports }: OpsCockpitFilter) => JSON.stringify([mode, direction, handledBy, reports]);

/**
 * Shipments → Managers: tiles, the URGENT and ATTENTION cards, the people named in Handled By and
 * the audit line, over the company's active jobs of one mode, direction and person, or all of
 * them - everyone's, or those of the signed-in manager's reports. Worked out on the server (Prague
 * day) and refreshed every minute, as the Sales and Warehouse cockpits are. The Cockpit and the
 * Team tab read the same answer.
 * The signal tile the cards are narrowed to (?signal=, null for none) is asked of the server: it
 * narrows the cards before it cuts them at their limit, so a tile opens every row it counts. Only
 * the cards differ by it.
 */
export const useShipmentsManagersCockpit = (filter: OpsCockpitFilter, signal: string | null, enabled: boolean) => {
  const query = useQuery({
    queryKey: cockpitKey(filter, signal),
    queryFn: async () => ({
      filter: filterText(filter),
      cockpit: (
        await api.shipments.shipmentManagersCockpit({
          mode: filter.mode,
          direction: filter.direction,
          handledBy: filter.handledBy ?? undefined,
          // Left out for everyone, as the server reads it.
          reports: filter.reports === "mine" ? "mine" : undefined,
          signal: signal ?? undefined,
        })
      ).cockpit,
    }),
    enabled,
    // Clocks move with time as well as with edits.
    refetchInterval: 60_000,
    // Coming back from a job just put right, the figures are read again at once (the app's queries
    // otherwise trust an answer for a minute); what was there shows until the new answer arrives.
    staleTime: 0,
    // Kept for `people`: the Handled By select is filled from the answer, and must not lose its
    // names each time a filter is changed. And for the tiles while another signal's cards load.
    placeholderData: keepPreviousData,
  });
  // The answer to an earlier filter is not this filter's: its figures stay off the screen. One to
  // this filter with the cards narrowed to another signal is this answer but for its cards: the
  // tiles, the people and the lines stay while a tile click asks for the cards anew.
  const waiting = query.isPlaceholderData && query.data?.filter !== filterText(filter);
  // A failed load must not read as "nothing urgent".
  const isError = query.isError && !query.data;
  return {
    cockpit: waiting ? null : (query.data?.cockpit ?? null),
    /** The two cards of `cockpit` are another signal's: this signal's are still to come ("…"). */
    cardsLoading: enabled && query.isPlaceholderData,
    /** Who the Handled By filter is picked from; the earlier answer's while the next one loads. */
    people: query.data?.cockpit.people ?? [],
    // Also while the request is held back (no connection): no answer yet is "…", never zeros.
    isLoading: isAnswerLoading({ enabled, isPending: query.isPending, isPlaceholderData: waiting }),
    isError,
    /** Why the load failed, for the page to word (the server says when "My reports" could not be answered). */
    error: isError ? (query.error as unknown) : null,
    /** Reads the answer again now: after a manager's action, on top of what the action's own hook invalidates. */
    refetch: query.refetch,
  };
};

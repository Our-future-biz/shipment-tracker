"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api";

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
const cockpitKey = ({ mode, direction, handledBy, reports }: OpsCockpitFilter) => ["shipments-managers-cockpit", mode, direction, handledBy, reports] as const;

/**
 * Shipments → Managers: tiles, the URGENT and ATTENTION cards, the people named in Handled By and
 * the audit line, over the company's active jobs of one mode, direction and person, or all of
 * them - everyone's, or those of the signed-in manager's reports. Worked out on the server (Prague
 * day) and refreshed every minute, as the Sales and Warehouse cockpits are. The Cockpit and the
 * Team tab read the same answer.
 * The signal the cards are narrowed to (?signal=) is not part of the question: the page narrows
 * the rows it already has, so a tile click asks the server nothing.
 */
export const useShipmentsManagersCockpit = (filter: OpsCockpitFilter, enabled: boolean) => {
  const query = useQuery({
    queryKey: cockpitKey(filter),
    queryFn: async () =>
      (
        await api.shipments.shipmentManagersCockpit({
          mode: filter.mode,
          direction: filter.direction,
          handledBy: filter.handledBy ?? undefined,
          // Left out for everyone, as the server reads it.
          reports: filter.reports === "mine" ? "mine" : undefined,
        })
      ).cockpit,
    enabled,
    // Clocks move with time as well as with edits.
    refetchInterval: 60_000,
    // Coming back from a job just put right, the figures are read again at once (the app's queries
    // otherwise trust an answer for a minute); what was there shows until the new answer arrives.
    staleTime: 0,
    // Kept only for `people`: the Handled By select is filled from the answer, and must not lose
    // its names each time a filter is changed.
    placeholderData: keepPreviousData,
  });
  // The answer to an earlier filter is not this filter's: its figures stay off the screen.
  const waiting = query.isPlaceholderData;
  // A failed load must not read as "nothing urgent".
  const isError = query.isError && !query.data;
  return {
    cockpit: waiting ? null : (query.data ?? null),
    /** Who the Handled By filter is picked from; the earlier answer's while the next one loads. */
    people: query.data?.people ?? [],
    isLoading: query.isLoading || waiting,
    isError,
    /** Why the load failed, for the page to word (the server says when "My reports" could not be answered). */
    error: isError ? (query.error as unknown) : null,
    /** Reads the answer again now: after a manager's action, on top of what the action's own hook invalidates. */
    refetch: query.refetch,
  };
};

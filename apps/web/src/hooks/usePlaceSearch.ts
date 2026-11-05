"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

const PLACES_KEY = "places";
const AIRPORTS_KEY = "airports";
const TERMINALS_KEY = "terminals";

// Places (UN/LOCODE) matching a search text; asks only once the text has 2+ characters.
export const usePlaceSearch = (q: string, enabled = true) =>
  useQuery({
    queryKey: [PLACES_KEY, q],
    queryFn: () => api.auth.placeSearch({ q }),
    enabled: enabled && q.length >= 2,
    staleTime: Infinity,
  });

// Airports (IATA) matching a search text, the same way.
export const useAirportSearch = (q: string, enabled = true) =>
  useQuery({
    queryKey: [AIRPORTS_KEY, q],
    queryFn: () => api.auth.airportSearch({ q }),
    enabled: enabled && q.length >= 2,
    staleTime: Infinity,
  });

// Ocean container terminals (CYs) and inland terminals matching a search text, the same way.
export const useTerminalSearch = (q: string, enabled = true) =>
  useQuery({
    queryKey: [TERMINALS_KEY, q],
    queryFn: () => api.auth.terminalSearch({ q }),
    enabled: enabled && q.length >= 2,
    staleTime: Infinity,
  });

/**
 * Counts a picked place, airport or terminal for the user (by its code), whose pickers list the
 * ones they pick most first. The cached lists are dropped once it is counted, so the next search
 * comes back in the new order. A failure only costs the order, so it is not shown.
 */
export const useRecordPlacePick = () => {
  const queryClient = useQueryClient();
  return (code: string) =>
    api.auth
      .placePick({ code })
      .then(() => {
        for (const key of [PLACES_KEY, AIRPORTS_KEY, TERMINALS_KEY]) queryClient.removeQueries({ queryKey: [key] });
      })
      .catch(() => undefined);
};

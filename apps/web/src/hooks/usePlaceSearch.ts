"use client";

import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { whereOfCode, type FoundByCode, type RouteWhere } from "@/lib/placeWhere";
import { placeCodeOf } from "@/lib/places";

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

// Asks for one code in the one list a code of its form comes from: the same requests the place
// fields make, so what they already know is not asked again.
function whereQuery(code: string) {
  const airport = /^[A-Z]{3}$/.test(code);
  const place = /^[A-Z]{2}[A-Z0-9]{3}$/.test(code);
  return {
    queryKey: [airport ? AIRPORTS_KEY : place ? PLACES_KEY : TERMINALS_KEY, code],
    queryFn: (): Promise<FoundByCode> =>
      airport ? api.auth.airportSearch({ q: code }) : place ? api.auth.placeSearch({ q: code }) : api.auth.terminalSearch({ q: code }),
    staleTime: Infinity,
  };
}

interface QuoteRoute {
  origin?: string | null;
  destination?: string | null;
}

// The route's places that have a code to ask by; older free text has none.
const coded = ({ origin, destination }: QuoteRoute) =>
  [origin, destination].flatMap((value) => {
    const code = placeCodeOf(value);
    return code ? [{ value: value!.trim(), code }] : [];
  });

const whereByValue = (places: ReturnType<typeof coded>, found: (FoundByCode | undefined)[]) =>
  Object.fromEntries(places.map((p, i) => [p.value, whereOfCode(p.code, found[i] ?? {})]));

/** Where a quote's Origin and Destination are. A place that can't be found just goes without it. */
export function useRouteWhere(route: QuoteRoute): RouteWhere {
  const places = coded(route);
  const answers = useQueries({ queries: places.map((p) => whereQuery(p.code)) });
  return { where: whereByValue(places, answers.map((a) => a.data)), isLoading: answers.some((a) => a.isLoading) };
}

/** The same, asked at the moment of need: for a quote known only once the user acts on it. */
export function useFetchRouteWhere() {
  const queryClient = useQueryClient();
  return async (route: QuoteRoute): Promise<RouteWhere> => {
    const places = coded(route);
    const answers = await Promise.allSettled(places.map((p) => queryClient.fetchQuery(whereQuery(p.code))));
    return { where: whereByValue(places, answers.map((a) => (a.status === "fulfilled" ? a.value : undefined))), isLoading: false };
  };
}

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

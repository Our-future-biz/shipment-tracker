"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

const PLACES_KEY = "places";
const AIRPORTS_KEY = "airports";

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

"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

/**
 * Vyber poli zobrazenych v kartach na zalozce Details.
 *
 * Mockup ma u kazde karty tlacitko "Zobrazit vse" a vedle nej tuzku, kterou si
 * uzivatel vybere, co ma byt v karte videt (secSum / secSumToggle).
 * Zde se volba uklada na uzivatele do databaze, takze plati i na jinem pocitaci.
 *
 * Ulozeny tvar: { "<id karty>": ["klic pole", ...] }
 * Karta bez zaznamu ukazuje vsechna sva pole.
 */

const PREF_KEY = "detail-card-fields";

type CardFieldMap = Record<string, string[]>;

export function useCardFields() {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["user-prefs", PREF_KEY],
    queryFn: () => api.shipments.userPrefGet(PREF_KEY),
    staleTime: 5 * 60 * 1000,
  });

  const map: CardFieldMap = useMemo(() => {
    if (!data?.value) return {};
    try {
      const parsed = JSON.parse(data.value);
      return parsed && typeof parsed === "object" ? (parsed as CardFieldMap) : {};
    } catch {
      return {};
    }
  }, [data?.value]);

  const save = useMutation({
    mutationFn: (next: CardFieldMap) =>
      api.shipments.userPrefSet(PREF_KEY, { value: JSON.stringify(next) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["user-prefs", PREF_KEY] }),
  });

  /** Klice poli videtelnych v karte. Bez ulozene volby jsou videt vsechna. */
  const visibleKeys = useCallback(
    (cardId: string, allKeys: string[]): string[] => {
      const chosen = map[cardId];
      if (!Array.isArray(chosen)) return allKeys;
      // poradi se ridi kartou, ne poradim vyberu
      return allKeys.filter((k) => chosen.includes(k));
    },
    [map],
  );

  /** Prepne jedno pole. */
  const toggleField = useCallback(
    (cardId: string, key: string, allKeys: string[]) => {
      const current = Array.isArray(map[cardId]) ? map[cardId]! : allKeys;
      const next = current.includes(key)
        ? current.filter((k) => k !== key)
        : [...current, key];
      save.mutate({ ...map, [cardId]: next });
    },
    [map, save],
  );

  /** Vrati kartu do vychoziho stavu (vsechna pole). */
  const resetCard = useCallback(
    (cardId: string) => {
      const next = { ...map };
      delete next[cardId];
      save.mutate(next);
    },
    [map, save],
  );

  /** true = uzivatel si kartu upravil */
  const isCustomised = useCallback((cardId: string) => Array.isArray(map[cardId]), [map]);

  return { visibleKeys, toggleField, resetCard, isCustomised, isSaving: save.isPending };
}

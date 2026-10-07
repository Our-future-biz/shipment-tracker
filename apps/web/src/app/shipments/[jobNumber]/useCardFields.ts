"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { message } from "antd";
import { api } from "@/lib/api";

/**
 * Vyber poli zobrazenych v kartach na zalozce Details.
 *
 * Mockup ma u kazde karty tlacitko "Zobrazit vse" a vedle nej tuzku, kterou si
 * uzivatel vybere, co ma byt v karte videt (secSum / secSumToggle).
 * Zde se volba uklada na uzivatele do databaze, takze plati i na jinem pocitaci.
 *
 * Ulozeny tvar: { "<id karty>": ["klic pole", ...], "<id karty>#known": [...] }
 * Karta bez zaznamu ukazuje vsechna sva pole.
 *
 * "#known" jsou vsechna pole, ktera karta mela v dobe ulozeni vyberu. Pole,
 * ktere do karty pribude pozdeji, v nem neni, a proto se ukaze samo - jinak by
 * zustalo skryte kazdemu, kdo si kartu nekdy upravil.
 */

const PREF_KEY = "detail-card-fields";
const knownKey = (cardId: string) => `${cardId}#known`;

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
    // Write the new map into the cache straight away. Without this, two quick
    // toggles both read the stale `map` and the second one undoes the first.
    onMutate: (next: CardFieldMap) => {
      const previous = queryClient.getQueryData(["user-prefs", PREF_KEY]);
      queryClient.setQueryData(["user-prefs", PREF_KEY], { value: JSON.stringify(next) });
      return { previous };
    },
    onError: (_e, _next, context) => {
      queryClient.setQueryData(["user-prefs", PREF_KEY], context?.previous);
      message.error("Could not save the field selection");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["user-prefs", PREF_KEY] }),
  });

  /** Klice poli videtelnych v karte. Bez ulozene volby jsou videt vsechna. */
  const visibleKeys = useCallback(
    (cardId: string, allKeys: string[]): string[] => {
      const chosen = map[cardId];
      if (!Array.isArray(chosen)) return allKeys;
      const known = map[knownKey(cardId)];
      const isNew = (k: string) => Array.isArray(known) && !known.includes(k);
      // poradi se ridi kartou, ne poradim vyberu
      return allKeys.filter((k) => chosen.includes(k) || isNew(k));
    },
    [map],
  );

  /** Prepne jedno pole. */
  const toggleField = useCallback(
    (cardId: string, key: string, allKeys: string[]) => {
      const current = visibleKeys(cardId, allKeys);
      const next = current.includes(key)
        ? current.filter((k) => k !== key)
        : [...current, key];
      save.mutate({ ...map, [cardId]: next, [knownKey(cardId)]: allKeys });
    },
    [map, save, visibleKeys],
  );

  /** Vrati kartu do vychoziho stavu (vsechna pole). */
  const resetCard = useCallback(
    (cardId: string) => {
      const next = { ...map };
      delete next[cardId];
      delete next[knownKey(cardId)];
      save.mutate(next);
    },
    [map, save],
  );

  /** true = uzivatel si kartu upravil */
  const isCustomised = useCallback((cardId: string) => Array.isArray(map[cardId]), [map]);

  return { visibleKeys, toggleField, resetCard, isCustomised, isSaving: save.isPending };
}

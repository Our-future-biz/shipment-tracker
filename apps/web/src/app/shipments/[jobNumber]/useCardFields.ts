"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/lib/toast";
import { changeUserPref, readUserPref, userPrefKey } from "@/hooks/userPrefs";
import { cardWithFieldToggled, cardWithoutChoice, parseCardFields, visibleCardKeys, type CardFieldMap } from "./cardFields";

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

export function useCardFields() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: userPrefKey(PREF_KEY),
    queryFn: () => readUserPref(PREF_KEY),
    staleTime: 5 * 60 * 1000,
  });

  const map: CardFieldMap = useMemo(() => parseCardFields(data?.value), [data?.value]);
  // Known once the saved choices were read. Until then - and when the read failed - every card
  // only shows all its fields, and nothing is saved: a map built on it would drop every choice.
  const loaded = data !== undefined;

  // Each change is made to the choices as the server holds them now (another tab may have saved
  // some since), and one change waits for the one before: two quick toggles both count.
  const save = useMutation({
    mutationFn: (edit: (current: CardFieldMap) => CardFieldMap) => changeUserPref(queryClient, PREF_KEY, parseCardFields, edit),
    scope: { id: `user-prefs:${PREF_KEY}` },
    onError: () => toast.error("Could not save the field selection"),
  });

  /** Klice poli videtelnych v karte. Bez ulozene volby jsou videt vsechna. */
  const visibleKeys = useCallback((cardId: string, allKeys: string[]): string[] => visibleCardKeys(map, cardId, allKeys), [map]);

  const refuseUnloaded = useCallback(() => {
    if (loaded) return false;
    toast.error("Your field selection is not loaded yet - try again in a moment");
    return true;
  }, [loaded, toast]);

  /** Prepne jedno pole. */
  const toggleField = useCallback(
    (cardId: string, key: string, allKeys: string[]) => {
      if (refuseUnloaded()) return;
      save.mutate((current) => cardWithFieldToggled(current, cardId, key, allKeys));
    },
    [refuseUnloaded, save],
  );

  /** Vrati kartu do vychoziho stavu (vsechna pole). */
  const resetCard = useCallback(
    (cardId: string) => {
      if (refuseUnloaded()) return;
      save.mutate((current) => cardWithoutChoice(current, cardId));
    },
    [refuseUnloaded, save],
  );

  /** true = uzivatel si kartu upravil */
  const isCustomised = useCallback((cardId: string) => Array.isArray(map[cardId]), [map]);

  return { visibleKeys, toggleField, resetCard, isCustomised, loaded, isSaving: save.isPending };
}

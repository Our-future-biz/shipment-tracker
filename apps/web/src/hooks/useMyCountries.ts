"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { useCountries } from "@/hooks/useOrgUnits";
import { defaultCountries } from "@/app/calendar/_lib/dayHolidays";
import { chosenCountries, countryChoice, keptAfterQuickPick, pickerValue } from "@/app/calendar/_lib/countryChoice";
import type { HolidayItem } from "@/app/calendar/public-holidays/_lib/holidays";

export const MY_COUNTRIES_KEY = ["holiday-my-countries"];
const SAVE_KEY = ["holiday-my-countries", "save"];

/** A save of "My countries": the list, and the one it replaced on the screen (put back when it is refused). */
export interface MyCountriesSave {
  countries: string[];
  before: string[] | undefined;
}

/**
 * Shows `countries` as the user's list at once and says what it replaced. Set before the save starts,
 * not in its onMutate (which waits): a quick next pick, made before the page is drawn again, builds on
 * it through latestMyCountries (mock test S18-100).
 */
export function showMyCountries(queryClient: QueryClient, countries: string[]): MyCountriesSave {
  const before = queryClient.getQueryData<string[]>(MY_COUNTRIES_KEY);
  queryClient.setQueryData(MY_COUNTRIES_KEY, countries);
  return { countries, before };
}

/** The user's list as the latest pick left it, drawn or not yet. */
export const latestMyCountries = (queryClient: QueryClient): string[] => queryClient.getQueryData<string[]>(MY_COUNTRIES_KEY) ?? [];

/** The save of "My countries", one at a time in click order. */
export function myCountriesSaveOptions(queryClient: QueryClient) {
  // Only the last save on its way writes the list: an older one's answer (or refusal) would put back a list the
  // user has changed since.
  const last = () => queryClient.isMutating({ mutationKey: SAVE_KEY }) === 1;
  return {
    mutationKey: SAVE_KEY,
    // One save at a time, in click order, so the server keeps the last pick.
    scope: { id: "holiday-my-countries" },
    mutationFn: async ({ countries }: MyCountriesSave) => (await api.holidays.holidayMyCountriesSet({ countries })).countries,
    // A read on its way would put back the list from before the pick (the pick itself is shown: showMyCountries).
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: MY_COUNTRIES_KEY });
    },
    // The server's cleaned list replaces the pick; a refusal puts back what was shown before it (read again, as
    // that may not be what the server kept).
    onError: (_err: unknown, { before }: MyCountriesSave) => {
      if (!last()) return;
      if (before) queryClient.setQueryData(MY_COUNTRIES_KEY, before);
      void queryClient.invalidateQueries({ queryKey: MY_COUNTRIES_KEY });
    },
    onSuccess: (saved: string[]) => {
      if (last()) queryClient.setQueryData(MY_COUNTRIES_KEY, saved);
    },
  };
}

/**
 * The countries whose holidays the signed-in user cares about, kept on their account: the Public
 * Holidays page and the year calendar show only theirs. As kept, not as read: useMyCountryChoice
 * says what the list means (an empty one is a user who never picked).
 */
export function useMyCountries() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: MY_COUNTRIES_KEY,
    queryFn: async () => (await api.holidays.holidayMyCountriesGet()).countries,
  });
  const save = useMutation(myCountriesSaveOptions(queryClient));
  // Each pick is shown at once, before its save (or the one before it) is on its way.
  const saveMyCountries = (countries: string[]) => save.mutateAsync(showMyCountries(queryClient, countries));
  return {
    myCountries: query.data ?? [],
    loaded: query.isSuccess,
    latestMyCountries: () => latestMyCountries(queryClient),
    saveMyCountries,
    isSaving: save.isPending,
  };
}

/**
 * The user's "My countries" as the year calendar and the Public Holidays page both read it (mock
 * council R21): the countries picked, every country, no other country - or, for a user who never
 * picked, the company's countries (else Germany) as if picked, on both pages alike (user council
 * M19). `listed` is the World Holidays list; `pick` keeps what a picker offering `offered` (and
 * "All countries", ALL_COUNTRIES_MARK) was changed to, and says so when the save fails.
 */
export function useMyCountryChoice(listed: HolidayItem[]) {
  const toast = useToast();
  const { myCountries: stored, latestMyCountries: latest, saveMyCountries } = useMyCountries();
  const { countries: companyCountries } = useCountries();
  const fallback = useMemo(() => defaultCountries(companyCountries.map((c) => c.code), listed), [companyCountries, listed]);
  const choice = useMemo(() => countryChoice(stored, fallback), [stored, fallback]);
  // The change is read against the picker as drawn and applied to the list the picks before it left
  // (mock test S18-100: quick picks kept only the last).
  const pick = (offered: readonly string[], next: string[]) =>
    saveMyCountries(keptAfterQuickPick(latest(), fallback, offered, pickerValue(choice), next)).catch((err) => {
      toast.error(`Could not save your countries: ${apiErrorMessage(err)}`);
    });
  return { choice, countries: chosenCountries(choice), pick };
}

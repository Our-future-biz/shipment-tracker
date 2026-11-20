"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { useCountries } from "@/hooks/useOrgUnits";
import { defaultCountries } from "@/app/calendar/_lib/dayHolidays";
import { chosenCountries, countryChoice, keptAfterPick, pickerValue } from "@/app/calendar/_lib/countryChoice";
import type { HolidayItem } from "@/app/calendar/public-holidays/_lib/holidays";

const MY_COUNTRIES_KEY = ["holiday-my-countries"];
const SAVE_KEY = ["holiday-my-countries", "save"];

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
  // Only the last save on its way writes the list: an older one's answer (or refusal) would put back a list the
  // user has changed since. Each pick is shown at once (onMutate runs even while a save waits its turn).
  const last = () => queryClient.isMutating({ mutationKey: SAVE_KEY }) === 1;
  const save = useMutation({
    mutationKey: SAVE_KEY,
    // One save at a time, in click order, so the server keeps the last pick.
    scope: { id: "holiday-my-countries" },
    mutationFn: async (countries: string[]) => (await api.holidays.holidayMyCountriesSet({ countries })).countries,
    onMutate: async (countries) => {
      await queryClient.cancelQueries({ queryKey: MY_COUNTRIES_KEY });
      const before = queryClient.getQueryData<string[]>(MY_COUNTRIES_KEY);
      queryClient.setQueryData(MY_COUNTRIES_KEY, countries);
      return { before };
    },
    // The server's cleaned list replaces the pick; a refusal puts back what was saved (read again when other saves
    // went meanwhile, as the one before may not be what the server kept).
    onError: (_err, _countries, context) => {
      if (!last()) return;
      if (context?.before) queryClient.setQueryData(MY_COUNTRIES_KEY, context.before);
      void queryClient.invalidateQueries({ queryKey: MY_COUNTRIES_KEY });
    },
    onSuccess: (saved) => {
      if (last()) queryClient.setQueryData(MY_COUNTRIES_KEY, saved);
    },
  });
  return { myCountries: query.data ?? [], loaded: query.isSuccess, saveMyCountries: save.mutateAsync, isSaving: save.isPending };
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
  const { myCountries: stored, saveMyCountries } = useMyCountries();
  const { countries: companyCountries } = useCountries();
  const fallback = useMemo(() => defaultCountries(companyCountries.map((c) => c.code), listed), [companyCountries, listed]);
  const choice = useMemo(() => countryChoice(stored, fallback), [stored, fallback]);
  const pick = (offered: readonly string[], next: string[]) =>
    saveMyCountries(keptAfterPick(stored, offered, pickerValue(choice), next)).catch((err) => {
      toast.error(`Could not save your countries: ${apiErrorMessage(err)}`);
    });
  return { choice, countries: chosenCountries(choice), pick };
}

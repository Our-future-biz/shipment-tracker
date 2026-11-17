"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

const MY_COUNTRIES_KEY = ["holiday-my-countries"];

/**
 * The countries whose holidays the signed-in user cares about, kept on their account: the Public
 * Holidays page and the year calendar show only theirs. An empty list shows every country.
 */
export function useMyCountries() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: MY_COUNTRIES_KEY,
    queryFn: async () => (await api.holidays.holidayMyCountriesGet()).countries,
  });
  const save = useMutation({
    mutationFn: async (countries: string[]) => (await api.holidays.holidayMyCountriesSet({ countries })).countries,
    // Shown at once; the server's cleaned list replaces it, and a refusal puts the saved one back.
    onMutate: async (countries) => {
      await queryClient.cancelQueries({ queryKey: MY_COUNTRIES_KEY });
      const before = queryClient.getQueryData<string[]>(MY_COUNTRIES_KEY);
      queryClient.setQueryData(MY_COUNTRIES_KEY, countries);
      return { before };
    },
    onError: (_err, _countries, context) => queryClient.setQueryData(MY_COUNTRIES_KEY, context?.before ?? []),
    onSuccess: (saved) => queryClient.setQueryData(MY_COUNTRIES_KEY, saved),
  });
  return { myCountries: query.data ?? [], loaded: query.isSuccess, saveMyCountries: save.mutateAsync, isSaving: save.isPending };
}

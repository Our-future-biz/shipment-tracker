"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

const MY_COUNTRIES_KEY = ["holiday-my-countries"];
const SAVE_KEY = ["holiday-my-countries", "save"];

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

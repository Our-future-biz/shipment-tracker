"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** The company's users as the pickers read them; Settings → Users changes them (useUserAdmin). */
export const usersKey = ["users"] as const;

export const useUsers = () => {
  const query = useQuery({
    queryKey: usersKey,
    queryFn: () => api.auth.usersList(),
    staleTime: 5 * 60 * 1000,
  });

  return {
    users: query.data?.users ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    // Known once read: until then (and when the read failed) `users` is empty, which says nothing
    // about whether a name is a user's.
    loaded: query.data !== undefined,
  };
};

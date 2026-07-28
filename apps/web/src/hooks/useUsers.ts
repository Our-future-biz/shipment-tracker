"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export const useUsers = () => {
  const query = useQuery({
    queryKey: ["users"],
    queryFn: () => api.auth.usersList(),
    staleTime: 5 * 60 * 1000,
  });

  return {
    users: query.data?.users ?? [],
    isLoading: query.isLoading,
  };
};

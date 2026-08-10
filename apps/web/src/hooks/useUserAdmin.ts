"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface ManagedUser {
  id: string;
  companyId: string;
  email: string;
  displayName: string;
  role: string;
}

export interface CompanyRow {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface NewUserInput {
  email: string;
  password: string;
  displayName?: string;
  role?: string;
}

export interface UpdateUserInput {
  displayName?: string;
  role?: string;
  password?: string;
}

// Company admin/manager managing their OWN company's users (company is implicit from token).
export const useCompanyUsers = () => {
  const qc = useQueryClient();
  const key = ["company-users"];
  const query = useQuery({ queryKey: key, queryFn: () => api.auth.usersList() });
  const invalidate = () => qc.invalidateQueries({ queryKey: key });

  const create = useMutation({ mutationFn: (input: NewUserInput) => api.auth.userCreate(input), onSuccess: invalidate });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateUserInput }) => api.auth.userUpdate(id, input),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: (id: string) => api.auth.userDelete(id), onSuccess: invalidate });

  return {
    users: (query.data?.users ?? []) as ManagedUser[],
    isLoading: query.isLoading,
    createUser: create.mutateAsync,
    updateUser: update.mutateAsync,
    deleteUser: remove.mutateAsync,
  };
};

// Superadmin: list + provision companies.
export const usePlatformCompanies = () => {
  const qc = useQueryClient();
  const key = ["platform-companies"];
  const query = useQuery({ queryKey: key, queryFn: () => api.auth.companyList() });

  const provision = useMutation({
    mutationFn: (params: {
      companyName: string;
      companySlug: string;
      adminEmail: string;
      adminPassword: string;
      adminName?: string;
    }) => api.auth.companyProvision(params),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  return {
    companies: (query.data?.companies ?? []) as CompanyRow[],
    isLoading: query.isLoading,
    provisionCompany: provision.mutateAsync,
    isProvisioning: provision.isPending,
  };
};

// Superadmin: manage a specific company's users by id.
export const usePlatformCompanyUsers = (companyId: string) => {
  const qc = useQueryClient();
  const key = ["platform-company-users", companyId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => api.auth.companyUsersList(companyId),
    enabled: !!companyId,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: key });

  const create = useMutation({
    mutationFn: (input: NewUserInput) => api.auth.companyUserCreate(companyId, input),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateUserInput }) =>
      api.auth.companyUserUpdate(companyId, id, input),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.auth.companyUserDelete(companyId, id),
    onSuccess: invalidate,
  });

  return {
    users: (query.data?.users ?? []) as ManagedUser[],
    isLoading: query.isLoading,
    createUser: create.mutateAsync,
    updateUser: update.mutateAsync,
    deleteUser: remove.mutateAsync,
  };
};

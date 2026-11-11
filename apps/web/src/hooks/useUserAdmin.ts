"use client";

import { useQuery, useMutation, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { services } from "@/lib/api/client";
import { usersKey } from "./useUsers";

export type ManagedUser = services.AuthUserInfo;
export type CompanyRow = services.CompanyInfo;

export interface NewUserInput {
  email: string;
  password: string;
  displayName?: string;
  role?: string;
  departmentId?: string | null;
  branchId?: string | null;
}

export interface UpdateUserInput {
  displayName?: string;
  role?: string;
  password?: string;
  departmentId?: string | null;
  branchId?: string | null;
  /** The manager the user reports to; null clears it. */
  reportsToUserId?: string | null;
}

/**
 * After a change of users: the admin list `key` and the list the pickers and person marks read
 * (useUsers), which would otherwise show the users before for its five minutes.
 */
export const invalidateUserLists = (qc: QueryClient, key: QueryKey) =>
  Promise.all([qc.invalidateQueries({ queryKey: key }), qc.invalidateQueries({ queryKey: usersKey })]);

// Company admin/manager managing their OWN company's users (company is implicit from token).
export const useCompanyUsers = () => {
  const qc = useQueryClient();
  const key = ["company-users"];
  const query = useQuery({ queryKey: key, queryFn: () => api.auth.usersList() });
  const invalidate = () => invalidateUserLists(qc, key);

  const create = useMutation({ mutationFn: (input: NewUserInput) => api.auth.userCreate(input), onSuccess: invalidate });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateUserInput }) => api.auth.userUpdate(id, input),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: (id: string) => api.auth.userDelete(id), onSuccess: invalidate });

  return {
    users: query.data?.users ?? [],
    isLoading: query.isLoading,
    createUser: create.mutateAsync,
    updateUser: update.mutateAsync,
    deleteUser: remove.mutateAsync,
  };
};

export const platformCompaniesKey = ["platform-companies"] as const;

// Superadmin: list + provision companies.
export const usePlatformCompanies = () => {
  const qc = useQueryClient();
  const key = platformCompaniesKey;
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
    companies: query.data?.companies ?? [],
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
  // The company may be the one the superadmin works as, whose users the pickers list.
  const invalidate = () => invalidateUserLists(qc, key);

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
    users: query.data?.users ?? [],
    isLoading: query.isLoading,
    createUser: create.mutateAsync,
    updateUser: update.mutateAsync,
    deleteUser: remove.mutateAsync,
  };
};

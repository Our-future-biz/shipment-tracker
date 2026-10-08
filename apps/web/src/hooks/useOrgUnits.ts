"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface Department {
  id: string;
  name: string;
}

export interface Branch {
  id: string;
  name: string;
  country: string;
}

export interface BranchInput {
  name: string;
  country: string;
}

// Renaming or removing a unit changes what users and noticeboard posts display.
const DEPENDENT_KEYS = [["company-users"], ["platform-company-users"], ["noticeboard"]];

export const useDepartments = () => {
  const qc = useQueryClient();
  const key = ["departments"];
  const query = useQuery({ queryKey: key, queryFn: () => api.auth.departmentList() });
  const invalidate = () => [key, ...DEPENDENT_KEYS].forEach((queryKey) => qc.invalidateQueries({ queryKey }));

  const create = useMutation({ mutationFn: (name: string) => api.auth.departmentCreate({ name }), onSuccess: invalidate });
  const update = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.auth.departmentUpdate(id, { name }),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: (id: string) => api.auth.departmentDelete(id), onSuccess: invalidate });

  return {
    departments: (query.data?.departments ?? []) as Department[],
    isLoading: query.isLoading,
    createDepartment: create.mutateAsync,
    updateDepartment: update.mutateAsync,
    deleteDepartment: remove.mutateAsync,
  };
};

export const useBranches = () => {
  const qc = useQueryClient();
  const key = ["branches"];
  const query = useQuery({ queryKey: key, queryFn: () => api.auth.branchList() });
  const invalidate = () => [key, ...DEPENDENT_KEYS].forEach((queryKey) => qc.invalidateQueries({ queryKey }));

  const create = useMutation({ mutationFn: (input: BranchInput) => api.auth.branchCreate(input), onSuccess: invalidate });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: BranchInput }) => api.auth.branchUpdate(id, input),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: (id: string) => api.auth.branchDelete(id), onSuccess: invalidate });

  return {
    branches: (query.data?.branches ?? []) as Branch[],
    isLoading: query.isLoading,
    createBranch: create.mutateAsync,
    updateBranch: update.mutateAsync,
    deleteBranch: remove.mutateAsync,
  };
};

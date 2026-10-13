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
  countryCode: string | null;
  locationId: number | null;
  city: string | null;
}

export interface BranchInput {
  name: string;
  countryCode: string;
  // The UN/LOCODE place of the branch's city.
  locationId: number;
}

// A UN/LOCODE place, as the city picker lists it.
export interface Location {
  id: number;
  code: string;
  name: string;
  nameAscii: string;
  subdivisionName: string | null;
}

// All places of one country; nothing is fetched until a country is chosen. Reference data that
// does not change while the app runs, so it is fetched once per country.
export const useLocations = (countryCode: string | undefined) => {
  const query = useQuery({
    queryKey: ["locations", countryCode],
    queryFn: () => api.auth.locationList(countryCode!),
    enabled: !!countryCode,
    staleTime: Infinity,
  });
  return { locations: (query.data?.locations ?? []) as Location[], isLoading: query.isFetching };
};

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

export interface Country {
  id: string;
  code: string;
  name: string;
}

export interface CountryInput {
  code: string;
  name: string;
}

export const useCountries = () => {
  const qc = useQueryClient();
  const key = ["countries"];
  const query = useQuery({ queryKey: key, queryFn: () => api.auth.countryList() });
  const invalidate = () => qc.invalidateQueries({ queryKey: key });

  const create = useMutation({ mutationFn: (input: CountryInput) => api.auth.countryCreate(input), onSuccess: invalidate });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: CountryInput }) => api.auth.countryUpdate(id, input),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: (id: string) => api.auth.countryDelete(id), onSuccess: invalidate });

  return {
    countries: (query.data?.countries ?? []) as Country[],
    isLoading: query.isLoading,
    createCountry: create.mutateAsync,
    updateCountry: update.mutateAsync,
    deleteCountry: remove.mutateAsync,
  };
};

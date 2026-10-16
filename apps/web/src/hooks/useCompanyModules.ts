"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AppModule } from "@/lib/modules";
import { platformCompaniesKey } from "./useUserAdmin";

/** A company as Platform → Companies lists it, with the modules it has hidden (superadmin). */
export interface CompanyModules {
  id: string;
  hiddenModules?: AppModule[];
}

/** Hides or shows modules for one company (superadmin): `PATCH /companies/:id/modules`. */
export function useCompanyModules() {
  const queryClient = useQueryClient();
  const update = useMutation({
    mutationFn: ({ companyId, hiddenModules }: { companyId: string; hiddenModules: AppModule[] }) =>
      api.auth.companyModulesUpdate(companyId, { hiddenModules }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: platformCompaniesKey }),
  });
  return { setHiddenModules: update.mutateAsync, isSaving: update.isPending, savingCompanyId: update.isPending ? update.variables?.companyId ?? null : null };
}

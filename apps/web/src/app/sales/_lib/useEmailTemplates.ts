"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";

export type SavedEmailTemplate = interfaces.EmailTemplate;

const KEY = ["sales-email-templates"];

// The signed-in user's own email templates, read while the Email dialog is open. Saving writes
// the whole list: it is the user's alone, so nobody else's change can be lost by it.
export function useEmailTemplates(enabled: boolean) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: KEY, queryFn: () => api.sales.emailTemplatesGet(), enabled });
  const save = useMutation({
    mutationFn: (templates: SavedEmailTemplate[]) => api.sales.emailTemplatesSet({ templates }),
    onSuccess: (stored) => queryClient.setQueryData(KEY, stored),
  });
  return { list: query.data?.data ?? [], ready: query.isSuccess, save };
}

// The template the user last chose is where the dialog starts next time - this browser's
// convenience only, so it may be gone (a private window) and the standard one is used.
const LAST_KEY = "sales.emailTemplate";
export function lastTemplateId(): string | null {
  try {
    return window.localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}
export function rememberTemplateId(id: string): void {
  try {
    window.localStorage.setItem(LAST_KEY, id);
  } catch {
    // Not remembered: the dialog starts from the standard template next time.
  }
}

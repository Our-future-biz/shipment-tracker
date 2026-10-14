"use client";

import { useState } from "react";
import { useCustomer } from "@/hooks/useCustomers";
import type { CustomerItem } from "@/hooks/useCustomers";
import type { controllers } from "@/lib/api/client";
import { useToast } from "@/lib/toast";

export type CustomerPatch = Omit<controllers.CustomerUpdateRequest, "id">;

interface PendingEdit {
  patch: CustomerPatch;
  // updatedAt of the row this save produced; null while the save is still on its way.
  savedAt: string | null;
}

// Saves fields of a customer as they are edited, and shows the user's choice at once: the server value only arrives
// after the save and the refetch that follows it, and the field would jump back to the old value in between. Every
// save is tracked on its own, so saves that overlap cannot hide or cancel one another. An edit stops applying by
// itself once the loaded row is at least as new as the row its save produced (both are ISO timestamps from the
// API, which compare correctly as text).
export function useCustomerEdits(customer: CustomerItem) {
  const toast = useToast();
  const { updateCustomer } = useCustomer(customer.id);
  const [edits, setEdits] = useState<PendingEdit[]>([]);

  const isPending = (edit: PendingEdit) => edit.savedAt === null || customer.updatedAt < edit.savedAt;
  const shown: CustomerItem = edits.filter(isPending).reduce((row, edit) => ({ ...row, ...edit.patch }) as CustomerItem, customer);

  const save = (patch: CustomerPatch) => {
    const edit: PendingEdit = { patch, savedAt: null };
    // Edits the loaded row has caught up with are dropped here, so the list never grows.
    setEdits((current) => [...current.filter(isPending), edit]);
    updateCustomer(patch).then(
      (saved) => setEdits((current) => current.map((e) => (e === edit ? { ...edit, savedAt: saved.customer.updatedAt } : e))),
      () => {
        setEdits((current) => current.filter((e) => e !== edit));
        toast.error("Failed to save");
      },
    );
  };

  return { shown, save };
}

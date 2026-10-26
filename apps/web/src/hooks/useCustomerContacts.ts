"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";
import { customerContactsKey } from "@/hooks/useQuoteCustomerFields";
import { refreshShipmentCopies } from "@/hooks/useShipments";
import { refreshQuoteCopies } from "@/hooks/useSalesQuotes";

export type ContactItem = interfaces.ContactItem;

/** The contact that has exactly this name (any case, outer spaces aside), as the server matches a typed one. */
export function contactNamed<T extends { name: string }>(contacts: readonly T[], name: string | null | undefined): T | undefined {
  const wanted = (name ?? "").trim().toLowerCase();
  if (!wanted) return undefined;
  return contacts.find((c) => c.name.trim().toLowerCase() === wanted);
}

/**
 * A shipment's contact among its customer's saved ones: by the id the shipment keeps, else by the
 * name (an old value stored before ids were kept, or a contact deleted since).
 */
export function findContact<T extends { id: string; name: string }>(
  contacts: readonly T[],
  contactId: string | null | undefined,
  name: string | null | undefined,
): T | undefined {
  const byId = contactId ? contacts.find((c) => c.id === contactId) : undefined;
  return byId ?? contactNamed(contacts, name);
}

export const useCustomerContacts = (customerId: string) => {
  const queryClient = useQueryClient();
  const key = customerContactsKey(customerId);

  const query = useQuery({
    queryKey: key,
    queryFn: () => api.customers.contactList(customerId),
    enabled: !!customerId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const createMutation = useMutation({
    mutationFn: (params: controllers.ContactCreateRequest) => api.customers.contactCreate(customerId, params),
    onSuccess: invalidate,
  });

  // A renamed contact is renamed on the shipments and open quotes that name it too (on the server,
  // a moment later), so those lists are read again once that has happened.
  const updateMutation = useMutation({
    mutationFn: ({ id, params }: { id: string; params: Omit<controllers.ContactUpdateRequest, "customerId"> }) =>
      api.customers.contactUpdate(id, { ...params, customerId }),
    onSuccess: () => {
      refreshShipmentCopies(queryClient);
      refreshQuoteCopies(queryClient);
      return invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.customers.contactDelete(id),
    onSuccess: invalidate,
  });

  return {
    contacts: query.data?.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    createContact: createMutation.mutateAsync,
    updateContact: updateMutation.mutateAsync,
    deleteContact: deleteMutation.mutateAsync,
  };
};

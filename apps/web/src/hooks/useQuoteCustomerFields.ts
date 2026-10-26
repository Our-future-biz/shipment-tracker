"use client";

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, isNotFound } from "@/lib/api";
import type { CustomerItem } from "@/hooks/useCustomers";
import { contactFieldsOf, customerLinkFields, withContactChecked } from "@/app/sales/_lib/quoteCustomer";
import type { SalesQuoteData } from "@/app/sales/_lib/types";

/** The cache keys useCustomer / useCustomerContacts read a customer's record and contacts under. */
export const customerKey = (customerId: string) => ["customer", customerId] as const;
export const customerContactsKey = (customerId: string) => ["customer-contacts", customerId] as const;

/**
 * What a quote takes over from the Customer Database, read through the query cache (so a customer
 * whose contacts a screen already loaded is not asked for again).
 */
export const useQuoteCustomerFields = () => {
  const queryClient = useQueryClient();

  // A customer's contacts. `fresh`: asked of the server even when a screen read them a moment ago -
  // for a link about to be saved, which the server refuses if the contact is gone.
  const readContacts = async (customerId: string, { fresh = false } = {}) => {
    const { data } = await queryClient.fetchQuery({
      queryKey: customerContactsKey(customerId),
      queryFn: () => api.customers.contactList(customerId),
      ...(fresh ? { staleTime: 0 } : {}),
    });
    return data;
  };

  // The person a quote for a customer goes to, with the link to that contact. Nothing for a
  // customer without contacts, or whose contacts cannot be read - the contact fields stay
  // editable on the quote.
  const customerContactFields = async (customerId: string): Promise<SalesQuoteData> => {
    try {
      return contactFieldsOf(await readContacts(customerId));
    } catch {
      return {};
    }
  };

  // What a new quote for a customer starts with: the link and the main contact.
  const customerQuoteFields = async (customer: Pick<CustomerItem, "id" | "companyName" | "label">): Promise<SalesQuoteData> => ({
    ...customerLinkFields(customer),
    ...(await customerContactFields(customer.id)),
  });

  // What a shipment carries of its customer, completed from the Customer Database where it is
  // linked: the name and account type as they are now, and the shipment's own contact person
  // (Customer's PIC, by its id or its name) when that is one of the customer's contacts - else the
  // customer's main contact. A customer deleted since keeps its name but loses the link; one that
  // can't be read leaves what the shipment says. A contact that could not be checked is no link
  // (the server would refuse the save).
  const withCustomerRecord = async (carried: SalesQuoteData): Promise<SalesQuoteData> => {
    if (!carried.customerId) return carried;
    const customerId = carried.customerId;
    try {
      const { customer } = await queryClient.fetchQuery({
        queryKey: customerKey(customerId),
        queryFn: () => api.customers.customerGet(customerId),
      });
      const contacts = await readContacts(customerId).catch(() => []);
      return {
        ...carried,
        customerContactId: null,
        ...customerLinkFields(customer),
        ...contactFieldsOf(contacts, { id: carried.customerContactId, name: carried.customerContact }),
      };
    } catch (err) {
      return isNotFound(err) ? { ...carried, customerId: undefined, customerContactId: null } : { ...carried, customerContactId: null };
    }
  };

  // A contact link copied from another quote, checked against the customer's contacts as the
  // Customer Database has them now (withContactChecked). Contacts that cannot be read check
  // nothing: the link is dropped, as the server would refuse a save it cannot check.
  const withLiveContact = async (patch: Partial<SalesQuoteData>): Promise<Partial<SalesQuoteData>> => {
    if (!patch.customerContactId || !patch.customerId) return withContactChecked(patch, null);
    const contacts = await readContacts(patch.customerId, { fresh: true }).catch(() => null);
    return withContactChecked(patch, contacts);
  };

  return { customerContactFields, customerQuoteFields, withCustomerRecord, withLiveContact };
};

/**
 * The customer an open quote is linked to and its contacts, as the quote page follows them: read
 * again as the quote names them and whenever the page comes back into view (a colleague, or
 * another tab, may have renamed them since), and right away after they were saved in this tab (the
 * Customer Database's hooks mark them out of date). What was read before `since` - the moment the
 * page last had the quote from the server - is not handed out: the quote's own copies are newer.
 */
export const useQuoteCustomerLive = (customerId: string | undefined, since: number) => {
  const id = customerId ?? "";
  const customer = useQuery({
    queryKey: customerKey(id),
    queryFn: () => api.customers.customerGet(id),
    enabled: !!id,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const contacts = useQuery({
    queryKey: customerContactsKey(id),
    queryFn: () => api.customers.contactList(id),
    enabled: !!id,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const customerRead = !!id && customer.isSuccess && customer.dataUpdatedAt >= since;
  const contactsRead = !!id && contacts.isSuccess && contacts.dataUpdatedAt >= since;
  const contactList = contacts.data?.data;
  const contactsFor = useMemo(
    () => (contactsRead && contactList ? { customerId: id, contacts: contactList } : undefined),
    [contactsRead, contactList, id],
  );

  return {
    /** The linked customer's record, once read after `since`. */
    customer: customerRead ? customer.data?.customer : undefined,
    /** The linked customer's contacts, once read after `since`. */
    contactsFor,
    /** The contacts as last read, to pick from (empty while none are read). */
    contacts: contactList ?? [],
    /** Reads the contacts again (after a save the server refused, which may be about a contact that is gone). */
    reloadContacts: contacts.refetch,
  };
};

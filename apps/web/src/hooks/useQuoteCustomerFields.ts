"use client";

import { useQueryClient } from "@tanstack/react-query";
import { api, isNotFound } from "@/lib/api";
import type { CustomerItem } from "@/hooks/useCustomers";
import { contactFieldsOf, customerLinkFields } from "@/app/sales/_lib/quoteCustomer";
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

  // The person a quote for a customer goes to. Nothing for a customer without contacts, or whose
  // contacts cannot be read - the contact fields stay editable on the quote.
  const customerContactFields = async (customerId: string): Promise<SalesQuoteData> => {
    try {
      const { data } = await queryClient.fetchQuery({
        queryKey: customerContactsKey(customerId),
        queryFn: () => api.customers.contactList(customerId),
      });
      return contactFieldsOf(data);
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
  // linked. A customer deleted since keeps its name but loses the link; one that can't be read
  // leaves what the shipment says.
  const withCustomerRecord = async (carried: SalesQuoteData): Promise<SalesQuoteData> => {
    if (!carried.customerId) return carried;
    const customerId = carried.customerId;
    try {
      const { customer } = await queryClient.fetchQuery({
        queryKey: customerKey(customerId),
        queryFn: () => api.customers.customerGet(customerId),
      });
      return { ...carried, ...(await customerQuoteFields(customer)) };
    } catch (err) {
      return isNotFound(err) ? { ...carried, customerId: undefined } : carried;
    }
  };

  return { customerContactFields, customerQuoteFields, withCustomerRecord };
};

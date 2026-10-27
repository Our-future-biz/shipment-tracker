import log from "encore.dev/log";
import { customers } from "~encore/clients";
import { asCompany } from "../../../lib/internalCall";
import type { CustomerRefs } from "../utils/customerLinks.utils";

// How many customers one call to the Customer Database asks about (it takes at most 2000).
const REFS_CHUNK = 500;

/**
 * The customers of the caller's company among `customerIds` and their live contacts, as the
 * Customer Database has them now. A caller without a login (a Pub/Sub handler) names the company.
 */
export async function readCustomerRefs(customerIds: string[], forCompany?: string): Promise<CustomerRefs> {
  const ids = [...new Set(customerIds.filter(Boolean))];
  const refs: CustomerRefs = { customers: [], contacts: [] };
  for (let i = 0; i < ids.length; i += REFS_CHUNK) {
    const request = { customerIds: ids.slice(i, i + REFS_CHUNK) };
    const part = forCompany ? await customers._internalCustomerRefs(request, asCompany(forCompany)) : await customers._internalCustomerRefs(request);
    refs.customers.push(...part.customers);
    refs.contacts.push(...part.contacts);
  }
  return refs;
}

/** readCustomerRefs, or null - logged - when the Customer Database cannot be read. */
export async function tryCustomerRefs(customerIds: string[]): Promise<CustomerRefs | null> {
  try {
    return await readCustomerRefs(customerIds);
  } catch (err) {
    log.warn("the Customer Database could not be read for a quote's customer", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

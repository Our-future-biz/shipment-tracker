// Query keys of one customer's records that refresh each other: a Pickup / Delivery address is
// also a site, so writing either reads the other again. Kept here so the two hooks need not
// import each other.

/** One customer's addresses. Kept apart from the ["customers"] list key, so a list refresh doesn't refetch them. */
export const customerAddressesKey = (customerId: string) => ["customer-addresses", customerId] as const;

/** One customer's sites. */
export const customerSitesKey = (customerId: string) => ["customer-sites", customerId] as const;

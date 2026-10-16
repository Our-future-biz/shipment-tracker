// Where Trucking's records live. Shared by screens outside Trucking (Costs, customer cards, the
// warehouse pick-up rows), which link to them only while the company has Trucking enabled.

export const consignmentHref = (id: string) => `/trucking/consignments/${id}`;
export const tripHref = (id: string) => `/trucking/trips/${id}`;
/** The consignments of a job, in the Trucking list. */
export const jobConsignmentsHref = (shipmentId: string) => `/trucking?job=${encodeURIComponent(shipmentId)}`;

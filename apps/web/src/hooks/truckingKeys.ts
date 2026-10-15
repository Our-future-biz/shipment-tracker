// Query keys of the Trucking screens, in one place: every hook and every invalidation uses these
// factories, so a list can't be refreshed under a key nobody reads (or missed under one that is).

export const truckingKeys = {
  all: ["trucking"] as const,
  settings: () => [...truckingKeys.all, "settings"] as const,
  hauliers: () => [...truckingKeys.all, "hauliers"] as const,
  haulierList: () => [...truckingKeys.hauliers(), "list"] as const,
  haulier: (customerId: string) => [...truckingKeys.hauliers(), "one", customerId] as const,
  tariffs: () => [...truckingKeys.all, "tariffs"] as const,
  tariffList: () => [...truckingKeys.tariffs(), "list"] as const,
  tariff: (id: string) => [...truckingKeys.tariffs(), "one", id] as const,
  tariffVersion: (versionId: string) => [...truckingKeys.tariffs(), "version", versionId] as const,
  tariffVersionDiff: (versionId: string, againstVersionId: string) => [...truckingKeys.tariffs(), "diff", versionId, againstVersionId] as const,
  fuelIndex: () => [...truckingKeys.all, "fuel-index"] as const,
  consignments: () => [...truckingKeys.all, "consignments"] as const,
  consignmentList: (filters: Record<string, string | undefined>) => [...truckingKeys.consignments(), "list", filters] as const,
  consignment: (id: string) => [...truckingKeys.consignments(), "one", id] as const,
  consignmentDocuments: (id: string) => [...truckingKeys.consignments(), "documents", id] as const,
  trips: () => [...truckingKeys.all, "trips"] as const,
  tripList: (filters: Record<string, string | undefined>) => [...truckingKeys.trips(), "list", filters] as const,
  trip: (id: string) => [...truckingKeys.trips(), "one", id] as const,
  publicOrder: (token: string) => ["haulier-order", token] as const,
};

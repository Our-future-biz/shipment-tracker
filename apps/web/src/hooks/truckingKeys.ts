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
  fuelIndex: () => [...truckingKeys.all, "fuel-index"] as const,
};

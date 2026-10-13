import type { Branch } from "@/hooks/useOrgUnits";

// The branches to choose from: those in the chosen country, or every one when no country is.
export const branchOptions = (branches: Branch[], countryCode?: string) =>
  branches
    .filter((b) => !countryCode || b.countryCode === countryCode)
    .map((b) => ({ value: b.id, label: b.city ? `${b.name} (${b.city})` : b.name }));

// Whether a chosen branch still fits once the country changes: a branch in another country does not.
export const branchFitsCountry = (branches: Branch[], branchId: string | undefined, countryCode?: string) =>
  !branchId || !countryCode || branches.find((b) => b.id === branchId)?.countryCode === countryCode;

import type { Branch } from "@/hooks/useOrgUnits";

// The branches to choose from: those in the chosen countries, or every one when no country is.
export const branchOptions = (branches: Branch[], countryCodes: readonly string[] = []) =>
  branches
    .filter((b) => !countryCodes.length || countryCodes.includes(b.countryCode ?? ""))
    .map((b) => ({ value: b.id, label: b.city ? `${b.name} (${b.city})` : b.name }));

// The chosen branches that still fit once the countries change: a branch in none of them does not.
export const branchesInCountries = (branches: Branch[], branchIds: readonly string[], countryCodes: readonly string[]) =>
  branchIds.filter((id) => !countryCodes.length || countryCodes.includes(branches.find((b) => b.id === id)?.countryCode ?? ""));

// The countries the chosen branches are in, each once.
export const countriesOfBranches = (branches: Branch[], branchIds: readonly string[]) => [
  ...new Set(branchIds.flatMap((id) => branches.find((b) => b.id === id)?.countryCode ?? [])),
];

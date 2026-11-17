import { APIError } from "encore.dev/api";
import { holidayCountryPrefRepository } from "../repositories/holidayCountryPref.repository";

const MAX_COUNTRIES = 300;

/** The countries as kept: trimmed, each once, in alphabetical order; empty ones dropped. */
export function cleanCountries(input: readonly string[]): string[] {
  return [...new Set(input.map((c) => c.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

// The countries whose holidays a user cares about (schemas/holidayCountryPref): theirs alone, kept on
// their account. Any name may be kept - one no longer in the World Holidays list simply shows nothing.
class MyCountriesService {
  async get(companyId: string, userId: string): Promise<string[]> {
    return holidayCountryPrefRepository.get(companyId, userId);
  }

  async set(companyId: string, userId: string, countries: readonly string[]): Promise<string[]> {
    const clean = cleanCountries(countries);
    if (clean.length > MAX_COUNTRIES) throw APIError.invalidArgument(`Pick at most ${MAX_COUNTRIES} countries`);
    if (clean.some((c) => c.length > 100)) throw APIError.invalidArgument("A country name is too long");
    await holidayCountryPrefRepository.set(companyId, userId, clean);
    return clean;
  }
}

export const myCountriesService = new MyCountriesService();

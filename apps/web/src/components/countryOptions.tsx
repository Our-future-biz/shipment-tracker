import { COUNTRIES, flagOf } from "@/lib/countries";

/** Every country as a Select option: code as value, flag + name shown, searchable by name or code (optionFilterProp="search"). */
export const COUNTRY_OPTIONS = COUNTRIES.map((country) => ({
  value: country.code,
  search: `${country.name} ${country.code}`,
  label: (
    <span className="flex items-center gap-2">
      <span aria-hidden>{flagOf(country.code)}</span>
      <span className="truncate">{country.name}</span>
    </span>
  ),
}));

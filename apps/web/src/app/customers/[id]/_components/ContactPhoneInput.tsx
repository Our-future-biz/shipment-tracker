"use client";

import { useState } from "react";
import { Input, Select, Space } from "antd";
import { getCountries, getCountryCallingCode, parsePhoneNumberFromString } from "libphonenumber-js";
import type { CountryCode } from "libphonenumber-js";
import { COUNTRIES, flagOf } from "@/lib/countries";

// Numbers saved without a country code are Czech; a new number starts there too.
export const DEFAULT_PHONE_COUNTRY: CountryCode = "CZ";

// Country names as everywhere else in the app (lib/countries); a calling-code region it lacks keeps its code.
const COUNTRY_NAMES = new Map(COUNTRIES.map((c) => [c.code, c.name]));

interface CountryOption {
  value: CountryCode;
  dialCode: string;
  name: string;
}

const COUNTRY_OPTIONS: CountryOption[] = getCountries()
  .map((country) => ({ value: country, dialCode: getCountryCallingCode(country), name: COUNTRY_NAMES.get(country) ?? country }))
  .sort((a, b) => a.name.localeCompare(b.name));

interface PhoneParts {
  country: CountryCode;
  national: string;
}

// A stored number split into the country and the rest. One that cannot be read stays whole in the number field.
export function splitPhone(value: string): PhoneParts {
  const parsed = value.trim() ? parsePhoneNumberFromString(value, DEFAULT_PHONE_COUNTRY) : undefined;
  if (!parsed) return { country: DEFAULT_PHONE_COUNTRY, national: value.trim() };
  return { country: parsed.country ?? DEFAULT_PHONE_COUNTRY, national: parsed.formatNational() };
}

// The number as it is stored: in international format ("+420 774 237 000") when it can be read, otherwise the
// country code and the digits as typed. No digits give "".
// A number typed with its own code ("+44 20 …") is taken as typed, whatever country is picked,
// so it never becomes "+420 +44 …".
export function joinPhone({ country, national }: PhoneParts): string {
  const digits = national.trim();
  if (!digits) return "";
  if (digits.startsWith("+")) {
    const own = parsePhoneNumberFromString(digits);
    return own?.isPossible() ? own.formatInternational() : digits;
  }
  const parsed = parsePhoneNumberFromString(digits, country);
  return parsed?.isPossible() ? parsed.formatInternational() : `+${getCountryCallingCode(country)} ${digits}`;
}

// Whether a stored number has a plausible length for its country (the form's check).
export function isPossiblePhone(value: string): boolean {
  return !!parsePhoneNumberFromString(value, DEFAULT_PHONE_COUNTRY)?.isPossible();
}

interface ContactPhoneInputProps {
  // Set by Form.Item: the number as stored.
  value?: string;
  onChange?: (value: string) => void;
  onPressEnter?: () => void;
  id?: string;
}

// Country (flag and dialling code) and the number. The parts are kept here as typed: read back from the joined
// value, a code shared by several countries (+1) would jump to another one.
// A value set from outside (the form reset or filled) is split again; the echo of this field's own
// change is not, so the country picked stays.
export function ContactPhoneInput({ value = "", onChange, onPressEnter, id }: ContactPhoneInputProps) {
  const [parts, setParts] = useState<PhoneParts>(() => splitPhone(value));
  const [known, setKnown] = useState(value);
  if (value !== known) {
    setKnown(value);
    if (value !== joinPhone(parts)) setParts(splitPhone(value));
  }

  const update = (next: PhoneParts) => {
    const joined = joinPhone(next);
    setParts(next);
    setKnown(joined);
    onChange?.(joined);
  };

  return (
    <Space.Compact block>
      <Select<CountryCode>
        aria-label="Country code"
        value={parts.country}
        onChange={(country) => update({ ...parts, country })}
        showSearch
        optionFilterProp="search"
        popupMatchSelectWidth={300}
        className="!w-[130px] shrink-0"
        options={COUNTRY_OPTIONS.map((option) => ({
          value: option.value,
          search: `${option.name} +${option.dialCode} ${option.value}`,
          label: (
            <span className="flex items-center gap-2">
              <span aria-hidden>{flagOf(option.value)}</span>
              <span>+{option.dialCode}</span>
            </span>
          ),
        }))}
        optionRender={(option) => {
          const country = COUNTRY_OPTIONS.find((c) => c.value === option.value);
          return (
            <span className="flex items-center gap-2">
              <span aria-hidden>{flagOf(String(option.value))}</span>
              <span className="flex-1 truncate">{country?.name}</span>
              <span className="text-slate-400 tabular-nums">+{country?.dialCode}</span>
            </span>
          );
        }}
      />
      <Input
        id={id}
        aria-label="Phone number"
        inputMode="tel"
        placeholder="123 456 789"
        value={parts.national}
        onChange={(e) => update({ ...parts, national: e.target.value })}
        onPressEnter={onPressEnter}
      />
    </Space.Compact>
  );
}

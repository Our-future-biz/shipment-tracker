"use client";

import { useState } from "react";
import { Input, Select, Space } from "antd";
import { getCountries, getCountryCallingCode, parsePhoneNumberFromString } from "libphonenumber-js";
import type { CountryCode } from "libphonenumber-js";

// Numbers saved without a country code are Czech; a new number starts there too.
export const DEFAULT_PHONE_COUNTRY: CountryCode = "CZ";

// The flag emoji of a country: its two letters as regional indicator symbols.
const flagOf = (country: string) => String.fromCodePoint(...[...country].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65));

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

interface CountryOption {
  value: CountryCode;
  dialCode: string;
  name: string;
}

const COUNTRY_OPTIONS: CountryOption[] = getCountries()
  .map((country) => ({ value: country, dialCode: getCountryCallingCode(country), name: regionNames.of(country) ?? country }))
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
export function joinPhone({ country, national }: PhoneParts): string {
  const digits = national.trim();
  if (!digits) return "";
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
export function ContactPhoneInput({ value = "", onChange, onPressEnter, id }: ContactPhoneInputProps) {
  const [parts, setParts] = useState<PhoneParts>(() => splitPhone(value));

  const update = (next: PhoneParts) => {
    setParts(next);
    onChange?.(joinPhone(next));
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

"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Select, Tooltip } from "antd";
import { ExclamationCircleOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { COUNTRIES } from "@/lib/countries";
import { countryCodeOf, countryLabel, countryMatches, countryValue, isUnmatched, UNMATCHED_HINT, type GeoKind } from "@/lib/places";

const COUNTRY_OPTIONS = COUNTRIES.map((c) => ({ code: c.code, label: countryLabel(c.code) }));

interface GeoSelectProps {
  kind: GeoKind;
  value?: string | null;
  /** The stored form: "Hamburg (DEHAM)", "Germany (DE)" or "DE"; "" when cleared. */
  onChange: (value: string) => void;
  onBlur?: () => void;
  autoFocus?: boolean;
  defaultOpen?: boolean;
  size?: "small" | "middle" | "large";
  className?: string;
  placeholder?: string;
  allowClear?: boolean;
}

/**
 * Picks a place (UN/LOCODE, searched worldwide) or a country from the database. A value not in
 * the database's form (older data, or what the AI could not match) is kept and offered as the
 * search text, so the matching places show up straight away.
 */
export function GeoSelect({
  kind,
  value,
  onChange,
  onBlur,
  autoFocus,
  defaultOpen,
  size = "middle",
  className,
  placeholder,
  allowClear = true,
}: GeoSelectProps) {
  const current = (value ?? "").trim();
  const unmatched = isUnmatched(kind, current);
  const [search, setSearch] = useState(unmatched && kind === "place" ? searchTextOf(current) : "");
  const [debounced, setDebounced] = useState(search);
  // Antd clears the search text as the list opens and closes; the old text stays until the
  // user types.
  const typed = useRef(false);
  const onSearch = (text: string) => {
    if (!text && !typed.current) return;
    typed.current = true;
    setSearch(text);
  };
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const places = useQuery({
    queryKey: ["places", debounced],
    queryFn: () => api.auth.placeSearch({ q: debounced }),
    enabled: kind === "place" && debounced.length >= 2,
    staleTime: Infinity,
  });

  const options = useMemo((): { value: string; label: ReactNode; code?: string }[] => {
    if (kind !== "place") {
      return COUNTRY_OPTIONS.map((c) => ({ value: countryValue(c.code, kind), label: c.label, code: c.code }));
    }
    const found = (places.data?.places ?? []).map((p) => ({
      value: `${p.name} (${p.code})`,
      label: (
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate">
            {p.name} <span className="text-slate-400">({p.code})</span>
          </span>
          <span className="shrink-0 text-xs text-slate-400 truncate max-w-[45%]">
            {[p.subdivisionName, p.countryCode].filter(Boolean).join(", ")}
          </span>
        </span>
      ),
    }));
    // Keep the current place listed so the box shows it before anything is searched.
    if (!debounced && current && !unmatched && !found.some((o) => o.value === current)) found.unshift({ value: current, label: <>{current}</> });
    return found;
  }, [kind, places.data, current, unmatched, debounced]);

  const selected = current && !unmatched ? (kind === "place" ? current : countryValue(countryCodeOf(current, kind)!, kind)) : undefined;

  return (
    <Select
      showSearch
      size={size}
      autoFocus={autoFocus}
      defaultOpen={defaultOpen}
      allowClear={allowClear}
      className={className}
      placeholder={unmatched ? current : (placeholder ?? (kind === "place" ? "Type a city, port or code" : "Choose a country"))}
      value={selected}
      searchValue={search}
      onSearch={onSearch}
      options={options}
      // Places are filtered by the server; countries by their label here.
      filterOption={
        kind === "place"
          ? false
          : (input, option) => countryMatches((option as { code?: string } | undefined)?.code ?? "", input)
      }
      notFoundContent={
        kind === "place"
          ? places.isFetching
            ? "Searching…"
            : debounced.length < 2
              ? "Type at least 2 letters"
              : "No place found"
          : "No country found"
      }
      onChange={(v) => onChange(v ?? "")}
      onBlur={onBlur}
      popupMatchSelectWidth={kind === "place" ? 340 : true}
    />
  );
}

/** The part of a free-text place worth searching: "PORT OF HALIFAX, CANADA" → "HALIFAX". */
function searchTextOf(text: string): string {
  return (text.split(/[,;/(]/)[0] ?? text)
    .replace(/^port\s+of\s+/i, "")
    .trim();
}

/** The warning shown next to a place or country that is not from the database. */
export function GeoFlag({ kind, value }: { kind: GeoKind; value?: string | null }) {
  if (!isUnmatched(kind, value)) return null;
  return (
    <Tooltip title={UNMATCHED_HINT}>
      <ExclamationCircleOutlined className="text-amber-500 ml-1 shrink-0" aria-label="Not from the database" />
    </Tooltip>
  );
}

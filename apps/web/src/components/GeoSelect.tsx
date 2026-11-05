"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { Select, Tooltip } from "antd";
import { ExclamationCircleOutlined } from "@ant-design/icons";
import { useDebounced } from "@/hooks/useDebounced";
import { useAirportSearch, usePlaceSearch, useRecordPlacePick, useTerminalSearch } from "@/hooks/usePlaceSearch";
import { COUNTRIES } from "@/lib/countries";
import type { geo } from "@/lib/api/client";
import { countryCodeOf, countryLabel, countryMatches, countryValue, isUnmatched, placeCodeOf, UNMATCHED_HINT, type GeoKind } from "@/lib/places";

const COUNTRY_OPTIONS = COUNTRIES.map((c) => ({ code: c.code, label: countryLabel(c.code) }));

// What an inland terminal is, beside its town.
const INLAND_KIND: Record<geo.InlandTerminalKind, string> = { dry_port: "Dry port", intermodal: "Intermodal", rail: "Rail" };

// What a place field asks for, by the codes it offers besides the places.
function placePrompt(airports: boolean, terminals: boolean): string {
  if (airports) return "Type a city, airport or code";
  if (terminals) return "Type a city, port, terminal or code";
  return "Type a city, port or code";
}

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
  /** Also offer IATA airports beside the places (a quote going by air). */
  airports?: boolean;
  /** Also offer ocean container terminals (CYs) and inland terminals beside the places (the Origin / Destination of a sea quote or shipment). */
  terminals?: boolean;
}

interface GeoOption {
  value: string;
  label: ReactNode;
  code?: string;
}

// An airport or terminal: its code first, then its name, and where it is at the side.
const codedOption = (code: string, name: string, where: (string | null | undefined)[]): GeoOption => ({
  value: `${name} (${code})`,
  label: (
    <span className="flex items-baseline justify-between gap-2">
      <span className="truncate">
        <span className="font-medium">{code}</span> <span className="text-slate-400">-</span> {name}
      </span>
      <span className="shrink-0 text-xs text-slate-400 truncate max-w-[40%]">{where.filter(Boolean).join(", ")}</span>
    </span>
  ),
});

/**
 * Picks a place (UN/LOCODE, searched worldwide; with `airports`, also an IATA airport; with
 * `terminals`, also an ocean or inland terminal) or a country from the database. Places, airports
 * and terminals are listed with the ones the user picks most first. A value not in the database's form (older data, or what the AI
 * could not match) is kept and offered as the search text, so the matching places show up
 * straight away.
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
  airports = false,
  terminals = false,
}: GeoSelectProps) {
  const current = (value ?? "").trim();
  const unmatched = isUnmatched(kind, current);
  const [search, setSearch] = useState(unmatched && kind === "place" ? searchTextOf(current) : "");
  // Antd clears the search text as the list opens and closes; the old text stays until the
  // user types.
  const typed = useRef(false);
  const onSearch = (text: string) => {
    if (!text && !typed.current) return;
    typed.current = true;
    setSearch(text);
  };
  const debounced = useDebounced(search.trim(), 250);
  const places = usePlaceSearch(debounced, kind === "place");
  const airportList = useAirportSearch(debounced, kind === "place" && airports);
  const terminalList = useTerminalSearch(debounced, kind === "place" && terminals);
  // Each place picked is counted for the user: the lists show the ones they pick most first
  // (sorted by the server, before it cuts a list).
  const recordPick = useRecordPlacePick();

  const options = useMemo((): (GeoOption | { label: ReactNode; options: GeoOption[] })[] => {
    if (kind !== "place") {
      return COUNTRY_OPTIONS.map((c) => ({ value: countryValue(c.code, kind), label: c.label, code: c.code }));
    }
    const found: GeoOption[] = (places.data?.places ?? []).map((p) => ({
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
    // Only the kinds this field offers: a search turned off still hands back what an earlier field
    // of another kind cached for the same text.
    const airportOptions = (airports ? (airportList.data?.airports ?? []) : []).map((a) => codedOption(a.code, a.name, [a.city, a.countryCode]));
    const terminalOptions = (terminals ? (terminalList.data?.terminals ?? []) : []).map((t) => codedOption(t.code, t.name, [t.port, t.countryCode]));
    const inlandOptions = (terminals ? (terminalList.data?.inland ?? []) : []).map((t) => codedOption(t.code, t.name, [INLAND_KIND[t.kind], t.town, t.countryCode]));
    // Keep the current place listed so the box shows it before anything is searched.
    const listed = [...airportOptions, ...terminalOptions, ...inlandOptions, ...found].some((o) => o.value === current);
    const pinned: GeoOption[] = !debounced && current && !unmatched && !listed ? [{ value: current, label: <>{current}</> }] : [];
    if (!airports && !terminals) return [...pinned, ...found];
    // By air airports, by sea container yards, and places in groups, so either kind of code can be picked.
    const groups = [
      { label: "Airports (IATA)", options: airportOptions },
      { label: "Container yards (CY)", options: terminalOptions },
      { label: "Inland terminals", options: inlandOptions },
      { label: "Places (UN/LOCODE)", options: found },
    ].filter((g) => g.options.length > 0);
    return [...pinned, ...groups];
  }, [kind, places.data, airportList.data, terminalList.data, airports, terminals, current, unmatched, debounced]);

  const selected = current && !unmatched ? (kind === "place" ? current : countryValue(countryCodeOf(current, kind)!, kind)) : undefined;

  // What the list says while it has nothing to offer.
  const notFound = () => {
    if (kind !== "place") return "No country found";
    if (places.isFetching || airportList.isFetching || terminalList.isFetching) return "Searching…";
    if (debounced.length < 2) return "Type at least 2 letters";
    if (airports) return "No airport or place found";
    if (terminals) return "No terminal or place found";
    return "No place found";
  };

  return (
    <Select
      showSearch
      size={size}
      autoFocus={autoFocus}
      defaultOpen={defaultOpen}
      allowClear={allowClear}
      className={className}
      placeholder={unmatched ? current : (placeholder ?? (kind === "place" ? placePrompt(airports, terminals) : "Choose a country"))}
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
      notFoundContent={notFound()}
      onChange={(v) => {
        onChange(v ?? "");
        const code = kind === "place" && v && v !== current ? placeCodeOf(v) : null;
        if (code) void recordPick(code);
      }}
      onBlur={onBlur}
      popupMatchSelectWidth={kind === "place" ? (airports || terminals ? 420 : 340) : true}
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

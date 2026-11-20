"use client";

import { useMemo, useState } from "react";
import { Button, Select, Tooltip } from "antd";
import { LeftOutlined, RightOutlined } from "@ant-design/icons";
import { CARD, CARD_BAR, CARD_TITLE, PAGE_TITLE } from "@/styles/ui";
import { usePublicHolidays } from "@/hooks/usePublicHolidays";
import { useMyCountryChoice } from "@/hooks/useMyCountries";
import { MONTHS, WEEKDAYS, holidayKey, monthWeeks } from "./_lib/calendar";
import { ALL_COUNTRIES_MARK, pickerPlaceholder, pickerValue } from "./_lib/countryChoice";
import { countryOf, flagOf, isCzechHoliday, listCountries, shownHolidays, yearHolidays, type DayHoliday } from "./_lib/dayHolidays";

const YEARS = Array.from({ length: 100 }, (_, i) => 1951 + i);

/** What a holiday's tooltip line says: where it is, and what. */
function HolidayLine({ h }: { h: DayHoliday }) {
  const flag = flagOf(h.countryCode);
  return (
    <div className="py-0.5">
      <span className="font-semibold">
        {flag && <span className="mr-1">{flag}</span>}
        {countryOf(h)}
        {h.country && h.countryCode && <span className="font-normal opacity-70"> ({h.countryCode})</span>}
      </span>
      <div>
        {h.name}
        {h.kind === "Regional" && <span className="opacity-70"> · regional{h.regions ? `: ${h.regions}` : ""}</span>}
      </div>
    </div>
  );
}

// Year calendar: 12 months with ISO week numbers; weekends and Czech public holidays in red, the
// other countries' holidays (the World Holidays list, Calendar → Public Holidays) marked with a dot,
// and on hover every holiday of the day with its country, so users know where to expect it. Today
// highlighted. No Print button (owner, 17 Nov 2026); printing from the browser (⌘P) still prints
// only the calendar, as the controls and app navigation are print:hidden.
export function CalendarView() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const { holidays: listed } = usePublicHolidays();
  const days = useMemo(() => yearHolidays(year, listed), [year, listed]);
  const countryOptions = useMemo(() => listCountries(listed), [listed]);
  // The user's countries, kept on their account and read as the Public Holidays page reads them: the
  // countries picked, every country, or no other country - and for a user who never picked, the
  // company's countries (else Germany) beside the Czech Republic, shown as the picks so the user sees
  // whose holidays these are (user council M19). Taking the last one out keeps "Czech holidays only"
  // instead of bringing that default back (mock council R21).
  const { choice, countries, pick } = useMyCountryChoice(listed);
  const pickerCountries = pickerValue(choice).filter((c) => c === ALL_COUNTRIES_MARK || countryOptions.includes(c));
  const pickCountries = (next: string[]) => void pick(countryOptions, next);

  const isToday = (m: number, d: number) =>
    year === today.getFullYear() && m === today.getMonth() && d === today.getDate();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3 flex-wrap print:hidden">
        <Button icon={<LeftOutlined />} onClick={() => setYear((y) => y - 1)} aria-label="Previous year" />
        <Select
          value={year}
          onChange={setYear}
          showSearch
          className="w-[110px]"
          options={YEARS.map((y) => ({ value: y, label: String(y) }))}
        />
        <Button icon={<RightOutlined />} onClick={() => setYear((y) => y + 1)} aria-label="Next year" />
        <Button onClick={() => setYear(today.getFullYear())}>Today</Button>
        {countryOptions.length > 0 && (
          <Select
            mode="multiple"
            allowClear
            maxTagCount="responsive"
            value={pickerCountries}
            onChange={pickCountries}
            placeholder={countries?.length ? `My countries: ${countries.join(", ")}` : pickerPlaceholder(choice)}
            className="min-w-[220px] max-w-[420px] flex-1"
            options={[{ value: ALL_COUNTRIES_MARK, label: "All countries" }, ...countryOptions.map((c) => ({ value: c, label: c }))]}
            aria-label="My countries (whose holidays are shown)"
          />
        )}
        <div className="flex items-center gap-4 text-[12px] text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-full bg-red-50 ring-1 ring-red-200" /> Czech public holiday
          </span>
          {countryOptions.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" /> Holiday in another country
            </span>
          )}
          <span>Hover a day to see where</span>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        <h2 className={`${PAGE_TITLE} text-center`}>{year}</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 print:grid-cols-3 gap-4">
          {MONTHS.map((monthName, m) => (
            <div key={monthName} className={`${CARD} overflow-hidden break-inside-avoid`}>
              <div className={`${CARD_BAR} justify-center`}>
                <h3 className={CARD_TITLE}>{monthName}</h3>
              </div>
              <div className="px-4 pt-2 pb-3">
                <table className="w-full text-center text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="py-1 font-normal text-[10px] text-slate-400">Wk</th>
                      {WEEKDAYS.map((d, i) => (
                        <th key={d} className={`py-1 font-bold ${i >= 5 ? "text-red-600" : "text-slate-500"}`}>
                          {d}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {monthWeeks(year, m).map((row) => (
                      <tr key={row.week + "-" + row.days.join()}>
                        <td className="py-1 text-[10px] text-slate-400 border-r border-slate-100">{row.week}</td>
                        {row.days.map((d, i) => {
                          if (d === null) return <td key={i} />;
                          const all = days.get(holidayKey(year, m, d));
                          const shown = shownHolidays(all, countries);
                          const czech = isCzechHoliday(all);
                          const abroad = shown.some((h) => !(h.countryCode === "CZ" && h.kind === "National"));
                          const red = i >= 5 || czech;
                          const cell = (
                            <span
                              className={`relative inline-flex items-center justify-center w-7 h-7 rounded-full font-semibold ${
                                isToday(m, d)
                                  ? "bg-indigo-600 text-white"
                                  : czech
                                    ? "bg-red-50 text-red-600"
                                    : red
                                      ? "text-red-600"
                                      : "text-slate-900"
                              }`}
                            >
                              {d}
                              {abroad && (
                                <span
                                  aria-hidden
                                  className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-amber-500"
                                />
                              )}
                            </span>
                          );
                          return (
                            <td key={i} className="py-0.5">
                              {shown.length ? (
                                <Tooltip
                                  // A long day (many countries picked) scrolls inside the tooltip
                                  // instead of running off the top of the screen (user council M19).
                                  styles={{ body: { maxHeight: "60vh", overflowY: "auto" } }}
                                  title={
                                    <div className="flex flex-col divide-y divide-white/15">
                                      {shown.map((h) => (
                                        <HolidayLine key={`${h.countryCode}-${h.kind}-${h.name}`} h={h} />
                                      ))}
                                    </div>
                                  }
                                >
                                  {cell}
                                </Tooltip>
                              ) : (
                                cell
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

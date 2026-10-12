"use client";

import { useMemo, useState } from "react";
import { Button, Select, Tooltip } from "antd";
import { LeftOutlined, PrinterOutlined, RightOutlined } from "@ant-design/icons";
import { MONTHS, WEEKDAYS, czechHolidays, holidayKey, monthWeeks } from "./_lib/calendar";

const YEARS = Array.from({ length: 100 }, (_, i) => 1951 + i);

// Year calendar: 12 months with ISO week numbers; weekends and Czech public holidays in red,
// today highlighted. Print prints only the calendar.
export function CalendarView() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const holidays = useMemo(() => czechHolidays(year), [year]);

  const isToday = (m: number, d: number) =>
    year === today.getFullYear() && m === today.getMonth() && d === today.getDate();

  return (
    <div className="flex flex-col gap-5">
      {/* Only the calendar is printed, without the app's menu and top bar. */}
      <style>{`@media print {
        body * { visibility: hidden; }
        #year-calendar, #year-calendar * { visibility: visible; }
        #year-calendar { position: absolute; left: 0; top: 0; width: 100%; }
        @page { margin: 10mm; }
      }`}</style>

      <div className="flex items-center gap-3 flex-wrap">
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
        <div className="flex-1" />
        <Button icon={<PrinterOutlined />} onClick={() => window.print()}>
          Print
        </Button>
      </div>

      <div id="year-calendar" className="flex flex-col gap-5">
        <h2 className="text-3xl font-bold text-slate-900 text-center m-0">{year}</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 print:grid-cols-3 gap-4">
          {MONTHS.map((monthName, m) => (
            <div key={monthName} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm break-inside-avoid">
              <div className="text-sm font-bold text-indigo-500 uppercase tracking-wide text-center mb-2">{monthName}</div>
              <table className="w-full text-center text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="py-1 font-normal text-[10px] text-slate-400">Wk</th>
                    {WEEKDAYS.map((d, i) => (
                      <th key={d} className={`py-1 font-bold ${i >= 5 ? "text-red-500" : "text-slate-600"}`}>
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
                        const holiday = holidays.get(holidayKey(year, m, d));
                        const red = i >= 5 || !!holiday;
                        const cell = (
                          <span
                            className={`inline-flex items-center justify-center w-7 h-7 rounded-full font-semibold ${
                              isToday(m, d)
                                ? "bg-indigo-500 text-white"
                                : holiday
                                  ? "bg-red-50 text-red-500"
                                  : red
                                    ? "text-red-500"
                                    : "text-slate-800"
                            }`}
                          >
                            {d}
                          </span>
                        );
                        return (
                          <td key={i} className="py-0.5">
                            {holiday ? <Tooltip title={holiday}>{cell}</Tooltip> : cell}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

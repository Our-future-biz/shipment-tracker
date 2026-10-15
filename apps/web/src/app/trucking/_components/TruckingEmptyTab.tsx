"use client";

import { CarOutlined, CheckOutlined } from "@ant-design/icons";
import type { TruckingTabInfo } from "../_lib/tabs";

interface TruckingEmptyTabProps {
  tab: TruckingTabInfo;
}

// A tab whose phase is not built yet: what it is for, what it will hold and which phase brings it.
export const TruckingEmptyTab = ({ tab }: TruckingEmptyTabProps) => (
  <section className="bg-white border border-slate-200 rounded-xl shadow-sm px-8 py-12 flex flex-col items-center text-center">
    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-xl text-indigo-500" aria-hidden>
      <CarOutlined />
    </span>
    <h2 className="mt-4 mb-1 text-base font-semibold text-slate-900">No {tab.label.toLowerCase()} yet</h2>
    <p className="m-0 max-w-[520px] text-[13px] text-slate-500">{tab.purpose}</p>
    <ul className="mt-5 mb-0 max-w-[520px] list-none p-0 text-left text-[13px] text-slate-600">
      {tab.holds.map((h) => (
        <li key={h} className="mb-1.5 flex gap-2 last:mb-0">
          <CheckOutlined className="mt-[3px] text-[11px] text-indigo-400" aria-hidden />
          <span>{h}</span>
        </li>
      ))}
    </ul>
    <span className="mt-6 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500">Arrives with Phase {tab.phase}</span>
  </section>
);

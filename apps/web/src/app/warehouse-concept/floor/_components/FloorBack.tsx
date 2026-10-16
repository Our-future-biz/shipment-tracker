"use client";

import { ArrowLeftOutlined } from "@ant-design/icons";

/** Title row of a position's sub-screen, with a large Back to the position. */
export function FloorBack({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onBack}
        className="flex h-12 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-[15px] font-semibold text-slate-700 cursor-pointer"
      >
        <ArrowLeftOutlined /> Position
      </button>
      <h2 className="m-0 min-w-0 flex-1 truncate text-[18px] font-bold text-slate-900">{title}</h2>
    </div>
  );
}

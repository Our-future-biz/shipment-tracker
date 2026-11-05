"use client";

import { ArrowLeftOutlined } from "@ant-design/icons";
import { MODAL_TITLE } from "@/styles/ui";

/** Title row of a position's sub-screen, with a large Back to the position. */
export function FloorBack({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onBack}
        className="flex h-12 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-[14px] font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100 cursor-pointer"
      >
        <ArrowLeftOutlined /> Position
      </button>
      <h2 className={`${MODAL_TITLE} min-w-0 flex-1 truncate`}>{title}</h2>
    </div>
  );
}

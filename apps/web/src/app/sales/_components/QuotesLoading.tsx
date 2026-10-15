"use client";

import { Spin } from "antd";
import type { LoadProgress } from "@/lib/fetchAllPages";

interface QuotesLoadingProps {
  progress: LoadProgress | null;
}

// Stands in for a screen that needs every quote while they are loaded page after page, and says
// how far the load has come - so nothing is added up or drawn from part of the quotes.
export function QuotesLoading({ progress }: QuotesLoadingProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16">
      <Spin />
      <span className="text-sm text-slate-500">
        {progress ? `Loading quotes ${progress.loaded.toLocaleString("en-US")} of ${progress.total.toLocaleString("en-US")}` : "Loading quotes…"}
      </span>
    </div>
  );
}

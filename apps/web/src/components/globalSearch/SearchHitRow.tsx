"use client";

import Link from "next/link";
import { REF } from "@/styles/ui";
import type { SearchHit } from "./searchTypes";

interface SearchHitRowProps {
  hit: SearchHit;
  /** Picked with the arrow keys (dropdown). */
  active?: boolean;
  onPick?: () => void;
  onHover?: () => void;
  id?: string;
}

// One thing found: its name (a reference in the reference type) over a line on which one it is,
// a status mark at the end. A real link, so it can also be opened in a new tab.
export function SearchHitRow({ hit, active = false, onPick, onHover, id }: SearchHitRowProps) {
  return (
    <Link
      id={id}
      href={hit.href}
      role="option"
      aria-selected={active}
      onClick={onPick}
      onMouseEnter={onHover}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg no-underline transition-colors ${
        active ? "bg-indigo-50" : "hover:bg-slate-50"
      }`}
    >
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-[13px] font-semibold ${active ? "text-indigo-700" : "text-slate-900"} ${hit.isRef ? REF : ""}`}
          title={hit.title}
        >
          {hit.title}
        </span>
        {hit.subtitle && (
          <span className="block truncate text-[12px] text-slate-500" title={hit.subtitle}>
            {hit.subtitle}
          </span>
        )}
      </span>
      {hit.mark && <span className="shrink-0">{hit.mark}</span>}
    </Link>
  );
}

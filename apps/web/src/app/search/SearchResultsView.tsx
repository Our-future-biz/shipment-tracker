"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Spin } from "antd";
import { CARD, CARD_BAR, CARD_TITLE, EMPTY_STATE, HINT, LINK, PAGE_SUBTITLE, PAGE_TITLE } from "@/styles/ui";
import { SearchHitRow } from "@/components/globalSearch/SearchHitRow";
import { MIN_QUERY, useGlobalSearch } from "@/components/globalSearch/useGlobalSearch";

// Results per kind on this page; each kind's own list shows the rest.
const PAGE_LIMIT = 20;

/**
 * Everything the main search finds for ?q=, by kind: a card per kind with up to 20 of them, its
 * count, and a link to the kind's own list searched for the same text where there is one.
 */
export function SearchResultsView() {
  const q = (useSearchParams().get("q") ?? "").trim();
  const groups = useGlobalSearch(q, PAGE_LIMIT);
  const loading = groups.some((g) => g.isLoading);
  const found = groups.filter((g) => g.hits.length > 0);
  const total = found.reduce((sum, g) => sum + g.total, 0);

  return (
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1400px] mx-auto flex flex-col gap-5">
        <div>
          <h1 className={PAGE_TITLE}>Search results</h1>
          <p className={`${PAGE_SUBTITLE} mt-0.5`}>
            {q.length < MIN_QUERY
              ? `Type at least ${MIN_QUERY} characters into the search at the top.`
              : loading
                ? `Searching for “${q}”…`
                : `${total} found for “${q}”`}
          </p>
        </div>

        {q.length >= MIN_QUERY && loading && found.length === 0 && (
          <div className="flex justify-center py-16">
            <Spin />
          </div>
        )}

        {q.length >= MIN_QUERY && !loading && found.length === 0 && (
          <div className={`${CARD} ${EMPTY_STATE}`}>
            {groups.some((g) => g.isError) ? "The search could not be finished — try again." : `Nothing found for “${q}”.`}
          </div>
        )}

        {found.map((g) => (
          <section key={g.kind} className={`${CARD} overflow-hidden`}>
            <div className={`${CARD_BAR} justify-between`}>
              <div className="flex items-center gap-2.5">
                <h2 className={CARD_TITLE}>{g.label}</h2>
                <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-white border border-indigo-100 text-[11px] font-semibold text-indigo-600 tabular-nums">
                  {g.total}
                </span>
              </div>
              {g.allHref && g.total > g.hits.length && (
                <Link href={g.allHref} className={`text-[13px] ${LINK}`}>
                  Show all {g.total} in {g.label}
                </Link>
              )}
            </div>
            <div role="listbox" aria-label={g.label} className="grid grid-cols-1 lg:grid-cols-2 gap-x-4 gap-y-0.5 p-2">
              {g.hits.map((hit) => (
                <SearchHitRow key={hit.key} hit={hit} />
              ))}
            </div>
            {g.total > g.hits.length && !g.allHref && (
              <div className={`${HINT} px-5 pb-3`}>
                The first {g.hits.length} of {g.total} — type more to narrow it down.
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

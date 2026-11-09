"use client";

import { Fragment } from "react";
import Link from "next/link";
import { CaretRightIcon } from "@phosphor-icons/react";
import { navSection } from "@/components/AppSidebar";
import { useSalesPermissions } from "@/hooks/useSalesPermissions";
import { CARD, HINT, PAGE_SUBTITLE, PAGE_TITLE } from "@/styles/ui";

// A section's own page (Sales, Tariffs, Finance): what its name in the sidebar opens. It lists the
// section's pages as the menu unfolds them, each with a line on what it is for, to pick from.
export function SectionOverview({ path }: { path: string }) {
  const section = navSection(path);
  const { canManageSales } = useSalesPermissions();
  if (!section) return null;
  const pages = (section.children ?? []).filter((c) => !c.managersOnly || canManageSales);
  const SectionIcon = section.icon;
  return (
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1400px] mx-auto flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <SectionIcon size={22} weight="fill" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className={PAGE_TITLE}>{section.label}</h1>
            {section.description && <p className={`${PAGE_SUBTITLE} mt-0.5`}>{section.description}</p>}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {pages.map((page) => (
            <Fragment key={page.path}>
              {/* As in the menu, pages set apart there (the managers' ones) start a row of their own. */}
              {page.divided && <div role="separator" className="col-span-full h-px bg-slate-200" />}
              <Link
                href={page.path}
                className={`${CARD} group flex items-center gap-4 px-5 py-4 no-underline transition-colors hover:border-indigo-300 hover:bg-indigo-50/40 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold text-slate-900 group-hover:text-indigo-700">{page.label}</span>
                  {page.description && <span className={`block ${HINT} mt-1`}>{page.description}</span>}
                </span>
                <CaretRightIcon size={16} weight="bold" aria-hidden className="shrink-0 text-slate-400 group-hover:text-indigo-600" />
              </Link>
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

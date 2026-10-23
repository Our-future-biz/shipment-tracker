"use client";

import { PageHeader } from "@/components/PageHeader";

// The warehouse managers' cockpit (Warehouse Concept → Managers). Its figures and lists are agreed
// one by one; until then the page holds its place in the menu.
export default function WarehouseManagersPage() {
  return (
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1400px] mx-auto">
        <PageHeader title="Managers" breadcrumb="Warehouse Concept" />
        <div className="bg-white border border-slate-200 rounded-2xl px-6 py-10 text-center">
          <div className="text-sm font-semibold text-slate-700">Managers cockpit</div>
          <p className="mt-1 mb-0 text-xs text-slate-400">The managers&apos; overview of the warehouse will be built here.</p>
        </div>
      </div>
    </div>
  );
}

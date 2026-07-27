import type { ReactNode } from "react";

export function SalesShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-slate-50 min-h-full p-6">
      <div className="max-w-[1600px] mx-auto">
        <h1 className="text-xl font-bold text-slate-800 mb-4">{title}</h1>
        {children}
      </div>
    </div>
  );
}

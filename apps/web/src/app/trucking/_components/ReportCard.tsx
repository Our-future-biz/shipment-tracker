import type { ReactNode } from "react";

interface ReportCardProps {
  title: string;
  extra?: ReactNode;
  children: ReactNode;
}

// One section of the Reports tab: a titled white card.
export const ReportCard = ({ title, extra, children }: ReportCardProps) => (
  <section className="bg-white border border-slate-200 rounded-xl shadow-sm" aria-label={title}>
    <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-slate-100">
      <h2 className="m-0 text-[13px] font-bold text-slate-800 uppercase tracking-wider">{title}</h2>
      {extra && <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-slate-500">{extra}</div>}
    </div>
    <div className="p-4">{children}</div>
  </section>
);

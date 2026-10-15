import type { ReactNode } from "react";

interface SalesPageProps {
  // The page's name: for a page in the Sales menu the label it has there (SALES_PAGES).
  title: string;
  // One grey line under the title, for what the title alone does not say.
  subtitle?: ReactNode;
  // The right end of the title row: quick filters as PillTabs, or a select.
  extra?: ReactNode;
  // The page's blocks - toolbar card, table card, section cards - as direct children: the frame
  // sets them 20px apart, so they carry no outer margin of their own.
  children: ReactNode;
}

// The frame of every Sales list page, the one Customer Database, Shipments and Customs have: the
// same padding, column width, title and spacing between blocks. It holds no state, so it is
// rendered by the page file or - when the title row needs the screen's own state for `extra` -
// by the screen's component itself.
export function SalesPage({ title, subtitle, extra, children }: SalesPageProps) {
  return (
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1400px] mx-auto flex flex-col gap-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          {extra}
        </div>
        {children}
      </div>
    </div>
  );
}

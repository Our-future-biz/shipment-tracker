import type { ReactNode } from "react";
import { LABEL_TEXT } from "@/styles/ui";

// The building blocks of a Finance invoice drawer (Accounts Payable, Accounts Receivable): a labelled fact for the
// facts grid, and a titled section with an optional action on the right.

/** One labelled fact of the drawer's facts grid. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className={LABEL_TEXT}>{label}</div>
      <div className="mt-0.5 text-[13px] text-slate-700">{children}</div>
    </div>
  );
}

/** A titled part of the drawer; `extra` sits at the right of the title (a button, a link). */
export function Section({ title, children, extra }: { title: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="m-0 text-[13px] font-bold uppercase tracking-wider text-slate-900">{title}</h3>
        {extra}
      </div>
      {children}
    </section>
  );
}

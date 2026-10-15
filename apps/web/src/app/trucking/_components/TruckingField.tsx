"use client";

import type { ReactNode } from "react";

interface TruckingFieldProps {
  label: string;
  hint?: string;
  children: ReactNode;
}

// A labelled control on the Trucking settings and haulier pages.
export const TruckingField = ({ label, hint, children }: TruckingFieldProps) => (
  <label className="flex min-w-0 flex-col gap-1">
    <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
    {children}
    {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
  </label>
);

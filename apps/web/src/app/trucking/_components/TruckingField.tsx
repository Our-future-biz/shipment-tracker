"use client";

import type { ReactNode } from "react";
import { HINT, LABEL_TEXT } from "@/styles/ui";

interface TruckingFieldProps {
  label: string;
  hint?: string;
  children: ReactNode;
}

// A labelled control on the Trucking settings and haulier pages: the app's field label over it, a hint under it.
export const TruckingField = ({ label, hint, children }: TruckingFieldProps) => (
  <label className="flex min-w-0 flex-col gap-1">
    <span className={LABEL_TEXT}>{label}</span>
    {children}
    {hint && <span className={HINT}>{hint}</span>}
  </label>
);

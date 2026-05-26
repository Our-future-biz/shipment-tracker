"use client";

import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  breadcrumb?: ReactNode;
  extra?: ReactNode;
}

export function PageHeader({ title, breadcrumb, extra }: PageHeaderProps) {
  return (
    <div className="mb-5">
      {breadcrumb && (
        <div className="text-xs text-slate-500 mb-1.5">{breadcrumb}</div>
      )}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800 m-0">{title}</h1>
        {extra && <div className="flex gap-2">{extra}</div>}
      </div>
    </div>
  );
}

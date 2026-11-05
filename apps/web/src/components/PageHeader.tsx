"use client";

import type { ReactNode } from "react";
import { PAGE_SUBTITLE, PAGE_TITLE } from "@/styles/ui";

interface PageHeaderProps {
  title: string;
  breadcrumb?: ReactNode;
  extra?: ReactNode;
}

export function PageHeader({ title, breadcrumb, extra }: PageHeaderProps) {
  return (
    <div className="mb-5">
      {breadcrumb && (
        <div className={`${PAGE_SUBTITLE} mb-1.5`}>{breadcrumb}</div>
      )}
      <div className="flex items-center justify-between gap-3">
        <h1 className={PAGE_TITLE}>{title}</h1>
        {extra && <div className="flex gap-2">{extra}</div>}
      </div>
    </div>
  );
}

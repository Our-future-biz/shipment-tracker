"use client";

import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  breadcrumb?: ReactNode;
  extra?: ReactNode;
}

export function PageHeader({ title, breadcrumb, extra }: PageHeaderProps) {
  return (
    <div style={{ marginBottom: 20 }}>
      {breadcrumb && (
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>{breadcrumb}</div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1e293b", margin: 0 }}>{title}</h1>
        {extra && <div style={{ display: "flex", gap: 8 }}>{extra}</div>}
      </div>
    </div>
  );
}

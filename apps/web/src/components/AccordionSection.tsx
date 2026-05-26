"use client";

import { useState, type ReactNode } from "react";

type SectionStatus = "completed" | "in-progress" | "not-started";

interface AccordionSectionProps {
  title: string;
  description: string;
  status: SectionStatus;
  defaultOpen?: boolean;
  children: ReactNode;
  id?: string;
}

const STATUS_LABELS: Record<SectionStatus, { label: string; color: string }> = {
  completed: { label: "✓ Completed", color: "#22c55e" },
  "in-progress": { label: "In progress", color: "#f59e0b" },
  "not-started": { label: "Not started", color: "#94a3b8" },
};

export function AccordionSection({
  title,
  description,
  status,
  defaultOpen = false,
  children,
  id,
}: AccordionSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const statusInfo = STATUS_LABELS[status];

  return (
    <div
      id={id}
      style={{
        background: "#fff",
        borderRadius: 10,
        border: "1px solid #e2e8f0",
        borderLeft: open ? "3px solid #6366f1" : "1px solid #e2e8f0",
        marginBottom: 8,
        overflow: "hidden",
      }}
    >
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 18px",
          cursor: "pointer",
        }}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: "#1e293b" }}>{title}</div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{description}</div>
        </div>
        <span style={{ fontSize: 11, color: statusInfo.color }}>{statusInfo.label}</span>
      </div>
      {open && (
        <div style={{ padding: "0 18px 16px", borderTop: "1px solid #f1f5f9" }}>{children}</div>
      )}
    </div>
  );
}

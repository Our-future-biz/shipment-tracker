"use client";

import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import { DownOutlined } from "@ant-design/icons";

type SectionStatus = "completed" | "in-progress" | "not-started";

interface AccordionSectionProps {
  title: string;
  description: string;
  status: SectionStatus;
  defaultOpen?: boolean;
  children: ReactNode;
  id?: string;
}

const STATUS_CONFIG: Record<SectionStatus, { label: string; color: string; icon: string }> = {
  completed: { label: "Completed", color: "#22c55e", icon: "✓" },
  "in-progress": { label: "In progress", color: "#f59e0b", icon: "●" },
  "not-started": { label: "Not started", color: "#94a3b8", icon: "○" },
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
  const [height, setHeight] = useState<number | undefined>(defaultOpen ? undefined : 0);
  const contentRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const statusInfo = STATUS_CONFIG[status];

  const updateHeight = useCallback(() => {
    if (!contentRef.current) return;
    if (open) {
      setHeight(contentRef.current.scrollHeight);
      // After transition, set to auto so content can resize
      const timer = setTimeout(() => setHeight(undefined), 250);
      return () => clearTimeout(timer);
    } else {
      // First set explicit height so transition can work
      setHeight(contentRef.current.scrollHeight);
      // Then trigger collapse on next frame
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setHeight(0));
      });
    }
  }, [open]);

  useEffect(() => {
    updateHeight();
  }, [updateHeight]);

  return (
    <div
      id={id}
      style={{
        background: "#fff",
        borderRadius: 10,
        border: "1px solid #e2e8f0",
        marginBottom: 8,
        overflow: "hidden",
        // Use a pseudo-element-like left accent via box-shadow to avoid layout shift
        boxShadow: open
          ? "inset 3px 0 0 0 #6366f1"
          : hovered
            ? "inset 3px 0 0 0 #c7d2fe"
            : "inset 3px 0 0 0 transparent",
        transition: "box-shadow 0.2s ease",
      }}
    >
      {/* Header */}
      <div
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 18px",
          cursor: "pointer",
          background: hovered ? "#fafaff" : "transparent",
          transition: "background 0.15s ease",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <DownOutlined
            style={{
              fontSize: 10,
              color: "#94a3b8",
              transition: "transform 0.25s ease",
              transform: open ? "rotate(0deg)" : "rotate(-90deg)",
            }}
          />
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: "#1e293b" }}>{title}</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{description}</div>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11,
            color: statusInfo.color,
            fontWeight: 500,
          }}
        >
          <span style={{ fontSize: 10 }}>{statusInfo.icon}</span>
          {statusInfo.label}
        </div>
      </div>

      {/* Animated content */}
      <div
        ref={contentRef}
        style={{
          height: height === undefined ? "auto" : height,
          overflow: "hidden",
          transition: "height 0.25s ease",
        }}
      >
        <div
          style={{
            padding: "12px 18px 16px",
            borderTop: "1px solid #f1f5f9",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

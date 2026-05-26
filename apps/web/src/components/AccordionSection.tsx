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
  completed: { label: "Completed", color: "#22c55e", icon: "\u2713" },
  "in-progress": { label: "In progress", color: "#f59e0b", icon: "\u25CF" },
  "not-started": { label: "Not started", color: "#94a3b8", icon: "\u25CB" },
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
      const timer = setTimeout(() => setHeight(undefined), 250);
      return () => clearTimeout(timer);
    } else {
      setHeight(contentRef.current.scrollHeight);
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
      className="bg-white rounded-lg border border-slate-200 mb-2 overflow-hidden transition-shadow duration-200"
      style={{
        boxShadow: open
          ? "inset 3px 0 0 0 #6366f1"
          : hovered
            ? "inset 3px 0 0 0 #c7d2fe"
            : "inset 3px 0 0 0 transparent",
      }}
    >
      {/* Header */}
      <div
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`flex items-center justify-between px-[18px] py-3.5 cursor-pointer select-none transition-colors duration-150 ${
          hovered ? "bg-[#fafaff]" : "bg-transparent"
        }`}
      >
        <div className="flex items-center gap-3">
          <DownOutlined
            className="text-slate-400 transition-transform duration-[250ms]"
            style={{
              fontSize: 10,
              transform: open ? "rotate(0deg)" : "rotate(-90deg)",
            }}
          />
          <div>
            <div className="font-semibold text-[13px] text-slate-800">{title}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{description}</div>
          </div>
        </div>
        <div
          className="flex items-center gap-1.5 text-[11px] font-medium"
          style={{ color: statusInfo.color }}
        >
          <span className="text-[10px]">{statusInfo.icon}</span>
          {statusInfo.label}
        </div>
      </div>

      {/* Animated content */}
      <div
        ref={contentRef}
        className="overflow-hidden transition-[height] duration-[250ms] ease-in-out"
        style={{
          height: height === undefined ? "auto" : height,
        }}
      >
        <div className="px-[18px] pt-3 pb-4 border-t border-slate-100">
          {children}
        </div>
      </div>
    </div>
  );
}

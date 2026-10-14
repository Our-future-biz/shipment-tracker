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

const STATUS_CONFIG: Record<SectionStatus, { label: string; className: string; icon: string }> = {
  completed: { label: "Completed", className: "text-green-500", icon: "\u2713" },
  "in-progress": { label: "In progress", className: "text-amber-500", icon: "\u25CF" },
  "not-started": { label: "Not started", className: "text-slate-400", icon: "\u25CB" },
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
      // The left accent: indigo while open, a lighter one while the header is hovered.
      className={`group bg-white rounded-lg border border-slate-200 mb-2 overflow-hidden transition-shadow duration-200 ${
        open
          ? "shadow-[inset_3px_0_0_0_var(--color-indigo-500)]"
          : "shadow-[inset_3px_0_0_0_transparent] hover:shadow-[inset_3px_0_0_0_var(--color-indigo-200)]"
      }`}
    >
      {/* Header */}
      <div
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between px-[18px] py-3.5 cursor-pointer select-none transition-colors duration-150 bg-transparent hover:bg-indigo-50/40"
      >
        <div className="flex items-center gap-3">
          <DownOutlined
            className={`text-slate-400 text-[10px] transition-transform duration-[250ms] ${open ? "rotate-0" : "-rotate-90"}`}
          />
          <div>
            <div className="font-semibold text-[13px] text-slate-800">{title}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{description}</div>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 text-[11px] font-medium ${statusInfo.className}`}>
          <span className="text-[10px]">{statusInfo.icon}</span>
          {statusInfo.label}
        </div>
      </div>

      {/* Animated content */}
      <div
        ref={contentRef}
        className="overflow-hidden transition-[height] duration-[250ms] ease-in-out"
        // Measured in pixels while animating, so it can't be a class.
        style={{ height: height === undefined ? "auto" : height }}
      >
        <div className="px-[18px] pt-3 pb-4 border-t border-slate-100">
          {children}
        </div>
      </div>
    </div>
  );
}

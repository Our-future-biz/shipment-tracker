"use client";

import type { CSSProperties, ReactNode } from "react";

interface AppCardProps {
  title?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  bodyStyle?: CSSProperties;
}

export function AppCard({ title, extra, children, className, style, bodyStyle }: AppCardProps) {
  return (
    <div
      className={`bg-white rounded-lg border border-slate-200 p-[18px] ${className ?? ""}`}
      style={style}
    >
      {(title || extra) && (
        <div className="flex justify-between items-center mb-3.5">
          {typeof title === "string" ? (
            <span className="text-sm font-semibold text-slate-800">{title}</span>
          ) : (
            title
          )}
          {extra}
        </div>
      )}
      <div style={bodyStyle}>{children}</div>
    </div>
  );
}

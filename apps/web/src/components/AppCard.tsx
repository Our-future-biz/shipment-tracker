"use client";

import type { CSSProperties, ReactNode } from "react";
import { CARD, CARD_BAR, CARD_TITLE } from "@/styles/ui";

interface AppCardProps {
  title?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  bodyStyle?: CSSProperties;
}

// A white card in the app's look (styles/ui.ts), as SectionCard: with a title, the indigo bar over it.
export function AppCard({ title, extra, children, className, style, bodyStyle }: AppCardProps) {
  return (
    <div className={`${CARD} overflow-hidden ${className ?? ""}`} style={style}>
      {(title || extra) && (
        <div className={CARD_BAR}>
          {typeof title === "string" ? <h3 className={`${CARD_TITLE} min-w-0 truncate`}>{title}</h3> : title}
          {extra && <div className="ml-auto shrink-0 flex items-center gap-2">{extra}</div>}
        </div>
      )}
      <div className="p-4" style={bodyStyle}>
        {children}
      </div>
    </div>
  );
}

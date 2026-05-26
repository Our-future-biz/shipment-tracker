"use client";

import type { CSSProperties, ReactNode } from "react";

interface AppCardProps {
  title?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
  bodyStyle?: CSSProperties;
}

export function AppCard({ title, extra, children, style, bodyStyle }: AppCardProps) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 10,
        border: "1px solid #e2e8f0",
        padding: 18,
        ...style,
      }}
    >
      {(title || extra) && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          {typeof title === "string" ? (
            <span style={{ fontSize: 14, fontWeight: 600, color: "#1e293b" }}>{title}</span>
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

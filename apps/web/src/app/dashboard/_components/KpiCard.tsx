"use client";

interface KpiCardProps {
  label: string;
  value: number | string;
  valueColor?: string;
  trend?: string;
  trendType?: "up" | "down" | "neutral";
}

export function KpiCard({ label, value, valueColor, trend, trendType = "neutral" }: KpiCardProps) {
  const trendColors = { up: "#22c55e", down: "#ef4444", neutral: "#64748b" };
  return (
    <div style={{ background: "#fff", borderRadius: 10, padding: 18, border: "1px solid #e2e8f0" }}>
      <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: valueColor ?? "#1e293b" }}>{value}</div>
      {trend && <div style={{ fontSize: 11, color: trendColors[trendType], marginTop: 6 }}>{trend}</div>}
    </div>
  );
}

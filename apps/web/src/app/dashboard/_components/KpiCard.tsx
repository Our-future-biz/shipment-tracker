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
    <div className="bg-white rounded-lg p-[18px] border border-slate-200">
      <div className="text-[11px] text-slate-500 uppercase tracking-wide mb-1.5">
        {label}
      </div>
      <div className="text-[28px] font-bold" style={{ color: valueColor ?? "#1e293b" }}>{value}</div>
      {trend && <div className="text-[11px] mt-1.5" style={{ color: trendColors[trendType] }}>{trend}</div>}
    </div>
  );
}

interface KpiCardProps {
  label: string;
  value: number;
  color: string;
}

export const KpiCard = ({ label, value, color }: KpiCardProps) => (
  <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3 flex flex-col gap-1 bg-white dark:bg-gray-900">
    <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</span>
    <span className="text-2xl font-bold tabular-nums" style={{ color }}>{value}</span>
  </div>
);

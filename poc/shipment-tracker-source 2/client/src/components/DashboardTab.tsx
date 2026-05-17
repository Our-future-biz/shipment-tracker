import { useMemo } from "react";
import {
  SHIPMENTS,
  STATUS_COLORS,
  isActiveStatus,
  parseDate,
  formatDate,
  type Shipment,
} from "@/lib/shipment-data";
import {
  Package,
  Clock,
  Ship,
  ShoppingCart,
  Anchor,
  AlertTriangle,
  Truck,
  CalendarClock,
  ArrowRight,
} from "lucide-react";

// Current date for deadline calculations — use March 25, 2026
const NOW = new Date(2026, 2, 25);

function getStatusBadge(status: string) {
  const color = STATUS_COLORS[status] || "#94a3b8";
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: color + "22", color, border: `1px solid ${color}44` }}
      data-testid={`badge-status-${status}`}
    >
      {status}
    </span>
  );
}

interface DeadlineItem {
  shipment: Shipment;
  deadlineType: string;
  date: Date;
  dateStr: string;
}

function getDeadlines(shipments: Shipment[]): DeadlineItem[] {
  const items: DeadlineItem[] = [];
  const activeShipments = shipments.filter((s) => isActiveStatus(s.status));

  for (const s of activeShipments) {
    const dateFields: { field: string; label: string }[] = [
      { field: "etd", label: "ETD" },
      { field: "eta", label: "ETA" },
      { field: "closing", label: "Closing" },
      { field: "crd", label: "CRD" },
      { field: "pu", label: "PU" },
    ];

    for (const df of dateFields) {
      const val = (s as any)[df.field] as string | undefined;
      if (val) {
        const d = parseDate(val);
        if (d) {
          items.push({ shipment: s, deadlineType: df.label, date: d, dateStr: val });
        }
      }
    }
  }

  items.sort((a, b) => a.date.getTime() - b.date.getTime());
  return items;
}

function categorizeDeadline(date: Date): "OVERDUE" | "TODAY" | "THIS WEEK" | "NEXT WEEK" | "LATER" {
  const today = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate());
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);

  if (diff < 0) return "OVERDUE";
  if (diff === 0) return "TODAY";
  // Days until end of this week (Sunday)
  const dayOfWeek = today.getDay(); // 0=Sun
  const daysToEndOfWeek = 7 - dayOfWeek;
  if (diff <= daysToEndOfWeek) return "THIS WEEK";
  if (diff <= daysToEndOfWeek + 7) return "NEXT WEEK";
  return "LATER";
}

const CATEGORY_ORDER = ["OVERDUE", "TODAY", "THIS WEEK", "NEXT WEEK", "LATER"] as const;
const CATEGORY_COLORS: Record<string, string> = {
  OVERDUE: "var(--brand-red-strong)",
  TODAY: "var(--brand-orange)",
  "THIS WEEK": "var(--brand-blue)",
  "NEXT WEEK": "var(--brand-teal)",
  LATER: "#64748b",
};

export function DashboardTab() {
  const activeShipments = useMemo(
    () => SHIPMENTS.filter((s) => isActiveStatus(s.status)),
    []
  );

  const kpis = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of SHIPMENTS) {
      if (isActiveStatus(s.status)) {
        counts[s.status] = (counts[s.status] || 0) + 1;
      }
    }
    return {
      totalActive: activeShipments.length,
      waitingUnload: counts["ČEKÁM NA VYKLÁDKU"] || 0,
      sailedNotOrdered: counts["ODPLULO-NEOBJEDNÁNO"] || 0,
      sailedOrdered: counts["ODPLULO-OBJEDNÁNO"] || 0,
      waitingDeparture: counts["ČEKÁM NA ODPLUTÍ"] || 0,
      missingSailing: counts["CHYBÍ PLUTÍ [EXP]"] || 0,
      waitingLoading: counts["ČEKÁM NA NAKLÁDKU"] || 0,
    };
  }, [activeShipments]);

  const deadlines = useMemo(() => getDeadlines(SHIPMENTS), []);

  const groupedDeadlines = useMemo(() => {
    const groups: Record<string, DeadlineItem[]> = {};
    for (const cat of CATEGORY_ORDER) groups[cat] = [];
    for (const dl of deadlines) {
      const cat = categorizeDeadline(dl.date);
      groups[cat].push(dl);
    }
    return groups;
  }, [deadlines]);

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* KPI Cards */}
      <section data-testid="kpi-section">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Active Shipments Overview</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard icon={<Package className="w-4 h-4" />} label="Total Active" value={kpis.totalActive} color="var(--brand-teal)" />
          <KpiCard icon={<Clock className="w-4 h-4" />} label="Waiting Unload" value={kpis.waitingUnload} color="#FFC107" />
          <KpiCard icon={<Ship className="w-4 h-4" />} label="Sailed - Not Ordered" value={kpis.sailedNotOrdered} color="var(--brand-orange)" />
          <KpiCard icon={<ShoppingCart className="w-4 h-4" />} label="Sailed - Ordered" value={kpis.sailedOrdered} color="#FFD54F" />
          <KpiCard icon={<Anchor className="w-4 h-4" />} label="Waiting Departure" value={kpis.waitingDeparture} color="var(--brand-blue)" />
          <KpiCard icon={<AlertTriangle className="w-4 h-4" />} label="Missing Sailing" value={kpis.missingSailing} color="var(--brand-red-strong)" danger />
        </div>
      </section>

      {/* Deadlines */}
      <section data-testid="deadlines-section">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
          <CalendarClock className="w-4 h-4" />
          Today&apos;s Deadlines &amp; Upcoming
        </h2>
        <div className="space-y-4">
          {CATEGORY_ORDER.filter((cat) => groupedDeadlines[cat].length > 0).map((cat) => (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded"
                  style={{ color: CATEGORY_COLORS[cat], backgroundColor: CATEGORY_COLORS[cat] + "18" }}
                >
                  {cat} ({groupedDeadlines[cat].length})
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {groupedDeadlines[cat].slice(0, 12).map((dl, i) => (
                  <DeadlineCard key={`${dl.shipment.row}-${dl.deadlineType}-${i}`} item={dl} category={cat} />
                ))}
              </div>
              {groupedDeadlines[cat].length > 12 && (
                <p className="text-xs text-muted-foreground mt-1">+{groupedDeadlines[cat].length - 12} more</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Active Shipments Table */}
      <section data-testid="active-table-section">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
          <Truck className="w-4 h-4" />
          Active Shipments ({activeShipments.length})
        </h2>
        <div className="rounded-lg border border-border/50 overflow-hidden" style={{ background: "hsl(var(--surface-9))" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50" style={{ background: "hsl(var(--surface-8))" }}>
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">Job Number</th>
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">Shipper</th>
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">Consignee</th>
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">Status</th>
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">ETD</th>
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">ETA</th>
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">Shipping Line</th>
                </tr>
              </thead>
              <tbody>
                {activeShipments.map((s) => (
                  <tr key={s.row} className="border-b border-border/30 hover:bg-white/[0.02] transition-colors" data-testid={`active-row-${s.row}`}>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums whitespace-nowrap" style={{ color: "var(--brand-teal)" }}>
                      {s.jobNumber || "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap max-w-[200px] truncate">{s.shipper}</td>
                    <td className="px-3 py-2 whitespace-nowrap max-w-[200px] truncate">{s.consignee || "—"}</td>
                    <td className="px-3 py-2">{getStatusBadge(s.status)}</td>
                    <td className="px-3 py-2 tabular-nums whitespace-nowrap">{formatDate(s.etd)}</td>
                    <td className="px-3 py-2 tabular-nums whitespace-nowrap">{formatDate(s.eta)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{s.shippingLine || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  color,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
  danger?: boolean;
}) {
  return (
    <div
      className="rounded-lg border border-border/50 px-4 py-3 flex flex-col gap-1"
      style={{
        background: danger ? "rgba(239, 83, 80, 0.08)" : "hsl(var(--surface-9))",
        borderColor: danger ? "var(--tint-red)" : undefined,
      }}
      data-testid={`kpi-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        <span style={{ color }}>{icon}</span>
        <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
      </div>
      <span className="text-2xl font-bold tabular-nums" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

function DeadlineCard({ item, category }: { item: DeadlineItem; category: string }) {
  const catColor = CATEGORY_COLORS[category];
  return (
    <div
      className="rounded-md border border-border/40 px-3 py-2 flex items-center gap-3"
      style={{ background: "hsl(var(--surface-9))" }}
      data-testid={`deadline-${item.shipment.row}-${item.deadlineType}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs tabular-nums" style={{ color: "var(--brand-teal)" }}>
            {item.shipment.jobNumber || "N/A"}
          </span>
          {getStatusBadge(item.shipment.status)}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5 truncate flex items-center gap-1">
          <span className="truncate">{item.shipment.shipper}</span>
          <ArrowRight className="w-3 h-3 flex-none opacity-50" />
          <span className="truncate">{item.shipment.consignee || "—"}</span>
        </div>
      </div>
      <div className="flex-none text-right">
        <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: catColor }}>
          {item.deadlineType}
        </div>
        <div className="text-xs font-medium tabular-nums" style={{ color: catColor }}>
          {formatDate(item.dateStr)}
        </div>
      </div>
    </div>
  );
}

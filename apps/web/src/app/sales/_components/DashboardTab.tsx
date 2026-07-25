"use client";

import { useRouter } from "next/navigation";
import {
  FileAddOutlined,
  HistoryOutlined,
  BellOutlined,
  FunnelPlotOutlined,
  BarChartOutlined,
  ContainerOutlined,
  FileProtectOutlined,
} from "@ant-design/icons";
import type { ReactNode } from "react";
import { useSalesQuotes } from "@/hooks/useSalesQuotes";
import { useToast } from "@/lib/toast";
import { needsFollowUp } from "../_lib/salesQuote";

export function DashboardTab({ onNavigate }: { onNavigate: (key: string) => void }) {
  const router = useRouter();
  const { salesQuotes, createQuote, isCreating } = useSalesQuotes();
  const toast = useToast();

  const openCount = salesQuotes.filter((q) => q.data.quoteStatus === "draft" || q.data.quoteStatus === "ready_to_send").length;
  const followUps = salesQuotes.filter((q) => needsFollowUp(q.data)).length;
  const wonCount = salesQuotes.filter((q) => q.data.quoteStatus === "won").length;

  const createQuoteAndOpen = async () => {
    try {
      const ref = await createQuote({});
      router.push(`/sales/quote/${ref}`);
    } catch {
      toast.error("Failed to create quote");
    }
  };

  const tiles: { title: string; desc: string; icon: ReactNode; onClick: () => void; primary?: boolean; badge?: number }[] = [
    { title: "Create new quote", desc: "Start a fresh freight quotation", icon: <FileAddOutlined />, onClick: createQuoteAndOpen, primary: true },
    { title: "Quote History", desc: `${salesQuotes.length} quotes`, icon: <HistoryOutlined />, onClick: () => onNavigate("quotes") },
    { title: "Follow-up", desc: "Quotes awaiting a nudge", icon: <BellOutlined />, onClick: () => onNavigate("followup"), badge: followUps },
    { title: "Pipeline", desc: "Deals by stage", icon: <FunnelPlotOutlined />, onClick: () => onNavigate("pipeline") },
    { title: "Sales Report", desc: "KPIs and conversion", icon: <BarChartOutlined />, onClick: () => onNavigate("report") },
    { title: "Shipment Reports", desc: "Revenue by shipment", icon: <ContainerOutlined />, onClick: () => onNavigate("shipments") },
    { title: "Terms & Conditions", desc: "Rate offer templates", icon: <FileProtectOutlined />, onClick: () => onNavigate("terms") },
  ];

  return (
    <div>
      {/* Snapshot */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <Stat label="Open quotes" value={openCount} />
        <Stat label="Need follow-up" value={followUps} />
        <Stat label="Won" value={wonCount} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        {tiles.map((tile) => (
          <button
            key={tile.title}
            onClick={tile.onClick}
            disabled={tile.primary && isCreating}
            className={`text-left rounded-2xl border p-5 transition-all duration-150 ${
              tile.primary
                ? "bg-indigo-500 border-indigo-500 text-white hover:bg-indigo-600"
                : "bg-white border-slate-200 hover:border-indigo-300 hover:shadow-sm"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-2xl ${tile.primary ? "text-white" : "text-indigo-500"}`}>{tile.icon}</span>
              {!!tile.badge && tile.badge > 0 && (
                <span className="text-[11px] font-semibold bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">
                  {tile.badge}
                </span>
              )}
            </div>
            <div className={`text-[15px] font-semibold mt-3 ${tile.primary ? "text-white" : "text-slate-800"}`}>
              {tile.title}
            </div>
            <div className={`text-xs mt-0.5 ${tile.primary ? "text-indigo-100" : "text-slate-400"}`}>{tile.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
      <div className="text-[11px] text-slate-400 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold text-slate-800 mt-0.5">{value}</div>
    </div>
  );
}

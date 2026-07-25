"use client";

import { Spin } from "antd";
import { useSalesQuotes } from "@/hooks/useSalesQuotes";
import { computeTotals, fmt, daysOpen } from "@/app/sales/_lib/salesQuote";
import type { SalesQuote } from "@/app/sales/_lib/salesQuote";

type StageName = "Prospect" | "Qualified" | "Proposal" | "Won";

const STAGES: { name: StageName; statuses: string[] }[] = [
  { name: "Prospect", statuses: ["draft", "ready_to_send"] },
  { name: "Qualified", statuses: ["quoted"] },
  { name: "Proposal", statuses: ["feedback", "revised"] },
  { name: "Won", statuses: ["won"] },
];

function stageForQuote(quote: SalesQuote): StageName | null {
  const status = quote.data.quoteStatus ?? "";
  const stage = STAGES.find((s) => s.statuses.includes(status));
  return stage ? stage.name : null;
}

export function PipelineTab() {
  const { salesQuotes, isLoading } = useSalesQuotes();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spin />
      </div>
    );
  }

  const byStage: Record<StageName, SalesQuote[]> = {
    Prospect: [],
    Qualified: [],
    Proposal: [],
    Won: [],
  };

  for (const quote of salesQuotes) {
    const stage = stageForQuote(quote);
    if (stage) byStage[stage].push(quote);
  }

  const stageTotals: Record<StageName, number> = {
    Prospect: 0,
    Qualified: 0,
    Proposal: 0,
    Won: 0,
  };

  for (const stage of STAGES) {
    stageTotals[stage.name] = byStage[stage.name].reduce(
      (sum, quote) => sum + computeTotals(quote.data).selling,
      0,
    );
  }

  return (
    <div>
      <div className="grid grid-cols-4 gap-3 mb-4">
        {STAGES.map((stage) => {
          const currency = byStage[stage.name][0]?.data.currency;
          return (
            <div
              key={stage.name}
              className="bg-white border border-slate-200 rounded-xl px-3 py-2.5"
            >
              <div className="text-[11px] text-slate-400 uppercase">{stage.name}</div>
              <div className="text-lg font-bold text-slate-800">
                {fmt(stageTotals[stage.name], currency)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-4 gap-4">
        {STAGES.map((stage) => {
          const quotes = byStage[stage.name];
          return (
            <div key={stage.name} className="bg-slate-100/60 rounded-2xl p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700">{stage.name}</span>
                <span className="text-xs text-slate-400">{quotes.length}</span>
              </div>

              <div className="space-y-2 mt-3">
                {quotes.length === 0 && (
                  <div className="text-xs text-slate-300">No quotes</div>
                )}
                {quotes.map((quote) => {
                  const totals = computeTotals(quote.data);
                  const d = daysOpen(quote.data);
                  const origin = quote.data.origin || "—";
                  const destination = quote.data.destination || "—";
                  return (
                    <div
                      key={quote.quoteNumber}
                      className="bg-white border border-slate-200 rounded-xl p-3"
                    >
                      <div className="text-sm font-medium text-slate-700">
                        {quote.data.customerName || "—"}
                      </div>
                      <div className="font-mono text-[11px] text-indigo-500">
                        {quote.quoteNumber}
                      </div>
                      <div className="text-xs text-slate-400">
                        {origin} → {destination}
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs font-semibold text-slate-700">
                          {fmt(totals.selling, quote.data.currency)}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {d != null ? `${d}d` : ""}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

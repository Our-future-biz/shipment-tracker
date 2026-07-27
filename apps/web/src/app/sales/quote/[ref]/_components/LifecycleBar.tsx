"use client";

import { useState } from "react";
import { Button, Modal, Select, Input, Dropdown } from "antd";
import { DownOutlined } from "@ant-design/icons";
import type { SalesQuoteData, TimelineEntry } from "../../../_lib/types";
import {
  QUOTE_STATUS_MAP,
  FEEDBACK_SUBSTATUSES,
  LOST_REASONS,
  VALIDITY_OPTIONS,
  winProbColor,
} from "../../../_lib/types";
import { validityInfo, daysOpen, needsFollowUp } from "../../../_lib/salesQuote";

interface Props {
  data: SalesQuoteData;
  onChange: (patch: Partial<SalesQuoteData>) => void;
}

// The main forward flow shown as a dot chain.
const FLOW = ["draft", "ready_to_send", "quoted", "feedback", "revised", "won"];

const TIMELINE_LABELS: Record<string, string> = {
  draft: "Draft created",
  ready_to_send: "Marked ready to send",
  quoted: "Quote sent to customer",
  feedback: "Customer feedback received",
  revised: "Quote revised",
  won: "Won — closed",
  lost: "Lost",
  expired: "Expired",
};

export function LifecycleBar({ data, onChange }: Props) {
  const current = data.quoteStatus ?? "draft";
  const def = QUOTE_STATUS_MAP[current];
  const winProb = data.winProbability ?? def?.winProbability ?? 0;
  const validity = validityInfo(data);
  const followUp = needsFollowUp(data);
  const openDays = daysOpen(data) ?? 0;

  const [target, setTarget] = useState<string | null>(null);
  const [validityDays, setValidityDays] = useState<number>(data.validityDays ?? 14);
  const [substatus, setSubstatus] = useState<string>(FEEDBACK_SUBSTATUSES[0]);
  const [lostCategory, setLostCategory] = useState<string>(Object.keys(LOST_REASONS)[0] ?? "Pricing");
  const [lostReason, setLostReason] = useState<string>("");
  const [comment, setComment] = useState<string>("");

  const openTransition = (next: string) => {
    setTarget(next);
    setComment("");
    if (next === "lost") {
      const firstCat = Object.keys(LOST_REASONS)[0] ?? "Pricing";
      setLostCategory(firstCat);
      setLostReason(LOST_REASONS[firstCat]?.[0] ?? "");
    }
  };

  const applyTransition = () => {
    if (!target) return;
    const nextDef = QUOTE_STATUS_MAP[target];
    const entry: TimelineEntry = {
      status: target,
      at: new Date().toISOString(),
      user: "You",
      comment: comment || undefined,
    };
    const patch: Partial<SalesQuoteData> = {
      quoteStatus: target,
      winProbability: nextDef?.winProbability ?? winProb,
    };
    if (target === "quoted") {
      patch.validityDays = validityDays;
      patch.sentAt = new Date().toISOString();
    }
    if (target === "feedback") {
      patch.substatus = substatus;
      entry.substatus = substatus;
    }
    if (target === "lost") {
      patch.lostReason = `${lostCategory}: ${lostReason}`;
      patch.lostComment = comment;
      entry.lostReason = patch.lostReason;
    }
    patch.timeline = [...(data.timeline ?? []), entry];
    onChange(patch);
    setTarget(null);
  };

  const nextItems = (def?.next ?? []).map((k) => ({ key: k, label: QUOTE_STATUS_MAP[k]?.label ?? k }));

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400 uppercase tracking-wide">Status</span>
          {def && (
            <span className="rounded-xl text-[13px] font-semibold px-3 py-1" style={{ backgroundColor: def.color.bg, color: def.color.text }}>
              {def.label}
            </span>
          )}
          {data.substatus && current === "feedback" && <span className="text-xs text-slate-500">· {data.substatus}</span>}
        </div>

        <Dropdown
          menu={{ items: nextItems, onClick: ({ key }) => openTransition(key) }}
          disabled={nextItems.length === 0}
          trigger={["click"]}
        >
          <Button type="primary" disabled={nextItems.length === 0}>
            Change status <DownOutlined />
          </Button>
        </Dropdown>
      </div>

      {/* Lifecycle flow bar */}
      <div className="mt-4 flex items-center">
        {current === "lost" || current === "expired" ? (
          <div className="flex items-center gap-2 text-[13px]">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: def?.color.text ?? "#94a3b8" }} />
            <span className="font-medium" style={{ color: def?.color.text }}>{def?.label}</span>
            <span className="text-slate-400">— quote is closed</span>
          </div>
        ) : (
          FLOW.map((k, i) => {
            const idx = FLOW.indexOf(current);
            const reached = idx >= 0 && i <= idx;
            const isCurrent = k === current;
            const c = QUOTE_STATUS_MAP[k];
            return (
              <div key={k} className="flex items-center">
                <div className="flex flex-col items-center">
                  <span
                    className={`w-3.5 h-3.5 rounded-full border-2 ${isCurrent ? "ring-2 ring-offset-1" : ""}`}
                    style={{
                      backgroundColor: reached ? c?.color.text : "#fff",
                      borderColor: reached ? c?.color.text : "#cbd5e1",
                    }}
                  />
                  <span className={`text-[10px] mt-1 ${isCurrent ? "font-semibold text-slate-700" : "text-slate-400"}`}>{c?.label}</span>
                </div>
                {i < FLOW.length - 1 && <span className={`w-8 h-0.5 mx-1 mb-4 ${i < idx ? "bg-indigo-300" : "bg-slate-200"}`} />}
              </div>
            );
          })
        )}
      </div>

      {/* Validity + follow-up cards */}
      {(validity.date || followUp) && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {validity.date && (
            <div className={`rounded-xl px-3 py-2 border ${validity.expired ? "bg-red-50 border-red-200" : "bg-slate-50 border-slate-100"}`}>
              <div className="text-[11px] text-slate-400 uppercase tracking-wide">Validity</div>
              <div className={`text-sm font-semibold mt-0.5 ${validity.expired ? "text-red-600" : "text-slate-800"}`}>
                {validity.expired ? `Expired (${validity.date})` : `Valid until ${validity.date}`}
              </div>
            </div>
          )}
          {followUp && (
            <div className="rounded-xl px-3 py-2 border bg-amber-50 border-amber-200">
              <div className="text-[11px] text-amber-500 uppercase tracking-wide">Follow-up</div>
              <div className="text-sm font-semibold mt-0.5 text-amber-700">
                No customer feedback in {openDays} days — follow up
              </div>
            </div>
          )}
        </div>
      )}

      {/* Win probability bar */}
      <div className="mt-4">
        <div className="flex justify-between text-xs text-slate-400 mb-1">
          <span>Win probability</span>
          <span className="font-semibold" style={{ color: winProbColor(winProb) }}>
            {winProb}%
          </span>
        </div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${winProb}%`, backgroundColor: winProbColor(winProb) }} />
        </div>
      </div>

      {/* Timeline */}
      {!!data.timeline?.length && (
        <div className="mt-4">
          <div className="text-xs font-semibold text-slate-500 mb-2">Timeline</div>
          <div className="space-y-2">
            {[...data.timeline].reverse().map((t, i) => {
              const td = QUOTE_STATUS_MAP[t.status];
              return (
                <div key={i} className="flex items-start gap-2 text-[13px]">
                  <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: td?.color.text ?? "#94a3b8" }} />
                  <div>
                    <span className="font-medium text-slate-700">{TIMELINE_LABELS[t.status] ?? td?.label ?? t.status}</span>
                    {t.substatus && <span className="text-slate-500"> · {t.substatus}</span>}
                    <span className="text-slate-400"> · {new Date(t.at).toLocaleString("en-GB")}</span>
                    {t.lostReason && <div className="text-red-500 text-xs">{t.lostReason}</div>}
                    {t.comment && <div className="text-slate-500 text-xs">{t.comment}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Transition modal */}
      <Modal
        open={!!target}
        onCancel={() => setTarget(null)}
        onOk={applyTransition}
        okText="Confirm"
        title={target ? `Move to ${QUOTE_STATUS_MAP[target]?.label ?? target}` : ""}
        destroyOnHidden
      >
        <div className="space-y-3 pt-2">
          {target === "quoted" && (
            <div>
              <div className="text-xs text-slate-500 mb-1">Validity (days)</div>
              <Select
                className="w-full"
                value={validityDays}
                onChange={setValidityDays}
                options={VALIDITY_OPTIONS.map((d) => ({ value: d, label: `${d} days` }))}
              />
            </div>
          )}
          {target === "feedback" && (
            <div>
              <div className="text-xs text-slate-500 mb-1">Feedback status</div>
              <Select
                className="w-full"
                value={substatus}
                onChange={setSubstatus}
                options={FEEDBACK_SUBSTATUSES.map((s) => ({ value: s, label: s }))}
              />
            </div>
          )}
          {target === "lost" && (
            <>
              <div>
                <div className="text-xs text-slate-500 mb-1">Reason category</div>
                <Select
                  className="w-full"
                  value={lostCategory}
                  onChange={(c) => {
                    setLostCategory(c);
                    setLostReason(LOST_REASONS[c]?.[0] ?? "");
                  }}
                  options={Object.keys(LOST_REASONS).map((c) => ({ value: c, label: c }))}
                />
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Reason</div>
                <Select
                  className="w-full"
                  value={lostReason}
                  onChange={setLostReason}
                  options={(LOST_REASONS[lostCategory] ?? []).map((r) => ({ value: r, label: r }))}
                />
              </div>
            </>
          )}
          <div>
            <div className="text-xs text-slate-500 mb-1">Comment (optional)</div>
            <Input.TextArea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>
        </div>
      </Modal>
    </div>
  );
}

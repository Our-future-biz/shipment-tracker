"use client";

import { useState } from "react";
import { Alert, Button, DatePicker, Input, Select } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { SalesDialog } from "../../../_components/SalesDialog";
import { floorText, marginText, type RoadMargin } from "../../../_lib/roadQuote";
import { MARGIN_INQUIRY_REASONS } from "@/hooks/useMarginInquiries";
import { LABEL_TEXT } from "@/styles/ui";

interface AskMarginApprovalDialogProps {
  quoteNumber: string;
  margin: RoadMargin;
  /** Sends the question. Resolves with why it was refused, or null. */
  onAsk: (input: { reason: string; note: string; needsBy: string | null; competitorPrice: string; volume: string }) => Promise<string | null>;
  onClose: () => void;
}

const LABEL = LABEL_TEXT;

// "Needs it by" is a moment still to come: the days before today, and today's hours and minutes
// already gone, can't be picked.
const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const beforeToday = (d: Dayjs) => d.isBefore(dayjs(), "day");
const pastTime = (d: Dayjs | null) => {
  const now = dayjs();
  if (!d || !d.isSame(now, "day")) return {};
  return {
    disabledHours: () => range(now.hour()),
    disabledMinutes: (hour: number) => (hour === now.hour() ? range(now.minute() + 1) : []),
  };
};

// A rep asks a manager to approve a margin below the floor (Council Outlay 6). The quote itself is
// the ask: the manager sees its figures as they are now. The owner's manager is told; the admins
// too when nobody is set, or after 4 office hours. Rendered only while open, so it starts empty.
export const AskMarginApprovalDialog = ({ quoteNumber, margin, onAsk, onClose }: AskMarginApprovalDialogProps) => {
  const [reason, setReason] = useState<string | undefined>(undefined);
  const [note, setNote] = useState("");
  const [needsBy, setNeedsBy] = useState<Dayjs | null>(null);
  const [competitorPrice, setCompetitorPrice] = useState("");
  const [volume, setVolume] = useState("");
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const problem = !reason
    ? "Pick a reason"
    : reason === "Other" && note.trim().length < 3
      ? "Say why, in a few words"
      : needsBy && !needsBy.isAfter(dayjs())
        ? "\"Customer needs it by\" has passed: pick a later time, or clear it"
        : null;

  // Selling with no buying has no margin to judge, as the margin panel says.
  const why = margin.noBuying
    ? "The quote has no buying lines, so its margin can't be judged."
    : `The margin of ${marginText(margin.marginCzk, margin.marginPercent)} is below the floor of ${floorText(margin)}.`;

  const send = async () => {
    if (!reason || problem) return;
    setSaving(true);
    setRefusal(null);
    const refused = await onAsk({ reason, note: note.trim(), needsBy: needsBy ? needsBy.toISOString() : null, competitorPrice: competitorPrice.trim(), volume: volume.trim() });
    setSaving(false);
    if (refused) setRefusal(refused);
    else onClose();
  };

  return (
    <SalesDialog
      open
      onClose={onClose}
      busy={saving}
      title="Ask for approval"
      subtitle={`${why} A manager decides; the answer comes to your notifications.`}
      footer={
        <>
          <Button disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button type="primary" loading={saving} disabled={!!problem} title={problem ?? undefined} onClick={send}>
            Send to a manager
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Reason</span>
          <Select aria-label="Reason" placeholder="Why this margin" value={reason} onChange={setReason} options={MARGIN_INQUIRY_REASONS.map((r) => ({ value: r, label: r }))} disabled={saving} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Note{reason === "Other" ? "" : " (optional)"}</span>
          <Input.TextArea aria-label="Note" rows={3} maxLength={1000} showCount value={note} onChange={(e) => setNote(e.target.value)} disabled={saving} placeholder="What the manager should know, e.g. the customer's target rate" />
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Competitor price (optional)</span>
            <Input aria-label="Competitor price" maxLength={200} value={competitorPrice} onChange={(e) => setCompetitorPrice(e.target.value)} disabled={saving} placeholder="e.g. Maersk USD 4 150 / box" />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Expected volume (optional)</span>
            <Input aria-label="Expected volume" maxLength={200} value={volume} onChange={(e) => setVolume(e.target.value)} disabled={saving} placeholder="e.g. 6 boxes a month" />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Customer needs it by (optional)</span>
          <DatePicker
            aria-label="Customer needs it by"
            showTime={{ format: "HH:mm" }}
            format="DD.MM.YYYY HH:mm"
            value={needsBy}
            onChange={setNeedsBy}
            disabledDate={beforeToday}
            disabledTime={pastTime}
            disabled={saving}
          />
        </label>
        {refusal && <Alert type="error" showIcon message={`${quoteNumber} - ${refusal}`} />}
      </div>
    </SalesDialog>
  );
};

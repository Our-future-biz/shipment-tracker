"use client";

import { useRouter } from "next/navigation";
import { Alert, Button, Card, Radio, Space, Tag } from "antd";
import { QuotePicker } from "@/app/sales/_components/QuotePicker";
import { QuoteStatusPill } from "@/app/sales/_components/QuoteStatusPill";
import { quoteHref } from "@/app/sales/_lib/quoteHref";
import type { QuoteReading } from "../_lib/useQuoteReading";
import { FieldReviewTable } from "./FieldReviewTable";

const counted = (n: number) => `${n} field${n !== 1 ? "s" : ""}`;

interface QuoteTargetProps {
  reading: QuoteReading;
}

// Where a reading goes: a new quote, or one found among all the company has.
export function QuoteTarget({ reading }: QuoteTargetProps) {
  return (
    <div className="mb-4">
      <Radio.Group value={reading.mode} onChange={(e) => reading.setMode(e.target.value)} className="mb-2">
        <Radio value="new">Create new quote</Radio>
        <Radio value="existing">Add to existing quote</Radio>
      </Radio.Group>
      {reading.mode === "new" ? (
        // No number to show: the server assigns the reference while it creates the quote.
        <div className="text-xs text-slate-400">The reference is assigned when the quote is created.</div>
      ) : (
        <QuotePicker value={reading.picked} onChange={reading.setPicked} />
      )}
    </div>
  );
}

interface QuoteReviewProps {
  reading: QuoteReading;
  onBack: () => void; onWritten: () => void;
}

// What was read, to tick and correct before it is written. Against an existing quote the table
// shows what the quote holds now; a value that differs starts unticked.
export function QuoteReview({ reading, onBack, onWritten }: QuoteReviewProps) {
  const { base, review, problem, writing } = reading;
  const ticked = review.fields.filter((f) => f.approved && f.extractedValue.trim()).length;
  const conflicts = review.fields.filter((f) => f.hasConflict).length;
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <Space size="small" wrap>
          <span className="text-sm font-semibold">
            {counted(review.fields.length)} read
            {base && (
              <>
                {" "}
                for <span className="font-mono">{base.quoteNumber}</span>
              </>
            )}
          </span>
          {base && <QuoteStatusPill status={base.effectiveStatus} />}
          {conflicts > 0 && (
            <Tag color="orange">
              {conflicts} conflict{conflicts > 1 ? "s" : ""}
            </Tag>
          )}
          {review.alreadyThere > 0 && <span className="text-xs text-slate-400">{review.alreadyThere} already on the quote</span>}
        </Space>
      </div>
      {problem && <Alert className="mb-3" type="error" showIcon message={problem} />}
      <FieldReviewTable fields={review.fields} onToggle={reading.toggle} editable onEdit={reading.edit} showExisting={base !== null} />
      {review.notes.map((note) => (
        <p key={note} className="mt-2 mb-0 text-xs text-slate-500">
          {note}
        </p>
      ))}
      <div className="flex gap-2 mt-4">
        <Button onClick={onBack} disabled={writing}>
          Back
        </Button>
        <Button
          type="primary"
          disabled={ticked === 0}
          loading={writing}
          onClick={async () => {
            if (await reading.write()) onWritten();
          }}
        >
          {base ? `Write ${counted(ticked)} to ${base.quoteNumber}` : `Create quote with ${counted(ticked)}`}
        </Button>
      </div>
    </Card>
  );
}

interface QuoteOpenButtonProps {
  quoteNumber: string;
}

// From the Done step straight to the quote: prices are not read, so that is where the work goes on.
export function QuoteOpenButton({ quoteNumber }: QuoteOpenButtonProps) {
  const router = useRouter();
  return (
    <Button size="large" onClick={() => router.push(quoteHref(quoteNumber))}>
      Open quote
    </Button>
  );
}

"use client";

import { useState } from "react";
import { Button, Checkbox, DatePicker, Popover, Tooltip } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { businessDateTime, businessDayOf, businessToday, formatDate } from "@/lib/date";

interface CostPaidCellProps {
  received: boolean;
  /** When the invoice was received (ISO); null when not known (received before that was kept). */
  receivedAt: string | null;
  /** yyyy-mm-dd, "" while unpaid */
  paidOn: string;
  paidBy: string;
  paidAt: string | null;
  /** A day marks it paid, "" takes the payment back. */
  onChange: (paidOn: string) => void;
}

// Paid on a buying cost (Council Outlay 7, step 6b; Council Review 5): the day the payment went, picked
// (today by default, never after it, K5, nor before the day its invoice was received, C-8), with who noted it
// and when shown once paid (K6). A click only opens the box, so a row is never paid or unpaid by an
// accidental click.
export function CostPaidCell({ received, receivedAt, paidOn, paidBy, paidAt, onChange }: CostPaidCellProps) {
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState<Dayjs | null>(null);
  const today = dayjs(businessToday());
  // The Prague day the invoice was received, as the server checks it; none when not known.
  const receivedOn = businessDayOf(receivedAt);

  if (!received) {
    return (
      <Tooltip title="Paid once its invoice is received">
        <span>
          <Checkbox checked={false} disabled aria-label="Supplier invoice paid" />
        </span>
      </Tooltip>
    );
  }

  const who = paidOn ? [paidBy, paidAt ? businessDateTime(paidAt) : ""].filter(Boolean).join(", ") : "";
  const save = (value: string) => {
    onChange(value);
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDay(paidOn ? dayjs(paidOn) : today);
      }}
      trigger="click"
      title={paidOn ? `Paid on ${formatDate(paidOn)}` : "Mark the invoice paid"}
      content={
        <div className="flex w-[240px] flex-col gap-2 text-[12px] text-slate-700">
          {who && <span>Noted by {who}</span>}
          <span>The day the payment went:</span>
          <DatePicker
            aria-label="Paid on"
            format="DD.MM.YYYY"
            value={day}
            onChange={setDay}
            disabledDate={(d) => d.isAfter(today, "day") || (!!receivedOn && d.isBefore(dayjs(receivedOn), "day"))}
            allowClear={false}
            size="small"
          />
          <span className="flex flex-wrap justify-end gap-2">
            {paidOn && (
              <Button size="small" danger onClick={() => save("")}>
                Take back payment
              </Button>
            )}
            <Button size="small" type="primary" disabled={!day || day.format("YYYY-MM-DD") === paidOn} onClick={() => day && save(day.format("YYYY-MM-DD"))}>
              {paidOn ? "Change day" : "Mark paid"}
            </Button>
          </span>
        </div>
      }
    >
      <Tooltip title={open ? undefined : paidOn ? `Paid on ${formatDate(paidOn)}${who ? ` · ${who}` : ""}` : "Mark paid…"}>
        <span>
          {/* Shows the state; the box above changes it. */}
          <Checkbox checked={!!paidOn} aria-label={paidOn ? `Paid on ${formatDate(paidOn)}: change` : "Mark the supplier invoice paid"} onClick={(e) => e.preventDefault()} />
        </span>
      </Tooltip>
    </Popover>
  );
}

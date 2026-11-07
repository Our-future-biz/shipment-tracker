"use client";

import { DatePicker, Form } from "antd";
import dayjs from "dayjs";
import { formatDate } from "@/lib/date";

const DATE_FORMATS = ["DD.MM.YYYY", "YYYY-MM-DD"];
const STORED_DATE = "YYYY-MM-DD";

interface Props {
  /** The date chosen, YYYY-MM-DD. */
  value: string;
  onChange: (value: string) => void;
  /** The first day that can be chosen: the quote would be expired before it. */
  today: string;
  /** A validity the quote had that has passed, said above the calendar. */
  passed?: string | null;
}

// The validity of a quote that goes out without one that still holds, chosen in the calendar.
export function ValidUntilField({ value, onChange, today, passed }: Props) {
  return (
    <Form.Item label="Valid until">
      {passed && <div className="text-xs text-red-600 mb-1">The previous validity {formatDate(passed)} has passed.</div>}
      <DatePicker
        className="w-full"
        aria-label="Valid until"
        format={DATE_FORMATS}
        allowClear={false}
        value={dayjs(value)}
        disabledDate={(date) => date.format(STORED_DATE) < today}
        onChange={(date) => date && onChange(date.format(STORED_DATE))}
      />
    </Form.Item>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Button, DatePicker, TimePicker, Tooltip } from "antd";
import { CheckOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { joinDateTime, splitDateTime } from "@/lib/columnConfig";

const DATE_LABEL = "Date";
const TIME_LABEL = "Time (optional)";
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

interface Props {
  /** "YYYY-MM-DD HH:MM", "YYYY-MM-DD" or "" */
  value: string;
  onCommit: (next: string) => void;
  onCancel: () => void;
  className?: string;
}

/**
 * A date with an optional exact time (closings, AMS / ISF deadlines). Picking the day opens the
 * time; the time may stay empty. Saved by ✓, Enter or a click elsewhere; Escape leaves it as it was.
 */
export function DateTimeEditor({ value, onCommit, onCancel, className }: Props) {
  const initial = splitDateTime(value);
  const [date, setDateState] = useState<Dayjs | null>(initial.date && dayjs(initial.date).isValid() ? dayjs(initial.date) : null);
  const [time, setTimeState] = useState(initial.time);
  const [timeOpen, setTimeOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // What save() reads: set together with the state, since Enter in a picker sets its value and
  // saves in the same keystroke, before the state has re-rendered.
  const latest = useRef({ date, time });
  const finished = useRef(false);
  const setDate = (d: Dayjs | null) => {
    latest.current = { ...latest.current, date: d };
    setDateState(d);
  };
  const setTime = (t: string) => {
    latest.current = { ...latest.current, time: t };
    setTimeState(t);
  };

  // What the two boxes show wins: a picker passes on a typed or emptied value only when it
  // loses focus, which Enter or the ✓ comes before.
  const typed = (label: string) => wrapperRef.current?.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)?.value.trim();
  const save = () => {
    if (finished.current) return;
    finished.current = true;
    let { date: d, time: t } = latest.current;
    const dateText = typed(DATE_LABEL);
    if (dateText === "") d = null;
    else if (dateText && ISO_DAY.test(dateText) && dayjs(dateText).isValid()) d = dayjs(dateText);
    const timeText = typed(TIME_LABEL);
    if (timeText === "") t = "";
    else if (timeText && HH_MM.test(timeText)) t = timeText;
    onCommit(d ? joinDateTime(d.format("YYYY-MM-DD"), t) : "");
  };
  const cancel = () => {
    finished.current = true;
    onCancel();
  };

  // A click outside the editor and its picker panels (rendered elsewhere in the page) saves —
  // after the click has taken the focus, so a time typed but not yet entered counts too.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (wrapperRef.current?.contains(target) || target?.closest?.(".ant-picker-dropdown")) return;
      setTimeout(save, 0);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `save` reads the latest values through a ref
  }, []);

  return (
    <div
      ref={wrapperRef}
      className={`flex items-center gap-1 ${className ?? ""}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") cancel();
        else if (e.key === "Enter") save();
      }}
    >
      <DatePicker
        size="small"
        autoFocus
        defaultOpen
        format="YYYY-MM-DD"
        className="min-w-[120px]"
        value={date}
        onChange={(d) => {
          setDate(d);
          if (d) setTimeOpen(true);
          else setTime("");
        }}
        aria-label={DATE_LABEL}
      />
      <TimePicker
        size="small"
        format="HH:mm"
        placeholder="Time"
        needConfirm={false}
        open={timeOpen}
        onOpenChange={setTimeOpen}
        className="w-[84px]"
        value={time ? dayjs(`2000-01-01T${time}`) : null}
        onChange={(t) => setTime(t ? t.format("HH:mm") : "")}
        aria-label={TIME_LABEL}
      />
      <Tooltip title="Save">
        <Button size="small" type="text" icon={<CheckOutlined />} onClick={save} aria-label="Save" />
      </Tooltip>
    </div>
  );
}

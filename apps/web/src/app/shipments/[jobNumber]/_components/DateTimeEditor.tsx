"use client";

import { useEffect, useRef, useState } from "react";
import { Button, DatePicker, TimePicker, Tooltip } from "antd";
import { CheckOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { splitDateTime } from "@/lib/columnConfig";
import { DATE_INPUT_FORMATS, leavesEditor, resolveDateTime, yearOutOfReach } from "./typedDate";

const DATE_LABEL = "Date";
const TIME_LABEL = "Time (optional)";

interface Props {
  /** "YYYY-MM-DD HH:MM", "YYYY-MM-DD" or "" */
  value: string;
  onCommit: (next: string) => void;
  onCancel: () => void;
  className?: string;
}

/**
 * A date with an optional exact time (closings, AMS / ISF deadlines). Picking the day opens the
 * time; the time may stay empty. Saved by ✓, Enter, Tab out of it or a click elsewhere, as a date alone is
 * (mock council S1-04); Escape leaves it as it was.
 * A typed date or time that can't be read keeps the editor open and says how to type it (user
 * council O4): saving the old value instead would let a corrected cut-off look saved.
 */
export function DateTimeEditor({ value, onCommit, onCancel, className }: Props) {
  const initial = splitDateTime(value);
  const [date, setDateState] = useState<Dayjs | null>(initial.date && dayjs(initial.date).isValid() ? dayjs(initial.date) : null);
  const [time, setTimeState] = useState(initial.time);
  const [timeOpen, setTimeOpen] = useState(false);
  const [error, setError] = useState<{ text: string; box: "date" | "time" } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // What save() reads: set together with the state, since Enter in a picker sets its value and
  // saves in the same keystroke, before the state has re-rendered.
  const latest = useRef({ date, time });
  const finished = useRef(false);
  // What was typed on the keyboard into each box since its picker last set it, or null. A picker
  // passes on a typed or emptied value only when it loses focus, which Enter or the ✓ comes before.
  // The box's own text can't be read instead: hovering a day or an hour in an open panel writes a
  // preview into it, which is not what was picked.
  const typedText = useRef<Record<string, string | null>>({ [DATE_LABEL]: null, [TIME_LABEL]: null });
  // A day or time set by its picker replaces what was typed into that box, and with it the box's
  // message; the other box's message stays while its text still can't be read.
  const setDate = (d: Dayjs | null) => {
    latest.current = { ...latest.current, date: d };
    typedText.current[DATE_LABEL] = null;
    setError((e) => (e?.box === "date" ? null : e));
    setDateState(d);
  };
  const setTime = (t: string) => {
    latest.current = { ...latest.current, time: t };
    typedText.current[TIME_LABEL] = null;
    setError((e) => (e?.box === "time" ? null : e));
    setTimeState(t);
  };

  const save = () => {
    if (finished.current) return;
    const { date: d, time: t } = latest.current;
    const next = resolveDateTime(
      { date: d ? d.format("YYYY-MM-DD") : "", time: t },
      { date: typedText.current[DATE_LABEL], time: typedText.current[TIME_LABEL] },
    );
    if ("error" in next) {
      setError({ text: next.error, box: next.box });
      // Back into the box that can't be read: a click elsewhere or a Tab out took the focus, and Escape - which
      // keeps the old date, as the message says - is read only inside the editor.
      wrapperRef.current?.querySelector<HTMLInputElement>(`input[aria-label="${next.box === "date" ? DATE_LABEL : TIME_LABEL}"]`)?.focus();
      return;
    }
    finished.current = true;
    onCommit(next.value);
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
    <Tooltip open={!!error} title={error ? <span role="alert">{error.text}</span> : null} placement="topLeft">
      <div
        ref={wrapperRef}
        // The boxes keep the width their text needs; in a narrow card the time goes under the date (O5).
        className={`flex flex-wrap items-center gap-1 ${className ?? ""}`}
        // Only real typing fires input events; a panel's hover preview doesn't.
        onInput={(e) => {
          const box = e.target as HTMLInputElement;
          const label = box.getAttribute("aria-label");
          if (label === DATE_LABEL || label === TIME_LABEL) {
            typedText.current[label] = box.value;
            setError(null);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") cancel();
          else if (e.key === "Enter") save();
        }}
        // Tab out of the editor saves, as a click elsewhere does (S1-04): the focus going from the date to the time
        // or the ✓, or into a picker's panel (rendered elsewhere in the page), stays in it. After the pickers have
        // taken what was typed on their own blur, as the click's save waits for it.
        onBlur={(e) => {
          if (leavesEditor(e.relatedTarget as Element | null, wrapperRef.current)) setTimeout(save, 0);
        }}
      >
        <DatePicker
          size="small"
          autoFocus
          defaultOpen
          // Shown as on every screen (DD.MM.YYYY); typed forms the picker doesn't read are read by save().
          format={DATE_INPUT_FORMATS}
          // A typed date that can't be read stays in the box beside its message, not the old date.
          preserveInvalidOnBlur
          status={error?.box === "date" ? "error" : undefined}
          className="min-w-[120px] shrink-0"
          value={date}
          // A day too many years from today is refused as typed (S1-05), and greyed in the panel.
          disabledDate={(d) => yearOutOfReach(d.format("YYYY-MM-DD"))}
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
          preserveInvalidOnBlur
          status={error?.box === "time" ? "error" : undefined}
          // The panel's OK, as on Commercial Parties' opening hours (no "Now"), saves the date and time.
          needConfirm
          showNow={false}
          onOk={(t) => {
            if (t) setTime(t.format("HH:mm"));
            save();
          }}
          open={timeOpen}
          onOpenChange={setTimeOpen}
          className="w-[84px] shrink-0"
          value={time ? dayjs(`2000-01-01T${time}`) : null}
          onChange={(t) => setTime(t ? t.format("HH:mm") : "")}
          // An hour or minute clicked in the panel counts at once: the picker itself passes it on
          // only when it loses focus, after the ✓ or a click elsewhere has saved.
          onCalendarChange={(t) => {
            const picked = Array.isArray(t) ? t[0] : t;
            if (picked) setTime(picked.format("HH:mm"));
          }}
          aria-label={TIME_LABEL}
        />
        <Tooltip title="Save">
          <Button size="small" type="text" icon={<CheckOutlined />} onClick={save} aria-label="Save" />
        </Tooltip>
      </div>
    </Tooltip>
  );
}

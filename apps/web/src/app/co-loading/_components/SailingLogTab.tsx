"use client";

import { useEffect, useState } from "react";
import { Button, Checkbox, Input, Spin } from "antd";
import { CountChip, SectionCard } from "@/components/SectionCard";
import { useSailingLog } from "@/hooks/useCoLoadingServices";
import { apiErrorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/date";
import { useMessages } from "@/lib/toast";
import { CARD, HINT } from "@/styles/ui";
import { noteChangedMeanwhile, noteEditorOnRead, noteRequest, type NoteEditor } from "../_lib/sailingLog";
import { CustomersToldCard } from "./CustomersToldCard";

const NOTE_MAX = 2000;
/** The dot before a history line, by what happened. */
const KIND_DOT: Record<string, string> = {
  created: "bg-slate-400",
  changed: "bg-indigo-400",
  stage: "bg-indigo-600",
  note: "bg-slate-400",
  check: "bg-emerald-500",
  linked: "bg-emerald-500",
  moved: "bg-amber-500",
  removed: "bg-red-400",
};

// A sailing's "Checklist and history" (Council Outlay 14, C5): the steps the box goes through, each
// ticked with who and when; a free note for whoever takes the box over; and one list of everything
// that happened to the sailing - its changes, its stages, every shipment that came on, moved on or
// left. For everyone; no money. Ticks and the note are read-only while the service is closed.
export function SailingLogTab({ sailingId, closed }: { sailingId: string; closed: boolean }) {
  const { log, isLoading, isError, tick, note } = useSailingLog(sailingId);
  const message = useMessages();
  // The box and the stored note it started from: Save sends that one, so a colleague's change meanwhile is refused, not written over.
  const [editor, setEditor] = useState<NoteEditor>({ text: "", startedFrom: "" });
  const stored = log?.note ?? "";
  // The stored note fills the box when it is read, and after a save; what is typed meanwhile is kept (noteEditorOnRead).
  useEffect(() => setEditor((now) => noteEditorOnRead(now, stored)), [stored]);
  const text = editor.text;

  if (isLoading)
    return (
      <div className="flex justify-center p-20">
        <Spin size="large" />
      </div>
    );
  if (isError || !log)
    return (
      <div className={`${CARD} px-5 py-8 text-center`} role="alert">
        <p className="m-0 text-[13px] text-slate-700">The checklist and the history could not be read.</p>
      </div>
    );

  const done = log.checklist.filter((i) => i.doneAt).length;
  const setTick = async (step: string, on: boolean) => {
    try {
      await tick.mutateAsync({ step, done: on });
    } catch (err) {
      message.error(apiErrorMessage(err));
    }
  };
  const saveNote = async () => {
    const request = noteRequest(editor);
    try {
      await note.mutateAsync(request);
      message.success(request.note ? "Note saved" : "Note cleared");
    } catch (err) {
      // In the server's words - a colleague changed the note meanwhile, naming who. The typed text stays in the box.
      message.error(apiErrorMessage(err));
    }
  };
  const changedMeanwhile = noteChangedMeanwhile(editor, stored);
  const closedHint = closed ? "The service is closed: nothing changes until a manager reopens it." : "";

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 items-start">
        <SectionCard title="Checklist" extra={<CountChip count={`${done} of ${log.checklist.length}`} />}>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {log.checklist.map((item) => (
              <li key={item.step} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <Checkbox checked={!!item.doneAt} disabled={closed || tick.isPending} onChange={(e) => void setTick(item.step, e.target.checked)}>
                  <span className={item.doneAt ? "text-slate-900" : "text-slate-700"}>{item.step}</span>
                </Checkbox>
                {item.doneAt && (
                  <span className="text-[12px] text-slate-500">
                    {item.doneByName || "Somebody"} · {formatDateTime(item.doneAt)}
                  </span>
                )}
                {item.offList && <span className="text-[12px] text-amber-700">no longer on the checklist</span>}
              </li>
            ))}
          </ul>
          <p className={`${HINT} m-0 mt-3`}>{closedHint || "A tick keeps who made it and when. Managers set the steps in Co-Loading Concept, Settings."}</p>
        </SectionCard>

        <SectionCard title="Hand-over note">
          <Input.TextArea
            aria-label="Hand-over note"
            rows={6}
            maxLength={NOTE_MAX}
            showCount
            disabled={closed}
            placeholder="What whoever takes this box over needs to know: who was promised what, what is still open."
            value={text}
            onChange={(e) => setEditor((now) => ({ ...now, text: e.target.value }))}
          />
          {/* A colleague's note stored since this box started: theirs beside what is typed, nothing lost. */}
          {changedMeanwhile && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800" role="status">
              <p className="m-0 font-medium">
                {log.noteByName || "Somebody"} changed the note meanwhile{log.noteAt ? ` (${formatDateTime(log.noteAt)})` : ""}
                {stored ? ". Their note:" : ", clearing it."}
              </p>
              {stored && <p className="m-0 mt-1 whitespace-pre-wrap text-slate-800">{stored}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="small" disabled={closed} onClick={() => setEditor({ text: stored, startedFrom: stored })}>
                  Use their note
                </Button>
                <Button size="small" disabled={closed} onClick={() => setEditor((now) => ({ ...now, startedFrom: stored }))}>
                  Keep mine, to save over theirs
                </Button>
              </div>
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className={HINT}>{log.noteAt ? `Last written by ${log.noteByName || "somebody"} · ${formatDateTime(log.noteAt)}` : closedHint || "Nobody has written a note yet."}</span>
            <Button type="primary" disabled={closed || text.trim() === stored} loading={note.isPending} onClick={saveNote}>
              Save note
            </Button>
          </div>
        </SectionCard>
      </div>

      <CustomersToldCard sailingId={sailingId} />

      <SectionCard title="History" bodyClassName="p-0" extra={<CountChip count={log.history.length} />}>
        <ol className="m-0 list-none p-0">
          {log.history.map((entry, index) => (
            <li key={`${entry.at}-${index}`} className="flex items-baseline gap-3 border-b border-slate-100 px-4 py-2 last:border-b-0">
              <span className={`mt-1.5 h-2 w-2 shrink-0 self-start rounded-full ${KIND_DOT[entry.kind] ?? "bg-slate-400"}`} aria-hidden />
              <span className="min-w-0 flex-1 text-[13px] text-slate-800">{entry.text}</span>
              <span className="shrink-0 whitespace-nowrap text-[12px] text-slate-500 tabular-nums">
                {entry.by ? `${entry.by} · ` : ""}
                {formatDateTime(entry.at)}
              </span>
            </li>
          ))}
        </ol>
        <p className={`${HINT} m-0 border-t border-slate-100 px-4 py-2.5`}>
          The latest first: the sailing&apos;s changes and stages, its ticks and note, and every shipment that came on, moved on or left. A container&apos;s box costs are not here: managers
          see them on Earnings.
        </p>
      </SectionCard>
    </div>
  );
}

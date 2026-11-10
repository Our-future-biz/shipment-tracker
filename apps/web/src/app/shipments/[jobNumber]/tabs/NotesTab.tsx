"use client";

import { useState } from "react";
import { Input, Button, Checkbox, DatePicker, Popconfirm, Tooltip } from "antd";
import {
  AlignLeftOutlined,
  FileTextOutlined,
  PlusOutlined,
  StarFilled,
  StarOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import type { ShipmentItem } from "@/hooks/useShipments";
import { useShipmentNotes, type ShipmentNote } from "@/hooks/useShipmentNotes";
import { formatDate, formatDateTime, todayIso } from "@/lib/date";
import { ConfirmModal } from "@/components/ConfirmModal";
import { AppModal } from "@/components/AppModal";
import { RowActionsMenu } from "@/app/shipments/_components/RowActionsMenu";
import { CARD, CARD_BAR, CARD_ICON, CARD_TITLE, LABEL_TEXT, TD, TH } from "@/styles/ui";
import { dueInfo, type DueTone } from "./noteDue";


/** The deadline chip's colours: a deadline is red; once past, solid red; a done to-do's grey. */
const DUE_TONE: Record<DueTone, string> = {
  overdue: "border-red-600 bg-red-600 text-white",
  soon: "border-red-200 bg-red-50 text-red-700",
  later: "border-red-200 bg-red-50 text-red-700",
  done: "border-slate-100 bg-transparent text-slate-400",
};

/** A deadline as the API takes it: YYYY-MM-DD, or "" for none. */
const ymd = (day: dayjs.Dayjs | null) => (day ? day.format("YYYY-MM-DD") : "");

// The shipment's to-do list: each to-do a title, details when a title is not enough, a deadline,
// who wrote it and when. Ticked off when done; a star keeps one at the very top. One table, newest
// first: the starred ones, the other open ones, then the last done ones at the bottom. The tab's
// name shows how many are open.
export function NotesTab({
  shipment,
  onSaveFreeComments,
}: {
  shipment: ShipmentItem;
  /** Free Comments, the shipment's older single note: kept here while it holds something. */
  onSaveFreeComments: (value: string) => void;
}) {
  const { notes, openCount, add, change, remove } = useShipmentNotes(shipment.id);
  // The new to-do: its title, deadline and (behind "Add details") details.
  const [title, setTitle] = useState("");
  const [due, setDue] = useState<dayjs.Dayjs | null>(null);
  const [details, setDetails] = useState("");
  const [withDetails, setWithDetails] = useState(false);
  const [viewing, setViewing] = useState<ShipmentNote | null>(null);
  const [editing, setEditing] = useState<ShipmentNote | null>(null);
  const [deleting, setDeleting] = useState<ShipmentNote | null>(null);

  const today = todayIso();
  // Newest first; the starred ones at the very top (the latest starred first); the done ones at the bottom, newest first too
  // (the server's order, kept here as well while a change is on its way).
  const newestFirst = (a: ShipmentNote, b: ShipmentNote) => b.createdAt.localeCompare(a.createdAt);
  // The latest starred on top of the starred ones.
  const latestStarred = (a: ShipmentNote, b: ShipmentNote) =>
    (b.pinnedAt ?? "").localeCompare(a.pinnedAt ?? "");
  const openNotes = notes
    .filter((n) => !n.done)
    .sort(
      (a, b) => Number(b.pinned) - Number(a.pinned) || latestStarred(a, b) || newestFirst(a, b),
    );
  const doneNotes = notes.filter((n) => n.done).sort(newestFirst);
  const overdue = openNotes.filter((n) => dueInfo(n.dueDate, today)?.tone === "overdue").length;
  const freeComments = shipment.freeComments?.trim() ?? "";

  const addNote = () => {
    const text = title.trim();
    if (!text || add.isPending) return;
    add.mutate(
      { text, details: details.trim() || undefined, dueDate: ymd(due) || undefined },
      {
        onSuccess: () => {
          setTitle("");
          setDue(null);
          setDetails("");
          setWithDetails(false);
        },
      },
    );
  };

  const row = (n: ShipmentNote) => (
    <NoteRow
      key={n.id}
      note={n}
      today={today}
      onToggle={(done) => change.mutate({ id: n.id, done })}
      onStar={() => change.mutate({ id: n.id, pinned: !n.pinned })}
      onView={() => setViewing(n)}
      onEdit={() => setEditing(n)}
      onDelete={() => setDeleting(n)}
    />
  );

  return (
    <section className={`${CARD} min-w-0 overflow-hidden`}>
      <div className={CARD_BAR}>
        <span className={`${CARD_ICON} shrink-0`}>
          <FileTextOutlined />
        </span>
        <h3 className={`${CARD_TITLE} min-w-0`}>Notes To-Do</h3>
        {openCount > 0 && (
          <Tooltip title={`${openCount} open${overdue ? `, ${overdue} overdue` : ""}`}>
            <span className="ml-1 min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-semibold leading-5 text-center tabular-nums">
              {openCount}
            </span>
          </Tooltip>
        )}
      </div>
      <div className="px-4 py-4">
        {/* A new to-do: a title (Enter adds it), a deadline, and details when wanted. */}
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          <div className="flex items-center gap-2">
            <Input
              value={title}
              maxLength={300}
              placeholder="What needs to be done?"
              aria-label="New to-do"
              onChange={(e) => setTitle(e.target.value)}
              onPressEnter={addNote}
            />
            <DatePicker
              value={due}
              onChange={setDue}
              format="DD.MM.YYYY"
              placeholder="Deadline"
              aria-label="Deadline"
              className="w-[150px] shrink-0"
            />
            <Button
              type="primary"
              onClick={addNote}
              disabled={!title.trim()}
              loading={add.isPending}
            >
              Add
            </Button>
          </div>
          {withDetails ? (
            <Input.TextArea
              className="!mt-2"
              autoFocus
              autoSize={{ minRows: 2, maxRows: 6 }}
              value={details}
              maxLength={2000}
              placeholder="Details"
              aria-label="Details"
              onChange={(e) => setDetails(e.target.value)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setWithDetails(true)}
              className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-indigo-600 hover:text-indigo-700 bg-transparent border-none p-0 cursor-pointer"
            >
              <PlusOutlined className="text-[10px]" />
              Add details
            </button>
          )}
        </div>

        {/* One table: the open to-dos, then the done ones under the last open one (the last few
            ticked off; the rest one click away). */}
        {notes.length === 0 ? (
          <p className="mt-6 mb-2 text-[13px] text-slate-500 text-center">Nothing to do yet.</p>
        ) : (
          <>
            <NotesTable className="mt-4">
              {openNotes.map(row)}
              {doneNotes.map(row)}
            </NotesTable>
          </>
        )}

        {/* Free Comments: the shipment's older single note, shown while it holds something; one click
            makes it a to-do of the list. */}
        {freeComments && (
          <FreeComments
            value={shipment.freeComments ?? ""}
            onSave={onSaveFreeComments}
            moving={add.isPending}
            onMoveToList={() =>
              add.mutate(
                { text: freeComments.slice(0, 300) },
                { onSuccess: () => onSaveFreeComments("") },
              )
            }
          />
        )}

        {viewing && (
          <NoteViewModal
            note={viewing}
            today={today}
            onClose={() => setViewing(null)}
            onEdit={() => {
              setEditing(viewing);
              setViewing(null);
            }}
          />
        )}

        {editing && (
          <NoteEditModal
            note={editing}
            saving={change.isPending}
            onClose={() => setEditing(null)}
            onSave={(values) =>
              change.mutate({ id: editing.id, ...values }, { onSuccess: () => setEditing(null) })
            }
          />
        )}

        <ConfirmModal
          open={!!deleting}
          onClose={() => setDeleting(null)}
          onConfirm={() => {
            if (deleting) remove.mutate(deleting.id, { onSettled: () => setDeleting(null) });
          }}
          title="Delete this to-do?"
          description="It is deleted for everyone who works on the shipment."
          confirmLabel="Delete"
          danger
          loading={remove.isPending}
        />
      </div>
    </section>
  );
}

// The to-dos as a table: the status, the tick box, what, until when, who wrote it and when, when it
// was finished, then ⋯; the star sits between the to-do and its deadline.
function NotesTable({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`overflow-x-auto rounded-lg border border-slate-200 ${className}`}>
      <table className="w-full min-w-[920px] table-fixed border-collapse">
        <thead>
          <tr>
            <th className={`${TH} w-[84px] !pl-3`}>Status</th>
            <th className={`${TH} w-[36px]`}>
              <span className="sr-only">Done</span>
            </th>
            <th className={TH}>To-Do</th>
            <th className={`${TH} w-[32px] !px-1`}>
              <span className="sr-only">Pin</span>
            </th>
            <th className={`${TH} w-[116px]`}>Deadline</th>
            <th className={`${TH} w-[170px]`}>Created by</th>
            <th className={`${TH} w-[140px]`}>Created</th>
            <th className={`${TH} w-[140px]`}>Finished</th>
            <th className={`${TH} w-[44px]`}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

// One to-do: a tick box, its title (a double click opens it to edit; its details on hover of a mark),
// its deadline, who wrote it and when, a star that keeps it at the top, and Edit / Delete behind ⋯.
function NoteRow({
  note,
  today,
  onToggle,
  onStar,
  onView,
  onEdit,
  onDelete,
}: {
  note: ShipmentNote;
  today: string;
  onToggle: (done: boolean) => void;
  onStar: () => void;
  /** Shows the whole to-do: its details and facts. */
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const due = dueInfo(note.dueDate, today, note.done);
  const who = note.authorName;
  const when = note.createdAt;
  // Every cell on the row's middle line, so the tick box, title, deadline and dates read as one line.
  const cell = TD;
  return (
    <tr
      className={`group transition-colors ${
        note.pinned && !note.done
          ? "bg-amber-50/70 hover:bg-amber-50"
          : note.done
            ? "bg-slate-50/60"
            : "hover:bg-slate-50"
      }`}
    >
      <td className={`${cell} !pl-3`}>
        {/* To-Do green, Done red; who ticked it off and when on hover. */}
        <Tooltip
          title={
            note.done
              ? `Done${note.doneByName ? ` by ${note.doneByName}` : ""} ${formatDateTime(note.doneAt)}`
              : undefined
          }
        >
          <span
            className={`inline-flex items-center h-6 px-2 rounded-md border text-[12px] font-semibold whitespace-nowrap ${
              note.done
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {note.done ? "Done" : "To-Do"}
          </span>
        </Tooltip>
      </td>
      <td className={cell}>
        {/* A tick asks first, so a stray click does not move a to-do. */}
        <Popconfirm
          title={note.done ? "Mark this to-do as not done?" : "Mark this to-do as done?"}
          okText={note.done ? "Not done" : "Done"}
          cancelText="Cancel"
          placement="right"
          onConfirm={() => onToggle(!note.done)}
        >
          {/* The tick changes only once confirmed (the Popconfirm's Done). */}
          <Checkbox
            checked={note.done}
            onChange={() => undefined}
            aria-label={note.done ? "Mark as not done" : "Mark as done"}
          />
        </Popconfirm>
      </td>
      <td className={cell} title="Double-click to edit" onDoubleClick={onEdit}>
        <div
          className={`text-[14.5px] leading-5 font-semibold break-words ${note.done ? "text-slate-500 line-through" : "text-slate-900"}`}
        >
          {note.text}
          {/* The details stay out of the list: a mark says there are some, a click shows the whole to-do. */}
          {note.details && (
            <button
              type="button"
              onClick={onView}
              onDoubleClick={(e) => e.stopPropagation()}
              aria-label="Show details"
              className="ml-1.5 inline-flex align-middle text-[13px] text-slate-400 hover:text-indigo-600 bg-transparent border-none p-0 cursor-pointer"
            >
              <AlignLeftOutlined />
            </button>
          )}
        </div>
      </td>
      {/* The star, between the to-do and its deadline. */}
      <td className={`${cell} !px-1`}>
        {/* Filled and amber when the to-do is kept at the top. Not offered on a done one. */}
        {!note.done && (
          <button
            type="button"
            onClick={(e) => {
              // A click leaves no focus frame or tooltip behind (the keyboard still gets its frame).
              e.currentTarget.blur();
              onStar();
            }}
            aria-label={note.pinned ? "Unpin" : "Pin to the top"}
            aria-pressed={note.pinned}
            // A starred one keeps its star in sight; the others show theirs when the row is pointed at.
            className={`h-6 w-6 flex items-center justify-center rounded bg-transparent border-none cursor-pointer text-[15px] transition-opacity outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
              note.pinned
                ? "text-amber-500 hover:text-amber-600"
                : "text-slate-300 hover:text-amber-500 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            }`}
          >
            {note.pinned ? <StarFilled /> : <StarOutlined />}
          </button>
        )}
      </td>
      <td className={cell}>
        {due ? (
          <span
            className={`inline-flex items-center h-6 px-2 rounded border text-[12px] font-medium whitespace-nowrap tabular-nums ${DUE_TONE[due.tone]}`}
            title={due.tone === "overdue" ? "Overdue" : undefined}
          >
            {due.label}
          </span>
        ) : (
          <span className="text-[13px] font-medium text-slate-600 whitespace-nowrap">None</span>
        )}
      </td>
      <td className={cell}>
        <span className="block truncate" title={who}>
          {who || "—"}
        </span>
      </td>
      <td className={`${cell} tabular-nums whitespace-nowrap`}>{formatDateTime(when)}</td>
      {/* When it was ticked off; who did it shows on the Done mark. */}
      <td className={`${cell} tabular-nums whitespace-nowrap`}>
        {note.done ? formatDateTime(note.doneAt) : <span className="text-slate-300">—</span>}
      </td>
      <td className={`${cell} !pr-2`}>
        <div className="flex items-center justify-end gap-1">
          <RowActionsMenu label="To-do actions" onEdit={onEdit} onDelete={onDelete} />
        </div>
      </td>
    </tr>
  );
}

// The whole to-do to read: its details, then its facts in a two-column table. Edit opens it to change.
function NoteViewModal({ note, today, onClose, onEdit }: { note: ShipmentNote; today: string; onClose: () => void; onEdit: () => void }) {
  const due = dueInfo(note.dueDate, today, note.done);
  const facts: [string, React.ReactNode][] = [
    [
      "Status",
      <span
        key="status"
        className={`inline-flex items-center h-6 px-2 rounded-md border text-[12px] font-semibold ${
          note.done ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"
        }`}
      >
        {note.done ? "Done" : "To-Do"}
      </span>,
    ],
    [
      "Deadline",
      due ? (
        <span key="due" className={`inline-flex items-center h-6 px-2 rounded border text-[12px] font-medium tabular-nums ${DUE_TONE[due.tone]}`}>
          {due.label}
        </span>
      ) : (
        "None"
      ),
    ],
    ["Created by", note.authorName || "—"],
    ["Created", formatDateTime(note.createdAt)],
    ["Finished", note.done ? `${formatDateTime(note.doneAt)}${note.doneByName ? ` · ${note.doneByName}` : ""}` : "—"],
  ];
  return (
    <AppModal
      open
      onClose={onClose}
      title={note.text}
      size="medium"
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Close</Button>
          <Button type="primary" onClick={onEdit}>
            Edit
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 py-1">
        <div>
          <div className={`${LABEL_TEXT} mb-1.5`}>Details</div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-[13px] leading-5 text-slate-800 whitespace-pre-wrap break-words">
            {note.details || <span className="text-slate-400">No details</span>}
          </div>
        </div>
        <table className="w-full border-collapse">
          <tbody>
            {facts.map(([label, value]) => (
              <tr key={label} className="border-b border-slate-100 last:border-b-0">
                <th className={`${LABEL_TEXT} text-left w-[130px] py-2 pr-3 align-middle`}>{label}</th>
                <td className="py-2 text-[13px] text-slate-900 align-middle tabular-nums">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppModal>
  );
}

// A to-do opened to edit: its title, details and deadline. Only what changed is saved.
function NoteEditModal({
  note,
  saving,
  onClose,
  onSave,
}: {
  note: ShipmentNote;
  saving: boolean;
  onClose: () => void;
  onSave: (values: { text?: string; details?: string; dueDate?: string }) => void;
}) {
  const [text, setText] = useState(note.text);
  const [details, setDetails] = useState(note.details);
  const [due, setDue] = useState<dayjs.Dayjs | null>(note.dueDate ? dayjs(note.dueDate) : null);
  const save = () => {
    const changes: { text?: string; details?: string; dueDate?: string } = {};
    if (text.trim() !== note.text) changes.text = text.trim();
    if (details.trim() !== note.details) changes.details = details.trim();
    if (ymd(due) !== (note.dueDate ?? "")) changes.dueDate = ymd(due);
    if (Object.keys(changes).length) onSave(changes);
    else onClose();
  };
  return (
    <AppModal
      open
      maskClosable={false}
      closable={!saving}
      onClose={onClose}
      title="Edit to-do"
      size="medium"
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="primary" loading={saving} disabled={!text.trim()} onClick={save}>
            Save
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 py-1">
        <label className="flex flex-col gap-1.5">
          <span className={LABEL_TEXT}>Title</span>
          <Input
            autoFocus
            value={text}
            maxLength={300}
            onChange={(e) => setText(e.target.value)}
            onPressEnter={save}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={LABEL_TEXT}>Details</span>
          <Input.TextArea
            autoSize={{ minRows: 3, maxRows: 8 }}
            value={details}
            maxLength={2000}
            onChange={(e) => setDetails(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={LABEL_TEXT}>Deadline</span>
          <DatePicker
            value={due}
            onChange={setDue}
            format="DD.MM.YYYY"
            placeholder="No deadline"
            className="w-[180px]"
          />
        </label>
        <p className="m-0 text-[12px] text-slate-500">
          Written by {note.authorName || "unknown"} on {formatDate(note.createdAt)}
        </p>
      </div>
    </AppModal>
  );
}

// Free Comments as text; a double click edits it, a click elsewhere saves, and "Add to the list"
// makes it a to-do (and empties Free Comments).
function FreeComments({
  value,
  onSave,
  onMoveToList,
  moving,
}: {
  value: string;
  onSave: (value: string) => void;
  onMoveToList: () => void;
  moving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const save = () => {
    setEditing(false);
    if (draft !== value) onSave(draft);
  };
  return (
    <div className="mt-6 border-t border-slate-100 pt-4">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-900">
          Free Comments
        </span>
        <Button size="small" onClick={onMoveToList} loading={moving}>
          Add to the list
        </Button>
      </div>
      {editing ? (
        <Input.TextArea
          autoFocus
          autoSize={{ minRows: 3 }}
          value={draft}
          aria-label="Free Comments"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setDraft(value);
              setEditing(false);
            }
          }}
        />
      ) : (
        <p
          className="m-0 text-[13px] leading-5 text-slate-700 whitespace-pre-wrap break-words rounded px-1 -mx-1 cursor-pointer hover:bg-slate-100"
          title="Double-click to edit"
          onDoubleClick={() => {
            setDraft(value);
            setEditing(true);
          }}
        >
          {value}
        </p>
      )}
    </div>
  );
}

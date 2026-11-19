"use client";

import { useId, useState } from "react";
import { DatePicker, Input, Modal, Popconfirm } from "antd";
import dayjs from "dayjs";
import { UserPicker } from "@/components/UserPicker";
import { useAbsenceCreate, useAbsenceDelete, useAbsenceUpdate, useAbsences } from "@/hooks/useAbsences";
import { useUsers } from "@/hooks/useUsers";
import { apiErrorMessage } from "@/lib/api";
import { businessToday } from "@/lib/date";
import { useToast } from "@/lib/toast";
import { BTN, BTN_PRIMARY, BTN_SM, HINT, LABEL_TEXT, LINK_PLAIN } from "@/styles/ui";
import {
  EMPTY_DRAFT,
  MAX_ABSENCE_NOTE,
  absenceDays,
  absenceProblem,
  comingAbsences,
  coverAwayWarning,
  coverHint,
  coverText,
  createRequest,
  draftOf,
  isAwayOn,
  updateRequest,
  userIdOf,
  type AbsenceDraft,
  type UserAbsence,
} from "../_lib/absences";

// "Away" (Council Outlay 11, D12): one user's absences from today on, each to be changed or
// deleted, and a form to record another - from, to, who covers, a note. Opened from the user menu
// ("Away…", for oneself) and from Settings → Users (a manager or an admin, for anybody of the
// company). The server checks every save again (an absence that overlaps another, who may change
// whose) and its refusals are shown as they come. A cover who is away on some of the same days is
// warned of under the picker, and the absence can be recorded all the same (K24).

/** Whose absences the dialog shows. */
export interface AwayPerson {
  id: string;
  name: string;
}

export interface AwayDialogProps {
  open: boolean;
  person: AwayPerson | null;
  /** The signed-in user's own absences: recorded without naming the user, and worded to them. */
  self: boolean;
  onClose(): void;
}

export function AwayDialog({ open, person, self, onClose }: AwayDialogProps) {
  // Mounted anew each time it opens, and for each person: nothing of the last one is left in the form.
  return open && person ? <Dialog key={person.id} person={person} self={self} onClose={onClose} /> : null;
}

function Dialog({ person, self, onClose }: { person: AwayPerson; self: boolean; onClose(): void }) {
  const toast = useToast();
  const [today] = useState(businessToday);
  // From today on: the absence in force and the coming ones.
  const { absences, isLoading, isError } = useAbsences({ userId: person.id, since: today });
  const { users } = useUsers();
  const create = useAbsenceCreate();
  const update = useAbsenceUpdate();
  const remove = useAbsenceDelete();
  const [editing, setEditing] = useState<UserAbsence | null>(null);
  const [draft, setDraft] = useState<AbsenceDraft>(EMPTY_DRAFT);
  const [error, setError] = useState("");
  const fromId = useId();
  const toId = useId();
  const coverId = useId();
  const noteId = useId();

  const saving = create.isPending || update.isPending;
  const problem = absenceProblem(draft, person.id, users);
  // K24: the cover's own absences on those days - a warning, never a refusal. Read once the cover and the first day
  // are picked; a read that fails just says nothing (the server does not check it either).
  const coverUserId = userIdOf(draft.coverEmail, users);
  const asksCover = !!coverUserId && coverUserId !== person.id && /^\d{4}-\d{2}-\d{2}$/.test(draft.fromDate);
  const coverAbsences = useAbsences({ userId: coverUserId ?? undefined, since: draft.fromDate }, asksCover);
  const cover = users.find((u) => u.id === coverUserId);
  const coverAway = asksCover ? coverAwayWarning(draft, cover?.displayName || cover?.email || "", coverAbsences.absences) : null;
  const coming = comingAbsences(absences, today);
  const set = (patch: Partial<AbsenceDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const startEdit = (a: UserAbsence) => {
    setEditing(a);
    setDraft(draftOf(a));
    setError("");
  };
  const stopEdit = () => {
    setEditing(null);
    setDraft(EMPTY_DRAFT);
    setError("");
  };

  const save = () => {
    if (problem || saving) return;
    setError("");
    const done = editing
      ? update.mutateAsync({ id: editing.id, request: updateRequest(draft, users) })
      : create.mutateAsync(createRequest(draft, person.id, self, users));
    done
      .then((saved) => {
        toast.success(`${editing ? "Absence changed" : "Absence recorded"}: ${absenceDays(saved)}`);
        stopEdit();
      })
      .catch((e) => setError(apiErrorMessage(e)));
  };

  const deleteOne = (a: UserAbsence) =>
    remove
      .mutateAsync(a.id)
      .then(() => {
        toast.success(`Absence deleted: ${absenceDays(a)}`);
        if (editing?.id === a.id) stopEdit();
      })
      .catch((e) => toast.error(`Not deleted: ${apiErrorMessage(e)}`));

  const close = () => {
    if (!saving) onClose();
  };

  return (
    <Modal
      open
      title={self ? "Away" : `Away · ${person.name}`}
      width={600}
      onCancel={close}
      maskClosable={!saving}
      destroyOnHidden
      footer={
        <div className="flex justify-end">
          <button type="button" onClick={close} disabled={saving} className={BTN}>
            Close
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className={HINT}>
          {self ? "When you are away, your colleagues and managers see it on Shipments → Managers." : `When ${person.name} is away, it shows on Shipments → Managers.`}
        </div>

        <section aria-label="Absences from today on" className="flex flex-col gap-2">
          <div className={LABEL_TEXT}>From today on</div>
          {isLoading ? (
            <div className={HINT}>Loading…</div>
          ) : isError ? (
            <div className="text-[13px] text-red-600">Could not load the absences.</div>
          ) : coming.length === 0 ? (
            <div className="text-[13px] text-slate-400">No absence recorded from today on.</div>
          ) : (
            <ul className="m-0 p-0 list-none flex flex-col divide-y divide-slate-100 rounded-lg border border-slate-200">
              {coming.map((a) => (
                <li key={a.id} className={`flex items-start justify-between gap-3 px-3 py-2 ${editing?.id === a.id ? "bg-indigo-50" : ""}`}>
                  <div className="min-w-0 text-[13px]">
                    <div className="font-semibold text-slate-900 tabular-nums">
                      {absenceDays(a)}
                      {isAwayOn(a, today) && <span className="ml-2 text-[12px] font-medium text-amber-700">away now</span>}
                    </div>
                    <div className="text-slate-600">Cover: {coverText(a)}</div>
                    {/* Somebody else's note reaches only the managers; to anybody else it comes empty and no line is drawn. */}
                    {a.note.trim() && <div className="text-slate-500 [overflow-wrap:anywhere]">{a.note}</div>}
                  </div>
                  {a.mayChange && (
                    <div className="flex items-center gap-3 shrink-0 text-[13px]">
                      <button type="button" onClick={() => startEdit(a)} disabled={saving} className={`p-0 border-none bg-transparent cursor-pointer ${LINK_PLAIN}`}>
                        Change
                      </button>
                      <Popconfirm
                        title="Delete this absence?"
                        description="The Holiday Cover it set on jobs comes off within 15 minutes, where nobody changed it since."
                        okText="Delete"
                        okButtonProps={{ danger: true, loading: remove.isPending }}
                        onConfirm={() => deleteOne(a)}
                      >
                        <button type="button" disabled={saving} className="p-0 border-none bg-transparent cursor-pointer text-red-600 hover:underline">
                          Delete
                        </button>
                      </Popconfirm>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label={editing ? "Change the absence" : "Record an absence"} className="flex flex-col gap-3">
          <div className={LABEL_TEXT}>{editing ? `Change ${absenceDays(editing)}` : "Record an absence"}</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={fromId} className={`block mb-1 ${LABEL_TEXT}`}>
                From
              </label>
              <DatePicker
                id={fromId}
                className="w-full"
                value={draft.fromDate ? dayjs(draft.fromDate) : null}
                onChange={(d) => {
                  const fromDate = d ? d.format("YYYY-MM-DD") : "";
                  // A To before the new From is moved along: one click less for a one-day absence.
                  set(draft.toDate && fromDate && draft.toDate < fromDate ? { fromDate, toDate: fromDate } : { fromDate });
                }}
                format="DD.MM.YYYY"
                disabled={saving}
              />
            </div>
            <div>
              <label htmlFor={toId} className={`block mb-1 ${LABEL_TEXT}`}>
                To
              </label>
              <DatePicker
                id={toId}
                className="w-full"
                value={draft.toDate ? dayjs(draft.toDate) : null}
                onChange={(d) => set({ toDate: d ? d.format("YYYY-MM-DD") : "" })}
                format="DD.MM.YYYY"
                disabled={saving}
                disabledDate={(d) => !!draft.fromDate && d.format("YYYY-MM-DD") < draft.fromDate}
                defaultPickerValue={draft.fromDate ? dayjs(draft.fromDate) : undefined}
              />
            </div>
          </div>
          <div className={`${HINT} -mt-1`}>Both days included.</div>
          <div>
            <label htmlFor={coverId} className={`block mb-1 ${LABEL_TEXT}`}>
              Cover
            </label>
            <UserPicker id={coverId} className="w-full" value={draft.coverEmail} onChange={(coverEmail) => set({ coverEmail })} placeholder="Nobody" disabled={saving} />
            <div className={`${HINT} mt-1`}>{coverHint(self, person.name)}</div>
            {coverAway && (
              <div role="status" className="mt-1 text-[12px] font-medium text-amber-700">
                {coverAway}.
              </div>
            )}
          </div>
          <div>
            <label htmlFor={noteId} className={`block mb-1 ${LABEL_TEXT}`}>
              Note — seen by you and the managers
            </label>
            <Input id={noteId} value={draft.note} onChange={(e) => set({ note: e.target.value })} maxLength={MAX_ABSENCE_NOTE} placeholder="Holiday, training…" disabled={saving} />
          </div>
          <div className="flex items-center justify-end gap-2">
            {/* Why it can't be sent yet, once something was typed. */}
            {problem && draft !== EMPTY_DRAFT && <span className={`${HINT} mr-auto`}>{problem}.</span>}
            {editing && (
              <button type="button" onClick={stopEdit} disabled={saving} className={`${BTN} ${BTN_SM}`}>
                Cancel change
              </button>
            )}
            <button type="button" onClick={save} disabled={saving || !!problem} className={`${BTN_PRIMARY} ${BTN_SM}`}>
              {saving ? "Saving…" : editing ? "Save" : "Record"}
            </button>
          </div>
          <div aria-live="polite">{error && <div className="text-[13px] text-red-600">Not saved: {error}</div>}</div>
        </section>
      </div>
    </Modal>
  );
}

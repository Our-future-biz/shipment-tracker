"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, App, Button, Form, Input, Spin } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import { useSalesPermissions } from "@/hooks/useSalesPermissions";
import { useTermsConditions, type TermsConditionItem } from "@/hooks/useTermsConditions";
import { apiErrorMessage, ErrCode, isAPIError } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { useToast } from "@/lib/toast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Pill } from "@/components/Pill";
import { SectionCard } from "@/components/SectionCard";
import { ManagersOnlyNote } from "./ManagersOnlyNote";
import { SalesDialog } from "./SalesDialog";

// A change is sent once the user has stopped typing for this long.
const AUTOSAVE_DELAY_MS = 600;
// How long "Saved" stays in the card's header.
const SAVED_FLASH_MS = 2000;

const CONFLICT = "changed by someone else";
const NO_NAME = "Name is required";

type Fields = Pick<TermsConditionItem, "name" | "includes" | "excludes" | "subjectTo">;

// One template as this visit of the page holds it.
interface Copy {
  /**
   * The template as the server last gave it to this page: read with the list, or the answer to a
   * save from here. What is typed is unsaved against it - not against the list, which is read
   * again behind every save - and a save names its updatedAt as the version it was made on.
   */
  stored: TermsConditionItem;
  /** What the fields hold. */
  fields: Fields;
  /** A save of it is running. */
  saving: boolean;
  /** Why the last save was refused, to finish "Not saved - …". Stays until a save succeeds or the latest version is loaded. */
  problem: string | null;
  /** Somebody else saved the template since `stored`: nothing more is sent from here until the latest version is loaded. */
  conflict: boolean;
}

const copyOf = (stored: TermsConditionItem): Copy => ({
  stored,
  fields: { name: stored.name, includes: stored.includes, excludes: stored.excludes, subjectTo: stored.subjectTo ?? "" },
  saving: false,
  problem: null,
  conflict: false,
});

// What a save has to send: the fields that differ from the stored template - or null, when the
// server has everything. The server trims a name, so spaces around one are no change.
function changesOf({ stored, fields }: Copy): Partial<Fields> | null {
  const changes: Partial<Fields> = {};
  if (fields.name.trim() !== stored.name.trim()) changes.name = fields.name.trim();
  if (fields.includes !== stored.includes) changes.includes = fields.includes;
  if (fields.excludes !== stored.excludes) changes.excludes = fields.excludes;
  if (fields.subjectTo !== (stored.subjectTo ?? "")) changes.subjectTo = fields.subjectTo;
  return Object.keys(changes).length ? changes : null;
}

// Why the server does not have what a template's fields hold, and will not get it by another
// try alone; null when it has it, or nothing stands in the way of sending it.
function notSaved(copy: Copy): string | null {
  if (!changesOf(copy)) return null;
  if (copy.conflict) return CONFLICT;
  // A template needs a name: nothing of it is sent until it has one.
  if (!copy.fields.name.trim()) return NO_NAME;
  return copy.problem;
}

// One toast per template about a refused save: a refusal repeated with every change refreshes
// that toast instead of stacking a new one each time.
const saveToastKey = (id: string) => `template-save:${id}`;

// The templates and their edited copies while Sales Settings is open. The tab reads and writes
// the three fields through this hook only, so every rule of safe saving lives here: nothing is
// sent before the user changes something, what is typed is never replaced by an answer of the
// server, saves go out one at a time and each names the version it was made on, a change that is
// waiting goes out when its template or the page is left, and a refused save is never hidden.
// `canEdit` is the server's word that the user may change the templates; for anybody else the
// copies are only read.
function useTemplateEditor(canEdit: boolean) {
  const { terms, isLoading, reload, createTerms, updateTerms, deleteTerms } = useTermsConditions();
  // antd's message API itself rather than useToast(): it is the same object on every render,
  // which the leave effect below needs - it must run when the page is left, not on each render -
  // and it lets a toast be replaced and taken down by its key.
  const { message } = App.useApp();

  const [copies, setCopies] = useState<Record<string, Copy>>({});
  // The template whose header says "Saved" for a moment.
  const [savedId, setSavedId] = useState<string | null>(null);

  // The working copies behind the rendered state. The autosave timers, the unload handlers and a
  // request that finishes after its template or the page was left need the latest values, not
  // those of a past render.
  const session = useRef({
    copies: {} as Record<string, Copy>,
    // The pause after the last keystroke, per template: one template's timer is never another's to clear.
    timers: new Map<string, ReturnType<typeof setTimeout>>(),
    // The save of a template that is waiting for its turn or running; a save asked for meanwhile joins it.
    inFlight: new Map<string, Promise<void>>(),
    // The last save that was asked for; the next one starts when it is done.
    queue: Promise.resolve() as Promise<unknown>,
    savedTimer: null as ReturnType<typeof setTimeout> | null,
    mounted: false,
  });

  const show = useCallback((next: Record<string, Copy>) => {
    session.current.copies = next;
    setCopies(next);
  }, []);

  const put = useCallback(
    (id: string, patch: Partial<Copy>) => {
      const copy = session.current.copies[id];
      if (copy) show({ ...session.current.copies, [id]: { ...copy, ...patch } });
    },
    [show],
  );

  // What the server says of the templates is taken over: a template this page does not hold yet,
  // and a newer version of one whose fields hold nothing unsaved. Never over typing - a save from
  // here is then refused, and says so - and never an older version: the list read behind one save
  // may arrive after the answer to the next.
  useEffect(() => {
    const next = { ...session.current.copies };
    let changed = false;
    for (const item of terms) {
      const copy = next[item.id];
      if (copy && (copy.saving || changesOf(copy) || Date.parse(item.updatedAt) <= Date.parse(copy.stored.updatedAt))) continue;
      next[item.id] = copyOf(item);
      changed = true;
    }
    if (changed) show(next);
  }, [terms, show]);

  const flashSaved = useCallback((id: string) => {
    const s = session.current;
    if (!s.mounted) return;
    setSavedId(id);
    if (s.savedTimer) clearTimeout(s.savedTimer);
    s.savedTimer = setTimeout(() => setSavedId(null), SAVED_FLASH_MS);
  }, []);

  // Sends a template's changes until the server has the latest of them or refuses one.
  const send = useCallback(
    async (id: string) => {
      const s = session.current;
      for (;;) {
        const copy = s.copies[id];
        const changes = copy && changesOf(copy);
        // After a conflict nothing more is sent - only loading the latest version ends it - and
        // nothing of a template without a name.
        if (!copy || !changes || copy.conflict || !copy.fields.name.trim()) break;
        put(id, { saving: true });
        try {
          const { terms: stored } = await updateTerms({ id, params: { ...changes, expectedUpdatedAt: copy.stored.updatedAt } });
          // The answer is the version the next save is made on - otherwise this page's own next
          // save would be refused. The fields stay as they are: what was typed during the request
          // is unsaved against the answer, and goes out next.
          put(id, { stored, saving: false, problem: null });
          message.destroy(saveToastKey(id));
          const now = s.copies[id];
          if (now && !changesOf(now)) flashSaved(id);
        } catch (err) {
          const conflict = isAPIError(err) && err.code === ErrCode.Aborted;
          put(id, { saving: false, conflict, problem: conflict ? CONFLICT : apiErrorMessage(err) });
          break;
        }
        // Typed again during the request: the autosave timer will send that. Without a timer
        // (Save was pressed, another template was chosen, the page is being left) it goes out
        // right away.
        if (s.timers.has(id)) break;
      }
    },
    [updateTerms, put, flashSaved, message],
  );

  // Saves what is waiting for a template right now. Saves go out one after another - an older
  // answer can then never pass for the newer text - and only one save of a template waits or
  // runs: a call made meanwhile joins it, and it then sends whatever changed since.
  const flush = useCallback(
    (id: string) => {
      const s = session.current;
      clearTimeout(s.timers.get(id));
      s.timers.delete(id);
      let saving = s.inFlight.get(id);
      if (!saving) {
        saving = s.queue.then(() => send(id)).finally(() => {
          s.inFlight.delete(id);
        });
        s.queue = saving.catch(() => undefined);
        s.inFlight.set(id, saving);
      }
      return saving;
    },
    [send],
  );

  // A save that did not happen is told as a toast too: its template may no longer be the one on
  // screen. After a conflict nothing more is sent, so every further change is answered this way.
  // An empty name is told only when asked for (`always`): while it is being typed over, the
  // field says it. Resolves with why the template is not saved, or null when it is.
  const announce = useCallback(
    (id: string, always: boolean) => {
      const copy = session.current.copies[id];
      const reason = copy ? notSaved(copy) : null;
      if (copy && reason && (always || reason !== NO_NAME)) {
        message.error({ key: saveToastKey(id), content: `Template ${copy.stored.name} is not being saved - ${reason}`, duration: 8 });
      }
      return reason;
    },
    [message],
  );

  // The one way the fields change. Call it for changes made by the user only: every call leads
  // to a save.
  const edit = useCallback(
    (id: string, patch: Partial<Fields>) => {
      const s = session.current;
      const copy = s.copies[id];
      if (!copy || !canEdit) return;
      const fields = { ...copy.fields, ...patch };
      // Back at what is stored: nothing is left of what a save was refused for.
      const settled = !copy.conflict && !changesOf({ ...copy, fields });
      put(id, settled ? { fields, problem: null } : { fields });
      clearTimeout(s.timers.get(id));
      s.timers.set(
        id,
        setTimeout(() => flush(id).then(() => announce(id, false)), AUTOSAVE_DELAY_MS),
      );
    },
    [canEdit, put, flush, announce],
  );

  // Saves what is waiting right now, for the Save button and for a template that is being left.
  // A refusal is announced here as for autosave, which leaves the caller only success to report:
  // resolves with why the template is not saved, or null when it is.
  const saveNow = useCallback((id: string) => flush(id).then(() => announce(id, true)), [flush, announce]);

  // Reads the templates again and puts the stored version of one into its fields, in place of
  // what was typed there: the way out of a conflict.
  const loadLatest = useCallback(
    async (id: string) => {
      const read = await reload();
      if (read.isError || !read.data) {
        message.error(`The latest version could not be loaded - ${apiErrorMessage(read.error)}`);
        return;
      }
      const latest = read.data.data.find((t) => t.id === id);
      const { [id]: held, ...others } = session.current.copies;
      message.destroy(saveToastKey(id));
      if (latest) show({ ...others, [id]: copyOf(latest) });
      else if (held) {
        // Deleted meanwhile: the list no longer has it, and there is nothing to edit.
        show(others);
        message.info(`Template ${held.stored.name} no longer exists`);
      }
    },
    [reload, show, message],
  );

  // Lets go of a template's copy, for one that was deleted.
  const forget = useCallback(
    (id: string) => {
      const s = session.current;
      clearTimeout(s.timers.get(id));
      s.timers.delete(id);
      const others = { ...s.copies };
      delete others[id];
      show(others);
    },
    [show],
  );

  useEffect(() => {
    const s = session.current;
    s.mounted = true;
    const unsaved = () => Object.values(s.copies).filter((copy) => changesOf(copy));
    // Reload or tab close while the server does not have every change: the browser asks first...
    const warn = (e: BeforeUnloadEvent) => {
      if (unsaved().length) e.preventDefault();
    };
    // ...and what is still waiting goes out, in a request that survives the page.
    const sendWhileClosing = () => {
      for (const copy of unsaved()) flush(copy.stored.id);
    };
    window.addEventListener("beforeunload", warn);
    window.addEventListener("pagehide", sendWhileClosing);
    return () => {
      s.mounted = false;
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener("pagehide", sendWhileClosing);
      if (s.savedTimer) clearTimeout(s.savedTimer);
      // Leaving for another page of the app: what is waiting is sent now, for every template that
      // was typed into. The page is gone by the time the answers arrive, so a change that could
      // not be saved can only be reported as a toast.
      for (const { stored } of unsaved()) {
        flush(stored.id).then(() => {
          const copy = s.copies[stored.id];
          const reason = copy ? notSaved(copy) : null;
          if (reason && !s.mounted) {
            message.error({ key: saveToastKey(stored.id), content: `Template ${stored.name}: your last changes were not saved - ${reason}`, duration: 8 });
          }
        });
      }
    };
  }, [flush, message]);

  return { terms, isLoading, createTerms, deleteTerms, copies, savedId, edit, flush, saveNow, loadLatest, forget };
}

// The templates are shared by the whole company and go into every new quote, so only
// managers and admins change them - the server's answer, and the server refuses anybody else
// whatever is on screen. Everybody can read them: for whoever may not change them the texts are
// read-only and New, Delete and Save are not there.
export function TermsTab() {
  const permissions = useSalesPermissions();
  const canEdit = permissions.canEditTerms;
  const { terms, isLoading, createTerms, deleteTerms, copies, savedId, edit, flush, saveNow, loadLatest, forget } = useTemplateEditor(canEdit);
  const toast = useToast();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  // The new template is on its way to the server: its dialog waits for the answer.
  const [creating, setCreating] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // The latest version of a template is being read, after a conflict.
  const [loadingLatest, setLoadingLatest] = useState(false);

  const selected = useMemo<TermsConditionItem | null>(
    () => terms.find((t) => t.id === selectedId) ?? null,
    [terms, selectedId],
  );
  // The selected template as it is being edited. The fields show this copy and nothing else: they
  // are filled when a template is opened here, and again only by a newer version from the server
  // while they hold nothing unsaved.
  const copy = selected ? copies[selected.id] : undefined;

  // Default selection to first template once terms load and nothing is selected.
  useEffect(() => {
    const first = terms[0];
    if (!selectedId && first) {
      setSelectedId(first.id);
    }
  }, [terms, selectedId]);

  // What was typed into the template that is being left goes out now, not when its pause would
  // have ended - with its timer merely cleared, the change would be dropped without a word.
  const leaveSelected = () => {
    if (selectedId) saveNow(selectedId);
  };

  const choose = (id: string) => {
    if (id === selectedId) return;
    leaveSelected();
    setSelectedId(id);
  };

  const openCreate = () => {
    setNewName("");
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    const trimmed = newName.trim();
    // Enter in the name field comes here as well, also while a first press is still being answered.
    if (!trimmed || creating) return;
    setCreating(true);
    // The new template is selected once it exists.
    leaveSelected();
    try {
      const created = await createTerms(trimmed);
      toast.success("Template created");
      setCreateOpen(false);
      setNewName("");
      if (created?.terms?.id) setSelectedId(created.terms.id);
    } catch (err) {
      toast.error(`Template not created - ${apiErrorMessage(err)}`);
    }
    setCreating(false);
  };

  const handleSave = async () => {
    if (!selectedId) return;
    const why = await saveNow(selectedId);
    if (!why) toast.success("Saved");
  };

  const handleDelete = async () => {
    if (!selectedId || deleting) return;
    setDeleting(true);
    // What was typed goes out first, whatever comes of it: should the template stay after all,
    // its text is not lost.
    await flush(selectedId);
    try {
      await deleteTerms(selectedId);
      toast.success("Template deleted");
      forget(selectedId);
      setSelectedId(null);
    } catch (err) {
      toast.error(`Template not deleted - ${apiErrorMessage(err)}`);
    }
    setDeleting(false);
    setDeleteOpen(false);
  };

  const handleLoadLatest = async (id: string) => {
    setLoadingLatest(true);
    await loadLatest(id);
    setLoadingLatest(false);
  };

  const refused = copy ? notSaved(copy) : null;
  const nameMissing = canEdit && !!copy && !copy.fields.name.trim();
  // The header always says what is true right now, not when a save last worked.
  let saveLabel: { text: string; tone: string } | null = null;
  if (canEdit && copy) {
    if (copy.saving) saveLabel = { text: "Saving…", tone: "text-slate-500" };
    else if (refused) saveLabel = { text: `Not saved - ${refused}`, tone: "text-red-600" };
    else if (changesOf(copy)) saveLabel = { text: "Unsaved changes", tone: "text-slate-400" };
    else if (savedId === copy.stored.id) saveLabel = { text: "Saved", tone: "text-green-600" };
  }

  return (
    <div className="flex gap-5 items-start">
      <div className="w-72 shrink-0">
        <SectionCard
          title="Templates"
          bodyClassName="p-2"
          extra={
            canEdit && (
              <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openCreate}>
                New
              </Button>
            )
          }
        >
          <ManagersOnlyNote status={permissions.status} allowed={canEdit} onRetry={() => permissions.reload()} className="px-3 pt-1 pb-2" />

          {isLoading ? (
            <div className="flex justify-center py-6">
              <Spin />
            </div>
          ) : terms.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-3 text-center">
              <span className="text-[13px] text-slate-400">No terms &amp; conditions templates yet</span>
              {canEdit && <span className="text-[11px] text-slate-400 mt-1">Click &ldquo;New&rdquo; to create one.</span>}
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {terms.map((t) => {
                const hasIncludes = !!t.includes && t.includes.trim().length > 0;
                const hasExcludes = !!t.excludes && t.excludes.trim().length > 0;
                const hasSubjectTo = !!t.subjectTo && t.subjectTo.trim().length > 0;
                const chosen = t.id === selectedId;
                // A template that was left with text the server does not have: its row says so,
                // since its header is not on screen.
                const held = copies[t.id];
                const leftUnsaved = !chosen && !!held && !held.saving && !!notSaved(held);
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={chosen}
                    onClick={() => choose(t.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg cursor-pointer text-[13px] transition-colors ${
                      chosen ? "bg-indigo-50 text-indigo-700 font-medium" : "bg-transparent text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <div className="truncate">{t.name}</div>
                    <div className="mt-1 flex items-center gap-1.5 flex-wrap font-normal">
                      <span className="text-[11px] text-slate-400">{formatDate(t.updatedAt)}</span>
                      <Pill tone={hasIncludes ? "green" : "slate"}>{hasIncludes ? "Includes ✓" : "Includes"}</Pill>
                      <Pill tone={hasExcludes ? "green" : "slate"}>{hasExcludes ? "Excludes ✓" : "Excludes"}</Pill>
                      <Pill tone={hasSubjectTo ? "green" : "slate"}>{hasSubjectTo ? "Subject to ✓" : "Subject to"}</Pill>
                      {leftUnsaved && (
                        <Pill tone="red" title="What was typed into this template is not saved - open it to see why">
                          Not saved
                        </Pill>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="flex-1 min-w-0">
        <SectionCard
          title="Template"
          extra={
            saveLabel && (
              <span role="status" className={`text-xs font-medium ${saveLabel.tone}`}>
                {saveLabel.text}
              </span>
            )
          }
        >
          {!selected || !copy ? (
            <div className="flex items-center justify-center py-16 text-[13px] text-slate-400">Select a template</div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Nothing here discards what was typed except "Load latest version", and that one says so. */}
              {copy.conflict && (
                <Alert
                  type="error"
                  showIcon
                  message="Changed by someone else"
                  description="This template was saved by somebody else while you were editing it. Your text here was not saved, and nothing more is saved from it. Copy what you still need, then load the latest version - that discards your text."
                  action={
                    <Button size="small" danger loading={loadingLatest} onClick={() => handleLoadLatest(copy.stored.id)}>
                      Load latest version
                    </Button>
                  }
                />
              )}

              <div>
                <div className="flex items-center gap-2">
                  <Input
                    value={copy.fields.name}
                    readOnly={!canEdit}
                    status={nameMissing ? "error" : undefined}
                    onChange={(e) => edit(copy.stored.id, { name: e.target.value })}
                    placeholder="Template name"
                    aria-label="Template name"
                    aria-invalid={nameMissing}
                    className="flex-1"
                  />
                  {canEdit && (
                    <Button danger size="small" icon={<DeleteOutlined />} onClick={() => setDeleteOpen(true)}>
                      Delete
                    </Button>
                  )}
                </div>
                {nameMissing && (
                  <div role="alert" className="mt-1 text-xs text-red-600">
                    {NO_NAME}
                  </div>
                )}
              </div>

              <div>
                <label className="flex items-center gap-2 text-[13px] font-medium text-slate-700 mb-1">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  Rate offer includes
                </label>
                <Input.TextArea
                  rows={6}
                  value={copy.fields.includes}
                  readOnly={!canEdit}
                  aria-label="Rate offer includes"
                  onChange={(e) => edit(copy.stored.id, { includes: e.target.value })}
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-[13px] font-medium text-slate-700 mb-1">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  Rate offer excludes
                </label>
                <Input.TextArea
                  rows={6}
                  value={copy.fields.excludes}
                  readOnly={!canEdit}
                  aria-label="Rate offer excludes"
                  onChange={(e) => edit(copy.stored.id, { excludes: e.target.value })}
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-[13px] font-medium text-slate-700 mb-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  Subject to
                </label>
                <Input.TextArea
                  rows={4}
                  value={copy.fields.subjectTo}
                  readOnly={!canEdit}
                  aria-label="Subject to"
                  placeholder="e.g. Space and equipment availability, carrier's GRI and surcharges in force at shipment"
                  onChange={(e) => edit(copy.stored.id, { subjectTo: e.target.value })}
                />
              </div>

              {canEdit && (
                <div className="flex justify-end">
                  <Button type="primary" size="small" onClick={handleSave}>
                    Save
                  </Button>
                </div>
              )}
            </div>
          )}
        </SectionCard>
      </div>

      <SalesDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        busy={creating}
        title="New Template"
        footer={
          <>
            <Button disabled={creating} onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="primary" disabled={!newName.trim()} loading={creating} onClick={submitCreate}>
              Create
            </Button>
          </>
        }
      >
        <Form layout="vertical" disabled={creating}>
          <Form.Item label="Name" className="!mb-0">
            <Input aria-label="Name" value={newName} onChange={(e) => setNewName(e.target.value)} onPressEnter={submitCreate} placeholder="Template name" />
          </Form.Item>
        </Form>
      </SalesDialog>

      <ConfirmModal
        open={deleteOpen}
        onClose={() => {
          if (!deleting) setDeleteOpen(false);
        }}
        onConfirm={handleDelete}
        title="Delete template"
        description={`Delete ${selected?.name ?? "this template"}?`}
        confirmLabel="Delete"
        danger
        loading={deleting}
      />
    </div>
  );
}

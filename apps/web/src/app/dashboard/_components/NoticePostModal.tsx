"use client";

import { useRef, useState } from "react";
import { Modal, Form, Input, Select, Button } from "antd";
import { CloseOutlined, ExclamationCircleFilled, InfoCircleFilled, LockOutlined, PaperClipOutlined, TeamOutlined } from "@ant-design/icons";
import type { ReactNode } from "react";
import { formatFileSize } from "@/lib/files";
import { useToast } from "@/lib/toast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { HINT, LABEL_TEXT } from "@/styles/ui";
import { useBranches, useCountries, useDepartments } from "@/hooks/useOrgUnits";
import type { Announcement, NewAnnouncementInput, UpdateAnnouncementInput } from "@/hooks/useNoticeboard";
import { SEVERITIES } from "../_lib/boards";
import { branchesInCountries, branchOptions } from "../_lib/branches";
import { fileIcon } from "./NoticeAttachmentList";

// A new post, or an existing post being edited.
export type NoticePostTarget = "new" | { post: Announcement };

interface NoticePostModalProps {
  // Null closes the dialog. The owner gives the dialog a new `key` for every opening.
  target: NoticePostTarget | null;
  onClose: () => void;
  onCreate: (input: NewAnnouncementInput) => Promise<{ id: string; target: string }>;
  onUpdate: (args: { id: string; input: UpdateAnnouncementInput }) => Promise<unknown>;
  onAddAttachment: (args: { id: string; file: File }) => Promise<unknown>;
  onRemoveAttachment: (attachmentId: string) => Promise<unknown>;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Each audience field is some of the organization's own entries (several may be picked, owner's answer
// 22 Nov), or ALL for every one of them.
const ALL = "all";

interface NoticeFormValues {
  countryCodes?: string[];
  branchIds?: string[];
  departmentIds?: string[];
  severity: string;
  title: string;
  body?: string;
}

/** The audience a new post names: the countries, branches and departments chosen, each empty for "All". */
export function noticeAudience(v: Pick<NoticeFormValues, "countryCodes" | "branchIds" | "departmentIds">) {
  const chosen = (values?: string[]) => (values ?? []).filter((x) => x !== ALL);
  const audience = { countryCodes: chosen(v.countryCodes), branchIds: chosen(v.branchIds), departmentIds: chosen(v.departmentIds) };
  return { ...audience, forAll: !audience.countryCodes.length && !audience.branchIds.length && !audience.departmentIds.length };
}

/**
 * Whom a new post is sent to: the company when every field is "All" - the server refuses an audience with
 * nothing chosen, which once turned into a company notice unasked (review of system-23) - else the audience.
 */
export function noticeTarget(v: Pick<NoticeFormValues, "countryCodes" | "branchIds" | "departmentIds">) {
  const { forAll, ...audience } = noticeAudience(v);
  return forAll ? { scope: "company" as const } : { scope: "audience" as const, ...audience };
}

/** A field's picks after a change: "All" picked clears the others, and one picked after "All" takes its place. */
export function allOrSome(next: string[] | undefined, prev: string[] | undefined): string[] {
  const picked = next ?? [];
  const added = picked.find((x) => !(prev ?? []).includes(x));
  if (added === ALL) return [ALL];
  return picked.length > 1 ? picked.filter((x) => x !== ALL) : picked;
}

// The priority pills: tinted like the pills on the board (slate, amber, red), with their icon. The
// chosen one is filled stronger and outlined in its own colour; keyboard focus is a ring in that colour too.
const SEVERITY_PILL: Record<string, { idle: string; chosen: string; icon: ReactNode }> = {
  info: { idle: "bg-slate-50 text-slate-600 focus-visible:ring-slate-500", chosen: "border-slate-500 bg-slate-100 text-slate-700 shadow-sm", icon: <InfoCircleFilled className="!text-slate-500" /> },
  warning: {
    idle: "bg-amber-50 text-amber-600 focus-visible:ring-amber-500",
    chosen: "border-amber-500 bg-amber-100 text-amber-700 shadow-sm",
    icon: (
      <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-400">
        <span className="h-1 w-1 rounded-full bg-white" />
      </span>
    ),
  },
  critical: { idle: "bg-red-50 text-red-600 focus-visible:ring-red-500", chosen: "border-red-500 bg-red-100 text-red-700 shadow-sm", icon: <ExclamationCircleFilled className="!text-red-500" /> },
};

// Field labels: the app's small bold caps (LABEL_TEXT), a required one marked with a red asterisk after the name.
const fieldLabel = (text: string) => <span className={LABEL_TEXT}>{text}</span>;
const requiredMark = (label: ReactNode, { required }: { required: boolean }) => (
  <>
    {label}
    {required && <span className="ml-0.5 text-[11px] font-bold text-red-500">*</span>}
  </>
);

// A form control: antd's Form.Item supplies value and onChange. A radio group to assistive
// technology and the keyboard: one tab stop (the chosen pill), arrows move the choice.
function PriorityPills({ id, value, onChange, disabled }: { id?: string; value?: string; onChange?: (value: string) => void; disabled?: boolean }) {
  const pills = useRef<(HTMLButtonElement | null)[]>([]);
  const chosenIndex = Math.max(0, SEVERITIES.findIndex((s) => s.value === value));
  const move = (from: number, step: number) => {
    const next = (from + step + SEVERITIES.length) % SEVERITIES.length;
    const severity = SEVERITIES[next];
    if (severity) onChange?.(severity.value);
    pills.current[next]?.focus();
  };
  return (
    <div id={id} role="radiogroup" aria-label="Priority" className="flex flex-wrap gap-2">
      {SEVERITIES.map((s, i) => {
        const chosen = s.value === value;
        const pill = SEVERITY_PILL[s.value];
        return (
          <button
            key={s.value}
            ref={(el) => {
              pills.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={chosen}
            tabIndex={i === chosenIndex ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange?.(s.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                move(i, 1);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                move(i, -1);
              }
            }}
            className={`inline-flex h-8 min-w-[92px] items-center gap-2 px-3.5 rounded-lg border text-[13px] cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60 ${pill?.idle ?? ""} ${
              chosen ? `font-semibold ${pill?.chosen ?? ""}` : "font-medium border-transparent opacity-70 hover:opacity-100"
            }`}
          >
            {pill?.icon}
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

function DocumentRow({ fileName, fileType, fileSize, disabled, onRemove }: { fileName: string; fileType: string; fileSize: number; disabled: boolean; onRemove: () => void }) {
  return (
    <li className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2">
      <span className="shrink-0 text-[20px] leading-none">{fileIcon(fileName, fileType)}</span>
      <span className="min-w-0 flex-1">
        <span title={fileName} className="block truncate text-[13px] font-medium text-slate-900">
          {fileName}
        </span>
        <span className={`block ${HINT}`}>{formatFileSize(fileSize)}</span>
      </span>
      <Button type="text" size="small" icon={<CloseOutlined />} aria-label={`Remove ${fileName}`} disabled={disabled} onClick={onRemove} />
    </li>
  );
}

export function NoticePostModal({ target, onClose, onCreate, onUpdate, onAddAttachment, onRemoveAttachment }: NoticePostModalProps) {
  const toast = useToast();
  const { departments } = useDepartments();
  const { branches } = useBranches();
  const { countries } = useCountries();
  const [form] = Form.useForm<NoticeFormValues>();
  const [saving, setSaving] = useState(false);
  // Blocks a second click that lands before the button has re-rendered as busy.
  const submitting = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // Documents picked in this dialog, uploaded on save; and stored ones marked for removal.
  const [newFiles, setNewFiles] = useState<File[]>([]);
  // A key per picked file (the same file can be picked twice, so not its name).
  const fileKeys = useRef(new WeakMap<File, string>());
  const fileKey = (f: File) => {
    let key = fileKeys.current.get(f);
    if (!key) fileKeys.current.set(f, (key = `file-${Math.random().toString(36).slice(2)}`));
    return key;
  };
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  // A new post that saved but whose documents did not: a retry must not post it twice.
  const [createdId, setCreatedId] = useState<string | null>(null);
  const removedDone = useRef(new Set<string>());
  const [dragOver, setDragOver] = useState(false);
  // Whom a new post went to, shown once its audience can no longer be changed.
  const [createdFor, setCreatedFor] = useState<string | null>(null);
  // A new post to everyone waits for a yes, asked at Post: asked the moment the last "All" was
  // picked, it came before anything was written (user council M11).
  const [confirmAll, setConfirmAll] = useState(false);

  // The dialog is mounted anew for every opening (an antd form instance would otherwise
  // carry the previous opening's values over), so what it was opened with is fixed here;
  // `target` going null afterwards only closes it, without the content changing on the way out.
  const [opened] = useState(target);
  const editing = opened && opened !== "new" ? opened.post : null;

  const initialValues: Partial<NoticeFormValues> = editing
    ? { severity: editing.severity, title: editing.title, body: editing.body }
    : {
        severity: "info",
        title: "",
        body: "",
      };

  const keptAttachments = (editing?.attachments ?? []).filter((a) => !removedIds.includes(a.id));

  const hasDocuments = keptAttachments.length + newFiles.length > 0;

  // Nothing may change under a running save: it works from what was in the dialog when it started.
  const handleClose = () => {
    if (!saving) onClose();
  };

  // Picked files wait here; they are uploaded together with the notice.
  const addFiles = (picked: File[]) => {
    for (const file of picked.filter((f) => f.size === 0)) toast.error(`${file.name} is empty`);
    for (const file of picked.filter((f) => f.size > MAX_FILE_SIZE)) toast.error(`${file.name} is larger than 10 MB`);
    setNewFiles((files) => [...files, ...picked.filter((f) => f.size > 0 && f.size <= MAX_FILE_SIZE)]);
  };

  // `toAllConfirmed`: the yes to "Send to all?" is given.
  const handleSubmit = async (toAllConfirmed = false) => {
    if (submitting.current) return;
    submitting.current = true;
    let v: NoticeFormValues;
    try {
      v = await form.validateFields();
    } catch {
      // The form marks the fields that need attention.
      submitting.current = false;
      return;
    }
    if (!toAllConfirmed && !(editing?.id ?? createdId) && noticeAudience(v).forAll) {
      submitting.current = false;
      setConfirmAll(true);
      return;
    }
    setSaving(true);
    // Whether the notice itself is stored, so a failure can say what is still missing.
    let noticeSaved = false;
    try {
      let id = editing?.id ?? createdId;
      if (id) {
        // Also a retry after the notice was posted without its documents: send what the form says now.
        await onUpdate({ id, input: { severity: v.severity, title: v.title, body: v.body ?? "" } });
      } else {
        const created = await onCreate({ ...noticeTarget(v), severity: v.severity, title: v.title, body: v.body ?? "" });
        id = created.id;
        setCreatedId(id);
        // Worded by the server, the same as the post will show on the board.
        setCreatedFor(created.target);
      }
      noticeSaved = true;
      await Promise.all(
        removedIds
          .filter((attachmentId) => !removedDone.current.has(attachmentId))
          .map(async (attachmentId) => {
            try {
              await onRemoveAttachment(attachmentId);
            } catch (err) {
              // Already gone (removed in another tab, say) is what was wanted; anything else is a failure.
              if ((err as { status?: number }).status !== 404) throw err;
            }
            removedDone.current.add(attachmentId);
          }),
      );
      // One at a time: each document is its own request with its own size limit; uploaded
      // ones leave the queue so a retry only sends what is still missing.
      for (const file of newFiles) {
        await onAddAttachment({ id, file });
        setNewFiles((files) => files.filter((f) => f !== file));
      }
      toast.success(editing ? "Notice updated" : "Notice posted");
      onClose();
    } catch {
      toast.error(
        noticeSaved
          ? `The notice is ${editing ? "saved" : "posted"}, but not all of its documents — try again or remove the document`
          : "Failed to save the notice",
      );
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  // Whom the notice is for is fixed once it exists, so it is shown, not offered.
  const locked = !!editing || !!createdId;
  const lockedLabel = editing ? editing.target : createdFor;

  // Chosen countries narrow the branches to the ones in them.
  const countryCodes = (Form.useWatch("countryCodes", form) ?? []).filter((c: string) => c !== ALL);
  const withAll = (allLabel: string, options: { value: string; label: string }[]) => [{ value: ALL, label: allLabel }, ...options];

  const handleValuesChange = (changed: Partial<NoticeFormValues>, all: NoticeFormValues) => {
    // A branch in none of the countries no longer fits. Judged on the countries just picked: `countryCodes`
    // is still the previous render's.
    if (changed.countryCodes) {
      const countries = changed.countryCodes.filter((c) => c !== ALL);
      const branchIds = (all.branchIds ?? []).filter((b) => b !== ALL);
      const kept = branchesInCountries(branches, branchIds, countries);
      if (kept.length !== branchIds.length) form.setFieldValue("branchIds", kept);
    }
  };
  // The three audience fields: several picked show as the first and "+ N", so each keeps its one line.
  const audienceSelect = {
    mode: "multiple",
    showSearch: true,
    optionFilterProp: "label",
    maxTagCount: "responsive",
    // The fields are a third of the dialog wide; the list may be wider than its field.
    popupMatchSelectWidth: false,
  } as const;

  return (
    <Modal
      open={!!target}
      onCancel={handleClose}
      closable={!saving}
      maskClosable={!saving}
      keyboard={!saving}
      title={editing ? "Edit Notice" : "Post a Notice"}
      // The drop zone for documents sits beside the buttons; picked documents are listed above it.
      footer={
        <div className="-mx-6 px-6 pt-4 border-t border-slate-200 flex items-center justify-between gap-4">
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              addFiles([...(e.target.files ?? [])]);
              // Reset so the same file can be picked again after being removed.
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={saving}
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (!saving) addFiles([...e.dataTransfer.files]);
            }}
            className={`flex min-w-0 max-w-[320px] flex-1 items-center gap-3 rounded-lg border border-dashed px-3 py-2.5 text-left cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              dragOver ? "border-indigo-400 bg-indigo-50" : "border-slate-300 bg-white hover:border-indigo-400 hover:bg-slate-50"
            }`}
          >
            <PaperClipOutlined className="shrink-0 !text-[20px] !text-slate-500" />
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-slate-900">Add documents</span>
              <span className={`block truncate ${HINT}`}>PDF, DOC, XLS, PNG and more · Max 10 MB each</span>
            </span>
          </button>
          <div className="flex shrink-0 gap-2">
            <Button disabled={saving} onClick={handleClose}>
              Cancel
            </Button>
            <Button type="primary" loading={saving} onClick={() => void handleSubmit()}>
              {editing ? "Save" : "Post"}
            </Button>
          </div>
        </div>
      }
      width={600}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" requiredMark={requiredMark} className="pt-2" preserve={false} initialValues={initialValues} disabled={saving} onValuesChange={handleValuesChange}>
        {locked ? (
          <Form.Item label={fieldLabel("For")} className="!mb-4">
            <div className="flex items-center gap-2 h-8 px-3 rounded-lg bg-slate-100 text-[13px] text-slate-700">
              <TeamOutlined className="text-slate-500" />
              <span className="min-w-0 flex-1 truncate">{lockedLabel}</span>
              <LockOutlined className="!text-slate-400" title="Whom the notice is for cannot be changed" />
            </div>
          </Form.Item>
        ) : (
          // Only the people matching all three see the notice, through any one of the entries picked in each;
          // "All" leaves that one open.
          <div className="grid grid-cols-3 gap-3 border-b border-slate-200 mb-4">
            <Form.Item
              name="countryCodes"
              label={fieldLabel("Country")}
              className="!mb-4"
              normalize={allOrSome}
              rules={[{ required: true, type: "array", min: 1, message: "Choose countries, or All" }]}
            >
              <Select {...audienceSelect} placeholder="Choose countries" options={withAll("All countries", countries.map((c) => ({ value: c.code, label: c.name })))} />
            </Form.Item>
            <Form.Item
              name="branchIds"
              label={fieldLabel("Branch")}
              className="!mb-4"
              normalize={allOrSome}
              rules={[{ required: true, type: "array", min: 1, message: "Choose branches, or All" }]}
            >
              <Select
                {...audienceSelect}
                placeholder="Choose branches"
                options={withAll(countryCodes.length ? "All branches in these countries" : "All branches", branchOptions(branches, countryCodes))}
              />
            </Form.Item>
            <Form.Item
              name="departmentIds"
              label={fieldLabel("Department")}
              className="!mb-4"
              normalize={allOrSome}
              rules={[{ required: true, type: "array", min: 1, message: "Choose departments, or All" }]}
            >
              <Select {...audienceSelect} placeholder="Choose departments" options={withAll("All departments", departments.map((d) => ({ value: d.id, label: d.name })))} />
            </Form.Item>
          </div>
        )}
        <Form.Item name="severity" label={fieldLabel("Priority")} className="!mb-4">
          <PriorityPills disabled={saving} />
        </Form.Item>
        <Form.Item name="title" label={fieldLabel("Title")} className="!mb-4" rules={[{ required: true, whitespace: true, message: "Title is required" }]}>
          <Input placeholder="e.g. Port congestion in Hamburg" maxLength={200} />
        </Form.Item>
        <Form.Item name="body" label={fieldLabel("Details")} className="!mb-4">
          <Input.TextArea autoSize={{ minRows: 3, maxRows: 10 }} placeholder="Everything people need to know." maxLength={20000} />
        </Form.Item>
        {/* Documents wait here and are uploaded together with the notice. */}
        {hasDocuments && (
          <ul className="mb-4 mt-0 p-0 list-none flex flex-col gap-1.5">
            {keptAttachments.map((a) => (
              <DocumentRow
                key={a.id}
                fileName={a.fileName}
                fileType={a.fileType}
                fileSize={a.fileSize}
                disabled={saving}
                onRemove={() => setRemovedIds((ids) => [...ids, a.id])}
              />
            ))}
            {newFiles.map((f) => (
              <DocumentRow
                key={fileKey(f)}
                fileName={f.name}
                fileType={f.type}
                fileSize={f.size}
                disabled={saving}
                onRemove={() => setNewFiles((files) => files.filter((x) => x !== f))}
              />
            ))}
          </ul>
        )}
      </Form>
      <ConfirmModal
        open={confirmAll}
        title="Send to all?"
        description="The notice will be shown to all."
        confirmLabel="Post"
        onConfirm={() => {
          setConfirmAll(false);
          void handleSubmit(true);
        }}
        // Not confirmed: nothing is posted, and the dialog stays as it was written.
        onClose={() => setConfirmAll(false)}
      />
    </Modal>
  );
}

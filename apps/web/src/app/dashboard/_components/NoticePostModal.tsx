"use client";

import { useRef, useState } from "react";
import { Modal, Form, Input, Select, Button } from "antd";
import { BankOutlined, CloseOutlined, LockOutlined, PaperClipOutlined, TeamOutlined } from "@ant-design/icons";
import { formatFileSize } from "@/lib/files";
import { useToast } from "@/lib/toast";
import { useDepartments } from "@/hooks/useOrgUnits";
import type { Announcement, NewAnnouncementInput, NoticeboardViewer, UpdateAnnouncementInput } from "@/hooks/useNoticeboard";
import { BOARDS, SEVERITIES } from "../_lib/boards";
import { fileIcon } from "./NoticeAttachmentList";
import type { BoardScope } from "../_lib/boards";

// A new post for a board, or an existing post being edited.
export type NoticePostTarget = { scope: BoardScope } | { post: Announcement };

interface NoticePostModalProps {
  // Null closes the dialog. The owner gives the dialog a new `key` for every opening.
  target: NoticePostTarget | null;
  viewer?: NoticeboardViewer;
  onClose: () => void;
  onCreate: (input: NewAnnouncementInput) => Promise<{ id: string }>;
  onUpdate: (args: { id: string; input: UpdateAnnouncementInput }) => Promise<unknown>;
  onAddAttachment: (args: { id: string; file: File }) => Promise<unknown>;
  onRemoveAttachment: (attachmentId: string) => Promise<unknown>;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;

interface NoticeFormValues {
  scope: BoardScope;
  departmentId?: string;
  severity: string;
  title: string;
  body?: string;
}

// The priority pills: tinted like the tags on the board, outlined when chosen.
const SEVERITY_PILL: Record<string, { idle: string; chosen: string }> = {
  info: { idle: "bg-blue-50 text-blue-600", chosen: "border-blue-400" },
  warning: { idle: "bg-amber-50 text-amber-600", chosen: "border-amber-400" },
  critical: { idle: "bg-red-50 text-red-600", chosen: "border-red-400" },
};

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
            className={`h-8 px-3.5 rounded-lg border text-[13px] font-medium cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${pill?.idle ?? ""} ${
              chosen ? (pill?.chosen ?? "") : "border-transparent opacity-80 hover:opacity-100"
            }`}
          >
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
        <span title={fileName} className="block truncate text-[13px] font-medium text-slate-800">
          {fileName}
        </span>
        <span className="block text-[11px] text-slate-500">{formatFileSize(fileSize)}</span>
      </span>
      <Button type="text" size="small" icon={<CloseOutlined />} aria-label={`Remove ${fileName}`} disabled={disabled} onClick={onRemove} />
    </li>
  );
}

export function NoticePostModal({ target, viewer, onClose, onCreate, onUpdate, onAddAttachment, onRemoveAttachment }: NoticePostModalProps) {
  const toast = useToast();
  const { departments } = useDepartments();
  const [form] = Form.useForm<NoticeFormValues>();
  const [saving, setSaving] = useState(false);
  // Blocks a second click that lands before the button has re-rendered as busy.
  const submitting = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // Documents picked in this dialog, uploaded on save; and stored ones marked for removal.
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  // A new post that saved but whose documents did not: a retry must not post it twice.
  const [createdId, setCreatedId] = useState<string | null>(null);
  const removedDone = useRef(new Set<string>());
  const [dragOver, setDragOver] = useState(false);
  // Where a new post ended up, for showing it once the board can no longer be changed.
  const [createdOn, setCreatedOn] = useState<{ scope: BoardScope; departmentId?: string } | null>(null);

  // The dialog is mounted anew for every opening (an antd form instance would otherwise
  // carry the previous opening's values over), so what it was opened with is fixed here;
  // `target` going null afterwards only closes it, without the content changing on the way out.
  const [opened] = useState(target);
  const editing = opened && "post" in opened ? opened.post : null;

  const initialValues: Partial<NoticeFormValues> = editing
    ? { scope: editing.scope as BoardScope, severity: editing.severity, title: editing.title, body: editing.body }
    : {
        scope: opened && "scope" in opened ? opened.scope : "company",
        departmentId: viewer?.departmentId ?? undefined,
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

  const handleSubmit = async () => {
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
    setSaving(true);
    // Whether the notice itself is stored, so a failure can say what is still missing.
    let noticeSaved = false;
    try {
      let id = editing?.id ?? createdId;
      if (id) {
        // Also a retry after the notice was posted without its documents: send what the form says now.
        await onUpdate({ id, input: { severity: v.severity, title: v.title, body: v.body ?? "" } });
      } else {
        id = (await onCreate(v)).id;
        setCreatedId(id);
        setCreatedOn({ scope: v.scope, departmentId: v.scope === "department" ? v.departmentId : undefined });
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

  // The board and the department are fixed once the notice exists, so they are shown, not offered.
  const locked = !!editing || !!createdId;
  const scope = Form.useWatch("scope", form) ?? initialValues.scope;
  const lockedBoard = editing?.scope ?? createdOn?.scope;
  const lockedLabel = [
    BOARDS.find((b) => b.scope === lockedBoard)?.title,
    editing ? editing.target : departments.find((d) => d.id === createdOn?.departmentId)?.name,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Modal
      open={!!target}
      onCancel={handleClose}
      closable={!saving}
      maskClosable={!saving}
      keyboard={!saving}
      title={editing ? "Edit Notice" : "Post a Notice"}
      footer={
        <div className="-mx-6 px-6 pt-4 border-t border-slate-200 flex justify-end gap-2">
          <Button disabled={saving} onClick={handleClose}>
            Cancel
          </Button>
          <Button type="primary" loading={saving} onClick={handleSubmit}>
            {editing ? "Save" : "Post"}
          </Button>
        </div>
      }
      width={520}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" className="pt-2 pb-2" preserve={false} initialValues={initialValues} disabled={saving}>
        {locked ? (
          <Form.Item label="Board">
            <div className="flex items-center gap-2 h-9 px-3 rounded-lg bg-slate-100 text-[13px] text-slate-600">
              {lockedBoard === "department" ? <TeamOutlined className="text-slate-500" /> : <BankOutlined className="text-slate-500" />}
              <span className="min-w-0 flex-1 truncate">{lockedLabel}</span>
              <LockOutlined className="!text-slate-400" title="The board cannot be changed" />
            </div>
          </Form.Item>
        ) : (
          <>
            <Form.Item name="scope" label="Board">
              <Select options={BOARDS.map((b) => ({ value: b.scope, label: b.title }))} />
            </Form.Item>
            {/* A new department post also picks which department it is for. */}
            {scope === "department" && (
              <Form.Item name="departmentId" label="Department" rules={[{ required: true, message: "Choose a department" }]}>
                <Select options={departments.map((d) => ({ value: d.id, label: d.name }))} placeholder="Choose a department" />
              </Form.Item>
            )}
          </>
        )}
        <Form.Item name="severity" label="Priority">
          <PriorityPills disabled={saving} />
        </Form.Item>
        <Form.Item name="title" label="Title" rules={[{ required: true, whitespace: true, message: "Title is required" }]}>
          <Input placeholder="e.g. Port congestion in Hamburg" maxLength={200} />
        </Form.Item>
        <Form.Item name="body" label="Details">
          <Input.TextArea autoSize={{ minRows: 3, maxRows: 10 }} placeholder="Everything people need to know." maxLength={20000} />
        </Form.Item>
        {/* Documents wait here and are uploaded together with the notice. */}
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
          className={`flex w-full items-center gap-3 rounded-lg border border-dashed px-3 py-2.5 text-left cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
            dragOver ? "border-indigo-400 bg-indigo-50" : "border-slate-300 bg-white hover:border-indigo-400 hover:bg-slate-50"
          }`}
        >
          <PaperClipOutlined className="shrink-0 !text-[20px] !text-slate-500" />
          <span className="min-w-0">
            <span className="block text-[13px] font-medium text-slate-800">Add documents</span>
            <span className="block text-[11px] text-slate-500">PDF, DOC, XLS, PNG and more · Max 10 MB each</span>
          </span>
        </button>
        {hasDocuments && (
          <ul className="mt-2 mb-0 p-0 list-none flex flex-col gap-1.5">
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
            {newFiles.map((f, i) => (
              <DocumentRow
                key={i}
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
    </Modal>
  );
}

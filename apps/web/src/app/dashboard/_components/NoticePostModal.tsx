"use client";

import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Modal, Form, Input, Select, Segmented, Button } from "antd";
import { UploadOutlined } from "@ant-design/icons";
import { useToast } from "@/lib/toast";
import { useDepartments } from "@/hooks/useOrgUnits";
import type { Announcement, NewAnnouncementInput, NoticeboardViewer, UpdateAnnouncementInput } from "@/hooks/useNoticeboard";
import { BOARDS, SEVERITIES } from "../_lib/boards";
import { NoticeAttachmentList } from "./NoticeAttachmentList";
import type { BoardScope } from "../_lib/boards";

// A new post for a board, or an existing post being edited.
export type NoticePostTarget = { scope: BoardScope } | { post: Announcement };

interface NoticePostModalProps {
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

export function NoticePostModal({ target, viewer, onClose, onCreate, onUpdate, onAddAttachment, onRemoveAttachment }: NoticePostModalProps) {
  const toast = useToast();
  const { departments } = useDepartments();
  const [form] = Form.useForm<NoticeFormValues>();
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // Documents picked in this dialog, uploaded on save; and stored ones marked for removal.
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);

  const editing = target && "post" in target ? target.post : null;

  // The form remounts each time the dialog opens: the post being edited, or a blank
  // one addressed to the reader's own unit on the chosen board.
  const initialValues: Partial<NoticeFormValues> = editing
    ? { scope: editing.scope as BoardScope, severity: editing.severity, title: editing.title, body: editing.body }
    : {
        scope: target && "scope" in target ? target.scope : "company",
        departmentId: viewer?.departmentId ?? undefined,
        severity: "info",
        title: "",
        body: "",
      };

  const keptAttachments = (editing?.attachments ?? []).filter((a) => !removedIds.includes(a.id));

  const hasDocuments = keptAttachments.length + newFiles.length > 0;

  const handleClose = () => {
    setNewFiles([]);
    setRemovedIds([]);
    onClose();
  };

  // Picked files wait here; they are uploaded together with the notice.
  const handlePickFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = [...(e.target.files ?? [])];
    for (const file of picked.filter((f) => f.size > MAX_FILE_SIZE)) toast.error(`${file.name} is larger than 10 MB`);
    setNewFiles((files) => [...files, ...picked.filter((f) => f.size <= MAX_FILE_SIZE)]);
    // Reset so the same file can be picked again after being removed.
    e.target.value = "";
  };

  const handleSubmit = async () => {
    const v = await form.validateFields();
    setSaving(true);
    try {
      let id = editing?.id;
      if (editing) {
        await onUpdate({ id: editing.id, input: { severity: v.severity, title: v.title, body: v.body ?? "" } });
      } else {
        id = (await onCreate(v)).id;
      }
      await Promise.all(removedIds.map((attachmentId) => onRemoveAttachment(attachmentId)));
      // One at a time: each document is its own request with its own size limit.
      for (const file of newFiles) await onAddAttachment({ id: id!, file });
      toast.success(editing ? "Notice updated" : "Notice posted");
      handleClose();
    } catch {
      toast.error("Failed to save the notice or one of its documents");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!target}
      onCancel={handleClose}
      title={editing ? "Edit Notice" : "Post a Notice"}
      footer={
        <div className="flex items-center gap-2">
          <input ref={fileInput} type="file" multiple hidden onChange={handlePickFiles} />
          <Button icon={<UploadOutlined />} onClick={() => fileInput.current?.click()}>
            Add documents
          </Button>
          <Button className="ml-auto" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="primary" loading={saving} onClick={handleSubmit}>
            {editing ? "Save" : "Post"}
          </Button>
        </div>
      }
      width={560}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" className="pt-2" preserve={false} initialValues={initialValues}>
        <Form.Item name="scope" label="Board">
          <Select disabled={!!editing} options={BOARDS.map((b) => ({ value: b.scope, label: b.title }))} />
        </Form.Item>
        {/* A new department post also picks which department it is for. */}
        {!editing && (
          <Form.Item noStyle dependencies={["scope"]}>
            {({ getFieldValue }) =>
              getFieldValue("scope") === "department" && (
                <Form.Item name="departmentId" label="Department" rules={[{ required: true, message: "Choose a department" }]}>
                  <Select options={departments.map((d) => ({ value: d.id, label: d.name }))} placeholder="Choose a department" />
                </Form.Item>
              )
            }
          </Form.Item>
        )}
        {editing?.target && (
          <Form.Item label="For">
            <Input value={editing.target} disabled />
          </Form.Item>
        )}
        <Form.Item name="severity" label="Priority">
          <Segmented options={SEVERITIES.map((s) => ({ value: s.value, label: s.label }))} />
        </Form.Item>
        <Form.Item name="title" label="Title" rules={[{ required: true, whitespace: true, message: "Title is required" }]}>
          <Input placeholder="e.g. Port congestion in Hamburg" maxLength={200} />
        </Form.Item>
        <Form.Item name="body" label="Details">
          <Input.TextArea rows={7} placeholder="Everything people need to know." />
        </Form.Item>
        {/* The picker sits in the footer; the chosen documents are listed here. */}
        {hasDocuments && (
          <Form.Item label="Documents" className="mb-0">
            <div className="flex flex-col gap-1">
              <NoticeAttachmentList
                files={keptAttachments.map((a) => ({ key: a.id, fileName: a.fileName, fileSize: a.fileSize }))}
                onRemove={(id) => setRemovedIds((ids) => [...ids, id])}
              />
              <NoticeAttachmentList
                files={newFiles.map((f, i) => ({ key: String(i), fileName: f.name, fileSize: f.size }))}
                onRemove={(index) => setNewFiles((files) => files.filter((_, i) => String(i) !== index))}
              />
            </div>
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}

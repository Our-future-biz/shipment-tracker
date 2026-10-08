"use client";

import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Button, Form, Input, Modal, Select } from "antd";
import { UploadOutlined } from "@ant-design/icons";
import { fileToDataUrl, formatFileSize } from "@/lib/files";
import { useToast } from "@/lib/toast";
import { DOCUMENT_TYPES } from "../../_lib/constants";

// The API accepts 20 MiB per request and base64 makes the file about a third larger.
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export interface CustomerDocumentInput {
  name: string;
  type: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileData: string;
}

interface CustomerDocumentDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (input: CustomerDocumentInput) => Promise<unknown>;
}

interface CustomerDocumentFormValues {
  name: string;
  type: string;
}

const INITIAL_VALUES: CustomerDocumentFormValues = { name: "", type: "Other" };

const TYPE_OPTIONS = DOCUMENT_TYPES.map((type) => ({ value: type, label: type }));

// "Contract 2026.pdf" → "Contract 2026"; a name that is only an extension (".env") is kept whole.
const withoutExtension = (fileName: string) => fileName.replace(/\.[^.]+$/, "") || fileName;

export function CustomerDocumentDialog({ open, onClose, onCreate }: CustomerDocumentDialogProps) {
  const toast = useToast();
  const [form] = Form.useForm<CustomerDocumentFormValues>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // The picked file is only remembered here; its content is read when the form is submitted.
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [saving, setSaving] = useState(false);

  const closeDialog = () => {
    setFile(null);
    setFileError("");
    onClose();
  };

  const handleCancel = () => {
    // An upload that is already on its way cannot be taken back, so the dialog waits for it.
    if (!saving) closeDialog();
  };

  const handleBrowse = () => fileInputRef.current?.click();

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    // Reset so picking the same file again still fires a change.
    e.target.value = "";
    if (!picked) return;

    if (picked.size === 0) {
      setFile(null);
      setFileError(`${picked.name} is empty. Choose another file.`);
      return;
    }
    if (picked.size > MAX_FILE_BYTES) {
      setFile(null);
      setFileError(`${picked.name} is too large (${formatFileSize(picked.size)}). The limit is 10 MB.`);
      return;
    }

    // Suggest a name from the file for as long as the user has not typed one of their own.
    if (!form.isFieldTouched("name") || !form.getFieldValue("name")?.trim()) {
      form.setFieldValue("name", withoutExtension(picked.name));
    }
    setFile(picked);
    setFileError("");
  };

  const handleSubmit = async () => {
    if (saving) return;
    if (!file) setFileError((current) => current || "File is required");
    // Validated even without a file, so every missing field is marked at once.
    const values = await form.validateFields().catch(() => null);
    if (!values || !file) return;

    setSaving(true);
    try {
      // Read here and awaited, so a document can never be saved before its content is ready.
      const fileData = await fileToDataUrl(file).catch(() => "");
      if (!fileData) {
        setFile(null);
        setFileError(`${file.name} could not be read. Choose the file again.`);
        return;
      }
      await onCreate({
        name: values.name.trim(),
        type: values.type,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        fileData,
      });
      toast.success("Document added");
      closeDialog();
    } catch {
      toast.error("Failed to add the document");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={handleCancel}
      onOk={handleSubmit}
      title="Add Document"
      okText="Add"
      confirmLoading={saving}
      cancelButtonProps={{ disabled: saving }}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" className="pt-2" preserve={false} initialValues={INITIAL_VALUES}>
        <Form.Item label="File" required validateStatus={fileError ? "error" : undefined} help={fileError || undefined}>
          <div className="flex items-center gap-2.5 min-w-0">
            <input ref={fileInputRef} type="file" hidden onChange={handleFileChange} />
            <Button size="small" icon={<UploadOutlined />} onClick={handleBrowse}>
              {file ? "Change file" : "Select file"}
            </Button>
            {file ? (
              <span className="min-w-0 flex items-baseline gap-1.5 text-[13px]">
                <span className="truncate text-slate-700" title={file.name}>
                  {file.name}
                </span>
                <span className="shrink-0 text-xs text-slate-400">{formatFileSize(file.size)}</span>
              </span>
            ) : (
              <span className="text-xs text-slate-400">Up to 10 MB</span>
            )}
          </div>
        </Form.Item>
        <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: "Name is required" }]}>
          <Input placeholder="e.g. Framework contract 2026" onPressEnter={handleSubmit} />
        </Form.Item>
        <Form.Item name="type" label="Type" className="mb-0">
          <Select options={TYPE_OPTIONS} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

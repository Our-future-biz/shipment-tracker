"use client";

import { useState } from "react";
import { Table, Button, Modal, Input, Select, Tag, Upload } from "antd";
import { PlusOutlined, DeleteOutlined, UploadOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useCustomerDocuments, type DocumentItem } from "@/hooks/useCustomerDocuments";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { DOCUMENT_TYPES } from "../../_lib/constants";

function formatSize(bytes: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsTab({ customerId }: { customerId: string }) {
  const { documents, isLoading, createDocument, deleteDocument } = useCustomerDocuments(customerId);
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DocumentItem | null>(null);

  const [name, setName] = useState("");
  const [type, setType] = useState("Other");
  const [fileName, setFileName] = useState("");
  const [fileType, setFileType] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const [fileData, setFileData] = useState("");

  const resetForm = () => {
    setName("");
    setType("Other");
    setFileName("");
    setFileType("");
    setFileSize(0);
    setFileData("");
  };

  const download = async (record: DocumentItem) => {
    try {
      const res = await api.customers.documentContent(record.id);
      const a = document.createElement("a");
      a.href = res.fileData;
      a.download = res.fileName || record.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      toast.error("Download failed");
    }
  };

  const handleFile = (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File must be 10MB or smaller");
      return Upload.LIST_IGNORE;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setFileData(reader.result as string);
      setFileName(file.name);
      setFileType(file.type);
      setFileSize(file.size);
      setName((prev) => prev || file.name);
    };
    reader.readAsDataURL(file);
    return false;
  };

  const submit = async () => {
    try {
      await createDocument({ name, type, fileName, fileType, fileSize, fileData });
      toast.success("Document added");
      resetForm();
      setAddOpen(false);
    } catch {
      toast.error("Failed to add document");
    }
  };

  const columns: ColumnsType<DocumentItem> = [
    {
      title: "Name",
      dataIndex: "name",
      render: (v: string, record: DocumentItem) => (
        <span
          className="text-indigo-500 font-medium cursor-pointer"
          onClick={() => download(record)}
        >
          {v}
        </span>
      ),
    },
    {
      title: "Type",
      dataIndex: "type",
      render: (v: string) => <Tag>{v}</Tag>,
    },
    {
      title: "File",
      dataIndex: "fileName",
      render: (v: string) => v || <span className="text-slate-300">—</span>,
    },
    {
      title: "Size",
      dataIndex: "fileSize",
      render: (v: number) => formatSize(v),
    },
    {
      title: "Uploaded",
      dataIndex: "createdAt",
      render: (v: string) => (v ? new Date(v).toLocaleDateString("en-GB") : <span className="text-slate-300">—</span>),
    },
    {
      title: "",
      key: "actions",
      width: 50,
      render: (_: unknown, record: DocumentItem) => (
        <Button
          type="text"
          size="small"
          danger
          icon={<DeleteOutlined />}
          onClick={() => setDeleteTarget(record)}
        />
      ),
    },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-slate-800">Documents</span>
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
          Add Document
        </Button>
      </div>

      <Table<DocumentItem>
        size="small"
        rowKey="id"
        loading={isLoading}
        dataSource={documents}
        columns={columns}
        pagination={false}
        locale={{ emptyText: "No documents yet" }}
      />

      <Modal
        open={addOpen}
        onCancel={() => {
          resetForm();
          setAddOpen(false);
        }}
        onOk={submit}
        title="Add Document"
        okText="Add"
        okButtonProps={{ disabled: !name }}
        destroyOnHidden
      >
        <div className="flex flex-col gap-3 pt-2">
          <div>
            <div className="text-sm text-slate-600 mb-1">File</div>
            <Upload beforeUpload={handleFile} maxCount={1} showUploadList={false}>
              <Button icon={<UploadOutlined />}>Select file</Button>
            </Upload>
            {fileName && (
              <div className="text-xs text-slate-500 mt-1">
                {fileName} · {formatSize(fileSize)}
              </div>
            )}
          </div>
          <div>
            <div className="text-sm text-slate-600 mb-1">Name</div>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <div className="text-sm text-slate-600 mb-1">Type</div>
            <Select
              className="w-full"
              value={type}
              onChange={setType}
              options={DOCUMENT_TYPES.map((t) => ({ value: t, label: t }))}
            />
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) await deleteDocument(deleteTarget.id);
          setDeleteTarget(null);
          toast.success("Document removed");
        }}
        title="Remove document"
        description={`Remove ${deleteTarget?.name}?`}
        confirmLabel="Remove"
        danger
      />
    </div>
  );
}

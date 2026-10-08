"use client";

import { useState } from "react";
import { Button, Table, Tag } from "antd";
import { DeleteOutlined, DownloadOutlined, PlusOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { ConfirmModal } from "@/components/ConfirmModal";
import { PillTabs, SectionCard } from "@/components/SectionCard";
import { useCustomerDocuments } from "@/hooks/useCustomerDocuments";
import type { DocumentItem } from "@/hooks/useCustomerDocuments";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { downloadDataUrl, formatFileSize } from "@/lib/files";
import { useToast } from "@/lib/toast";
import { DOCUMENT_TYPES, DOCUMENT_TYPE_COLORS } from "../../_lib/constants";
import { CustomerCountChip } from "../_components/CustomerCountChip";
import { CustomerDocumentDialog } from "../_components/CustomerDocumentDialog";
import type { CustomerDocumentInput } from "../_components/CustomerDocumentDialog";
import { EMPTY_CELL, TABLE_PAGINATION } from "../../_lib/customerTable";

interface DocumentsTabProps {
  customerId: string;
}

const ALL_TYPES = "all";

export function DocumentsTab({ customerId }: DocumentsTabProps) {
  const toast = useToast();
  const { documents, isLoading, createDocument, deleteDocument } = useCustomerDocuments(customerId);
  const [typeFilter, setTypeFilter] = useState(ALL_TYPES);
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [downloadingIds, setDownloadingIds] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<DocumentItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const countOfType = (type: string) => documents.filter((d) => d.type === type).length;
  const typeTabs = [
    { key: ALL_TYPES, label: `All (${documents.length})` },
    ...DOCUMENT_TYPES.map((type) => ({ key: type, label: `${type} (${countOfType(type)})` })),
  ];
  const visibleDocuments = typeFilter === ALL_TYPES ? documents : documents.filter((d) => d.type === typeFilter);

  const handleTypeFilterChange = (key: string) => {
    setTypeFilter(key);
    setPage(1);
  };

  const handleCreate = async (input: CustomerDocumentInput) => {
    await createDocument(input);
    // A filter on another type would hide the document that was just added.
    if (typeFilter !== ALL_TYPES && typeFilter !== input.type) handleTypeFilterChange(ALL_TYPES);
  };

  const handleDownload = async (doc: DocumentItem) => {
    if (downloadingIds.includes(doc.id)) return;
    setDownloadingIds((ids) => [...ids, doc.id]);
    try {
      // The list carries no file content; it is fetched only when a document is opened.
      const content = await api.customers.documentContent(doc.id);
      if (!content.fileData) {
        toast.error("This document has no file attached");
        return;
      }
      downloadDataUrl(content.fileData, content.fileName || doc.fileName || doc.name);
    } catch {
      toast.error("Failed to download the document");
    } finally {
      setDownloadingIds((ids) => ids.filter((id) => id !== doc.id));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDocument(deleteTarget.id);
      toast.success("Document deleted");
      setDeleteTarget(null);
    } catch {
      toast.error("Failed to delete the document");
    } finally {
      setDeleting(false);
    }
  };

  const columns: ColumnsType<DocumentItem> = [
    {
      title: "Name",
      dataIndex: "name",
      render: (v: string, r) => (
        <button
          type="button"
          title="Download"
          onClick={() => handleDownload(r)}
          className="p-0 border-none bg-transparent text-left text-indigo-600 hover:underline cursor-pointer"
        >
          {v}
        </button>
      ),
    },
    {
      title: "Type",
      dataIndex: "type",
      render: (v: string) => (
        <Tag color={DOCUMENT_TYPE_COLORS[v] ?? "default"} className="!m-0">
          {v}
        </Tag>
      ),
    },
    { title: "File", dataIndex: "fileName", render: (v: string) => v || EMPTY_CELL },
    { title: "Size", dataIndex: "fileSize", render: (v: number) => (v ? formatFileSize(v) : EMPTY_CELL) },
    { title: "Uploaded", dataIndex: "createdAt", render: (v: string) => formatDate(v) || EMPTY_CELL },
    {
      title: "",
      key: "actions",
      width: 80,
      render: (_: unknown, r) => (
        <div className="flex justify-end gap-1">
          <Button
            type="text"
            size="small"
            icon={<DownloadOutlined />}
            aria-label={`Download ${r.name}`}
            loading={downloadingIds.includes(r.id)}
            onClick={() => handleDownload(r)}
          />
          <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label={`Delete ${r.name}`} onClick={() => setDeleteTarget(r)} />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <SectionCard
        title="Documents"
        bodyClassName="p-2"
        extra={
          <>
            <CustomerCountChip count={documents.length} />
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
              Add Document
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-3 px-2 pb-3">
          <PillTabs tabs={typeTabs} active={typeFilter} onChange={handleTypeFilterChange} />
        </div>
        <Table<DocumentItem>
          size="small"
          rowKey="id"
          loading={isLoading}
          dataSource={visibleDocuments}
          columns={columns}
          scroll={{ x: "max-content" }}
          pagination={{ ...TABLE_PAGINATION, current: page, onChange: setPage }}
          locale={{ emptyText: typeFilter === ALL_TYPES ? "No documents yet" : "No documents of this type" }}
        />
      </SectionCard>

      <CustomerDocumentDialog open={addOpen} onClose={() => setAddOpen(false)} onCreate={handleCreate} />

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete document"
        description={`Delete ${deleteTarget?.name ?? "this document"}? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        loading={deleting}
      />
    </div>
  );
}

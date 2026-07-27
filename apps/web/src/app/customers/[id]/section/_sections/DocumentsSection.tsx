"use client";

import { Table, Spin, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo } from "react";
import { useCustomerDocuments, type DocumentItem } from "@/hooks/useCustomerDocuments";
import { KpiCard, SectionCard } from "./shared";

const DOCUMENT_TYPES = ["Contract", "NDA", "Power of attorney", "Customs", "Other"] as const;

const TYPE_COLORS: Record<string, string> = {
  Contract: "blue",
  NDA: "purple",
  "Power of attorney": "gold",
  Customs: "green",
  Other: "default",
};

function formatBytes(bytes: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes.toFixed(1)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsSection({ customerId }: { customerId: string }) {
  const { documents, isLoading } = useCustomerDocuments(customerId);

  const counts = useMemo(() => {
    const rows = documents as DocumentItem[];
    const byType = new Map<string, number>();
    for (const type of DOCUMENT_TYPES) byType.set(type, 0);
    for (const doc of rows) {
      byType.set(doc.type, (byType.get(doc.type) ?? 0) + 1);
    }
    return { total: rows.length, byType };
  }, [documents]);

  const columns: ColumnsType<DocumentItem> = [
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      render: (name: string) => <span className="font-medium text-indigo-600">{name}</span>,
    },
    {
      title: "Type",
      dataIndex: "type",
      key: "type",
      render: (type: string) => (type ? <Tag color={TYPE_COLORS[type] ?? "default"}>{type}</Tag> : <span className="text-slate-400">—</span>),
    },
    {
      title: "File",
      dataIndex: "fileName",
      key: "fileName",
      render: (fileName: string) => <span className="text-slate-600">{fileName || "—"}</span>,
    },
    {
      title: "Size",
      dataIndex: "fileSize",
      key: "fileSize",
      render: (fileSize: number) => <span className="text-slate-600">{formatBytes(fileSize)}</span>,
    },
    {
      title: "Uploaded",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (createdAt: string) => <span className="text-slate-500">{new Date(createdAt).toLocaleDateString("en-GB")}</span>,
    },
  ];

  return (
    <div>
      <div className="grid grid-cols-6 gap-3 mb-4">
        <KpiCard label="Total" value={counts.total} />
        {DOCUMENT_TYPES.map((type) => (
          <KpiCard key={type} label={type} value={counts.byType.get(type) ?? 0} />
        ))}
      </div>

      <SectionCard title="Document archive">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Spin />
          </div>
        ) : (
          <Table<DocumentItem>
            size="small"
            pagination={false}
            rowKey="id"
            columns={columns}
            dataSource={documents as DocumentItem[]}
          />
        )}
      </SectionCard>
    </div>
  );
}

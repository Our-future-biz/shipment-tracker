"use client";

import { Table, Button } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined, PaperClipOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { SectionCard } from "@/components/SectionCard";
import { formatDateTime } from "@/lib/date";
import type { Announcement } from "@/hooks/useNoticeboard";
import { NoticeSeverityTag } from "./NoticeSeverityTag";

interface NoticeBoardCardProps {
  title: string;
  // The reader's own unit on this board, shown next to the title.
  caption?: string;
  posts: Announcement[];
  isLoading: boolean;
  emptyText: string;
  // Posts on this board are addressed to more than the reader's own unit, so say to whom.
  showTarget: boolean;
  canPost: boolean;
  onPost: () => void;
  onOpen: (post: Announcement) => void;
  onEdit: (post: Announcement) => void;
  onDelete: (post: Announcement) => void;
}

export function NoticeBoardCard({
  title,
  caption,
  posts,
  isLoading,
  emptyText,
  showTarget,
  canPost,
  onPost,
  onOpen,
  onEdit,
  onDelete,
}: NoticeBoardCardProps) {
  const columns: ColumnsType<Announcement> = [
    { title: "Priority", dataIndex: "severity", width: 96, render: (v: string) => <NoticeSeverityTag severity={v} /> },
    {
      title: "Notice",
      dataIndex: "title",
      render: (v: string, r) => (
        <div className="min-w-0 flex items-center gap-2 [overflow-wrap:anywhere] text-[18px] leading-tight font-semibold text-slate-800">
          {/* Shown until the reader has opened the notice. */}
          {r.unread && <span role="img" aria-label="Unread" title="Unread" className="shrink-0 w-2 h-2 rounded-full bg-red-500" />}
          {v}
          {r.attachments.length > 0 && (
            <span className="shrink-0 flex items-center gap-0.5 text-xs font-normal text-slate-400" title="Documents attached">
              <PaperClipOutlined />
              {r.attachments.length}
            </span>
          )}
        </div>
      ),
    },
    ...(showTarget ? [{ title: "For", dataIndex: "target", width: 130 }] : []),
    {
      title: "Posted",
      dataIndex: "createdAt",
      width: 150,
      render: (v: string, r) => (
        <div className="text-xs">
          <div className="text-slate-700">{r.authorName}</div>
          <div className="text-slate-400">{formatDateTime(v)}</div>
        </div>
      ),
    },
    ...(posts.some((p) => p.canEdit)
      ? [
          {
            title: "",
            key: "actions",
            width: 72,
            render: (_: unknown, r: Announcement) =>
              r.canEdit && (
                // Row clicks open the notice; the buttons must not.
                <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button type="text" size="small" icon={<EditOutlined />} aria-label={`Edit ${r.title}`} onClick={() => onEdit(r)} />
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label={`Delete ${r.title}`} onClick={() => onDelete(r)} />
                </div>
              ),
          },
        ]
      : []),
  ];

  return (
    <SectionCard
      title={caption ? `${title} · ${caption}` : title}
      bodyClassName="p-2"
      extra={
        canPost && (
          <Button type="primary" size="small" icon={<PlusOutlined />} aria-label={`Post to ${title}`} title="Post a notice" onClick={onPost} />
        )
      }
    >
      <Table<Announcement>
        size="small"
        rowKey="id"
        loading={isLoading}
        dataSource={posts}
        columns={columns}
        pagination={{ pageSize: 5, hideOnSinglePage: true, size: "small" }}
        locale={{ emptyText }}
        rowClassName="cursor-pointer"
        onRow={(r) => ({ onClick: () => onOpen(r) })}
      />
    </SectionCard>
  );
}

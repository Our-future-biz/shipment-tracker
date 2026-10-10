"use client";

import { Table, Button, Dropdown } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined, EllipsisOutlined, PaperClipOutlined } from "@ant-design/icons";
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
  // A feed rather than a grid: the priority tag, then the notice taking all the remaining
  // width (who posted it, when and for whom sit under the title), then a quiet menu.
  const columns: ColumnsType<Announcement> = [
    { title: "Priority", dataIndex: "severity", width: 88, render: (v: string) => <NoticeSeverityTag severity={v} /> },
    {
      title: "Notice",
      dataIndex: "title",
      render: (v: string, r) => (
        <div className="relative">
          {/* Shown until the reader has opened the notice; it hangs in the gutter so every title starts on the same line. */}
          {r.unread && <span role="img" aria-label="Unread" title="Unread" className="absolute -left-3.5 top-[7px] w-2 h-2 rounded-full bg-red-500" />}
          <div className="min-w-0">
            {/* A real button, so the notice can be opened from the keyboard; the click itself is the row's. */}
            <button
              type="button"
              className="block w-full p-0 border-none bg-transparent text-left cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
            >
              <span className="text-[15px] leading-tight font-semibold text-slate-800 [overflow-wrap:anywhere] line-clamp-2">{v}</span>
            </button>
            <div className="mt-0.5 flex items-center gap-x-1.5 text-xs text-slate-500">
              {showTarget && r.target && (
                <span title={r.target} className="min-w-0 max-w-[45%] truncate rounded bg-slate-100 px-1.5 text-slate-600">
                  {r.target}
                </span>
              )}
              {/* A long name gives way; the date always stays readable. */}
              <span className="min-w-0 truncate">{r.authorName}</span>
              <span className="shrink-0">· {formatDateTime(r.createdAt)}</span>
              {r.attachments.length > 0 && (
                <span className="shrink-0 flex items-center gap-0.5 text-slate-400" title="Documents attached">
                  <PaperClipOutlined />
                  {r.attachments.length}
                </span>
              )}
            </div>
          </div>
        </div>
      ),
    },
    ...(posts.some((p) => p.canEdit)
      ? [
          {
            title: "",
            key: "actions",
            width: 44,
            render: (_: unknown, r: Announcement) =>
              r.canEdit && (
                // Row clicks open the notice; the menu and its items must not (their clicks bubble through here).
                <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                  <Dropdown
                    trigger={["click"]}
                    placement="bottomRight"
                    menu={{
                      items: [
                        { key: "edit", label: "Edit", icon: <EditOutlined />, onClick: () => onEdit(r) },
                        { key: "delete", label: "Delete", icon: <DeleteOutlined />, danger: true, onClick: () => onDelete(r) },
                      ],
                    }}
                  >
                    <Button
                      type="text"
                      size="small"
                      icon={<EllipsisOutlined className="!text-[20px]" />}
                      aria-label={`Actions for ${r.title}`}
                      className="!text-slate-600 hover:!text-slate-900"
                    />
                  </Dropdown>
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
          <Button type="primary" size="small" icon={<PlusOutlined />} aria-label={`Post Notice to ${title}`} onClick={onPost}>
            Post Notice
          </Button>
        )
      }
    >
      <Table<Announcement>
        size="small"
        rowKey="id"
        tableLayout="fixed"
        // The tag and the notice explain themselves; column headings would only make it a table again.
        showHeader={false}
        className="[&_.ant-table-cell]:!py-1.5"
        loading={isLoading}
        dataSource={posts}
        columns={columns}
        pagination={{ pageSize: 8, hideOnSinglePage: true, size: "small", showSizeChanger: false }}
        // A blank area for the spinner during the first load, instead of "No notices.".
        locale={{ emptyText: isLoading ? <div className="h-16" /> : emptyText }}
        rowClassName="cursor-pointer"
        onRow={(r) => ({ onClick: () => onOpen(r) })}
      />
    </SectionCard>
  );
}

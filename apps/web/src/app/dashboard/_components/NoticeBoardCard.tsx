"use client";

import { useMemo, type ReactNode } from "react";
import { Table, Button, Dropdown } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined, EllipsisOutlined, PaperClipOutlined } from "@ant-design/icons";
import { useAuth } from "@/lib/auth/AuthContext";
import type { ColumnsType } from "antd/es/table";
import { SectionCard } from "@/components/SectionCard";
import { formatDateTime } from "@/lib/date";
import type { Announcement } from "@/hooks/useNoticeboard";
import { NoticeSeverityTag } from "./NoticeSeverityTag";
import { SEVERITIES } from "../_lib/boards";

// Every column sorts. Text in Czech order (so "Č" sits after "C"); Status by weight, Critical first.
const byText = (get: (a: Announcement) => string) => (a: Announcement, b: Announcement) => get(a).localeCompare(get(b), "cs");
const severityRank = (a: Announcement) => SEVERITIES.findIndex((s) => s.value === a.severity);

// An unread notice is a soft card: a light indigo background (the card header's tone), a shade darker
// on hover, a faint indigo outline with rounded ends, and a white gap below so several unread ones in a
// row stay apart. Drawn on the cells (the outline as inset shadows, inside the white gap), so it also
// covers the sorted Date column's own background.
const UNREAD_ROW = [
  "[&>td]:!bg-indigo-50/70",
  "[&:hover>td]:!bg-indigo-100/60",
  "[&>td]:!border-b-2 [&>td]:!border-b-white",
  "[&>td]:!shadow-[inset_0_1px_0_#e0e7ff,inset_0_-1px_0_#e0e7ff]",
  "[&>td:first-child]:!shadow-[inset_1px_1px_0_#e0e7ff,inset_0_-1px_0_#e0e7ff]",
  "[&>td:last-child]:!shadow-[inset_-1px_1px_0_#e0e7ff,inset_0_-1px_0_#e0e7ff]",
  "[&>td:first-child]:!rounded-l-lg [&>td:last-child]:!rounded-r-lg",
].join(" ");

interface NoticeBoardCardProps {
  title: string;
  // The reader's own unit on this board, shown next to the title.
  caption?: string;
  posts: Announcement[];
  // Shown above the notices, e.g. the filters.
  toolbar?: ReactNode;
  // Shown in the middle of the header bar, e.g. the search box.
  headerExtra?: ReactNode;
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
  toolbar,
  headerExtra,
  isLoading,
  emptyText,
  showTarget,
  canPost,
  onPost,
  onOpen,
  onEdit,
  onDelete,
}: NoticeBoardCardProps) {
  const { user } = useAuth();
  // The board's own order, kept whenever no column sort is chosen: unread notices on top,
  // then everything by when it was posted, newest first.
  const ordered = useMemo(
    () => [...posts].sort((a, b) => Number(b.unread) - Number(a.unread) || b.createdAt.localeCompare(a.createdAt)),
    [posts],
  );
  const readRank = (a: Announcement) => (a.authorId === user?.id ? 2 : a.unread ? 0 : 1);
  // A table: priority, for whom, the notice itself, who posted it, the date, whether the
  // reader has read it, then a quiet menu.
  const columns: ColumnsType<Announcement> = [
    {
      title: "Status",
      dataIndex: "severity",
      width: 120,
      sorter: (a, b) => severityRank(a) - severityRank(b),
      sortDirections: ["descend", "ascend"],
      render: (v: string) => <NoticeSeverityTag severity={v} />,
    },
    ...(showTarget
      ? [
          {
            title: "Department",
            dataIndex: "target",
            width: 200,
            sorter: byText((a) => a.target ?? ""),
            render: (v: string | null | undefined) =>
              v ? (
                <span title={v} className="inline-block max-w-full truncate align-middle rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {v}
                </span>
              ) : null,
          },
        ]
      : []),
    {
      title: "Title",
      dataIndex: "title",
      sorter: byText((a) => a.title),
      render: (v: string, r) => (
        <div className="relative flex items-center gap-1.5 min-w-0">
          {/* Shown until the reader has opened the notice; it hangs in the gutter so every title starts on the same line. */}
          {r.unread && <span role="img" aria-label="Unread" title="Unread" className="absolute -left-3.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-red-500" />}
          {/* A real button, so the notice can be opened from the keyboard; the click itself is the row's. */}
          <button
            type="button"
            className="min-w-0 p-0 border-none bg-transparent text-left cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
          >
            <span className="text-[15px] leading-tight font-semibold text-slate-800 [overflow-wrap:anywhere] line-clamp-2">{v}</span>
          </button>
          {r.attachments.length > 0 && (
            <span className="shrink-0 flex items-center gap-0.5 text-xs text-slate-400" title="Documents attached">
              <PaperClipOutlined />
              {r.attachments.length}
            </span>
          )}
        </div>
      ),
    },
    {
      title: "Posted by",
      dataIndex: "authorName",
      sorter: byText((a) => a.authorName),
      width: 160,
      render: (v: string) => <span className="block truncate text-slate-600" title={v}>{v}</span>,
    },
    {
      title: "Date",
      dataIndex: "createdAt",
      width: 160,
      sortDirections: ["descend", "ascend"],
      sorter: (a, b) => a.createdAt.localeCompare(b.createdAt),
      render: (v: string) => <span className="text-slate-500 tabular-nums whitespace-nowrap">{formatDateTime(v)}</span>,
    },
    {
      // Whether the reader has confirmed the notice; their own notices need no confirming.
      title: "Read",
      key: "read",
      width: 120,
      // Unread first, then read, then the reader's own.
      sorter: (a, b) => readRank(a) - readRank(b),
      render: (_: unknown, r: Announcement) =>
        r.authorId === user?.id ? (
          // Indigo, the app's own colour (as on the author's initials), apart from green Read and amber Unread.
          <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">Yours</span>
        ) : r.unread ? (
          <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Unread</span>
        ) : (
          <span
            title={r.readAt ? `Read ${formatDateTime(r.readAt)}` : undefined}
            className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
          >
            Read
          </span>
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
      middle={headerExtra}
      dense
      extra={
        canPost && (
          <Button type="primary" size="small" icon={<PlusOutlined />} aria-label={`Post Notice to ${title}`} onClick={onPost}>
            Post Notice
          </Button>
        )
      }
    >
      {toolbar}
      <Table<Announcement>
        size="small"
        rowKey="id"
        tableLayout="fixed"
        // On a narrow screen the table scrolls sideways rather than squeeze the titles.
        scroll={{ x: 940 }}
        className="[&_.ant-table-tbody_.ant-table-cell]:!py-1"
        loading={isLoading}
        dataSource={ordered}
        columns={columns}
        pagination={{ pageSize: 8, hideOnSinglePage: true, size: "small", showSizeChanger: false }}
        // A blank area for the spinner during the first load, instead of "No notices.".
        locale={{ emptyText: isLoading ? <div className="h-16" /> : emptyText }}
        rowClassName={(r) => (r.unread ? `cursor-pointer ${UNREAD_ROW}` : "cursor-pointer")}
        onRow={(r) => ({ onClick: () => onOpen(r) })}
      />
    </SectionCard>
  );
}

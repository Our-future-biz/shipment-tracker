"use client";

import { useEffect, useRef } from "react";
import { Badge, Dropdown } from "antd";
import { BellOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { useNoticeboard } from "@/hooks/useNoticeboard";
import { BOARDS } from "@/app/dashboard/_lib/boards";
import { NoticeSeverityTag } from "@/app/dashboard/_components/NoticeSeverityTag";

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const boardLabel = (scope: string, target: string) => {
  const board = BOARDS.find((b) => b.scope === scope)?.title ?? scope;
  return target ? `${board} · ${target}` : board;
};

const NOTICE_TOAST_TYPE: Record<string, "info" | "warning" | "error"> = { info: "info", warning: "warning", critical: "error" };

// What the signed-in user has not looked at yet: noticeboard posts from colleagues and
// chat messages that tag them with @. A new one pops up as a notification; they stay
// under the bell until the notice or the shipment's chat (mentions) is opened.
export function NotificationBell() {
  const router = useRouter();
  const toast = useToast();
  const { data: mentionData } = useQuery({
    queryKey: ["shipment-comments", "mentions"],
    queryFn: () => api.shipments.commentMentions(),
    refetchInterval: 15000,
  });
  const mentions = mentionData?.mentions ?? [];
  const { announcements, isLoading: noticesLoading } = useNoticeboard();
  const notices = announcements.filter((a) => a.unread);

  // Announce only what arrives while the app is open, not the backlog found on load.
  const seenMentions = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!mentionData) return;
    const fresh = seenMentions.current ? mentionData.mentions.filter((m) => !seenMentions.current!.has(m.id)) : [];
    seenMentions.current = new Set(mentionData.mentions.map((m) => m.id));
    for (const m of fresh) {
      toast.notify({
        title: `${m.authorName || "A colleague"} mentioned you in ${m.jobNumber || "a shipment"}`,
        description: m.message,
      });
    }
  }, [mentionData, toast]);

  const seenNotices = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (noticesLoading) return;
    const fresh = seenNotices.current ? announcements.filter((a) => a.unread && !seenNotices.current!.has(a.id)) : [];
    seenNotices.current = new Set(announcements.map((a) => a.id));
    for (const a of fresh) {
      toast.notify({
        title: `New notice: ${a.title}`,
        description: `${a.authorName} · ${boardLabel(a.scope, a.target)}`,
        type: NOTICE_TOAST_TYPE[a.severity] ?? "info",
      });
    }
  }, [announcements, noticesLoading, toast]);

  const total = mentions.length + notices.length;
  const rowClass = "block w-full text-left px-4 py-2.5 border-none border-b border-slate-100 bg-white hover:bg-slate-50 cursor-pointer";
  const headingClass = "px-4 py-2 border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500";

  const panel = (
    <div className="w-80 max-h-96 overflow-y-auto rounded-lg bg-white shadow-lg border border-slate-200">
      <div className="px-4 py-2.5 border-b border-slate-200 text-[13px] font-semibold text-slate-700">Notifications</div>
      {total === 0 && <p className="px-4 py-6 text-center text-xs text-slate-400">Nothing new.</p>}
      {notices.length > 0 && <div className={headingClass}>Noticeboard</div>}
      {notices.map((a) => (
        <button key={a.id} type="button" onClick={() => router.push(`/dashboard?notice=${a.id}`)} className={rowClass}>
          <span className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-semibold text-slate-800 truncate">{a.title}</span>
            <NoticeSeverityTag severity={a.severity} />
          </span>
          {a.body && <span className="block text-[12px] text-slate-600 line-clamp-2">{a.body}</span>}
          <span className="block text-[11px] text-slate-400 mt-0.5">
            {a.authorName} · {boardLabel(a.scope, a.target)} · {formatTime(a.createdAt)}
          </span>
        </button>
      ))}
      {mentions.length > 0 && <div className={headingClass}>Mentions</div>}
      {mentions.map((m) => (
        <button key={m.id} type="button" onClick={() => router.push(`/shipments?chat=${m.shipmentId}`)} className={rowClass}>
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-semibold text-slate-800 truncate">{m.authorName || "Unknown"}</span>
            <span className="shrink-0 text-[11px] font-mono text-slate-500">{m.jobNumber}</span>
          </span>
          <span className="block text-[12px] text-slate-600 line-clamp-2">{m.message}</span>
          <span className="block text-[11px] text-slate-400 mt-0.5">{formatTime(m.createdAt)}</span>
        </button>
      ))}
    </div>
  );

  return (
    <Dropdown trigger={["click"]} placement="bottomRight" popupRender={() => panel}>
      <button
        type="button"
        aria-label={total ? `Notifications — ${total} unread` : "Notifications"}
        className="flex items-center justify-center w-9 h-9 rounded-md bg-transparent border-none cursor-pointer text-slate-500 hover:bg-slate-50 hover:text-slate-700"
      >
        <Badge count={total} size="small" color="#ef4444">
          <BellOutlined className="text-[18px]" />
        </Badge>
      </button>
    </Dropdown>
  );
}

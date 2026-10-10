"use client";

import { useEffect, useRef, useState } from "react";
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

// How far back the "All" view of the panel goes.
const RECENT_NOTICES = 20;

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
  const { announcements, viewer, hasLoaded: noticesLoaded } = useNoticeboard();
  const [open, setOpen] = useState(false);
  // "Unread" is what still needs attention; "All" keeps the recent notices in reach after
  // they have been opened. Mentions exist here only while unread.
  const [view, setView] = useState<"unread" | "all">("unread");
  const notices = announcements.filter((a) => a.unread);
  const listed = view === "unread" ? notices : announcements.slice(0, RECENT_NOTICES);

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

  // The newest notice this tab has accounted for; null until the list first arrives. Only
  // notices posted after it are announced, so a list that failed to load at first does not
  // replay its history as "new". Nor does a board the reader has just been added to: a
  // change of their department, branch or country starts from a new baseline.
  const noticesSince = useRef<string | null>(null);
  const audience = viewer ? `${viewer.departmentId}|${viewer.branchId}|${viewer.country}` : "";
  const lastAudience = useRef<string | null>(null);
  useEffect(() => {
    if (!noticesLoaded) return;
    const since = noticesSince.current;
    const baseline = since === null || lastAudience.current !== audience;
    lastAudience.current = audience;
    const fresh = baseline ? [] : announcements.filter((a) => a.unread && a.createdAt > since);
    noticesSince.current = announcements.reduce((newest, a) => (a.createdAt > newest ? a.createdAt : newest), since ?? "");
    for (const a of fresh) {
      toast.notify({
        title: `New notice: ${a.title}`,
        description: `${a.authorName} · ${boardLabel(a.scope, a.target)}`,
        type: NOTICE_TOAST_TYPE[a.severity] ?? "info",
      });
    }
  }, [announcements, audience, noticesLoaded, toast]);

  // The panel is not an antd menu, so it does not close itself when a row is chosen.
  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const total = mentions.length + notices.length;
  const rowClass = "block w-full text-left px-4 py-2.5 border-b border-slate-100 last:border-b-0 bg-white hover:bg-slate-50 cursor-pointer";
  const headingClass = "px-4 py-2 border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500";

  const panel = (
    <div className="w-80 max-h-96 overflow-y-auto rounded-lg bg-white shadow-lg border border-slate-200">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-4 py-2 border-b border-slate-200 bg-white">
        <span className="text-[13px] font-semibold text-slate-700">Notifications</span>
        <span className="flex rounded-md bg-slate-100 p-0.5">
          {(["unread", "all"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={`px-2.5 py-0.5 rounded border-none text-[12px] font-medium cursor-pointer ${
                view === v ? "bg-white text-slate-800 shadow-sm" : "bg-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {v === "unread" ? `Unread${total ? ` (${total})` : ""}` : "All"}
            </button>
          ))}
        </span>
      </div>
      {listed.length + mentions.length === 0 && (
        <p className="px-4 py-6 text-center text-xs text-slate-400">{view === "unread" ? "Nothing new." : "No notifications yet."}</p>
      )}
      {listed.length > 0 && <div className={headingClass}>Noticeboard</div>}
      {listed.map((a) => (
        <button key={a.id} type="button" onClick={() => go(`/dashboard?notice=${a.id}`)} className={rowClass}>
          <span className="flex items-center gap-2">
            {a.unread && <span role="img" aria-label="Unread" className="shrink-0 w-2 h-2 rounded-full bg-red-500" />}
            <span className={`min-w-0 flex-1 text-[13px] truncate ${a.unread ? "font-semibold text-slate-800" : "font-medium text-slate-500"}`}>
              {a.title}
            </span>
            <NoticeSeverityTag severity={a.severity} />
          </span>
          {a.body && <span className={`text-[12px] line-clamp-2 ${a.unread ? "text-slate-600" : "text-slate-400"}`}>{a.body}</span>}
          <span className="block text-[11px] text-slate-400 mt-0.5">
            {a.authorName} · {boardLabel(a.scope, a.target)} · {formatTime(a.createdAt)}
          </span>
        </button>
      ))}
      {mentions.length > 0 && <div className={headingClass}>Mentions</div>}
      {mentions.map((m) => (
        <button key={m.id} type="button" onClick={() => go(`/shipments?chat=${m.shipmentId}`)} className={rowClass}>
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-semibold text-slate-800 truncate">{m.authorName || "Unknown"}</span>
            <span className="shrink-0 text-[11px] font-mono text-slate-500">{m.jobNumber}</span>
          </span>
          <span className="text-[12px] text-slate-600 line-clamp-2">{m.message}</span>
          <span className="block text-[11px] text-slate-400 mt-0.5">{formatTime(m.createdAt)}</span>
        </button>
      ))}
    </div>
  );

  return (
    <Dropdown open={open} onOpenChange={setOpen} trigger={["click"]} placement="bottomRight" popupRender={() => panel}>
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

"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Dropdown, Input } from "antd";
import { BellOutlined, SearchOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { useNoticeboard } from "@/hooks/useNoticeboard";
import { useFxAlerts, useInvalidateFx } from "@/hooks/useFx";
import { NoticeSeverityTag } from "@/app/dashboard/_components/NoticeSeverityTag";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatDate } from "@/lib/date";
import { useWarehouseInquiryAnswers, type WarehouseInquiryItem } from "@/hooks/useWarehouseInquiries";

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// A mention in a shipment's or a quote's chat, as the bell lists it.
interface BellMention {
  key: string;
  unread: boolean;
  authorName: string;
  message: string;
  createdAt: string;
  /** Job no. or Sales Reference. */
  ref: string;
  href: string;
  place: string;
}

// Where a notification about a Sales Reference leads: the Quotes list with that quote's chat
// open. One about an Internal Reference opens the Shipments list with the shipment's chat.
const quoteChatHref = (quoteNumber: string) => `/sales/quotes?chat=${encodeURIComponent(quoteNumber)}`;
const shipmentChatHref = (shipmentId: string) => `/shipments?chat=${encodeURIComponent(shipmentId)}`;

// A warehouse answer as the bell says it.
const answerTitle = (a: WarehouseInquiryItem) => `Warehouse ${a.inquiry.status === "approved" ? "approved" : "rejected"} ${a.quoteNumber}`;
const answerText = (a: WarehouseInquiryItem) => {
  const what = `${a.inquiry.pieces} piece${a.inquiry.pieces === 1 ? "" : "s"} of 12.5 t or more${a.customerName ? ` · ${a.customerName}` : ""}`;
  return a.inquiry.status === "approved"
    ? `${what}: EUR ${a.inquiry.priceEurPerPiece ?? 0} per piece${a.inquiry.comment ? ` — ${a.inquiry.comment}` : ""}`
    : `${what}: ${a.inquiry.comment}`;
};

// How long a read notification stays under the bell, in the "Last 7 days" view.
const READ_KEEP_DAYS = 7;
const READ_KEEP_MS = READ_KEEP_DAYS * 86_400_000;
const keptSince = (iso: string | null | undefined, now: number) => !!iso && now - Date.parse(iso) <= READ_KEEP_MS;

// The search box: every word must appear somewhere in the item, case and accents ignored.
const fold = (v: string) => v.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const matchesAll = (q: string, ...fields: (string | null | undefined)[]) => {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fold(fields.filter(Boolean).join(" "));
  return words.every((w) => hay.includes(w));
};

const NOTICE_TOAST_TYPE: Record<string, "info" | "warning" | "error"> = { info: "info", warning: "warning", critical: "error" };

// What the signed-in user has not looked at yet: noticeboard posts from colleagues, chat
// messages that tag them with @, and the warehouse's answers to their questions about pieces of
// 12.5 t or more on a quote. A new one pops up as a notification; they stay
// under the bell until the notice or the shipment's chat (mentions) is opened. Read ones stay
// another 7 days in the "Last 7 days" view, and the search box looks through what is shown.
export function NotificationBell() {
  const router = useRouter();
  const toast = useToast();
  const { data: mentionData } = useQuery({
    queryKey: ["shipment-comments", "mentions"],
    queryFn: () => api.shipments.commentMentions(),
    refetchInterval: 15000,
  });
  // Unread mentions and read ones of the last 7 days (the server says which is which).
  // …and in a quote's chat (a thread shared by the quote and its revisions).
  const { data: quoteMentionData } = useQuery({
    queryKey: ["sales-quote-comments", "mentions"],
    queryFn: () => api.quotes.quoteCommentMentions(),
    refetchInterval: 15000,
  });
  // Each kind as the bell lists it: where it was said (job no. or Sales Reference) and where a
  // click leads; undefined while its answer is not here. Both together, newest first.
  const shipmentMentions: BellMention[] | undefined = mentionData?.mentions.map((m) => ({
    ...m,
    key: `s:${m.id}`,
    ref: m.jobNumber,
    href: shipmentChatHref(m.shipmentId),
    place: "a shipment",
  }));
  const quoteMentions: BellMention[] | undefined = quoteMentionData?.mentions.map((m) => ({
    ...m,
    key: `q:${m.id}`,
    ref: m.quoteNumber,
    href: quoteChatHref(m.quoteNumber),
    place: "a quote",
  }));
  const allMentions: BellMention[] = [...(shipmentMentions ?? []), ...(quoteMentions ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  // ČNB rates still missing after the 16:00 pull — admins only; they clear themselves once
  // the rates arrive.
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  const { data: fxAlertData } = useFxAlerts(isAdmin);
  const invalidateFx = useInvalidateFx();
  const fxAlerts = isAdmin ? (fxAlertData?.alerts ?? []) : [];
  const { announcements, viewer, hasLoaded: noticesLoaded } = useNoticeboard();
  // The warehouse answered a quote inquiry this user sent; it leaves the bell once opened.
  const { answers: warehouseAnswers, hasLoaded: answersLoaded, seen: answerSeen } = useWarehouseInquiryAnswers();
  const [open, setOpen] = useState(false);
  // "Unread" is what still needs attention; "All" keeps the recent notices in reach after
  // they have been opened. Mentions exist here only while unread.
  const [view, setView] = useState<"unread" | "all">("unread");
  const [query, setQuery] = useState("");
  const now = Date.now();
  const notices = announcements.filter((a) => a.unread);
  const unreadMentions = allMentions.filter((m) => m.unread);
  const unreadAnswers = warehouseAnswers.filter((a) => !a.inquiry.answerSeenAt);
  // "Last 7 days": everything unread, and what was read in the last 7 days (a mention: written in them).
  const viewNotices = view === "unread" ? notices : announcements.filter((a) => a.unread || keptSince(a.readAt, now));
  const viewMentions = view === "unread" ? unreadMentions : allMentions;
  const viewAnswers = view === "unread" ? unreadAnswers : warehouseAnswers;
  const listed = viewNotices.filter((a) => matchesAll(query, a.title, a.body, a.authorName, a.target));
  const mentions = viewMentions.filter((m) => matchesAll(query, m.authorName, m.message, m.ref));
  const answersShown = viewAnswers.filter((a) => matchesAll(query, answerTitle(a), answerText(a), a.quoteNumber, a.inquiry.decidedByName));
  const fxShown = fxAlerts.filter((a) => matchesAll(query, "ČNB exchange rates missing", a.reason, a.fixingDate));

  // Announce only what arrives while the app is open, not the backlog found on load. Each kind
  // keeps its own memory of what it has seen: the two lists arrive at their own times, and the
  // first answer of either must only be remembered - not announced as news because the other
  // list got there first.
  const seenShipmentMentions = useRef<Set<string> | null>(null);
  const seenQuoteMentions = useRef<Set<string> | null>(null);
  const announceFresh = (list: BellMention[] | undefined, seen: { current: Set<string> | null }) => {
    if (!list) return;
    // Only unread ones are new: a read mention back in the list is not news.
    const fresh = seen.current ? list.filter((m) => m.unread && !seen.current!.has(m.key)) : [];
    seen.current = new Set(list.map((m) => m.key));
    for (const m of fresh) {
      toast.notify({
        title: `${m.authorName || "A colleague"} mentioned you in ${m.ref || m.place}`,
        description: m.message,
      });
    }
  };
  // The lists change only with their answers; the mapped arrays are rebuilt every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => announceFresh(shipmentMentions, seenShipmentMentions), [mentionData, toast]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => announceFresh(quoteMentions, seenQuoteMentions), [quoteMentionData, toast]);

  // Announce only answers that arrive while the app is open, not the ones waiting on load.
  const seenAnswers = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!answersLoaded) return;
    const before = seenAnswers.current;
    const fresh = before ? warehouseAnswers.filter((a) => !a.inquiry.answerSeenAt && !before.has(a.inquiry.id)) : [];
    seenAnswers.current = new Set(warehouseAnswers.map((a) => a.inquiry.id));
    for (const a of fresh) toast.notify({ title: answerTitle(a), description: answerText(a), type: a.inquiry.status === "approved" ? "info" : "warning" });
  }, [warehouseAnswers, answersLoaded, toast]);

  const seenFxAlerts = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!fxAlertData) return;
    const before = seenFxAlerts.current;
    const fresh = before ? fxAlertData.alerts.filter((a) => !before.has(a.id)) : [];
    seenFxAlerts.current = new Set(fxAlertData.alerts.map((a) => a.id));
    for (const a of fresh) {
      toast.notify({ title: `ČNB exchange rates missing for ${formatDate(a.fixingDate)}`, description: a.reason, type: "error" });
    }
    // The missing rates arrived: everything priced from rates (previews, queue) is stale.
    if (before && before.size > 0 && fxAlertData.alerts.length === 0) invalidateFx();
  }, [fxAlertData, toast, invalidateFx]);

  // The notices this tab has accounted for; null until the list first arrives. Only ones not
  // seen before are announced — by id, so a notice whose timestamp is older than one already
  // received still counts. A list that failed to load at first does not replay its history as
  // "new", nor does a board the reader has just been added to: a change of their department,
  // branch or country starts from a new baseline.
  const seenNotices = useRef<Set<string> | null>(null);
  const audience = viewer ? `${viewer.departmentId}|${viewer.branchId}|${viewer.country}` : "";
  const lastAudience = useRef<string | null>(null);
  useEffect(() => {
    if (!noticesLoaded) return;
    const seen = seenNotices.current;
    const baseline = seen === null || lastAudience.current !== audience;
    lastAudience.current = audience;
    const fresh = baseline ? [] : announcements.filter((a) => a.unread && !seen.has(a.id));
    seenNotices.current = new Set([...(baseline ? [] : seen), ...announcements.map((a) => a.id)]);
    for (const a of fresh) {
      toast.notify({
        title: `New notice: ${a.title}`,
        description: `${a.authorName} · ${a.target}`,
        type: NOTICE_TOAST_TYPE[a.severity] ?? "info",
      });
    }
  }, [announcements, audience, noticesLoaded, toast]);

  // The panel is not an antd menu, so it does not close itself when a row is chosen.
  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  // The badge counts what is unread, whatever the view or the search.
  const total = unreadMentions.length + notices.length + fxAlerts.length + unreadAnswers.length;
  const openAnswer = (a: WarehouseInquiryItem) => {
    if (!a.inquiry.answerSeenAt) answerSeen.mutate({ quoteNumber: a.quoteNumber, inquiryId: a.inquiry.id });
    go(quoteChatHref(a.quoteNumber));
  };
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
              {v === "unread" ? `Unread${total ? ` (${total})` : ""}` : `Last ${READ_KEEP_DAYS} days`}
            </button>
          ))}
        </span>
      </div>
      <div className="sticky top-[41px] z-10 px-3 py-2 border-b border-slate-200 bg-white">
        <Input
          size="small"
          allowClear
          prefix={<SearchOutlined className="text-slate-400" />}
          placeholder={view === "unread" ? "Search unread" : `Search the last ${READ_KEEP_DAYS} days`}
          aria-label="Search notifications"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {fxShown.length > 0 && <div className={headingClass}>Exchange rates</div>}
      {fxShown.map((a) => (
        <button key={a.id} type="button" onClick={() => go("/exchange")} className={rowClass}>
          <span className="flex items-center gap-2">
            <span role="img" aria-label="Unresolved" className="shrink-0 w-2 h-2 rounded-full bg-red-500" />
            <span className="min-w-0 flex-1 text-[13px] font-semibold text-slate-800 truncate">
              ČNB rates missing for {formatDate(a.fixingDate)}
            </span>
            <NoticeSeverityTag severity="critical" />
          </span>
          <span className="text-[12px] line-clamp-2 text-slate-600">{a.reason}</span>
          <span className="block text-[11px] text-slate-400 mt-0.5">System · {formatTime(a.raisedAt)}</span>
        </button>
      ))}
      {answersShown.length > 0 && <div className={headingClass}>Warehouse answers</div>}
      {answersShown.map((a) => (
        <button key={a.inquiry.id} type="button" onClick={() => openAnswer(a)} className={rowClass}>
          <span className="flex items-center gap-2">
            {!a.inquiry.answerSeenAt && (
              <span role="img" aria-label="Unread" className={`shrink-0 w-2 h-2 rounded-full ${a.inquiry.status === "approved" ? "bg-emerald-500" : "bg-red-500"}`} />
            )}
            <span className={`min-w-0 flex-1 text-[13px] truncate ${a.inquiry.answerSeenAt ? "font-medium text-slate-500" : "font-semibold text-slate-800"}`}>{answerTitle(a)}</span>
            <span className="shrink-0 text-[11px] font-mono text-slate-500">{a.quoteNumber}</span>
          </span>
          <span className="text-[12px] text-slate-600 line-clamp-2">{answerText(a)}</span>
          <span className="block text-[11px] text-slate-400 mt-0.5">
            {a.inquiry.decidedByName || "Warehouse"} · {a.inquiry.decidedAt ? formatTime(a.inquiry.decidedAt) : ""}
          </span>
        </button>
      ))}
      {listed.length + mentions.length + fxShown.length + answersShown.length === 0 && (
        <p className="px-4 py-6 text-center text-xs text-slate-400">
          {query.trim() ? `Nothing matches “${query.trim()}”.` : view === "unread" ? "Nothing new." : `Nothing in the last ${READ_KEEP_DAYS} days.`}
        </p>
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
            {a.authorName} · {a.target} · {formatTime(a.createdAt)}
          </span>
        </button>
      ))}
      {mentions.length > 0 && <div className={headingClass}>Mentions</div>}
      {mentions.map((m) => (
        <button key={m.key} type="button" onClick={() => go(m.href)} className={rowClass}>
          <span className="flex items-center justify-between gap-2">
            {m.unread && <span role="img" aria-label="Unread" className="shrink-0 w-2 h-2 rounded-full bg-red-500" />}
            <span className={`min-w-0 flex-1 text-[13px] truncate ${m.unread ? "font-semibold text-slate-800" : "font-medium text-slate-500"}`}>{m.authorName || "Unknown"}</span>
            <span className="shrink-0 text-[11px] font-mono text-slate-500">{m.ref}</span>
          </span>
          <span className={`text-[12px] line-clamp-2 ${m.unread ? "text-slate-600" : "text-slate-400"}`}>{m.message}</span>
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
        <Badge count={total} size="small" color="red">
          <BellOutlined className="text-[18px]" />
        </Badge>
      </button>
    </Dropdown>
  );
}

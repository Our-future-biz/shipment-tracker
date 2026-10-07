"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Input, Tooltip } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";
import { SendOutlined, DeleteOutlined, PaperClipOutlined, DownloadOutlined, CloseOutlined } from "@ant-design/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthContext";
import { useUsers } from "@/hooks/useUsers";
import { useToast } from "@/lib/toast";
import { attachmentContentUrl, fileToBase64 } from "@/lib/files";
import type { interfaces } from "@/lib/api/client";

// The shipment's internal conversation, laid out like a messaging app: colleagues on the
// left with avatar, name and time, own messages on the right in blue with a read tick,
// files as cards under the message they were sent with, and a separator for each day.
// Typing @ offers colleagues to tag; a tagged colleague gets a notification.

interface ChatPanelProps {
  shipmentId: string;
}

type Comment = interfaces.CommentItem;

const initials = (name: string) =>
  name
    .split(/[\s.@_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "?";

// A stable colour per author, so the same colleague always reads the same way.
const AUTHOR_TONES = [
  "bg-indigo-100 text-indigo-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-sky-100 text-sky-700",
  "bg-rose-100 text-rose-700",
  "bg-violet-100 text-violet-700",
];
const toneFor = (id: string) => AUTHOR_TONES[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % AUTHOR_TONES.length]!;

const dayKey = (iso: string) => new Date(iso).toDateString();
const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
};
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

const sizeLabel = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} kB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

// Coloured file-type badge, by extension.
const FILE_KINDS: { exts: string[]; label: string; tone: string }[] = [
  { exts: ["pdf"], label: "PDF", tone: "bg-red-500" },
  { exts: ["xls", "xlsx", "csv"], label: "XLS", tone: "bg-emerald-600" },
  { exts: ["doc", "docx"], label: "DOC", tone: "bg-blue-600" },
  { exts: ["jpg", "jpeg", "png", "gif", "webp", "heic"], label: "IMG", tone: "bg-violet-500" },
];
const FileBadge = ({ fileName }: { fileName: string }) => {
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  const kind = FILE_KINDS.find((k) => k.exts.includes(ext)) ?? { label: "FILE", tone: "bg-slate-400" };
  return (
    <span className={`shrink-0 flex items-center justify-center w-8 h-9 rounded-md text-[9px] font-bold text-white ${kind.tone}`}>
      {kind.label}
    </span>
  );
};

interface Colleague {
  id: string;
  name: string;
}

// The "@query" being typed right before the caret, if any. Names can contain a space,
// so the query runs to the caret; it stops being a mention once nobody matches.
const mentionQueryAt = (text: string, caret: number) => {
  const m = /(?:^|\s)@([^@\n]{0,40})$/.exec(text.slice(0, caret));
  return m ? { query: m[1]!, start: caret - m[1]!.length - 1 } : null;
};

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// One tick = sent, two blue ticks = a colleague has opened the chat since.
const ReadTicks = ({ read }: { read: boolean }) => (
  <Tooltip title={read ? "Read" : "Sent"}>
    <svg width="16" height="10" viewBox="0 0 16 10" fill="none" className={read ? "text-blue-600" : "text-slate-400"} aria-label={read ? "Read" : "Sent"}>
      <path d="M1 5.5 4 8.5 10 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {read && <path d="M7.5 8.5 8 9 15 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  </Tooltip>
);

export const ChatPanel = ({ shipmentId }: ChatPanelProps) => {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  // Colleagues picked from the @ list for the message being written.
  const [tagged, setTagged] = useState<Colleague[]>([]);
  const [caret, setCaret] = useState(0);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionDismissed, setMentionDismissed] = useState(false);
  const { users } = useUsers();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<TextAreaRef>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["comments", shipmentId],
    queryFn: () => api.shipments.commentList(shipmentId),
    refetchInterval: 10000,
  });

  const sendMessage = useMutation({
    // Files are stored as ordinary shipment documents first, then tied to the message.
    // authorId is derived server-side from the authenticated user.
    mutationFn: async ({ text, attach }: { text: string; attach: File[] }) => {
      const attachmentIds: string[] = [];
      for (const file of attach) {
        const { attachment } = await api.shipments.attachmentCreate(shipmentId, {
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          contentBase64: await fileToBase64(file),
        });
        attachmentIds.push(attachment.id);
      }
      // A colleague counts as tagged only while their @name is still in the text.
      const mentionedUserIds = tagged.filter((t) => text.includes(`@${t.name}`)).map((t) => t.id);
      return api.shipments.commentCreate(shipmentId, { message: text, attachmentIds, mentionedUserIds });
    },
    onSuccess: (_res, { attach }) => {
      queryClient.invalidateQueries({ queryKey: ["comments", shipmentId] });
      queryClient.invalidateQueries({ queryKey: ["shipment-comments", "unread"] });
      if (attach.length > 0) {
        queryClient.invalidateQueries({ queryKey: ["shipment-attachments", shipmentId] });
        queryClient.invalidateQueries({ queryKey: ["attachments", shipmentId] });
      }
      setMessage("");
      setFiles([]);
      setTagged([]);
    },
    onError: () => toast.error("Failed to send message"),
  });

  const deleteComment = useMutation({
    mutationFn: (commentId: string) => api.shipments.commentDelete(shipmentId, commentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", shipmentId] });
      // The message's files go with it, so the document lists change too.
      queryClient.invalidateQueries({ queryKey: ["shipment-attachments", shipmentId] });
      queryClient.invalidateQueries({ queryKey: ["attachments", shipmentId] });
    },
    onError: () => toast.error("Failed to delete message"),
  });

  const comments = useMemo(() => data?.comments ?? [], [data]);

  // Opening the chat (and anything arriving while it is open) counts as read.
  useEffect(() => {
    api.shipments
      .commentMarkRead(shipmentId)
      // Clears both the unread badge and any mention notifications for this shipment.
      .then(() => queryClient.invalidateQueries({ queryKey: ["shipment-comments"] }))
      .catch(() => {
        // Not fatal — the badge just stays until the next time the chat is opened.
      });
  }, [shipmentId, comments.length, queryClient]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [comments.length]);

  const colleagues = useMemo<Colleague[]>(
    () => users.filter((u) => u.id !== user?.id).map((u) => ({ id: u.id, name: u.displayName || u.email })),
    [users, user?.id],
  );

  // The @ list: open while an "@query" sits before the caret and someone matches it.
  const mention = mentionDismissed ? null : mentionQueryAt(message, caret);
  const mentionQuery = mention?.query.toLowerCase() ?? "";
  // A finished name followed by a space is done — don't keep offering longer namesakes.
  const mentionDone = /\s$/.test(mentionQuery) && colleagues.some((c) => c.name.toLowerCase() === mentionQuery.trimEnd());
  const mentionMatches = mention && !mentionDone ? colleagues.filter((c) => c.name.toLowerCase().includes(mentionQuery)).slice(0, 6) : [];
  const mentionOpen = mentionMatches.length > 0;

  const pickMention = (c: Colleague) => {
    if (!mention) return;
    const before = `${message.slice(0, mention.start)}@${c.name} `;
    setMessage(before + message.slice(caret));
    setTagged((t) => (t.some((x) => x.id === c.id) ? t : [...t, c]));
    setCaret(before.length);
    setMentionIndex(0);
    // Put the caret right after the inserted name once the new text has rendered.
    requestAnimationFrame(() => {
      const el = inputRef.current?.resizableTextArea?.textArea;
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    });
  };

  // @Name of any colleague (or yourself) is shown highlighted in a message.
  const mentionPattern = useMemo(() => {
    const names = users.map((u) => u.displayName || u.email).filter(Boolean).sort((a, b) => b.length - a.length);
    return names.length ? new RegExp(`(@(?:${names.map(escapeRegExp).join("|")}))`, "g") : null;
  }, [users]);
  const withMentions = (text: string, isMe: boolean) =>
    mentionPattern
      ? text.split(mentionPattern).map((part, i) =>
          i % 2 === 1 ? (
            <span key={i} className={`font-semibold ${isMe ? "text-white underline decoration-white/50" : "text-blue-700"}`}>
              {part}
            </span>
          ) : (
            part
          ),
        )
      : text;

  const canSend = (!!message.trim() || files.length > 0) && !sendMessage.isPending;

  const handleSend = () => {
    if (!canSend) return;
    sendMessage.mutate({ text: message.trim(), attach: files });
  };

  const fileCard = (a: Comment["attachments"][number]) => (
    <div key={a.id} className="flex items-center gap-3 w-64 max-w-full px-3 py-2 rounded-lg border border-slate-200 bg-white">
      <FileBadge fileName={a.fileName} />
      <a
        href={attachmentContentUrl(shipmentId, a.id)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 min-w-0 !text-slate-800 hover:!text-blue-600"
      >
        <span className="block text-[12.5px] font-semibold truncate">{a.fileName}</span>
        <span className="block text-[11px] font-normal text-slate-500">{sizeLabel(a.fileSize)}</span>
      </a>
      <a
        href={attachmentContentUrl(shipmentId, a.id, true)}
        aria-label={`Download ${a.fileName}`}
        className="shrink-0 !text-slate-500 hover:!text-blue-600"
      >
        <DownloadOutlined className="text-[15px]" />
      </a>
    </div>
  );

  const row = (c: Comment, isMe: boolean, firstOfGroup: boolean) => {
    const text = c.message && (
      <div
        className={`px-3.5 py-2 rounded-xl text-[13px] leading-snug whitespace-pre-wrap break-words ${
          isMe ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-800"
        }`}
      >
        {withMentions(c.message, isMe)}
      </div>
    );

    if (isMe) {
      return (
        <div className="group flex flex-col items-end gap-1">
          <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <button
              type="button"
              aria-label="Delete message"
              onClick={() => deleteComment.mutate(c.id)}
              className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-slate-300 hover:text-red-500 bg-transparent border-none cursor-pointer p-0"
            >
              <DeleteOutlined className="text-[11px]" />
            </button>
            {timeLabel(c.createdAt)}
            <ReadTicks read={c.readByOthers} />
          </span>
          <div className="max-w-[80%] min-w-0 flex flex-col items-end gap-1.5">
            {text}
            {c.attachments.map(fileCard)}
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-start gap-3">
        <span className="w-9 shrink-0">
          {firstOfGroup && (
            <span className={`flex items-center justify-center w-9 h-9 rounded-full text-[13px] font-bold ${toneFor(c.authorId)}`}>
              {initials(c.authorName)}
            </span>
          )}
        </span>
        <div className="max-w-[80%] min-w-0 flex flex-col items-start gap-1.5">
          {firstOfGroup && (
            <span className="flex items-baseline gap-2">
              <span className="text-[13px] font-bold text-slate-700">{c.authorName || "Unknown"}</span>
              <span className="text-[11px] text-slate-500">{timeLabel(c.createdAt)}</span>
            </span>
          )}
          {text}
          {c.attachments.map(fileCard)}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-1.5">
        {isLoading && <p className="text-center text-slate-400 text-xs py-4">Loading…</p>}
        {!isLoading && comments.length === 0 && (
          <p className="text-center text-slate-400 text-xs py-6">No messages yet — write the first update for this shipment.</p>
        )}

        {comments.map((c, i) => {
          const prev = comments[i - 1];
          const isMe = c.authorId === user?.id;
          const newDay = !prev || dayKey(prev.createdAt) !== dayKey(c.createdAt);
          // A run is the same author on the same day, within a quarter of an hour.
          const firstOfGroup =
            newDay || prev!.authorId !== c.authorId || Date.parse(c.createdAt) - Date.parse(prev!.createdAt) > 15 * 60 * 1000;
          return (
            <div key={c.id} className="flex flex-col gap-1.5">
              {newDay && (
                <div className="flex items-center gap-3 my-2">
                  <span className="flex-1 h-px bg-slate-200" />
                  <span className="px-3 py-0.5 rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">{dayLabel(c.createdAt)}</span>
                  <span className="flex-1 h-px bg-slate-200" />
                </div>
              )}
              <div className={firstOfGroup ? "mt-3" : ""}>{row(c, isMe, firstOfGroup)}</div>
            </div>
          );
        })}
      </div>

      <div className="relative shrink-0 border-t border-slate-200 bg-white">
        {mentionOpen && (
          <ul role="listbox" aria-label="Mention a colleague" className="absolute bottom-full left-3 right-3 mb-1 p-1 m-0 list-none rounded-lg border border-slate-200 bg-white shadow-lg z-10">
            {mentionMatches.map((c, i) => (
              <li
                key={c.id}
                role="option"
                aria-selected={i === mentionIndex}
                // mousedown, not click, so the textarea keeps focus
                onMouseDown={(e) => {
                  e.preventDefault();
                  pickMention(c);
                }}
                onMouseEnter={() => setMentionIndex(i)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-[13px] text-slate-800 ${i === mentionIndex ? "bg-slate-100" : ""}`}
              >
                <span className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold ${toneFor(c.id)}`}>{initials(c.name)}</span>
                <span className="truncate">{c.name}</span>
              </li>
            ))}
          </ul>
        )}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
            {files.map((f, i) => (
              <span key={`${f.name}-${i}`} className="flex items-center gap-1.5 max-w-full pl-2 pr-1 py-1 rounded-md bg-slate-100 text-[12px] text-slate-700">
                <span className="truncate">{f.name}</span>
                <span className="shrink-0 text-slate-400">{sizeLabel(f.size)}</span>
                <button
                  type="button"
                  aria-label={`Remove ${f.name}`}
                  onClick={() => setFiles(files.filter((_, j) => j !== i))}
                  className="shrink-0 flex items-center text-slate-400 hover:text-red-500 bg-transparent border-none cursor-pointer p-0.5"
                >
                  <CloseOutlined className="text-[10px]" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2 p-3">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              setFiles([...files, ...Array.from(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            aria-label="Attach files"
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 flex items-center justify-center w-9 h-9 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-100 bg-transparent border-none cursor-pointer transition-colors"
          >
            <PaperClipOutlined className="text-[18px]" />
          </button>
          <Input.TextArea
            value={message}
            ref={inputRef}
            placeholder="Write a message…  (@ to mention a colleague)"
            autoSize={{ minRows: 1, maxRows: 5 }}
            className="!text-[13px] !rounded-lg"
            onChange={(e) => {
              setMessage(e.target.value);
              setCaret(e.target.selectionStart ?? e.target.value.length);
              setMentionDismissed(false);
              setMentionIndex(0);
            }}
            onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
            onKeyDown={(e) => {
              if (mentionOpen) {
                const n = mentionMatches.length;
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  setMentionIndex((i) => (i + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  pickMention(mentionMatches[Math.min(mentionIndex, n - 1)]!);
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setMentionDismissed(true);
                  return;
                }
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <button
            type="button"
            aria-label="Send message"
            onClick={handleSend}
            disabled={!canSend}
            className="shrink-0 flex items-center justify-center w-11 h-9 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors border-none cursor-pointer"
          >
            <SendOutlined />
          </button>
        </div>
      </div>
    </div>
  );
};

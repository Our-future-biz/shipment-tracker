"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Input, Tooltip } from "antd";
import { SendOutlined, DeleteOutlined } from "@ant-design/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthContext";
import type { interfaces } from "@/lib/api/client";

// The shipment's internal conversation, laid out like a messaging app: own messages on the
// right, colleagues' on the left with their name and initials, messages of the same person
// grouped together, and a separator for each day.

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

export const ChatPanel = ({ shipmentId }: ChatPanelProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["comments", shipmentId],
    queryFn: () => api.shipments.commentList(shipmentId),
    refetchInterval: 10000,
  });

  const createComment = useMutation({
    // authorId is derived server-side from the authenticated user.
    mutationFn: (msg: string) => api.shipments.commentCreate(shipmentId, { message: msg }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", shipmentId] });
      queryClient.invalidateQueries({ queryKey: ["shipment-comments", "unread"] });
      setMessage("");
    },
  });

  const deleteComment = useMutation({
    mutationFn: (commentId: string) => api.shipments.commentDelete(shipmentId, commentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["comments", shipmentId] }),
  });

  const comments = useMemo(() => data?.comments ?? [], [data]);

  // Opening the chat (and anything arriving while it is open) counts as read.
  useEffect(() => {
    api.shipments
      .commentMarkRead(shipmentId)
      .then(() => queryClient.invalidateQueries({ queryKey: ["shipment-comments", "unread"] }))
      .catch(() => {
        // Not fatal — the badge just stays until the next time the chat is opened.
      });
  }, [shipmentId, comments.length, queryClient]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [comments.length]);

  const handleSend = () => {
    const text = message.trim();
    if (!text || createComment.isPending) return;
    createComment.mutate(text);
  };

  const bubble = (c: Comment, isMe: boolean, firstOfGroup: boolean) => (
    <div className={`group flex items-end gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
      {/* Every message shows who wrote it. */}
      <span className="w-7 shrink-0">
        <Tooltip title={c.authorName || "Unknown"}>
          <span className={`flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-bold ${toneFor(c.authorId)}`}>
            {initials(c.authorName)}
          </span>
        </Tooltip>
      </span>

      <div className={`max-w-[78%] min-w-0 ${isMe ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
        <span className="text-[11px] font-semibold text-slate-500 px-1">{isMe ? `${c.authorName || "You"} (you)` : c.authorName || "Unknown"}</span>
        <div
          className={`relative px-3 py-2 text-[13px] leading-snug whitespace-pre-wrap break-words shadow-sm ${
            isMe
              ? `bg-indigo-500 text-white rounded-2xl ${firstOfGroup ? "rounded-tr-md" : ""}`
              : `bg-white text-slate-800 border border-slate-200 rounded-2xl ${firstOfGroup ? "rounded-tl-md" : ""}`
          }`}
        >
          {c.message}
          <span className={`block text-[10px] mt-1 text-right ${isMe ? "text-indigo-100" : "text-slate-400"}`}>{timeLabel(c.createdAt)}</span>
        </div>
      </div>

      {isMe && (
        <button
          type="button"
          aria-label="Delete message"
          onClick={() => deleteComment.mutate(c.id)}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 hover:text-red-500 bg-transparent border-none cursor-pointer p-1"
        >
          <DeleteOutlined className="text-[11px]" />
        </button>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-1.5">
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
                <div className="self-center my-2 px-2.5 py-0.5 rounded-full bg-white border border-slate-200 text-[11px] font-semibold text-slate-500">
                  {dayLabel(c.createdAt)}
                </div>
              )}
              <div className={firstOfGroup ? "mt-1.5" : ""}>{bubble(c, isMe, firstOfGroup)}</div>
            </div>
          );
        })}
      </div>

      <div className="shrink-0 flex items-end gap-2 p-3 border-t border-slate-200 bg-white">
        <Input.TextArea
          value={message}
          placeholder="Write a message…   (Enter sends, Shift+Enter new line)"
          autoSize={{ minRows: 1, maxRows: 5 }}
          className="!text-[13px] !rounded-2xl"
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
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
          disabled={!message.trim() || createComment.isPending}
          className="shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-indigo-500 text-white hover:bg-indigo-600 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors border-none cursor-pointer"
        >
          <SendOutlined />
        </button>
      </div>
    </div>
  );
};

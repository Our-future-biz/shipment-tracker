"use client";

import { useMemo } from "react";
import { Badge, Button, Drawer, Tooltip } from "antd";
import { MessageOutlined } from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { fileToBase64 } from "@/lib/files";
import { ChatThread, type ChatSource } from "@/app/shipments/_components/ChatPanel";
import { HINT } from "@/styles/ui";
import { plainQuoteRef } from "../_lib/salesQuote";

// A quote's chat: the same panel as a shipment's, filed under the original Sales Reference. A
// revision (QCZ…001-R1) opens the thread of the quote it revises (QCZ…001), so every revision
// shows the whole conversation; each message says which reference it was written on.

/** The thread of a Sales Reference: the original reference its revisions share (server: revisionRoot). */
// The thread of a quote: its revision root without the letters of its Freight Mode, as the server keys it
// (quoteThreadOf in apps/api/lib/salesReference.ts), so a quote keeps its chat when its letters change.
export const quoteThreadOf = (quoteNumber: string) => plainQuoteRef(quoteNumber.trim()).replace(/-R[0-9]+$/, "");

export const quoteChatKeys = {
  all: ["sales-quote-comments"] as const,
  thread: (threadRef: string) => ["sales-quote-comments", "thread", threadRef] as const,
  unread: ["sales-quote-comments", "unread"] as const,
  mentions: ["sales-quote-comments", "mentions"] as const,
};

/** Unread messages per thread for the signed-in user (the chat badges). */
export function useQuoteChatUnread() {
  const { data } = useQuery({
    queryKey: quoteChatKeys.unread,
    queryFn: async () => (await api.quotes.quoteCommentUnread()).unread,
    refetchInterval: 15_000,
  });
  return useMemo(() => new Map((data ?? []).map((u) => [u.threadRef, u.unread])), [data]);
}

export function QuoteChatPanel({ quoteNumber }: { quoteNumber: string }) {
  const queryClient = useQueryClient();
  const source = useMemo<ChatSource>(
    () => ({
      key: quoteChatKeys.thread(quoteThreadOf(quoteNumber)),
      list: async () => (await api.quotes.quoteCommentList(quoteNumber)).comments,
      // Files are stored for the thread first, then tied to the message they are sent with.
      send: async ({ message, files, mentionedUserIds }) => {
        const fileIds: string[] = [];
        for (const file of files) {
          const { id } = await api.quotes.quoteChatFileUpload(quoteNumber, {
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
            contentBase64: await fileToBase64(file),
          });
          fileIds.push(id);
        }
        return api.quotes.quoteCommentCreate(quoteNumber, { message, fileIds, mentionedUserIds });
      },
      remove: (id) => api.quotes.quoteCommentDelete(quoteNumber, id),
      strike: (id) => api.quotes.quoteCommentStrike(quoteNumber, id),
      markRead: () => api.quotes.quoteCommentMarkRead(quoteNumber),
      // Reading clears the thread's badge and its mentions under the bell; a message sent or
      // deleted changes the badges. The thread's own list is the panel's and is read again by it -
      // never from here, or every read would fetch the list it was just triggered by once more.
      refresh: (what) => {
        queryClient.invalidateQueries({ queryKey: quoteChatKeys.unread });
        if (what === "read") queryClient.invalidateQueries({ queryKey: quoteChatKeys.mentions });
      },
      emptyText: "No messages yet — write the first note about this quote. Its revisions share this chat.",
      showQuoteNumber: true,
    }),
    [quoteNumber, queryClient],
  );
  return <ChatThread source={source} />;
}

/** The chat of a quote in a side drawer, as on the Shipments list. */
export function QuoteChatDrawer({ quoteNumber, onClose }: { quoteNumber: string | null; onClose: () => void }) {
  const thread = quoteNumber ? quoteThreadOf(quoteNumber) : "";
  return (
    <Drawer
      open={!!quoteNumber}
      onClose={onClose}
      width={460}
      destroyOnHidden
      classNames={{ body: "!p-0" }}
      title={
        quoteNumber ? (
          <span>
            Chat — {quoteNumber}
            {thread !== quoteNumber && <span className={`block ${HINT} font-normal`}>Shared with {thread} and all its revisions</span>}
          </span>
        ) : (
          "Chat"
        )
      }
    >
      {quoteNumber && <QuoteChatPanel quoteNumber={quoteNumber} />}
    </Drawer>
  );
}

/** The chat icon of a quote, red with a count while something is unread. */
export function QuoteChatButton({ quoteNumber, unread, onOpen, label }: { quoteNumber: string; unread: number; onOpen: () => void; label?: string }) {
  const title = unread ? `Chat — ${unread} unread` : "Chat";
  return (
    <Tooltip title={label ? undefined : title}>
      <Badge count={unread} size="small" offset={label ? [-4, 2] : [0, 2]}>
        <Button
          size={label ? "middle" : "small"}
          type={label ? "default" : "text"}
          icon={<MessageOutlined />}
          aria-label={`${title} of ${quoteNumber}`}
          className={unread ? "!text-red-600" : undefined}
          onClick={onOpen}
        >
          {label}
        </Button>
      </Badge>
    </Tooltip>
  );
}

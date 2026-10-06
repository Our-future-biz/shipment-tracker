"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Input, Button } from "antd";
import { SendOutlined, DeleteOutlined } from "@ant-design/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthContext";

interface ChatPanelProps {
  shipmentId: string;
}

export const ChatPanel = ({ shipmentId }: ChatPanelProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
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
    if (!message.trim()) return;
    createComment.mutate(message.trim());
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {comments.length === 0 && (
          <p className="text-center text-gray-400 text-xs py-4">No messages yet</p>
        )}
        {comments.map((comment) => {
          const isMe = comment.authorId === user?.id;
          return (
            <div key={comment.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
              <div className={`max-w-[85%] px-3 py-1.5 rounded-lg text-xs ${
                isMe
                  ? "bg-teal-500/10 text-teal-800"
                  : "bg-gray-100 text-gray-700"
              }`}>
                {comment.message}
              </div>
              <div className="flex items-center gap-2 mt-0.5 px-1">
                {!isMe && comment.authorName && <span className="text-[10px] font-semibold text-gray-500">{comment.authorName}</span>}
                <span className="text-[10px] text-gray-400">
                  {new Date(comment.createdAt).toLocaleString(undefined, { hour: "2-digit", minute: "2-digit" })}
                </span>
                {isMe && (
                  <button
                    onClick={() => deleteComment.mutate(comment.id)}
                    className="text-gray-300 hover:text-red-400"
                  >
                    <DeleteOutlined style={{ fontSize: 9 }} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div style={{ flexShrink: 0, display: "flex", gap: 8, padding: 12, borderTop: "1px solid #e5e7eb" }}>
        <Input
          size="small"
          placeholder="Type a message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onPressEnter={handleSend}
        />
        <Button
          size="small"
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSend}
          disabled={!message.trim()}
        />
      </div>
    </div>
  );
};

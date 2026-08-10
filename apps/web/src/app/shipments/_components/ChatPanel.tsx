"use client";

import { useState, useRef, useEffect } from "react";
import { Input, Button } from "antd";
import { SendOutlined, DeleteOutlined, CloseOutlined } from "@ant-design/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthContext";

interface ChatPanelProps {
  shipmentId: string;
  jobNumber: string;
  onClose: () => void;
}

export const ChatPanel = ({ shipmentId, jobNumber, onClose }: ChatPanelProps) => {
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
      setMessage("");
    },
  });

  const deleteComment = useMutation({
    mutationFn: (commentId: string) => api.shipments.commentDelete(shipmentId, commentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["comments", shipmentId] }),
  });

  const comments = data?.comments ?? [];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [comments.length]);

  const handleSend = () => {
    if (!message.trim()) return;
    createComment.mutate(message.trim());
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", borderLeft: "1px solid #e5e7eb", background: "#fff", width: 320 }}>
      {/* Header */}
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px", borderBottom: "1px solid #e5e7eb" }}>
        <div>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Chat</span>
          <span className="text-[10px] text-gray-400 ml-2 font-mono">{jobNumber}</span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <CloseOutlined style={{ fontSize: 12 }} />
        </button>
      </div>

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

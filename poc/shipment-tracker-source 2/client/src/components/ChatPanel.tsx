import { useState, useCallback, useEffect, useRef } from "react";
import { apiRequest } from "@/lib/queryClient";
import { X, Send, MessageSquare, Trash2 } from "lucide-react";

interface Comment {
  id: number;
  jobNumber: string;
  author: string;
  message: string;
  createdAt: string;
}

interface ChatPanelProps {
  jobNumber: string;
  shipperName?: string;
  consigneeName?: string;
  authorName?: string;
  onClose: () => void;
}

export function ChatPanel({ jobNumber, shipperName, consigneeName, authorName, onClose }: ChatPanelProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load comments
  useEffect(() => {
    if (!jobNumber) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const resp = await apiRequest("GET", `/api/comments/${encodeURIComponent(jobNumber)}`);
        const data = await resp.json();
        if (!cancelled) setComments(data);
      } catch (err) {
        console.error("Failed to load comments:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [jobNumber]);

  // Auto-scroll to bottom when comments change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments]);

  // Focus input on open
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [jobNumber]);

  const handleSend = useCallback(async () => {
    const msg = newMessage.trim();
    if (!msg || !jobNumber) return;

    setSending(true);
    try {
      const resp = await apiRequest("POST", "/api/comments", {
        jobNumber,
        author: authorName || "User",
        message: msg,
      });
      const comment = await resp.json();
      setComments((prev) => [...prev, comment]);
      setNewMessage("");
    } catch (err) {
      console.error("Failed to send comment:", err);
    } finally {
      setSending(false);
    }
  }, [newMessage, jobNumber]);

  const handleDelete = useCallback(async (id: number) => {
    try {
      await apiRequest("DELETE", `/api/comments/${id}`);
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error("Failed to delete comment:", err);
    }
  }, []);

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) + " " +
        d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return iso;
    }
  };

  return (
    <div
      className="flex flex-col h-full border-l border-border/50"
      style={{ width: "340px", background: "hsl(var(--surface-8))" }}
      data-testid="chat-panel"
    >
      {/* Header */}
      <div
        className="flex-none flex items-center justify-between px-4 py-3 border-b border-border/50"
        style={{ background: "hsl(var(--surface-9))" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare className="w-4 h-4 text-[var(--brand-teal)] flex-none" />
          <div className="min-w-0">
            <h3 className="text-xs font-semibold text-foreground truncate">Chat</h3>
            <p className="text-[10px] text-muted-foreground font-mono truncate">{jobNumber}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors flex-none"
          data-testid="chat-close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Shipment context */}
      {(shipperName || consigneeName) && (
        <div className="flex-none px-4 py-2 border-b border-border/30 text-[10px] text-muted-foreground">
          {shipperName && <span>Shipper: <span className="text-foreground">{shipperName}</span></span>}
          {shipperName && consigneeName && <span className="mx-1.5">→</span>}
          {consigneeName && <span>Consignee: <span className="text-foreground">{consigneeName}</span></span>}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3" style={{ background: "hsl(var(--surface-6))" }}>
        {loading ? (
          <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
            Loading...
          </div>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <MessageSquare className="w-8 h-8 opacity-20" />
            <p className="text-xs">No messages yet</p>
            <p className="text-[10px] text-muted-foreground/50">Start the conversation</p>
          </div>
        ) : (
          <div className="space-y-3">
            {comments.map((c) => (
              <div
                key={c.id}
                className="group rounded-lg px-3 py-2 transition-colors hover:bg-white/[0.02]"
                style={{ background: "hsl(var(--surface-10))" }}
                data-testid={`chat-msg-${c.id}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-medium text-[var(--brand-teal)]">{c.author}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] text-muted-foreground/50">{formatTime(c.createdAt)}</span>
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="opacity-0 group-hover:opacity-100 w-4 h-4 rounded flex items-center justify-center text-muted-foreground/40 hover:text-red-400 transition-all"
                      title="Delete"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap break-words">
                  {c.message}
                </p>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex-none px-3 py-3 border-t border-border/50" style={{ background: "hsl(var(--surface-9))" }}>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Type a message..."
            className="flex-1 px-3 py-2 text-xs rounded-md border border-border/40 bg-background/50 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-[var(--brand-teal)]"
            disabled={sending}
            data-testid="chat-input"
          />
          <button
            onClick={handleSend}
            disabled={!newMessage.trim() || sending}
            className="flex items-center justify-center w-8 h-8 rounded-md transition-all disabled:opacity-30"
            style={{ background: newMessage.trim() ? "var(--brand-teal)" : "hsl(var(--border-20))" }}
            data-testid="chat-send"
          >
            <Send className="w-3.5 h-3.5" style={{ color: newMessage.trim() ? "hsl(var(--surface-8))" : "hsl(var(--fg-50))" }} />
          </button>
        </div>
      </div>
    </div>
  );
}

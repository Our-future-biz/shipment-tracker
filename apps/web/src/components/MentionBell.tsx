"use client";

import { useEffect, useRef } from "react";
import { Badge, Dropdown } from "antd";
import { BellOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast";

// Chat messages that tag the signed-in user with @ and that they have not opened yet.
// A new one pops up as a notification; all of them stay under the bell until the
// shipment's chat is opened.
export function MentionBell() {
  const router = useRouter();
  const toast = useToast();
  const { data } = useQuery({
    queryKey: ["shipment-comments", "mentions"],
    queryFn: () => api.shipments.commentMentions(),
    refetchInterval: 15000,
  });
  const mentions = data?.mentions ?? [];

  // Announce only what arrives while the app is open, not the backlog found on load.
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!data) return;
    const fresh = seen.current ? data.mentions.filter((m) => !seen.current!.has(m.id)) : [];
    seen.current = new Set(data.mentions.map((m) => m.id));
    for (const m of fresh) {
      toast.notify({
        title: `${m.authorName || "A colleague"} mentioned you in ${m.jobNumber || "a shipment"}`,
        description: m.message,
      });
    }
  }, [data, toast]);

  const openChat = (shipmentId: string) => router.push(`/shipments?chat=${shipmentId}`);

  const panel = (
    <div className="w-80 max-h-96 overflow-y-auto rounded-lg bg-white shadow-lg border border-slate-200">
      <div className="px-4 py-2.5 border-b border-slate-200 text-[13px] font-semibold text-slate-700">Mentions</div>
      {mentions.length === 0 && <p className="px-4 py-6 text-center text-xs text-slate-400">Nobody has mentioned you.</p>}
      {mentions.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => openChat(m.shipmentId)}
          className="block w-full text-left px-4 py-2.5 border-none border-b border-slate-100 bg-white hover:bg-slate-50 cursor-pointer"
        >
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-semibold text-slate-800 truncate">{m.authorName || "Unknown"}</span>
            <span className="shrink-0 text-[11px] font-mono text-slate-500">{m.jobNumber}</span>
          </span>
          <span className="block text-[12px] text-slate-600 line-clamp-2">{m.message}</span>
          <span className="block text-[11px] text-slate-400 mt-0.5">
            {new Date(m.createdAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </span>
        </button>
      ))}
    </div>
  );

  return (
    <Dropdown trigger={["click"]} placement="bottomRight" popupRender={() => panel}>
      <button
        type="button"
        aria-label={mentions.length ? `Mentions — ${mentions.length} unread` : "Mentions"}
        className="flex items-center justify-center w-9 h-9 rounded-md bg-transparent border-none cursor-pointer text-slate-500 hover:bg-slate-50 hover:text-slate-700"
      >
        <Badge count={mentions.length} size="small" color="#ef4444">
          <BellOutlined className="text-[18px]" />
        </Badge>
      </button>
    </Dropdown>
  );
}

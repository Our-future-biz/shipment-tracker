"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Drawer, Modal } from "antd";
import { ArrowLeftOutlined, CloseOutlined, CloudSyncOutlined } from "@ant-design/icons";
import { formatDateTime } from "@/lib/date";
import { TERMS } from "@/app/warehouse/_lib/glossary";
import { useFloorQueue } from "../_lib/useFloorQueue";
import type { ItemStatus, QueueItem } from "../_lib/queue";
import { bigDefault, bigPrimary } from "./floorUi";

// Floor mode's frame on the phone. The app's sidebar and top bar are global (AppShell) and made
// for a desk, so floor mode hides them while it is open and shows a full-screen layer of its own
// (below antd dialogs and messages, which sit at 1000+): a 56 px header with Back, the connection and "Exit floor
// mode", and — while writes wait — a "Waiting to send (n)" bar that opens the queue.

const STATE_TEXT: Record<ItemStatus["state"], { text: string; tone: string }> = {
  waiting: { text: "Waiting to send", tone: "bg-amber-50 text-amber-800" },
  sending: { text: "Sending…", tone: "bg-indigo-50 text-indigo-700" },
  failed: { text: "Not sent", tone: "bg-red-50 text-red-700" },
  too_old: { text: "Too old to send", tone: "bg-red-50 text-red-700" },
  held_user: { text: "Another user's", tone: "bg-slate-100 text-slate-700" },
  blocked: { text: "Waiting for an earlier one", tone: "bg-slate-100 text-slate-700" },
};

function QueueRow({ item }: { item: QueueItem }) {
  const q = useFloorQueue();
  const st = q.statusOf(item);
  const s = STATE_TEXT[st.state];
  const canRetry = st.state === "failed";
  const canDiscard = st.state === "failed" || st.state === "too_old";
  return (
    <li className="border-b border-slate-100 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[14px] font-bold text-indigo-600">{item.ref}</span>
        <span className="text-[15px] font-semibold text-slate-800">{item.label}</span>
        <span className={`ml-auto rounded-md px-2 py-0.5 text-[12px] font-semibold ${s.tone}`}>{s.text}</span>
      </div>
      <div className="mt-0.5 text-[13px] text-slate-500">
        Made {formatDateTime(item.recordedAt)} · {item.userName}
        {item.attempts ? ` · ${item.attempts} ${item.attempts === 1 ? "try" : "tries"}` : ""}
      </div>
      {"why" in st && <div className="mt-1 text-[13px] text-slate-700">{st.why}</div>}
      {(canRetry || canDiscard) && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {canRetry ? (
            <button type="button" className={bigDefault} onClick={() => q.retry(item.id)}>
              Try again
            </button>
          ) : (
            <span />
          )}
          {canDiscard && (
            <button
              type="button"
              className={`${bigDefault} !text-red-600 !border-red-300`}
              onClick={() =>
                Modal.confirm({
                  title: `Discard “${item.label}” of ${item.ref}?`,
                  content: "It is taken off this phone and never sent. Record it again on the gate job if it is still needed.",
                  okText: "Discard",
                  okButtonProps: { danger: true },
                  onOk: () => q.discard(item.id),
                })
              }
            >
              Discard
            </button>
          )}
        </div>
      )}
    </li>
  );
}

export function FloorShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const q = useFloorQueue();
  const [sheet, setSheet] = useState(false);
  const home = pathname.replace(/\/$/, "") === "/warehouse/floor";
  const n = q.items.length;

  return (
    <div className="fixed inset-0 z-[900] flex flex-col bg-slate-50 text-slate-900">
      <header className="flex h-14 shrink-0 items-center gap-1 border-b border-slate-200 bg-white px-1">
        {home ? (
          <span className="w-12" aria-hidden />
        ) : (
          <Link href="/warehouse/floor" aria-label="Back to the scan screen" className="flex h-12 w-12 items-center justify-center text-[18px] text-slate-600">
            <ArrowLeftOutlined />
          </Link>
        )}
        <h1 className="m-0 flex-1 truncate text-[17px] font-bold">{TERMS.floorMode}</h1>
        <span
          role="status"
          className={`rounded-full px-2.5 py-1 text-[12px] font-bold ${q.online ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}
        >
          {q.online ? "Online" : "Offline"}
        </span>
        <Link href="/warehouse?tab=gatelog" aria-label="Exit floor mode" title="Exit floor mode" className="flex h-12 w-12 items-center justify-center text-[18px] text-slate-600">
          <CloseOutlined />
        </Link>
      </header>
      {n > 0 && (
        <button
          type="button"
          onClick={() => setSheet(true)}
          className={`flex min-h-[48px] w-full shrink-0 items-center gap-2 border-none px-4 text-left text-[15px] font-semibold cursor-pointer ${
            q.authPaused ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"
          }`}
        >
          <CloudSyncOutlined spin={q.sending} />
          {q.authPaused ? `Sign in again to send (${n})` : `${TERMS.waitingToSend} (${n})`}
          <span className="ml-auto text-[13px] font-normal underline">See</span>
        </button>
      )}
      <main className="flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-[560px] px-4 pb-28 pt-4">{children}</div>
      </main>

      <Drawer
        open={sheet}
        placement="bottom"
        height="80%"
        title={`${TERMS.waitingToSend} (${n})`}
        onClose={() => setSheet(false)}
        styles={{ body: { paddingTop: 4 } }}
      >
        <p className="mt-0 text-[13px] text-slate-500">
          Made on this phone while there was no connection. They are sent in order, with the time they were made, as soon as the phone is back online — the server
          applies each one only once.
        </p>
        {n === 0 ? (
          <div className="py-6 text-center text-[15px] text-slate-500">Everything is sent.</div>
        ) : (
          <ul className="m-0 list-none p-0">
            {q.items.map((i) => (
              <QueueRow key={i.id} item={i} />
            ))}
          </ul>
        )}
        {n > 0 && (
          <button type="button" className={`${bigPrimary} mt-3`} disabled={q.sending} onClick={q.flush}>
            {q.sending ? "Sending…" : "Send now"}
          </button>
        )}
      </Drawer>
    </div>
  );
}

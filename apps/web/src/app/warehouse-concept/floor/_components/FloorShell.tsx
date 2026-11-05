"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Drawer, Modal } from "antd";
import { ArrowLeftOutlined, CloseOutlined, CloudSyncOutlined } from "@ant-design/icons";
import { formatDateTime } from "@/lib/date";
import { Badge, type Tone } from "@/components/Badge";
import { Pill } from "@/components/Pill";
import { MODAL_TITLE, REF } from "@/styles/ui";
import { TERMS } from "@/app/warehouse-concept/_lib/glossary";
import { useFloorQueue } from "../_lib/useFloorQueue";
import type { ItemStatus, QueueItem } from "../_lib/queue";
import { bigDanger, bigDefault, bigPrimary } from "./floorUi";

// Floor mode's frame on the phone. The app's sidebar and top bar are global (AppShell) and made
// for a desk, so floor mode hides them while it is open and shows a full-screen layer of its own
// (below antd dialogs and messages, which sit at 1000+): a 56 px header with Back, the connection and "Exit floor
// mode", and — while writes wait — a "Waiting to send (n)" bar that opens the queue.

const STATE_TEXT: Record<ItemStatus["state"], { text: string; tone: Tone }> = {
  waiting: { text: "Waiting to send", tone: "a" },
  sending: { text: "Sending…", tone: "i" },
  failed: { text: "Not sent", tone: "r" },
  too_old: { text: "Too old to send", tone: "r" },
  held_user: { text: "Another user's", tone: "" },
  blocked: { text: "Waiting for an earlier one", tone: "" },
};

function QueueRow({ item }: { item: QueueItem }) {
  const q = useFloorQueue();
  const st = q.statusOf(item);
  // antd's static Modal.confirm does not render under React 19; the hook version does.
  const [modal, modalHolder] = Modal.useModal();
  const s = STATE_TEXT[st.state];
  const canRetry = st.state === "failed";
  const canDiscard = st.state === "failed" || st.state === "too_old";
  return (
    <li className="border-b border-slate-100 py-3 last:border-b-0">
      {modalHolder}
      <div className="flex flex-wrap items-center gap-2">
        <span className={`${REF} text-[14px] font-bold text-indigo-600`}>{item.ref}</span>
        <span className="text-[14px] font-semibold text-slate-900">{item.label}</span>
        <Badge tone={s.tone} className="ml-auto">
          {s.text}
        </Badge>
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
              className={bigDanger}
              onClick={() =>
                modal.confirm({
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
  const home = pathname.replace(/\/$/, "") === "/warehouse-concept/floor";
  const n = q.items.length;
  const waiting = q.waiting;

  return (
    <div className="fixed inset-0 z-[900] flex flex-col bg-slate-50 text-slate-900">
      <header className="flex h-14 shrink-0 items-center gap-1 border-b border-slate-200 bg-white px-1">
        {home ? (
          <span className="w-12" aria-hidden />
        ) : (
          <Link href="/warehouse-concept/floor" aria-label="Back to the scan screen" className="flex h-12 w-12 items-center justify-center text-[18px] !text-slate-500 hover:!text-slate-900">
            <ArrowLeftOutlined />
          </Link>
        )}
        {/* The title of a phone's app bar: the sub-page size, not the desk page title's. */}
        <h1 className={`${MODAL_TITLE} flex-1 truncate`}>{TERMS.floorMode}</h1>
        <Pill role="status" tone={q.online ? "green" : "red"}>
          {q.online ? "Online" : "Offline"}
        </Pill>
        <Link href="/warehouse-concept?tab=gatelog" aria-label="Exit floor mode" title="Exit floor mode" className="flex h-12 w-12 items-center justify-center text-[18px] !text-slate-500 hover:!text-slate-900">
          <CloseOutlined />
        </Link>
      </header>
      {n > 0 && (
        <button
          type="button"
          onClick={() => setSheet(true)}
          className={`flex min-h-[48px] w-full shrink-0 items-center gap-2 border-none px-4 text-left text-[14px] font-semibold cursor-pointer ${
            q.authPaused ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
          }`}
        >
          <CloudSyncOutlined spin={q.sending} />
          {q.authPaused ? `Sign in again to send (${waiting})` : `${TERMS.waitingToSend} (${waiting})`}
          <span className="ml-auto text-[13px] font-normal underline">See</span>
        </button>
      )}
      {q.notSaved && (
        <div role="alert" className="shrink-0 bg-red-50 px-4 py-2.5 text-[14px] font-semibold text-red-700">
          Not saved on this phone — writes are held only while this page stays open. Don&apos;t close or reload it until everything is sent.
        </div>
      )}
      <main className="flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-[560px] px-4 pb-28 pt-4">{children}</div>
      </main>

      <Drawer
        open={sheet}
        placement="bottom"
        height="80%"
        title={`${TERMS.waitingToSend} (${waiting})`}
        onClose={() => setSheet(false)}
        classNames={{ body: "!pt-1" }}
      >
        <p className="mt-0 text-[13px] text-slate-500">
          Made on this phone while there was no connection. They are sent in order, with the time they were made, as soon as the phone is back online — the server
          applies each one only once.
        </p>
        {n === 0 ? (
          <div className="py-6 text-center text-[14px] text-slate-500">Everything is sent.</div>
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

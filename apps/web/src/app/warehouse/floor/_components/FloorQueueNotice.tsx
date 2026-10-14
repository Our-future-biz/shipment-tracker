"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CloudSyncOutlined } from "@ant-design/icons";
import { TERMS } from "@/app/warehouse/_lib/glossary";
import { useFloorQueue } from "../_lib/useFloorQueue";

// Outside floor mode (other Warehouse pages, e.g. after "Open full gate job"), changes made in
// floor mode that still wait are shown here and keep being sent. They are not yet on the gate job,
// so a step shown there as not stamped may be on its way.
export function FloorQueueNotice() {
  const pathname = usePathname();
  const q = useFloorQueue();
  const n = q.items.length;
  if (!n || pathname.startsWith("/warehouse/floor")) return null;
  return (
    <div role="status" className="fixed bottom-4 right-4 z-[950] max-w-[calc(100vw-32px)] rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-[13px] text-amber-900 shadow-md">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <CloudSyncOutlined spin={q.sending} />
        <span className="font-semibold">
          {q.authPaused ? `Sign in again to send (${n})` : `${TERMS.floorMode}: ${TERMS.waitingToSend.toLowerCase()} (${n})`}
        </span>
        <Link href="/warehouse/floor" className="underline">
          Open floor mode
        </Link>
      </div>
      <div className="mt-0.5 text-[12px] text-amber-800">Made on this device without a connection — not on the gate job until sent. Sent while a Warehouse page is open.</div>
    </div>
  );
}

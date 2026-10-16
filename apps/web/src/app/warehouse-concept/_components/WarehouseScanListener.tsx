"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Modal } from "antd";
import type { GateMovement } from "@/hooks/useGateLog";
import { useToast } from "@/lib/toast";
import { directionOf } from "@/app/warehouse-concept/_lib/glossary";
import { scanHref } from "@/app/warehouse-concept/_lib/scanner";
import { useScanOpen, useWedgeScanner } from "@/app/warehouse-concept/_lib/useWedgeScanner";

// Handheld scanners on every Warehouse page: a scan (fast keys + Enter while no field has the
// focus) opens the matching position — its gate job, or its floor screen in floor mode. Several
// matches are listed with large links; nothing found is said in a toast. Pages with a scan box of
// their own (Gate Log, floor mode home) handle scans there.
export function WarehouseScanListener() {
  const pathname = usePathname();
  const toast = useToast();
  const target = pathname.startsWith("/warehouse-concept/floor") ? "floor" : "gate";
  const open = useScanOpen(target);
  const [many, setMany] = useState<{ value: string; matches: GateMovement[] } | null>(null);

  useWedgeScanner((raw) => {
    open(raw)
      .then(({ value, result }) => {
        if (result.kind === "many") setMany({ value, matches: result.matches });
        else if (result.kind === "none") toast.warning(`No position for “${value || raw}”`);
      })
      .catch(() => toast.error("Could not look up the scan — no connection?"));
  });

  return (
    <Modal open={!!many} title={many ? `${many.matches.length} positions for “${many.value}”` : ""} footer={null} onCancel={() => setMany(null)} destroyOnHidden>
      <ul className="list-none m-0 p-0 flex flex-col gap-2">
        {many?.matches.map((m) => (
          <li key={m.id}>
            <Link
              href={scanHref(target, m.id)}
              onClick={() => setMany(null)}
              className="flex flex-wrap items-center gap-x-3 gap-y-0.5 min-h-[48px] rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50"
            >
              <span className="font-mono font-bold text-indigo-600">{m.positionRef || m.gateRef}</span>
              <span className="text-slate-700">{m.customer || "—"}</span>
              <span className="ml-auto text-xs text-slate-500">{directionOf(m)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

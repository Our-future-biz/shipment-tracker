"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Input, type InputRef } from "antd";
import { ScanOutlined } from "@ant-design/icons";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast";
import type { GateMovement } from "@/hooks/useGateLog";
import { scanMatch } from "@/app/warehouse/_lib/worklist";
import { errorMessage } from "../_lib/gate";
import { btnInline } from "./job/fields";

// Scan or type at the gate: a scanner types the label's barcode / QR value (the warehouse ref)
// and Enter. An exact ref opens that job; otherwise one match on the job no., a container or a
// plate opens it; several are listed (as links here). Nothing found: maybe an unannounced truck —
// record a walk-in. The box is focused on arrival and takes typing back whenever no other field is
// focused (a scan after a click on the page lands here); after a result its text is selected, so
// the next scan replaces it. A field, button or link that has the focus keeps its keys.
const nothingFocused = () => !document.activeElement || document.activeElement === document.body;
export function ScanBox({ movements }: { movements: GateMovement[] }) {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");
  const [result, setResult] = useState<{ q: string; matches: GateMovement[] } | null>(null);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<InputRef>(null);
  const refocus = () => inputRef.current?.focus({ cursor: "all" });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
      if (e.key === " " || !nothingFocused() || document.querySelector("[role=dialog]")) return;
      // Focused before the key is handled, so the character itself goes into the box.
      inputRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, []);

  const go = () => {
    const q = value.trim();
    if (!q) return;
    const r = scanMatch(q, movements);
    if (r.kind === "open") {
      setResult({ q, matches: [r.movement] });
      router.push(`/warehouse/gate-log/${r.movement.id}`);
    } else {
      setResult({ q, matches: r.kind === "many" ? r.matches : [] });
      refocus();
    }
  };

  const walkIn = async () => {
    if (!result) return;
    setCreating(true);
    try {
      const res = await api.warehouse.gateMovementCreate({ walkIn: true, note: `Scanned / typed at the gate: ${result.q}` });
      await queryClient.invalidateQueries({ queryKey: ["warehouse-gate"] });
      toast.success("Walk-in recorded");
      router.push(`/warehouse/gate-log/${res.movement.id}`);
    } catch (e) {
      toast.error(errorMessage(e, "Failed to record the walk-in"));
      refocus();
    } finally {
      setCreating(false);
    }
  };

  const status = !result ? "" : result.matches.length === 1 ? `Match — opening ${result.matches[0]!.positionRef || result.matches[0]!.gateRef}` : result.matches.length > 1 ? `${result.matches.length} matches for “${result.q}”` : `No match for “${result.q}”`;

  return (
    <div className="mt-4 bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="gate-scan" className="text-[13px] font-bold uppercase tracking-wider text-slate-800 shrink-0">
          Scan or type
        </label>
        <Input
          id="gate-scan"
          ref={inputRef}
          autoFocus
          allowClear
          prefix={<ScanOutlined className="text-slate-400" />}
          placeholder="Warehouse ref (label barcode / QR), job no., container or plate — Enter opens"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setResult(null);
          }}
          onPressEnter={go}
          className="flex-1 min-w-[260px] max-w-[560px]"
        />
        <span role="status" aria-live="polite" className={`text-xs ${result && !result.matches.length ? "text-red-600" : "text-slate-500"}`}>
          {status}
        </span>
      </div>
      {result && result.matches.length > 1 && (
        <ul className="list-none m-0 mt-2 p-0 flex flex-wrap gap-2">
          {result.matches.map((m) => (
            <li key={m.id}>
              <Link href={`/warehouse/gate-log/${m.id}`} className={btnInline}>
                <span className="font-mono font-semibold text-indigo-500">{m.positionRef || m.gateRef}</span>
                <span className="text-slate-500">{m.customer || "—"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {result && result.matches.length === 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
          No match — an unannounced truck?
          <button type="button" className={btnInline} disabled={creating} onClick={walkIn}>
            Record a walk-in
          </button>
        </div>
      )}
    </div>
  );
}

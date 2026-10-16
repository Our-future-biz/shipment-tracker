"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Input, type InputRef } from "antd";
import { ScanOutlined } from "@ant-design/icons";
import { useToast } from "@/lib/toast";
import { useCreateWalkIn, type GateMovement } from "@/hooks/useGateLog";
import { confirmLeave } from "@/app/warehouse-concept/_lib/useUnsavedGuard";
import { ScanBurst, containerHref, matchScanned, scanHref, scannedContainer, type ScanTarget } from "@/app/warehouse-concept/_lib/scanner";
import { dialogOpen } from "@/app/warehouse-concept/_lib/useWedgeScanner";
import { errorMessage } from "../_lib/gate";
import { btnInline } from "./job/fields";

// Scan or type at the gate: a scanner types the label's barcode / QR value (the warehouse ref)
// and Enter. An exact ref opens that job; otherwise one match on the job no., a container or a
// plate opens it; several are listed (as links here). Nothing found: maybe an unannounced truck —
// record a walk-in. A scanner set to the wrong keyboard layout (Czech number row, Y / Z swapped)
// is read too (scanCandidates). The box is focused on arrival and takes typing back whenever no
// other field is focused (a scan after a click on the page lands here); after a result its text
// is selected, so the next scan replaces it. A field, button or link that has the focus keeps its
// keys. `data-scan-box` tells the Warehouse-wide scan listener that this page has its own box.
//
// A scanner set to end with Tab instead of Enter opens the same way: a Tab that ends a fast burst of
// keys (a scan, see ScanBurst) stays in the box and opens; a person's Tab still moves on.
//
// Floor mode (`target="floor"`, `large`): opens the floor screen, the box is 56 px tall, and it
// takes the focus back whenever nothing else needs it (after a tap elsewhere). With `scannerMode`
// the phone's on-screen keyboard stays hidden (a Bluetooth / built-in scanner still types).
const nothingFocused = () => !document.activeElement || document.activeElement === document.body;
export function ScanBox({
  movements,
  target = "gate",
  large = false,
  scannerMode = false,
  extra,
}: {
  movements: GateMovement[];
  target?: ScanTarget;
  large?: boolean;
  scannerMode?: boolean;
  /** Buttons beside the box (floor mode: keyboard toggle, camera). */
  extra?: ReactNode;
}) {
  const router = useRouter();
  const toast = useToast();
  const createWalkIn = useCreateWalkIn();
  const [value, setValue] = useState("");
  const [result, setResult] = useState<{ q: string; matches: GateMovement[] } | null>(null);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<InputRef>(null);
  const refocus = () => inputRef.current?.focus({ cursor: "all" });
  const burst = useRef(new ScanBurst());
  const keepFocus = scannerMode || target === "floor";

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
      if (e.key === " " || !nothingFocused() || dialogOpen()) return;
      // Focused before the key is handled, so the character itself goes into the box.
      inputRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, []);

  // Floor mode (scanner or keyboard): the box takes the focus back after a tap elsewhere, unless a
  // field or a dialog took it.
  useEffect(() => {
    if (!keepFocus) return;
    const onFocusOut = () =>
      window.setTimeout(() => {
        if (nothingFocused() && !dialogOpen()) inputRef.current?.focus({ preventScroll: true });
      }, 150);
    document.addEventListener("focusout", onFocusOut);
    inputRef.current?.focus({ preventScroll: true });
    return () => document.removeEventListener("focusout", onFocusOut);
  }, [keepFocus, scannerMode]);

  const go = () => {
    const q = value.trim();
    if (!q) return;
    // Floor mode: a container number opens the container's tally / stuffing list.
    const container = target === "floor" ? scannedContainer(q, movements) : null;
    if (container) {
      // A scan is a navigation like a click: unsaved edits on this screen are asked about first.
      if (confirmLeave()) router.push(containerHref(target, container.id));
      return;
    }
    const { value: used, result: r } = matchScanned(q, movements);
    if (r.kind === "open") {
      setResult({ q: used, matches: [r.movement] });
      if (confirmLeave()) router.push(scanHref(target, r.movement.id));
      else refocus();
    } else {
      setResult({ q: r.kind === "many" ? used : q, matches: r.kind === "many" ? r.matches : [] });
      refocus();
    }
  };

  const walkIn = async () => {
    if (!result) return;
    setCreating(true);
    try {
      const res = await createWalkIn.mutateAsync(`Scanned / typed at the gate: ${result.q}`);
      toast.success("Walk-in recorded");
      if (confirmLeave()) router.push(scanHref(target, res.movement.id));
    } catch (e) {
      toast.error(errorMessage(e, "Failed to record the walk-in"));
      refocus();
    } finally {
      setCreating(false);
    }
  };

  const status = !result ? "" : result.matches.length === 1 ? `Match — opening ${result.matches[0]!.positionRef || result.matches[0]!.gateRef}` : result.matches.length > 1 ? `${result.matches.length} matches for “${result.q}”` : `No match for “${result.q}”`;

  return (
    <div data-scan-box className={large ? "bg-white border border-slate-200 rounded-xl shadow-sm p-3" : "mt-4 bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3"}>
      <div className={large ? "flex flex-col gap-2" : "flex flex-wrap items-center gap-3"}>
        <label htmlFor="gate-scan" className="text-[13px] font-bold uppercase tracking-wider text-slate-800 shrink-0">
          Scan or type
        </label>
        <div className={large ? "flex items-center gap-2" : "contents"}>
          <Input
            id="gate-scan"
            ref={inputRef}
            autoFocus
            allowClear
            size={large ? "large" : undefined}
            inputMode={scannerMode ? "none" : undefined}
            autoComplete="off"
            autoCapitalize="characters"
            enterKeyHint="go"
            prefix={<ScanOutlined className="text-slate-400" />}
            placeholder={large ? "Scan the label, or type the ref, container or plate" : "Warehouse ref (label barcode / QR), job no., container or plate — Enter opens"}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setResult(null);
            }}
            onPressEnter={go}
            onKeyDown={(e) => {
              const step = burst.current.feed(e);
              if (e.key === "Tab" && step.kind === "scan" && !e.shiftKey && value.trim()) {
                e.preventDefault();
                go();
              }
            }}
            className={large ? "flex-1 min-w-0 !h-14 !text-base" : "flex-1 min-w-[260px] max-w-[560px]"}
          />
          {extra}
        </div>
        <span role="status" aria-live="polite" className={`${large ? "text-sm" : "text-xs"} ${result && !result.matches.length ? "text-red-600" : "text-slate-500"}`}>
          {status}
        </span>
      </div>
      {result && result.matches.length > 1 && (
        <ul className="list-none m-0 mt-2 p-0 flex flex-wrap gap-2">
          {result.matches.map((m) => (
            <li key={m.id}>
              <Link href={scanHref(target, m.id)} className={large ? `${btnInline} !min-h-[48px] !px-3 !text-sm` : btnInline}>
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
          <button type="button" className={large ? `${btnInline} !min-h-[48px] !px-3 !text-sm` : btnInline} disabled={creating} onClick={walkIn}>
            Record a walk-in
          </button>
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CameraOutlined } from "@ant-design/icons";
import { useGateLog } from "@/hooks/useGateLog";
import { useToast } from "@/lib/toast";
import { directionOfVisit } from "@/app/warehouse/_lib/glossary";
import { expectedBecause, expectedSortKey, isExpectedToday, pragueToday } from "@/app/warehouse/_lib/worklist";
import { useScanOpen } from "@/app/warehouse/_lib/useWedgeScanner";
import { ScanBox } from "@/app/warehouse/gate-log/_components/ScanBox";
import { Badge, VISIT_TONE } from "@/app/warehouse/gate-log/_lib/gate";
import { CameraScan, cameraScanSupported } from "./CameraScan";
import { FloorCard } from "./floorUi";

const KEYBOARD_KEY = "warehouse-floor:keyboard";

// Floor mode home: scan first. The box is always ready for the handheld scanner (with the phone's
// on-screen keyboard hidden unless "Keyboard" is on), the camera can read the label where the
// browser supports it, and below is what is expected at the gate today, earliest dock slot first.
export function FloorHome() {
  const toast = useToast();
  const { movements, isLoading } = useGateLog();
  const open = useScanOpen("floor");
  const [keyboard, setKeyboard] = useState(false);
  const [camera, setCamera] = useState(false);
  const [canCamera, setCanCamera] = useState(false);

  useEffect(() => {
    setCanCamera(cameraScanSupported());
    try {
      setKeyboard(localStorage.getItem(KEYBOARD_KEY) === "1");
    } catch {
      // No storage: keyboard stays hidden.
    }
  }, []);
  const toggleKeyboard = () => {
    const next = !keyboard;
    setKeyboard(next);
    try {
      localStorage.setItem(KEYBOARD_KEY, next ? "1" : "0");
    } catch {
      // Not remembered; fine.
    }
  };

  const today = pragueToday();
  const expected = useMemo(
    () =>
      movements
        .filter((m) => isExpectedToday(m, today))
        .sort((a, b) => expectedSortKey(a, today).localeCompare(expectedSortKey(b, today)) || (a.positionRef || a.gateRef).localeCompare(b.positionRef || b.gateRef)),
    [movements, today],
  );

  const onCameraScan = useCallback(
    (raw: string) => {
      setCamera(false);
      open(raw, movements).then(({ value, result }) => {
        if (result.kind === "none") toast.warning(`No position for “${value || raw}”`);
        if (result.kind === "many") toast.info(`${result.matches.length} positions for “${value}” — type more of it, or pick one below`);
      });
    },
    [open, movements, toast],
  );

  const sideBtn = "h-14 shrink-0 rounded-xl border border-slate-300 bg-white px-3 text-[14px] font-semibold text-slate-700 cursor-pointer";

  return (
    <div className="flex flex-col gap-4">
      <ScanBox
        movements={movements}
        target="floor"
        large
        scannerMode={!keyboard}
        extra={
          <>
            <button type="button" className={`${sideBtn} ${keyboard ? "!border-indigo-500 !text-indigo-700" : ""}`} aria-pressed={keyboard} onClick={toggleKeyboard}>
              Keyboard
            </button>
            {canCamera && (
              <button type="button" className={sideBtn} aria-label="Scan with camera" onClick={() => setCamera(true)}>
                <CameraOutlined className="text-[20px]" />
              </button>
            )}
          </>
        }
      />

      <FloorCard title={`Expected today (${expected.length})`}>
        {isLoading ? (
          <div className="py-3 text-[15px] text-slate-500">Loading…</div>
        ) : expected.length === 0 ? (
          <div className="py-3 text-[15px] text-slate-500">Nothing expected today.</div>
        ) : (
          <ul className="-mx-4 m-0 list-none p-0">
            {expected.map((m) => (
              <li key={m.id} className="border-t border-slate-100 first:border-t-0">
                <Link href={`/warehouse/floor/${m.id}`} className="flex min-h-[56px] min-w-0 flex-col justify-center px-4 py-2 active:bg-slate-50">
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-mono text-[15px] font-bold text-indigo-600">{m.positionRef || m.gateRef}</span>
                    <Badge tone={VISIT_TONE[m.visit] ?? ""}>{directionOfVisit(m.visit)}</Badge>
                    <span className="ml-auto min-w-0 max-w-full truncate text-[13px] font-semibold text-slate-600">{expectedBecause(m, today)}</span>
                  </span>
                  <span className="truncate text-[14px] text-slate-700">
                    {m.customer || "—"}
                    {m.plate ? <span className="ml-2 font-mono text-slate-500">{m.plate}</span> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </FloorCard>

      <CameraScan open={camera} onClose={() => setCamera(false)} onScan={onCameraScan} />
    </div>
  );
}

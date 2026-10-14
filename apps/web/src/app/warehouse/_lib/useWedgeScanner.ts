"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { GateMovement } from "@/hooks/useGateLog";
import { ScanBurst, isEditable, matchScanned, scanHref, type ScanTarget } from "./scanner";
import type { ScanResult } from "./worklist";

/** A dialog (antd modal, drawer, confirm) is open and showing. */
export const dialogOpen = () => Array.from(document.querySelectorAll("[role=dialog]")).some((el) => el.getClientRects().length > 0);

/**
 * Keyboard-wedge scans anywhere on the page: while no field has the focus, no dialog is open and
 * the page has no scan box of its own ([data-scan-box] — the Gate Log and floor mode), a fast burst
 * of keys ending with Enter / Tab is a scan. From the third fast key on, the burst's keys and its
 * Enter are kept from the page (so a scan never "clicks" the focused button or opens a grid
 * row). Typing in fields is never touched.
 */
export function useWedgeScanner(onScan: (value: string) => void, { enabled = true }: { enabled?: boolean } = {}) {
  const handler = useRef(onScan);
  useEffect(() => {
    handler.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled) return;
    const burst = new ScanBurst();
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditable(document.activeElement) || document.querySelector("[data-scan-box]") || dialogOpen()) {
        burst.reset();
        return;
      }
      const step = burst.feed(e);
      if (step.kind === "pass") return;
      e.preventDefault();
      e.stopPropagation();
      if (step.kind === "scan") handler.current(step.value);
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [enabled]);
}

export type ScanOpenResult = { value: string; result: ScanResult<GateMovement> };

/**
 * What a scanned or typed value opens, from the Gate Log list (cached; read once if not loaded
 * yet): one match goes to its gate job (or its floor screen); several or none are returned for the
 * caller to show.
 */
export function useScanOpen(target: ScanTarget) {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useCallback(
    async (raw: string, movements?: GateMovement[]): Promise<ScanOpenResult> => {
      const list =
        movements ??
        (
          await queryClient.ensureQueryData({
            queryKey: ["warehouse-gate"],
            queryFn: () => api.warehouse.gateMovementList({}),
          })
        ).movements;
      const found = matchScanned(raw, list);
      if (found.result.kind === "open") router.push(scanHref(target, found.result.movement.id));
      return found;
    },
    [queryClient, router, target],
  );
}

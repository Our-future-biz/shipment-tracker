"use client";

import { useEffect } from "react";

// Unsaved edits are not lost by accident: while a screen has them, closing or reloading the page
// asks the browser's "leave site?" question, and following a link or switching the Warehouse tab
// asks first. One shared set, so the module tabs (not links) can ask too via confirmLeave().
// The browser's Back button: while dirty, one extra history entry (same address, marked) sits on
// top, so Back first lands on the real entry of this page; the question is asked there, and
// "stay" puts the marker back, "leave" goes back once more.

export const LEAVE_TEXT = "You have unsaved changes. Leave without saving them?";

const dirtyScreens = new Set<string>();
// Set when this module itself calls history.back(), so that popstate is not asked about.
let ownBack = false;

type MarkedState = Record<string, unknown> & { __whUnsaved?: string };
const historyState = (): MarkedState => (window.history.state && typeof window.history.state === "object" ? (window.history.state as MarkedState) : {});
const pushMarker = (mark: string) => window.history.pushState({ ...historyState(), __whUnsaved: mark }, "", window.location.href);

/** true when there is nothing unsaved, or the user agreed to leave without saving. */
export function confirmLeave(): boolean {
  if (!dirtyScreens.size) return true;
  if (!window.confirm(LEAVE_TEXT)) return false;
  dirtyScreens.clear();
  return true;
}

export function useUnsavedGuard(dirty: boolean, screen = "remeasurement") {
  useEffect(() => {
    if (!dirty) return;
    dirtyScreens.add(screen);
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Older browsers need a return value to show the question.
      e.returnValue = "";
    };
    // Capture phase on the document runs before the app's own link handling, so a "stay" stops
    // the navigation. Links that open a new tab or window are let through.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!a || a.getAttribute("target") === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href") ?? "";
      if (href.startsWith("#")) return;
      if (!dirtyScreens.has(screen)) return;
      if (window.confirm(LEAVE_TEXT)) {
        dirtyScreens.delete(screen);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
    };
    const mark = `wh-unsaved:${screen}`;
    let leaving = false;
    const onPopState = () => {
      if (ownBack) {
        ownBack = false;
        return;
      }
      if (!dirtyScreens.has(screen) || historyState().__whUnsaved === mark) return;
      if (window.confirm(LEAVE_TEXT)) {
        dirtyScreens.delete(screen);
        leaving = true;
        window.history.back();
        return;
      }
      pushMarker(mark);
    };
    if (historyState().__whUnsaved !== mark) pushMarker(mark);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("popstate", onPopState);
    document.addEventListener("click", onClick, true);
    return () => {
      dirtyScreens.delete(screen);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("click", onClick, true);
      // Saved or discarded while still on this page: take the marker entry off again.
      if (!leaving && historyState().__whUnsaved === mark) {
        ownBack = true;
        window.history.back();
      }
    };
  }, [dirty, screen]);
}

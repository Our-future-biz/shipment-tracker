"use client";

import { useEffect, useState } from "react";
import { Button } from "antd";
import { AppModal } from "@/components/AppModal";
import { onPageSessionChange, pageSessionChanged } from "@/lib/auth/pageSession";

// Long enough to read the notice, short enough that nobody works on in a page about to go.
const RELOAD_AFTER_MS = 2000;

const reload = () => window.location.reload();

/**
 * Loads the page again when another tab of this browser signs out, signs in (as anyone) or chooses
 * another company to work as. What this page shows and keeps would be of the session before, so it
 * is blocked with a short notice and reloaded; its requests are not sent any more meanwhile
 * (lib/auth/pageSession). The storage is looked at when another tab changes it, when the page comes
 * back from the browser's cache or into view again (it may have missed the change while away), and
 * whenever a request found the session changed.
 */
export function SessionChangedNotice() {
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    const check = () => {
      if (pageSessionChanged()) setChanged(true);
    };
    const handleStorage = (e: StorageEvent) => {
      if (e.storageArea === localStorage) check();
    };
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) check();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") check();
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibility);
    const unsubscribe = onPageSessionChange(() => setChanged(true));
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibility);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!changed) return;
    const timer = window.setTimeout(reload, RELOAD_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [changed]);

  return (
    <AppModal
      open={changed}
      onClose={reload}
      closable={false}
      maskClosable={false}
      size="small"
      title="Your session changed in another tab"
      footer={
        <Button type="primary" onClick={reload}>
          Reload now
        </Button>
      }
    >
      <p className="m-0 text-[13px] text-slate-700 leading-relaxed">
        Another tab of this browser signed in or out, or chose another company to work as. This page is loaded again to match it.
      </p>
    </AppModal>
  );
}

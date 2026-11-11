"use client";

import { useEffect, useState } from "react";
import { Button } from "antd";
import { AppModal } from "@/components/AppModal";
import { changesPageSession } from "@/lib/auth/pageSession";

// Long enough to read the notice, short enough that nobody works on in a page about to go.
const RELOAD_AFTER_MS = 2000;

const reload = () => window.location.reload();

/**
 * Loads the page again when another tab of this browser signs out, signs in (as anyone) or chooses
 * another company to work as. What this page shows and keeps would be of the session before, so it
 * is blocked with a short notice and reloaded. Until then its requests still go out as the session
 * it shows (lib/auth/pageSession), so a save on its way lands where it was made.
 */
export function SessionChangedNotice() {
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.storageArea === localStorage && changesPageSession(e.key, e.newValue)) setChanged(true);
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
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

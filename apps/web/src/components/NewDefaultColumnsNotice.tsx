"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Alert, Button } from "antd";
import { useAuth } from "@/lib/auth/AuthContext";
import { newDefaultsSeenKey, tellsNewDefaults } from "@/lib/newDefaultColumns";

interface NewDefaultColumnsNoticeProps {
  /** Which list: the "seen" mark is kept per list and user. */
  scope: string;
  /** Names the defaults told about; a new version tells again. */
  version: string;
  /** The user's own set as the list draws it; null when they have none (they get the defaults anyway). */
  own: readonly string[] | null;
  defaults: readonly string[];
  /** What changed, in the list's words. */
  children: ReactNode;
  /** Puts the list on the new defaults. */
  onReset: () => void;
  /** Set while the columns can't be changed yet (Quotes: the company's set not read). */
  resetDisabled?: boolean;
}

// A one-time notice over a list whose default columns changed, for a user whose own saved set keeps
// them from seeing it (mock council S9-2): what is new, a button that takes the new defaults, and a
// close that keeps the user's own. Either way it is not shown again for these defaults, in this browser.
export function NewDefaultColumnsNotice({ scope, version, own, defaults, children, onReset, resetDisabled }: NewDefaultColumnsNoticeProps) {
  const { user } = useAuth();
  const key = user ? newDefaultsSeenKey(scope, user.id) : null;
  // Unknown until read in the browser; nothing shows meanwhile.
  const [seen, setSeen] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!key) return;
    try {
      setSeen(localStorage.getItem(key));
    } catch {
      // Storage unavailable: told on every visit rather than never.
      setSeen(null);
    }
  }, [key]);

  const markSeen = () => {
    setSeen(version);
    if (!key) return;
    try {
      localStorage.setItem(key, version);
    } catch {
      /* ignore quota / unavailable */
    }
  };

  if (!key || seen === undefined || !tellsNewDefaults(own, defaults, seen, version)) return null;
  return (
    <Alert
      type="info"
      showIcon
      closable
      onClose={markSeen}
      className="!mb-3"
      message="New default columns"
      description={children}
      action={
        <Button
          size="small"
          type="primary"
          disabled={resetDisabled}
          onClick={() => {
            onReset();
            markSeen();
          }}
        >
          Use the new defaults
        </Button>
      }
    />
  );
}

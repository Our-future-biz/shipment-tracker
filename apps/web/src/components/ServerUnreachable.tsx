"use client";

import { Button } from "antd";
import { CARD, HINT, MODAL_TITLE } from "@/styles/ui";

interface ServerUnreachableProps {
  onRetry: () => void;
}

/**
 * What a page shows when the stored session could not be checked because the server did not
 * answer (or answered with an error of its own, as while it starts up). The user stays signed in.
 */
export function ServerUnreachable({ onRetry }: ServerUnreachableProps) {
  return (
    <div className="flex items-center justify-center h-screen bg-slate-50 px-4">
      <div role="alert" className={`${CARD} w-full max-w-[420px] p-6 text-center`}>
        <h1 className={`${MODAL_TITLE} mb-2`}>The server could not be reached</h1>
        <p className={`${HINT} mt-0 mb-4`}>You are still signed in. The server may be starting up or briefly down — try again in a moment.</p>
        <Button type="primary" onClick={onRetry}>
          Retry
        </Button>
      </div>
    </div>
  );
}

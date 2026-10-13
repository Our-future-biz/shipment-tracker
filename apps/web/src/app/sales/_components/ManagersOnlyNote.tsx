"use client";

import { Button } from "antd";

// The line a shared setting of Sales carries for whoever may not change it (useSalesPermissions).
// Nothing while the server's answer is on its way, or allows the change. When the answer could
// not be had the setting is locked just the same, and the line says that instead: "only
// managers" would be a guess about somebody who may well be one.
export function ManagersOnlyNote({
  status,
  allowed,
  onRetry,
  className = "",
}: {
  status: "loading" | "ready" | "error";
  allowed: boolean;
  onRetry: () => void;
  className?: string;
}) {
  if (status === "loading" || allowed) return null;
  if (status === "error") {
    return (
      <div className={`text-xs text-red-600 ${className}`}>
        Could not check whether you may change this.{" "}
        <Button size="small" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }
  return <div className={`text-xs text-slate-500 ${className}`}>Only managers and admins can change this.</div>;
}

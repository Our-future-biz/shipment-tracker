"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { usePortalMe } from "@/hooks/useHaulierPortal";
import { truckingKeys } from "@/hooks/truckingKeys";
import { portalSignOut } from "../_lib/portalClient";
import { PORTAL_LOGIN_PATH } from "../_lib/portalSession";
import { Bi } from "./Bi";

interface PortalFrameProps {
  children: ReactNode;
}

// The signed-in portal page around its content: who is signed in for which haulier, and Log out.
// Outside the app shell (AppShell OPEN_PATHS), built for a phone.
export const PortalFrame = ({ children }: PortalFrameProps) => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { me } = usePortalMe();
  const [leaving, setLeaving] = useState(false);

  const handleLogout = async () => {
    setLeaving(true);
    await portalSignOut();
    queryClient.removeQueries({ queryKey: truckingKeys.portal() });
    router.replace(PORTAL_LOGIN_PATH);
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] text-slate-500">
              {me?.ourCompany ? `${me.ourCompany} · ` : ""}
              <Bi text={{ cs: "Portál dopravce", en: "Haulier portal" }} />
            </div>
            <div className="truncate text-[15px] font-semibold text-slate-900">{me?.haulierName ?? "…"}</div>
            {me && <div className="truncate text-[12px] text-slate-500">{me.userName}</div>}
          </div>
          <button
            type="button"
            disabled={leaving}
            onClick={handleLogout}
            className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] font-semibold text-slate-700 disabled:opacity-50"
          >
            <Bi text={{ cs: "Odhlásit", en: "Log out" }} />
          </button>
        </div>
      </header>
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-5">{children}</div>
    </main>
  );
};

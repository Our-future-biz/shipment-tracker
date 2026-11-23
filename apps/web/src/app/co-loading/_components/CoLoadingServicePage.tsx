"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { App } from "antd";
import { LockSimpleIcon, LockSimpleOpenIcon } from "@phosphor-icons/react";
import { Pill } from "@/components/Pill";
import { useCoLoadingService, useCoLoadingServiceClosing } from "@/hooks/useCoLoadingServices";
import { apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatDate } from "@/lib/date";
import { useMessages } from "@/lib/toast";
import { BTN, HINT, LINK, PAGE_SUBTITLE, PAGE_TITLE } from "@/styles/ui";
import { canManageServices, closedLine, tileLine } from "../_lib/services";
import { CoLoadingSailings } from "./CoLoadingSailings";
import { CoLoadingServiceShipments } from "./CoLoadingServiceShipments";

// A Co-Loading Concept service's own page, opened from its tile: its heading, its sailings (with
// "Create new sailing"), then the Shipments grid with the jobs of its Service Name (CoLoadingServiceShipments). Managers and higher close the service
// here (its tile is hidden from users and nothing new is put in it: the grid is read-only) and reopen
// it. A closed one still opens from a link, saying it is closed: it stays in the app.
export function CoLoadingServicePage() {
  const { serviceId } = useParams<{ serviceId: string }>();
  const { service, isLoading, notFound } = useCoLoadingService(serviceId);
  const { close, reopen } = useCoLoadingServiceClosing();
  const { user } = useAuth();
  const isManager = canManageServices(user?.role);
  const { modal } = App.useApp();
  const message = useMessages();

  const onClose = () => {
    if (!service) return;
    modal.confirm({
      title: `Close "${service.name}"?`,
      content:
        "Users will no longer see its tile, and nothing new can be put in it until it is reopened. It stays in the app, and managers can reopen it here at any time.",
      okText: "Close service",
      okButtonProps: { danger: true },
      cancelText: "Keep it open",
      onOk: async () => {
        try {
          await close.mutateAsync(service.id);
          message.success(`Service "${service.name}" closed`);
        } catch (err) {
          message.error(apiErrorMessage(err));
        }
      },
    });
  };

  const onReopen = async () => {
    if (!service) return;
    try {
      await reopen.mutateAsync(service.id);
      message.success(`Service "${service.name}" reopened`);
    } catch (err) {
      message.error(apiErrorMessage(err));
    }
  };

  return (
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1400px] mx-auto flex flex-col gap-2 min-w-0">
        <Link href="/co-loading" className={`${LINK} text-[13px] w-fit`}>
          ← Co-Loading Concept
        </Link>
        {isLoading ? (
          <p className={`${HINT} m-0`}>Loading the service…</p>
        ) : notFound || !service ? (
          <p className={`${HINT} m-0`}>This service was not found.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <h1 className={PAGE_TITLE}>{service.name}</h1>
                {service.closedAt && <Pill tone="slate">Closed</Pill>}
              </div>
              {isManager &&
                (service.closedAt ? (
                  <button type="button" onClick={onReopen} disabled={reopen.isPending} className={BTN}>
                    <LockSimpleOpenIcon size={16} aria-hidden />
                    Reopen service
                  </button>
                ) : (
                  <button type="button" onClick={onClose} disabled={close.isPending} className={BTN}>
                    <LockSimpleIcon size={16} aria-hidden />
                    Close service
                  </button>
                ))}
            </div>
            <p className={`${PAGE_SUBTITLE} m-0`}>{tileLine(service)}</p>
            {service.note && <p className={`${PAGE_SUBTITLE} m-0`}>{service.note}</p>}
            {service.closedAt && (
              <div role="status" className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[13px] text-slate-700">
                <span className="font-semibold">{closedLine(service, formatDate)}.</span> Users no longer see its tile, and nothing new can be put
                in it until {isManager ? "you reopen it" : "a manager reopens it"}.
              </div>
            )}
            <div className="mt-4 flex flex-col gap-5">
              <CoLoadingSailings serviceId={service.id} closed={!!service.closedAt} />
              {service.serviceName ? (
                <CoLoadingServiceShipments serviceName={service.serviceName} closed={!!service.closedAt} />
              ) : (
                <p className={`${HINT} m-0`}>This service has no Service Name, so it has no shipments to show.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

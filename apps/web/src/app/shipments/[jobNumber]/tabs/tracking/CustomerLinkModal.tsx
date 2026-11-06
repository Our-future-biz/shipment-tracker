"use client";

import { useState } from "react";
import { Alert, Button, Spin } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppModal } from "@/components/AppModal";
import { CopyButton } from "@/components/CopyButton";
import type { ShipmentItem } from "@/hooks/useShipments";
import { api, apiErrorMessage } from "@/lib/api";
import { businessDateTime, formatDate } from "@/lib/date";
import { HINT, REF } from "@/styles/ui";

/** The customer's read-only link: made, replaced or stopped here. The address can be shown only once. */
export function CustomerLinkModal({ shipment, onClose }: { shipment: ShipmentItem; onClose: () => void }) {
  const queryClient = useQueryClient();
  const key = ["customer-link", shipment.id];
  const { data, isLoading, error: loadError } = useQuery({ queryKey: key, queryFn: () => api.shipments.customerLinkGet(shipment.id), staleTime: 0 });
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onError = (err: unknown) => setError(apiErrorMessage(err));

  const create = useMutation({
    mutationFn: () => api.shipments.customerLinkCreate(shipment.id),
    onSuccess: (res) => {
      setError(null);
      setUrl(res.url);
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError,
  });
  const revoke = useMutation({
    mutationFn: () => api.shipments.customerLinkRevoke(shipment.id),
    onSuccess: () => {
      setError(null);
      setUrl(null);
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError,
  });

  const link = data?.link ?? null;
  const busy = create.isPending || revoke.isPending;

  return (
    <AppModal
      open
      onClose={onClose}
      title="Customer link"
      subtitle={shipment.jobNumber ?? undefined}
      footer={
        <div className="flex justify-between gap-2">
          <div className="flex gap-2">
            {link && (
              <Button danger disabled={busy} loading={revoke.isPending} onClick={() => revoke.mutate()}>
                Stop this link
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button onClick={onClose}>Close</Button>
            {!isLoading && (
              <Button type={link ? "default" : "primary"} disabled={busy} loading={create.isPending} onClick={() => create.mutate()}>
                {link ? "Make a new link" : "Make a link"}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        {(error || loadError) && <Alert type="error" showIcon message={error ?? apiErrorMessage(loadError)} />}
        <p className={`${HINT} m-0`}>
          Anyone with the link sees this job&apos;s route, vessel, containers and dates, without signing in. No names, prices, notes or documents. It closes 30 days after delivery, or when you stop it.
        </p>
        {isLoading && <Spin />}
        {url && (
          <div className="rounded-md bg-emerald-50 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className={`${REF} min-w-0 flex-1 break-all text-[12px] text-slate-900`}>{url}</span>
              <CopyButton text={url} what="customer link" />
            </div>
            <p className={`${HINT} m-0 mt-1`}>Copy it now: it can&apos;t be shown again. A new link replaces this one.</p>
          </div>
        )}
        {link && (
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
            <dt className="text-slate-500">Made</dt>
            <dd className="m-0 text-slate-900">{[businessDateTime(link.createdAt), link.createdBy].filter(Boolean).join(" · ")}</dd>
            <dt className="text-slate-500">Last opened</dt>
            <dd className="m-0 text-slate-900">{link.lastOpenedAt ? businessDateTime(link.lastOpenedAt) : "Not yet"}</dd>
            <dt className="text-slate-500">Open until</dt>
            <dd className="m-0 text-slate-900">{!link.open ? "Closed" : link.openUntil ? formatDate(link.openUntil) : "30 days after delivery"}</dd>
          </dl>
        )}
      </div>
    </AppModal>
  );
}

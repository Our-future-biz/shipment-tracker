"use client";

import { useState } from "react";
import { Alert, Button, Spin } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppModal } from "@/components/AppModal";
import { ConfirmModal } from "@/components/ConfirmModal";
import { CopyButton } from "@/components/CopyButton";
import { InfoRow } from "@/components/InfoRow";
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
  // Replacing or stopping the link the customer has is asked about first: their old address stops working.
  const [asking, setAsking] = useState<"replace" | "stop" | null>(null);
  const onError = (err: unknown) => {
    setAsking(null);
    setError(apiErrorMessage(err));
  };

  const create = useMutation({
    mutationFn: () => api.shipments.customerLinkCreate(shipment.id),
    onSuccess: (res) => {
      setAsking(null);
      setError(null);
      setUrl(res.url);
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError,
  });
  const revoke = useMutation({
    mutationFn: () => api.shipments.customerLinkRevoke(shipment.id),
    onSuccess: () => {
      setAsking(null);
      setError(null);
      setUrl(null);
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError,
  });

  const link = data?.link ?? null;
  const busy = create.isPending || revoke.isPending;
  // The server makes no link for a cancelled job or one delivered more than 30 days ago.
  const closed = link?.open === false;

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
              <Button danger disabled={busy} loading={revoke.isPending} onClick={() => setAsking("stop")}>
                Stop this link
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button onClick={onClose}>Close</Button>
            {!isLoading && !closed && (
              <Button type={link ? "default" : "primary"} disabled={busy} loading={create.isPending} onClick={() => (link ? setAsking("replace") : create.mutate())}>
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
          <div>
            <InfoRow label="Made">{[businessDateTime(link.createdAt), link.createdBy].filter(Boolean).join(" · ")}</InfoRow>
            <InfoRow label="Last opened">{link.lastOpenedAt ? businessDateTime(link.lastOpenedAt) : "Not yet"}</InfoRow>
            <InfoRow label="Open until">{!link.open ? "Closed" : link.openUntil ? formatDate(link.openUntil) : "30 days after delivery"}</InfoRow>
          </div>
        )}
        {closed && <p className={`${HINT} m-0`}>No new link can be made: the job is cancelled, or it was delivered more than 30 days ago.</p>}
      </div>
      <ConfirmModal
        open={asking === "replace"}
        onClose={() => !busy && setAsking(null)}
        onConfirm={() => create.mutate()}
        title="Make a new link?"
        description="The link the customer has stops working. Send them the new one."
        confirmLabel="Make a new link"
        danger
        loading={create.isPending}
      />
      <ConfirmModal
        open={asking === "stop"}
        onClose={() => !busy && setAsking(null)}
        onConfirm={() => revoke.mutate()}
        title="Stop this link?"
        description={closed ? "Nobody can open it again." : "The customer's link stops working at once. You can make a new one later."}
        confirmLabel="Stop this link"
        danger
        loading={revoke.isPending}
      />
    </AppModal>
  );
}

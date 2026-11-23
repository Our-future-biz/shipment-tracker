"use client";

import { useEffect, useState } from "react";
import { Button, Input, Select } from "antd";
import { AppModal } from "@/components/AppModal";
import { useCoLoadingSailings, type CoLoadingSailing } from "@/hooks/useCoLoadingServices";
import { apiErrorMessage } from "@/lib/api";
import { HINT, LABEL_TEXT } from "@/styles/ui";
import { containersWords, fillWords } from "../_lib/boxUtilization";
import { sailingTitle } from "../_lib/sailings";

interface MoveShipmentModalProps {
  open: boolean;
  onClose: () => void;
  /** The sailing the shipment is on now. */
  sailing: CoLoadingSailing;
  /** The shipment to move; null while none is picked. */
  shipment: { id: string; jobNumber: string } | null;
  onMove: (toSailingId: string, reason: string) => Promise<void>;
  moving: boolean;
}

// "Move to another sailing": cargo left behind goes to another sailing of the same service, with
// the reason typed. This sailing's "Taken off" list keeps where it went and why.
export function MoveShipmentModal({ open, onClose, sailing, shipment, onMove, moving }: MoveShipmentModalProps) {
  const { sailings, isLoading } = useCoLoadingSailings(sailing.serviceId);
  const others = sailings.filter((s) => s.id !== sailing.id);
  const [to, setTo] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setTo(null);
    setReason("");
    setError(null);
  }, [open]);

  const handleMove = async () => {
    if (!to) return setError("Pick the sailing to move it to.");
    if (!reason.trim()) return setError("Say why the shipment is moved.");
    try {
      await onMove(to, reason.trim());
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  };

  return (
    <AppModal
      open={open}
      onClose={moving ? () => undefined : onClose}
      title={shipment ? `Move ${shipment.jobNumber} to another sailing` : "Move to another sailing"}
      subtitle={`It leaves ${sailingTitle(sailing)}. Its history here keeps where it went and why.`}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={moving}>
            Cancel
          </Button>
          <Button type="primary" loading={moving} disabled={others.length === 0} onClick={handleMove}>
            Move
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {!isLoading && others.length === 0 ? (
          <p className="m-0 text-[13px] text-slate-700" role="status">
            This service has no other sailing yet. Create the next sailing on the service&apos;s page first.
          </p>
        ) : (
          <>
            <label className="flex flex-col gap-1.5">
              <span className={LABEL_TEXT}>Move to</span>
              <Select
                aria-label="Sailing to move the shipment to"
                placeholder="Pick a sailing"
                loading={isLoading}
                value={to}
                onChange={(value) => {
                  setTo(value);
                  setError(null);
                }}
                options={others.map((s) => ({ value: s.id, label: `${sailingTitle(s)} · ${containersWords(s)}${s.fill ? ` · ${fillWords(s.fill)}` : ""}` }))}
              />
              <span className={HINT}>The other sailings of this service, the newest first, each with how full it is.</span>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={LABEL_TEXT}>Why</span>
              <Input.TextArea
                aria-label="Why the shipment is moved"
                rows={2}
                maxLength={300}
                placeholder="e.g. Box full, rolled to the next week"
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setError(null);
                }}
              />
            </label>
          </>
        )}
        {error && (
          <p className="m-0 text-[13px] text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>
    </AppModal>
  );
}

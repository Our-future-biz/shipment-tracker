"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Radio, Select } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { useShipments } from "@/hooks/useShipments";
import { invalidateReleaseRequests, useReleasePasses } from "@/hooks/useReleaseRequests";
import { HINT } from "@/styles/ui";
import {
  AskManagerToRelease,
  OverrideReasonField,
  PaymentNotCheckedNote,
  ReleasePaymentWarning,
  ReleaseStopAlert,
  useCanOverrideReleaseStop,
  useReleaseChecksState,
} from "@/components/finance/ReleasePaymentWarning";
import { overrideReasonOk, PASS_CHECKING, RELEASE_ON_APPROVAL_LABEL, RELEASE_ON_APPROVAL_NOTE, releaseStopLikely, releaseStopNote } from "@/lib/paymentWarnings";
import type { MoveOutcome } from "../_lib/moveOutcome";
import { everyHeldOnApproval, mayBeStopped, overrideReasons, releaseStanding, type ReleaseJob } from "../_lib/releaseReasons";

// Asked when shipments are released from Stock (Vyskladnit): do they leave on a new truck
// or on one that is already being loaded? A new truck gets the next TCZ reference when the
// release is confirmed; the trucks on offer are the ones shipments in Out Warehouse are on.
// The plate number is not asked for here; it is filled in on the truck's shipments.
// Before the release, each shipment's payment is checked (Council Outlay 10, D20): a job whose invoice is unpaid while
// the customer is on prepayment or has overdue invoices is named, and the button says "Release anyway". A check that
// fails or is slow does not hold the release up: a small note says so.
// The prepayment stop (Accounts Receivable step 7) is the server's: a job on prepayment that is not paid (or whose
// payment could not be checked) is refused. The dialog then stays open with just the shipments not moved, names each
// stopped job with the server's sentence, and a manager may send them again - on the same truck - with a reason.
// When the check already says a job will be stopped, the dialog says so first, and a manager sees the reason at once.
// A user asks a manager to release each stopped job from here (Council Outlay 11, D16). An approval releases
// nothing: for 7 days it lets the job be released once, from this very dialog, on the truck picked here. A job
// with such an approval is therefore not said to be stopped: it goes through on the approval - and a manager's
// typed reason is never sent with it (_lib/releaseReasons: the reason goes only with the jobs the stop holds and
// no approval lets through). Whether an approval stands is read when the dialog opens and every 30 seconds while
// it is open; until it is read, "stopped", the ask button and the reason field wait.

/** What a release from the dialog came to: the truck it went on (null when none could be given) and per shipment. */
export interface TruckRelease {
  truck: string | null;
  outcome: MoveOutcome;
}

export function ReleaseToTruckModal({
  shipmentIds,
  onClose,
  onRelease,
}: {
  /** The ticked shipments; null keeps the dialog closed. */
  shipmentIds: string[] | null;
  onClose: () => void;
  /** Releases the shipments on the truck (null: a new one); a manager's reason goes with the shipments it is given for (id → reason). */
  onRelease: (shipmentIds: string[], truck: string | null, paymentOverrideReasons?: ReadonlyMap<string, string>) => Promise<TruckRelease>;
}) {
  const { shipments } = useShipments({ warehouse: "out" });
  const open = shipmentIds !== null;
  // The shipments still to release: all ticked ones, then those an earlier try did not move.
  const [pending, setPending] = useState<string[]>([]);
  // The truck an earlier try used (a new one is created once): the rest follow it there.
  const [truckUsed, setTruckUsed] = useState<string | null>(null);
  // The shipments the server stopped for prepayment on the last try, with its sentence.
  const [stopped, setStopped] = useState<MoveOutcome["stopped"]>([]);
  const [reason, setReason] = useState("");
  const manager = useCanOverrideReleaseStop();
  // The ticked shipments' job numbers, to name the ones that warn (the Stock list, as the page reads it).
  const { shipments: inStock } = useShipments({ warehouse: "stock", enabled: open });
  const payment = useReleaseChecksState(pending, open && pending.length > 0);
  const warned = payment.items.filter((x) => x.state === "warn" && x.check);
  // What the dialog knows of each job: held for prepayment by the check (not paid), not checked, stopped by the
  // server on the last try. The server stops these - unless a manager approved a request for the job's release
  // and the approval can still be used: those go through on it.
  const facts = pending.map((shipmentId) => {
    const item = payment.items.find((x) => x.shipmentId === shipmentId);
    return {
      shipmentId,
      held: item?.state === "warn" && releaseStopLikely(item.check),
      unchecked: item?.state === "unknown",
      stopped: stopped.some((s) => s.shipmentId === shipmentId),
    };
  });
  // An approval is looked for only where something may stop the job.
  const approvals = useReleasePasses(facts.filter(mayBeStopped).map((j) => j.shipmentId), "warehouse", open);
  const jobs: ReleaseJob[] = facts.map((j) => ({ ...j, pass: approvals.passes.has(j.shipmentId) }));
  const standingOf = (id: string) => {
    const found = jobs.find((j) => j.shipmentId === id);
    return found ? releaseStanding(found) : "free";
  };
  // Not read yet (for a short while only): nothing is said of "stopped" before it is.
  const passChecking = approvals.checking;
  // The server's stops that still stand: one whose job got its approval meanwhile goes through on it.
  const stoppedShown = stopped.filter((x) => standingOf(x.shipmentId) === "stopped");
  // Said up front, never stopped here.
  const likelyStopped = passChecking ? [] : warned.filter((x) => standingOf(x.shipmentId) === "likely_stopped");
  const onApproval = jobs.filter((j) => releaseStanding(j) === "on_approval");
  const queryClient = useQueryClient();
  const notChecked = payment.items.filter((x) => x.state === "unknown").length;
  const jobOf = (id: string) => inStock.find((s) => s.id === id)?.jobNumber ?? "";
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [existing, setExisting] = useState<string>();
  const [releasing, setReleasing] = useState(false);
  // A second click before the first release has finished must not create a second truck.
  const busy = useRef(false);

  // Trucks already in use, newest reference first, each with its plate number and how
  // many shipments it carries.
  const trucks = useMemo(() => {
    const byRef = new Map<string, { count: number; plate: string }>();
    for (const s of shipments) {
      if (!s.warehouseReleasedDate || !s.warehouseTruck) continue;
      const truck = byRef.get(s.warehouseTruck) ?? { count: 0, plate: "" };
      byRef.set(s.warehouseTruck, { count: truck.count + 1, plate: truck.plate || s.plateNumber });
    }
    return [...byRef].sort((a, b) => b[0].localeCompare(a[0]));
  }, [shipments]);

  useEffect(() => {
    if (!shipmentIds) return;
    setMode("new");
    setExisting(undefined);
    setPending(shipmentIds);
    setTruckUsed(null);
    setStopped([]);
    setReason("");
  }, [shipmentIds]);

  const count = pending.length;
  const ready = truckUsed !== null || mode === "new" || !!existing;
  // Only while the first answers are on their way, and for a short while: never longer.
  const checking = payment.state === "checking";
  // After a stop a manager sends the stopped ones again with a reason; before it, the reason is up to them.
  // Neither is asked for while it is not known whether an approval stands; not read at all, a job counts as not
  // approved and the manager's own reason is the way that is left.
  const reasonShown = manager && !passChecking && (stoppedShown.length > 0 || likelyStopped.length > 0);
  const reasonOk = overrideReasonOk(reason);
  const needsReason = manager && !passChecking && stoppedShown.length > 0 && !reasonOk;

  const release = async () => {
    if (!open || pending.length === 0 || !ready || checking || passChecking || needsReason || busy.current) return;
    busy.current = true;
    setReleasing(true);
    const truck = truckUsed ?? (mode === "new" ? null : existing!);
    // The typed reason, per job: only with the jobs the stop holds (or may hold) and no approval lets through.
    const reasons = reasonShown && reasonOk ? overrideReasons(jobs, reason) : undefined;
    const { truck: used, outcome } = await onRelease(pending, truck, reasons);
    busy.current = false;
    setReleasing(false);
    // An approval a release went through on is used now, and one that was refused after all is no longer promised.
    invalidateReleaseRequests(queryClient);
    if (outcome.done) {
      onClose();
      return;
    }
    // Only what was not moved stays, for the same truck (a new one is not created twice); the moved ones are on it.
    if (used) setTruckUsed(used);
    setPending(pending.filter((id) => !outcome.moved.includes(id)));
    setStopped(outcome.stopped);
  };

  // A warning that is gone past, on a job nothing else lets through: an unpaid invoice of a customer with overdue ones.
  const warnedOnly = warned.filter((x) => standingOf(x.shipmentId) === "free");
  const okText = (() => {
    if (reasonShown && reasonOk) return "Release with a reason";
    if (stoppedShown.length > 0) return manager ? "Release with a reason" : "Try again";
    // Every job the stop holds has a manager's approval: said on the button, unless another job's warning is gone past.
    if (everyHeldOnApproval(jobs) && warnedOnly.length === 0) return RELEASE_ON_APPROVAL_LABEL;
    return warned.length > 0 ? "Release anyway" : "Release";
  })();

  return (
    <Modal
      open={open}
      title="Release from warehouse"
      okText={okText}
      cancelText={stoppedShown.length > 0 ? "Close" : "Cancel"}
      width={480}
      centered
      destroyOnHidden
      confirmLoading={releasing || checking || passChecking}
      okButtonProps={{ disabled: !ready || count === 0 || needsReason }}
      onOk={release}
      onCancel={onClose}
    >
      {truckUsed !== null ? (
        <p className="mt-0 mb-3 text-[13px] text-slate-700">
          {count} shipment{count === 1 ? "" : "s"} not released yet, to go on truck <span className="font-semibold">{truckUsed}</span>.
        </p>
      ) : (
        <>
          <p className="mt-0 mb-3 text-[13px] text-slate-700">
            Release {count} shipment{count === 1 ? "" : "s"} to a new truck, or add {count === 1 ? "it" : "them"} to an existing one?
          </p>
          <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)} className="flex flex-col gap-3 w-full">
            <div>
              <Radio value="new">New truck</Radio>
              {mode === "new" && <p className={`mt-1 mb-0 ml-6 ${HINT}`}>A new truck reference (TCZ) is created on release.</p>}
            </div>
            <div>
              <Radio value="existing" disabled={trucks.length === 0}>
                Existing truck
                {trucks.length === 0 && <span className={`ml-2 ${HINT}`}>none yet</span>}
              </Radio>
              {mode === "existing" && (
                <div className="mt-2 ml-6">
                  <Select
                    showSearch
                    placeholder="Select a truck"
                    className="w-full"
                    value={existing}
                    onChange={setExisting}
                    options={trucks.map(([ref, t]) => ({
                      value: ref,
                      label: `${ref}${t.plate ? ` \u00b7 ${t.plate}` : ""} \u00b7 ${t.count} shipment${t.count === 1 ? "" : "s"}`,
                    }))}
                  />
                </div>
              )}
            </div>
          </Radio.Group>
        </>
      )}
      {(stoppedShown.length > 0 || checking || passChecking || warned.length > 0 || notChecked > 0 || onApproval.length > 0) && (
        <div className="mt-4 flex flex-col gap-2">
          {/* What the server said of each stopped job: these were not released. */}
          {stoppedShown.map((x) => (
            <div key={x.shipmentId} className="flex flex-col gap-1.5">
              <ReleaseStopAlert message={x.stop.message} label={jobOf(x.shipmentId) || undefined} />
              <AskManagerToRelease shipmentId={x.shipmentId} what="warehouse" offer label={count > 1 ? jobOf(x.shipmentId) || undefined : undefined} />
            </div>
          ))}
          {checking && <div className={HINT}>Checking payment…</div>}
          {stoppedShown.length === 0 &&
            warned.map((x) => <ReleasePaymentWarning key={x.shipmentId} check={x.check!} label={jobOf(x.shipmentId) || undefined} />)}
          {/* Whether a manager approved a held job is being read: "stopped" is not said before it is known. */}
          {!checking && passChecking && stoppedShown.length === 0 && (
            <div className={HINT} aria-live="polite">
              {PASS_CHECKING}
            </div>
          )}
          {stoppedShown.length === 0 && likelyStopped.length > 0 && (
            <div className="text-[13px] font-medium text-red-700">
              {releaseStopNote(manager)}
              {count > 1 && ` (${likelyStopped.map((x) => jobOf(x.shipmentId) || "a shipment").join(", ")})`}
            </div>
          )}
          {/* Approved by a manager on request: not stopped. Each job's line names who approved and until when. */}
          {onApproval.length > 0 && (
            <div className="text-[13px] font-medium text-emerald-700">
              {RELEASE_ON_APPROVAL_NOTE}
              {count > 1 && ` (${onApproval.map((x) => jobOf(x.shipmentId) || "a shipment").join(", ")})`}
            </div>
          )}
          {onApproval.map((x) => (
            <AskManagerToRelease key={x.shipmentId} shipmentId={x.shipmentId} what="warehouse" label={count > 1 ? jobOf(x.shipmentId) || undefined : undefined} />
          ))}
          {/* Known before the first try: asked for from here, without being refused first. One whose requests
              could not be read says so, and is asked for all the same. */}
          {stoppedShown.length === 0 &&
            likelyStopped.map((x) => (
              <AskManagerToRelease key={x.shipmentId} shipmentId={x.shipmentId} what="warehouse" offer label={count > 1 ? jobOf(x.shipmentId) || undefined : undefined} />
            ))}
          {!checking &&
            stoppedShown.length === 0 &&
            notChecked > 0 &&
            (count > 1 ? (
              <div className={HINT}>
                Payment could not be checked for {notChecked} of {count} shipments.
              </div>
            ) : (
              <PaymentNotCheckedNote />
            ))}
        </div>
      )}
      {reasonShown && (
        <div className="mt-3">
          <OverrideReasonField value={reason} onChange={setReason} disabled={releasing} />
        </div>
      )}
    </Modal>
  );
}

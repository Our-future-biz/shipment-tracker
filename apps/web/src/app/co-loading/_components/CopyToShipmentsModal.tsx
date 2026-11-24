"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Checkbox } from "antd";
import { AppModal } from "@/components/AppModal";
import type { SailingShipmentFacts } from "@/hooks/useCoLoadingServices";
import { apiErrorMessage } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { HINT, REF, TD, TH } from "@/styles/ui";

/** A copied value as the dialog shows it: a date in the app's way, a text as it is, a dash for nothing. */
const shown = (field: string, value: string) => (!value ? "—" : field === "estimatedDeparture" || field === "closingDate" ? formatDate(value) || value : value);

/** What a copy did, in a sentence: "Copied to 3 shipments. 1 not changed: CZLCL… (why)". */
export function copyResultWords(result: { copied: number; refused: { jobNumber: string; reason: string }[] }): string {
  const copied = result.copied === 0 ? "Nothing was copied." : `Copied to ${result.copied === 1 ? "1 shipment" : `${result.copied} shipments`}.`;
  if (result.refused.length === 0) return copied;
  return `${copied} ${result.refused.length} not changed: ${result.refused.map((r) => `${r.jobNumber} (${r.reason})`).join("; ")}`;
}

// "Copy to linked shipments" (Council Outlay 14, A3): the sailing's vessel, voyage, departure (as
// ETD) and cut-off (as Closing Date) written to its shipments by hand, after seeing what each holds
// now and what it would get. Only the shipments that differ are listed to tick; one in a master job,
// a cancelled one and one that has departed are named and left alone. Each shipment is saved by its
// own rules: one that refuses is said, with why, and the others are still written.
export function CopyToShipmentsModal({
  open,
  onClose,
  sailingName,
  facts,
  onCopy,
  copying,
}: {
  open: boolean;
  onClose: () => void;
  sailingName: string;
  facts: SailingShipmentFacts[];
  onCopy: (shipmentIds: string[]) => Promise<{ copied: number; refused: { jobNumber: string; reason: string }[] }>;
  copying: boolean;
}) {
  const toChange = useMemo(() => facts.filter((f) => !f.skipped && f.changes.length > 0), [facts]);
  const skipped = facts.filter((f) => f.skipped && f.changes.length > 0);
  const [ticked, setTicked] = useState<string[]>([]);
  const [said, setSaid] = useState<{ text: string; tone: "red" | "amber" } | null>(null);
  // Every shipment that differs starts ticked: the usual case is "all of them".
  useEffect(() => {
    if (!open) return;
    setTicked(toChange.map((f) => f.shipmentId));
    setSaid(null);
    // Only opening sets this off.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const picked = toChange.filter((f) => ticked.includes(f.shipmentId));

  const handleCopy = async () => {
    try {
      const result = await onCopy(picked.map((f) => f.shipmentId));
      // All written: the dialog closes on the caller's word. A refusal stays to be read.
      if (result.refused.length === 0) onClose();
      else setSaid({ text: copyResultWords(result), tone: "amber" });
    } catch (err) {
      setSaid({ text: apiErrorMessage(err), tone: "red" });
    }
  };

  return (
    <AppModal
      open={open}
      onClose={copying ? () => undefined : onClose}
      size="large"
      title={`Copy ${sailingName} to its shipments`}
      subtitle="The vessel, the voyage, the departure as ETD and the cut-off as Closing Date. Nothing is written until you press Copy."
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={copying}>
            Close
          </Button>
          <Button type="primary" loading={copying} disabled={picked.length === 0} onClick={handleCopy}>
            {picked.length === 0 ? "Copy" : `Copy to ${picked.length === 1 ? "1 shipment" : `${picked.length} shipments`}`}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {toChange.length === 0 ? (
          <p className="m-0 text-[13px] text-slate-700" role="status">
            Every shipment already has what this sailing gives. A week is not copied as a vessel, and a date the sailing does not have is not copied either.
          </p>
        ) : (
          <div className="max-h-[50vh] overflow-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={`${TH} w-10`}>
                    <Checkbox
                      aria-label="Tick all shipments"
                      checked={picked.length === toChange.length}
                      indeterminate={picked.length > 0 && picked.length < toChange.length}
                      onChange={(e) => setTicked(e.target.checked ? toChange.map((f) => f.shipmentId) : [])}
                    />
                  </th>
                  <th className={TH}>Shipment</th>
                  <th className={TH}>Field</th>
                  <th className={TH}>Now</th>
                  <th className={TH}>Becomes</th>
                </tr>
              </thead>
              <tbody>
                {toChange.flatMap((f) =>
                  f.changes.map((c, i) => (
                    <tr key={`${f.shipmentId}-${c.field}`}>
                      {i === 0 && (
                        <>
                          <td className={TD} rowSpan={f.changes.length}>
                            <Checkbox
                              aria-label={`Tick ${f.jobNumber}`}
                              checked={ticked.includes(f.shipmentId)}
                              onChange={(e) => setTicked((prev) => (e.target.checked ? [...prev, f.shipmentId] : prev.filter((id) => id !== f.shipmentId)))}
                            />
                          </td>
                          <td className={`${TD} ${REF} font-semibold align-top`} rowSpan={f.changes.length}>
                            {f.jobNumber}
                          </td>
                        </>
                      )}
                      <td className={TD}>{c.label}</td>
                      {/* A value that would be overwritten stands out; an empty one is only filled in. */}
                      <td className={`${TD} ${c.old ? "font-medium text-amber-700" : "text-slate-400"}`}>{shown(c.field, c.old)}</td>
                      <td className={`${TD} font-medium`}>{shown(c.field, c.next)}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        )}
        {toChange.some((f) => f.changes.some((c) => c.old)) && <p className={`${HINT} m-0`}>A value in amber is on the shipment now and would be replaced.</p>}
        {skipped.length > 0 && (
          <p className={`${HINT} m-0`}>
            Left alone: {skipped.map((f) => `${f.jobNumber} (${f.skipped!.replace(/\.$/, "").toLowerCase()})`).join(", ")}.
          </p>
        )}
        {said && (
          <p className={`m-0 text-[13px] ${said.tone === "red" ? "text-red-600" : "text-amber-800"}`} role="alert">
            {said.text}
          </p>
        )}
      </div>
    </AppModal>
  );
}

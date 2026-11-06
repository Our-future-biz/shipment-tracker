"use client";

import { useState } from "react";
import { Alert, Button, Checkbox, Input } from "antd";
import { AppModal } from "@/components/AppModal";
import type { ShipmentItem } from "@/hooks/useShipments";
import { readTrackingNotice, useTrackingActions, type TrackingReadFact, type TrackingReadingPreview } from "@/hooks/useShipmentTracking";
import { apiErrorMessage } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { fileToBase64, formatFileSize } from "@/lib/files";
import { BTN_GHOST, BTN_SM, EMPTY_STATE, HINT, LABEL_TEXT } from "@/styles/ui";
import { readFactWords } from "./trackingText";

const MAX_TEXT = 6000;
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp";

const canKeep = (fact: TrackingReadFact) => !fact.alreadyKept && !fact.refusal;

/**
 * A carrier's or terminal's notice, pasted or uploaded: read, then looked over, and only what a person
 * ticks is kept. ATA and ATD stay proposals until someone confirms them under Events.
 */
export function ReadNoticeModal({ shipment, onClose }: { shipment: ShipmentItem; onClose: () => void }) {
  const { keepReading } = useTrackingActions(shipment.id);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  const [read, setRead] = useState<TrackingReadingPreview | null>(null);
  const [ticked, setTicked] = useState<ReadonlySet<number>>(new Set());
  const [keepVessel, setKeepVessel] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startReading = async () => {
    setError(null);
    setReading(true);
    try {
      const source = file ? { fileBase64: await fileToBase64(file), fileName: file.name } : { text: text.trim() };
      const preview = await readTrackingNotice(shipment.id, source);
      setRead(preview);
      // The notice of another job is looked at first, not kept by a click.
      setTicked(preview.otherShipment ? new Set() : new Set(preview.facts.flatMap((f, i) => (canKeep(f) ? [i] : []))));
      setKeepVessel(!preview.otherShipment && !!preview.vesselChange);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setReading(false);
    }
  };

  const keep = async () => {
    if (!read) return;
    setError(null);
    try {
      await keepReading.mutateAsync({
        facts: read.facts.filter((_, i) => ticked.has(i)),
        file: file ? { fileName: file.name, fileType: file.type, contentBase64: await fileToBase64(file) } : undefined,
        vesselChange: keepVessel && read.vesselChange ? read.vesselChange : undefined,
      });
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  };

  const toggle = (i: number, on: boolean) =>
    setTicked((was) => {
      const next = new Set(was);
      if (on) next.add(i);
      else next.delete(i);
      return next;
    });

  const kept = ticked.size + (keepVessel ? 1 : 0);
  const footer = read ? (
    <div className="flex justify-between gap-2">
      <Button onClick={() => setRead(null)}>Read another</Button>
      <div className="flex gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button type="primary" loading={keepReading.isPending} disabled={kept === 0} onClick={keep}>
          Keep {kept === 1 ? "1 fact" : `${kept} facts`}
        </Button>
      </div>
    </div>
  ) : (
    <div className="flex justify-end gap-2">
      <Button onClick={onClose}>Cancel</Button>
      <Button type="primary" loading={reading} disabled={!file && !text.trim()} onClick={startReading}>
        Read
      </Button>
    </div>
  );

  return (
    <AppModal open onClose={onClose} title="Read a notice" subtitle={shipment.jobNumber ?? undefined} footer={footer}>
      <div className="space-y-3">
        {error && <Alert type="error" showIcon message={error} />}
        {!read ? (
          <>
            <p className={`${HINT} m-0`}>An arrival notice, a delay or schedule change, a terminal&apos;s or airline&apos;s message. Nothing is kept until you have looked it over.</p>
            <div>
              <label htmlFor="notice-text" className={LABEL_TEXT}>Paste the message</label>
              <Input.TextArea id="notice-text" className="mt-1" rows={7} maxLength={MAX_TEXT} disabled={!!file} value={text} onChange={(e) => setText(e.target.value)} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className={`${BTN_GHOST} ${BTN_SM} cursor-pointer`}>
                {file ? "Choose another file" : "Or upload a file"}
                <input
                  type="file"
                  accept={ACCEPT}
                  className="sr-only"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
              </label>
              {file && (
                <span className={HINT}>
                  {file.name} · {formatFileSize(file.size)} ·{" "}
                  <button type="button" onClick={() => setFile(null)} className="cursor-pointer bg-transparent border-none p-0 underline text-[12px] text-slate-500">
                    Remove
                  </button>
                </span>
              )}
            </div>
          </>
        ) : read.facts.length === 0 && !read.vesselChange ? (
          <p className={EMPTY_STATE}>No dated facts found in this notice.</p>
        ) : (
          <>
            {read.otherShipment && (
              <Alert
                type="warning"
                showIcon
                message={`This notice names ${read.containersFound.join(", ")}, and none of these is on ${shipment.jobNumber}. Is it the right job? Nothing is ticked.`}
              />
            )}
            <ul className="m-0 p-0 list-none divide-y divide-slate-100">
              {read.vesselChange && (
                <li className="py-2">
                  <Checkbox checked={keepVessel} onChange={(e) => setKeepVessel(e.target.checked)}>
                    <span className="font-medium text-slate-900">{[read.vesselChange.vessel, read.vesselChange.voyage].filter(Boolean).join(" ")}</span>
                  </Checkbox>
                  <div className="ml-6 text-[12px] text-slate-500">
                    {shipment.vessel ? `Replaces ${[shipment.vessel, shipment.voyage].filter(Boolean).join(" ")}` : "Sets the vessel and voyage"}
                  </div>
                </li>
              )}
              {read.facts.map((fact, i) => (
                <li key={`${fact.kind}:${fact.occurredOn}:${fact.note}`} className="py-2">
                  <Checkbox checked={ticked.has(i)} disabled={!canKeep(fact)} onChange={(e) => toggle(i, e.target.checked)}>
                    <span className="font-medium text-slate-900">{fact.label}</span>
                    <span className="ml-2 tabular-nums text-slate-700">{formatDate(fact.occurredOn)}</span>
                  </Checkbox>
                  <div className={`${HINT} ml-6`}>{[fact.place, fact.vessel, fact.note].filter(Boolean).join(" · ")}</div>
                  <div className={`ml-6 text-[12px] ${fact.refusal ? "text-amber-700" : "text-slate-500"}`}>{readFactWords(fact)}</div>
                </li>
              ))}
            </ul>
            {file && <p className={`${HINT} m-0`}>{file.name} goes into Documents as a Carrier notice.</p>}
          </>
        )}
      </div>
    </AppModal>
  );
}

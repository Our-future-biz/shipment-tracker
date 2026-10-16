"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Checkbox, Input, InputNumber, Modal } from "antd";
import { DashboardOutlined } from "@ant-design/icons";
import { useGateFiles, useGateMovement, type GateFile, type GateMovement } from "@/hooks/useGateLog";
import { useToast } from "@/lib/toast";
import { formatDateTime } from "@/lib/date";
import type { interfaces } from "@/lib/api/client";
import { TERMS } from "@/app/warehouse-concept/_lib/glossary";
import { pctText } from "@/app/warehouse-concept/_lib/cargoCompare";
import { fileToBase64 } from "@/lib/files";
import { Badge, errorMessage, nf } from "../../_lib/gate";
import { FileLink } from "./ExceptionsPanel";
import { btnDefault, btnInline, btnPrimary, Section } from "./fields";

// Re-weighing ("VGM" as the warehouse uses the word): every LCL shipment is weighed on receipt —
// inbound cargo before its Receipt stamp, import cargo before its house is ticked off at the
// stripping tally. Weighed gross kg, who and when, an optional scale photo (gate files) and a note;
// compared with the declared weight (more than 5 % off is a variance). A correction is a new
// re-weigh: the history stays and the latest counts. FCL cargo is not re-weighed here.

type Reweigh = interfaces.GateReweighItem;
const MAX_KG = 100_000;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const isImage = (f: GateFile) => /^image\//.test(f.fileType) || /\.(jpe?g|png|gif|webp|tiff?)$/i.test(f.fileName);

/** "1 234.5 kg" */
export const kgText = (kg: number) => `${nf(kg, kg % 1 ? 1 : 0)} kg`;

/** "1 234 kg · declared 1 180 kg · +4.6 %" */
export function reweighLine(r: Reweigh): string {
  return [kgText(r.weighedKg), r.declaredKg ? `declared ${kgText(r.declaredKg)}${r.declaredSource === "gate" ? " (gate)" : ""}` : "", pctText(r.variancePct)]
    .filter(Boolean)
    .join(" · ");
}

/** The re-weigh tag: green within tolerance, amber as a variance, grey when not compared. */
export function ReweighTag({ r }: { r: Pick<Reweigh, "weighedKg" | "variancePct" | "flagged"> }) {
  return (
    <Badge tone={r.flagged ? "a" : r.variancePct == null ? "" : "g"} title={r.flagged ? "More than 5 % off the declared weight" : undefined}>
      Re-weighed {kgText(r.weighedKg)}
      {r.variancePct != null ? ` · ${pctText(r.variancePct)}` : ""}
      {r.flagged ? " · variance" : ""}
    </Badge>
  );
}

/** The gate job's re-weigh card: the weighing that counts, its history and "Re-weigh". */
export function ReweighSection({ m, informHref }: { m: GateMovement; /** Shipment Details, where Operations are informed of a variance. */ informHref?: string }) {
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const { files } = useGateFiles(m.id);
  const byId = new Map(files.map((f) => [f.id, f]));
  const r = m.reweigh;
  const left = !!m.impRelease || !!m.leftAt;
  if (!m.needsReweigh && !r) return null;
  const due = m.needsReweigh && !r;

  return (
    <Section
      title={TERMS.reweigh}
      icon={<DashboardOutlined />}
      extra={due ? <Badge tone="r">Required before the {m.visit === "výdej" ? "tick-off" : TERMS.receipt.toLowerCase()}</Badge> : r ? <ReweighTag r={r} /> : undefined}
    >
      {r ? (
        <div className="text-xs">
          <div className="font-semibold text-slate-900">{reweighLine(r)}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {formatDateTime(r.weighedAt)}
            {r.weighedBy ? ` · ${r.weighedBy}` : ""}
            {r.note ? ` — ${r.note}` : ""}
          </div>
          {r.fileIds.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-x-3">
              {r.fileIds.map((id) => byId.get(id)).map((f, i) => (f ? <FileLink key={f.id} movementId={m.id} file={f} /> : <span key={i} className="text-[11px] text-slate-400">photo no longer stored</span>))}
            </div>
          )}
          {r.flagged && (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 flex flex-wrap items-center gap-2">
              <span>More than 5 % off the declared weight.</span>
              {informHref && (
                <Link href={informHref} className={btnInline}>
                  Inform Operations
                </Link>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="text-xs text-slate-500">
          LCL cargo is re-weighed on receipt —{" "}
          {m.visit === "výdej" ? "before its house is ticked off at the stripping tally." : `before the ${TERMS.receipt} stamp.`}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!m.archivedAt && !left && (
          <button type="button" className={due ? btnPrimary : btnDefault} onClick={() => setOpen(true)}>
            {r ? "Re-weigh again" : "Re-weigh"}
          </button>
        )}
        {m.reweighs.length > 1 && (
          <button type="button" className={btnInline} onClick={() => setShowHistory(!showHistory)} aria-expanded={showHistory}>
            {showHistory ? "Hide history" : `History (${m.reweighs.length})`}
          </button>
        )}
      </div>
      {showHistory && (
        <ul className="list-none m-0 mt-2 p-0 text-[11px] text-slate-600">
          {m.reweighs.map((x, i) => (
            <li key={x.id} className={`py-1 border-b border-slate-100 last:border-b-0 ${i > 0 ? "text-slate-400" : ""}`}>
              <span className="font-mono">{formatDateTime(x.weighedAt)}</span> · {reweighLine(x)}
              {x.weighedBy ? ` · ${x.weighedBy}` : ""}
              {x.note ? ` — ${x.note}` : ""}
              {i === 0 ? " (counts)" : ""}
            </li>
          ))}
        </ul>
      )}
      <ReweighModal open={open} movementId={m.id} label={m.positionRef || m.gateRef} declaredKg={m.weightKg} onClose={() => setOpen(false)} />
    </Section>
  );
}

/**
 * Records a re-weigh of one position (the gate job, the container page): weighed kg, a note and
 * scale photos — chosen from the position's gate files or uploaded here.
 */
export function ReweighModal({
  open,
  movementId,
  label,
  declaredKg,
  onClose,
  onDone,
}: {
  open: boolean;
  movementId: string;
  label: string;
  /** Shown as a hint only; the server compares with the shipment's declared weight. */
  declaredKg?: number | null;
  onClose: () => void;
  onDone?: (res: { movement: GateMovement; notice: string }) => void;
}) {
  const toast = useToast();
  const { reweigh } = useGateMovement(open ? movementId : undefined);
  const { files, upload } = useGateFiles(movementId);
  const [kg, setKg] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [fileIds, setFileIds] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    setKg(null);
    setNote("");
    setFileIds([]);
  }, [open]);
  const valid = kg != null && Number.isFinite(kg) && kg > 0 && kg <= MAX_KG;
  const photos = files.filter(isImage);

  const submit = async () => {
    if (!valid) return;
    try {
      const res = await reweigh.mutateAsync({ weighedKg: kg!, note: note.trim(), fileIds });
      if (res.notice) toast.notify({ type: /variance|5 %/.test(res.notice) ? "warning" : "info", title: `Re-weighed ${kgText(kg!)}`, description: res.notice });
      else toast.success(`Re-weighed ${kgText(kg!)} — logged on the position`);
      onDone?.(res);
      onClose();
    } catch (e) {
      toast.error(errorMessage(e, "Failed to record the re-weigh"));
    }
  };

  return (
    <Modal
      open={open}
      title={`Re-weigh ${label}`}
      okText="Record re-weigh"
      okButtonProps={{ disabled: !valid }}
      confirmLoading={reweigh.isPending}
      onCancel={onClose}
      onOk={submit}
      destroyOnHidden
      width={520}
    >
      <p className="text-xs text-slate-500 mt-0">
        The weighed gross weight of the whole position. It is compared with the shipment&rsquo;s declared weight (more than 5 % off is a variance). A correction is a new
        re-weigh: the history is kept and the latest counts.
      </p>
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Weighed gross kg</span>
        <InputNumber
          autoFocus
          min={0}
          max={MAX_KG}
          step={0.1}
          precision={1}
          value={kg}
          onChange={(v) => setKg(v == null ? null : Number(v))}
          onPressEnter={submit}
          suffix="kg"
          className="!w-full"
          placeholder={declaredKg ? `gate figure ${nf(declaredKg)} kg` : undefined}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs mt-3">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Note</span>
        <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={2000} value={note} placeholder="Scale, pallets weighed…" onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="mt-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Scale photo ({fileIds.length} chosen)</span>
          <button type="button" className={`${btnInline} ml-auto`} disabled={upload.isPending} onClick={() => input.current?.click()}>
            {upload.isPending ? "Uploading…" : "Upload photo"}
          </button>
          <input
            ref={input}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              if (file.size > MAX_UPLOAD_BYTES) return toast.error(`${file.name} is larger than 25 MB`);
              try {
                const res = await upload.mutateAsync({ fileName: file.name, fileType: file.type || "image/jpeg", contentBase64: await fileToBase64(file), tag: "Scale" });
                setFileIds((ids) => [...ids, res.file.id].slice(0, 20));
              } catch (err) {
                toast.error(errorMessage(err, `Failed to upload ${file.name}`));
              }
            }}
          />
        </div>
        {photos.length === 0 ? (
          <div className="text-xs text-slate-400">No photos on this position yet.</div>
        ) : (
          <Checkbox.Group value={fileIds} onChange={(v) => setFileIds((v as string[]).slice(0, 20))} className="!flex !flex-col max-h-[160px] overflow-y-auto">
            {photos.map((f) => (
              <Checkbox key={f.id} value={f.id} className="!text-xs">
                {f.tag ? `${f.tag} · ` : ""}
                {f.fileName}
              </Checkbox>
            ))}
          </Checkbox.Group>
        )}
      </div>
    </Modal>
  );
}

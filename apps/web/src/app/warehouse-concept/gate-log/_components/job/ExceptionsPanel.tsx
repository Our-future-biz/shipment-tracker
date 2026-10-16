"use client";

import { useEffect, useRef, useState } from "react";
import { Checkbox, Input, InputNumber, Modal, Select } from "antd";
import { WarningOutlined } from "@ant-design/icons";
import { useGateFiles, useGateFileUrl, useGateMovement, type GateException, type GateFile, type GateMovement } from "@/hooks/useGateLog";
import { useToast } from "@/lib/toast";
import { formatDateTime } from "@/lib/date";
import { Badge, errorMessage, surveyPhaseKey } from "../../_lib/gate";
import { btnDefault, btnInline, Section } from "./fields";

// Damage / short / over (OS&D) exceptions of a movement. Recorded from a survey or by hand (type,
// pieces, a note, photos of this movement); while one is open the cargo is ON HOLD — the release
// gate "No open exceptions" is Blocked and the WH release is refused, unless a supervisor
// overrides (the override wins). Any user resolves an exception with a note; who and when are logged.

/** Must match the API's EXCEPTION_GATE (apps/api/services/warehouse/services/osd.ts). */
export const EXCEPTION_GATE = "No open exceptions";
export const EXCEPTION_TYPES = ["Damaged", "Short", "Over"] as const;
const TYPE_TONE = { Damaged: "r", Short: "a", Over: "b" } as const;

export type ExceptionPrefill = { type: string; pieces: number; container: string; surveyPhase: string };

const isImage = (f: GateFile) => /^image\//.test(f.fileType) || /\.(jpe?g|png|gif|webp|tiff?)$/i.test(f.fileName);

/** Opens one stored photo / document of the movement in a new tab. */
export function FileLink({ movementId, file }: { movementId: string; file: GateFile }) {
  const [want, setWant] = useState(false);
  const { data: url } = useGateFileUrl(movementId, file, want);
  const pending = useRef(false);
  useEffect(() => {
    if (url && pending.current) {
      pending.current = false;
      window.open(url, "_blank", "noopener");
    }
  }, [url]);
  return (
    <button
      type="button"
      className="text-[11px] text-indigo-500 hover:underline bg-transparent border-none p-0 cursor-pointer max-w-[180px] truncate"
      title={`Open ${file.fileName}`}
      onClick={() => {
        if (url) window.open(url, "_blank", "noopener");
        else {
          pending.current = true;
          setWant(true);
        }
      }}
    >
      {file.tag ? `${file.tag} · ` : ""}
      {file.fileName}
    </button>
  );
}

/** The exceptions, open first; `onResolve` adds the "Resolve…" button (none = read-only). */
export function ExceptionList({ m, onResolve }: { m: GateMovement; onResolve?: (e: GateException) => void }) {
  const { files } = useGateFiles(m.id);
  const byId = new Map(files.map((f) => [f.id, f]));
  const list = [...m.exceptions].sort((a, b) => (a.status === b.status ? b.createdAt.localeCompare(a.createdAt) : a.status === "open" ? -1 : 1));
  if (!list.length) return <div className="text-xs text-slate-400">No damage, short or over recorded.</div>;
  return (
    <ul className="list-none m-0 p-0">
      {list.map((e) => {
        const open = e.status === "open";
        const photos = e.fileIds.map((id) => byId.get(id)).filter((f): f is GateFile => !!f);
        return (
          <li key={e.id} className="py-2 border-b border-slate-100 last:border-b-0 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={TYPE_TONE[e.type as keyof typeof TYPE_TONE] ?? ""}>{e.type}</Badge>
              <span className="font-semibold text-slate-800 tabular-nums">
                {e.pieces} pc{e.pieces === 1 ? "" : "s"}
              </span>
              {e.container && <span className="font-mono text-slate-500">{e.container}</span>}
              <Badge tone={open ? "r" : "g"}>{open ? "Open — on hold" : "Resolved"}</Badge>
              {open && onResolve && (
                <button type="button" className={`${btnInline} ml-auto`} onClick={() => onResolve(e)}>
                  Resolve…
                </button>
              )}
            </div>
            {e.note && <div className="mt-1 text-slate-700 whitespace-pre-wrap break-words">{e.note}</div>}
            <div className="mt-0.5 text-[11px] text-slate-400">
              {e.source === "survey" ? `From the ${e.surveyPhase ? `${surveyPhaseKey(e.surveyPhase)} ` : ""}survey` : e.source === "tally" ? "Found at the stripping tally" : "Recorded by hand"} · {formatDateTime(e.createdAt)}
              {e.createdBy ? ` · ${e.createdBy}` : ""}
            </div>
            {photos.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                {photos.map((f) => (
                  <FileLink key={f.id} movementId={m.id} file={f} />
                ))}
              </div>
            )}
            {e.fileIds.length > photos.length && (
              <div className="text-[11px] text-slate-400">{e.fileIds.length - photos.length} photo(s) no longer stored</div>
            )}
            {!open && (
              <div className="mt-1 rounded bg-emerald-50 px-2 py-1 text-[11px] text-emerald-800">
                Resolved {e.resolvedAt ? formatDateTime(e.resolvedAt) : ""}
                {e.resolvedBy ? ` by ${e.resolvedBy}` : ""}
                {e.resolutionNote ? ` — ${e.resolutionNote}` : ""}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The exceptions card of the gate job: list, "Record exception" and "Resolve…". With `survey`, it
 * offers to record what the survey found (damaged → Damaged, lost → Short) for that container
 * and pass.
 */
export function ExceptionsPanel({
  m,
  survey,
}: {
  m: GateMovement;
  survey?: { container: string; phase: string; damaged: number; lost: number };
}) {
  const toast = useToast();
  const { createException, resolveException } = useGateMovement(m.id);
  const [prefill, setPrefill] = useState<ExceptionPrefill | null>(null);
  const [resolving, setResolving] = useState<GateException | null>(null);
  const openCount = m.exceptions.filter((e) => e.status === "open").length;

  // Survey findings not yet recorded as an exception of the same container, pass and type.
  const recorded = (type: string) =>
    !!survey && m.exceptions.some((e) => e.type === type && e.container === survey.container && e.source === "survey" && surveyPhaseKey(e.surveyPhase) === surveyPhaseKey(survey.phase));
  const offers = survey
    ? [
        ...(survey.damaged > 0 && !recorded("Damaged") ? [{ type: "Damaged", pieces: survey.damaged }] : []),
        ...(survey.lost > 0 && !recorded("Short") ? [{ type: "Short", pieces: survey.lost }] : []),
      ]
    : [];

  return (
    <Section
      title="Damage / short / over"
      icon={<WarningOutlined />}
      extra={openCount > 0 ? <Badge tone="r">On hold — {openCount} open</Badge> : m.exceptions.length ? <Badge tone="g">None open</Badge> : undefined}
    >
      {offers.length > 0 && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex flex-wrap items-center gap-2">
          <span>This survey found:</span>
          {offers.map((o) => (
            <button
              key={o.type}
              type="button"
              className={btnInline}
              onClick={() => setPrefill({ type: o.type, pieces: o.pieces, container: survey!.container, surveyPhase: survey!.phase })}
            >
              Record {o.type.toLowerCase()} — {o.pieces} pc{o.pieces === 1 ? "" : "s"}
            </button>
          ))}
        </div>
      )}
      <ExceptionList m={m} onResolve={m.archivedAt ? undefined : setResolving} />
      {!m.archivedAt && (
        <div className="mt-3">
          <button type="button" className={btnDefault} onClick={() => setPrefill({ type: "Damaged", pieces: 1, container: survey?.container ?? "", surveyPhase: "" })}>
            Record exception
          </button>
        </div>
      )}

      <CreateExceptionModal
        m={m}
        prefill={prefill}
        saving={createException.isPending}
        onClose={() => setPrefill(null)}
        onSubmit={(input) =>
          createException
            .mutateAsync(input)
            .then(() => toast.success(`${input.type} recorded — the cargo is on hold until it is resolved`))
            .catch((e) => {
              toast.error(errorMessage(e, "Failed to record the exception"));
              throw e;
            })
        }
      />
      <ResolveModal
        exception={resolving}
        saving={resolveException.isPending}
        onClose={() => setResolving(null)}
        onSubmit={(note) =>
          resolveException
            .mutateAsync({ exceptionId: resolving!.id, note })
            .then((res) => toast.success(res.movement.openExceptions ? "Resolved — other exceptions are still open" : "Resolved — the hold is cleared"))
            .catch((e) => {
              toast.error(errorMessage(e, "Failed to resolve the exception"));
              throw e;
            })
        }
      />
    </Section>
  );
}

function CreateExceptionModal({
  m,
  prefill,
  saving,
  onClose,
  onSubmit,
}: {
  m: GateMovement;
  prefill: ExceptionPrefill | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (input: { type: string; pieces: number; note: string; container: string; surveyPhase: string; source: string; fileIds: string[] }) => Promise<unknown>;
}) {
  const { files } = useGateFiles(m.id);
  const [type, setType] = useState("Damaged");
  const [pieces, setPieces] = useState<number | null>(1);
  const [note, setNote] = useState("");
  const [container, setContainer] = useState("");
  const [fileIds, setFileIds] = useState<string[]>([]);
  useEffect(() => {
    if (!prefill) return;
    setType(prefill.type);
    setPieces(prefill.pieces);
    setContainer(prefill.container);
    setNote("");
    setFileIds([]);
  }, [prefill]);

  // Photos of this movement, those of the chosen container first.
  const photos = [...files].sort((a, b) => Number(b.container === container) - Number(a.container === container) || Number(isImage(b)) - Number(isImage(a)));
  const valid = !!type && (pieces ?? 0) >= 1 && Number.isInteger(pieces);

  return (
    <Modal
      open={!!prefill}
      title={prefill?.surveyPhase ? "Record exception from the survey" : "Record exception"}
      okText="Record — cargo on hold"
      okButtonProps={{ danger: true, disabled: !valid }}
      confirmLoading={saving}
      onCancel={onClose}
      onOk={() =>
        onSubmit({
          type,
          pieces: pieces ?? 0,
          note: note.trim(),
          container,
          surveyPhase: prefill?.surveyPhase ?? "",
          source: prefill?.surveyPhase ? "survey" : "manual",
          fileIds,
        })
          .then(onClose)
          .catch(() => undefined)
      }
      destroyOnHidden
      width={560}
    >
      <p className="text-xs text-slate-500 mt-0">
        While it is open the cargo is on hold: the release gate &ldquo;{EXCEPTION_GATE}&rdquo; is Blocked and the WH release is refused until someone resolves it with a
        note.
      </p>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Type</span>
          <Select value={type} onChange={setType} options={EXCEPTION_TYPES.map((t) => ({ value: t, label: t }))} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Pieces</span>
          <InputNumber min={1} precision={0} value={pieces} onChange={(v) => setPieces(v == null ? null : Number(v))} suffix="pcs" className="!w-full" />
        </label>
        {m.containers.length > 0 && (
          <label className="flex flex-col gap-1 col-span-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Container</span>
            <Select
              value={container}
              onChange={setContainer}
              options={[{ value: "", label: "Position level" }, ...m.containers.map((c) => ({ value: c.number, label: c.number }))]}
            />
          </label>
        )}
        <label className="flex flex-col gap-1 col-span-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Note</span>
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} value={note} placeholder="What was found…" onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      <div className="mt-3">
        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">Photos of this movement ({fileIds.length} chosen)</div>
        {photos.length === 0 ? (
          <div className="text-xs text-slate-400">No photos yet — add them in the Survey tab, then record the exception.</div>
        ) : (
          <Checkbox.Group value={fileIds} onChange={(v) => setFileIds((v as string[]).slice(0, 20))} className="!flex !flex-col max-h-[180px] overflow-y-auto">
            {photos.map((f) => (
              <Checkbox key={f.id} value={f.id} className="!text-xs">
                {f.tag ? `${f.tag} · ` : ""}
                {f.fileName}
                {f.container ? <span className="text-slate-400"> · {f.container}</span> : null}
              </Checkbox>
            ))}
          </Checkbox.Group>
        )}
      </div>
    </Modal>
  );
}

function ResolveModal({
  exception,
  saving,
  onClose,
  onSubmit,
}: {
  exception: GateException | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (note: string) => Promise<unknown>;
}) {
  const [note, setNote] = useState("");
  const close = () => {
    setNote("");
    onClose();
  };
  return (
    <Modal
      open={!!exception}
      title={`Resolve ${exception?.type.toLowerCase() ?? ""} — ${exception?.pieces ?? 0} pcs`}
      okText="Resolve"
      okButtonProps={{ disabled: !note.trim() }}
      confirmLoading={saving}
      onCancel={close}
      onOk={() =>
        onSubmit(note.trim())
          .then(close)
          .catch(() => undefined)
      }
      destroyOnHidden
    >
      <p className="text-xs text-slate-500 mt-0">How was it settled? The note, who and when are logged. When no exception is left open, the hold is cleared.</p>
      <Input.TextArea autoFocus autoSize={{ minRows: 3, maxRows: 6 }} placeholder="Resolution note (required)" value={note} onChange={(e) => setNote(e.target.value)} />
    </Modal>
  );
}

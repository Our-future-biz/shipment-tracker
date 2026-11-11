"use client";

import { useEffect, useState } from "react";
import { Checkbox, Input, InputNumber, Modal, Select } from "antd";
import { WarningOutlined } from "@ant-design/icons";
import { useGateFilePreview, useGateFiles, useGateMovement, type GateException, type GateFile, type GateMovement } from "@/hooks/useGateLog";
import { useToast } from "@/lib/toast";
import { formatDateTime } from "@/lib/date";
import { Badge, errorMessage, surveyPhaseKey } from "../../_lib/gate";
import { btnDefault, btnInline, Section } from "./fields";
import { HINT, LABEL_TEXT, LINK, REF } from "@/styles/ui";

// Damage / short / over (OS&D) exceptions of a movement. Recorded from a survey or by hand (type,
// pieces, a note, photos of this movement); while one is open the cargo is ON HOLD — the release
// gate "No open exceptions" is Blocked and the WH release is refused, unless a supervisor
// overrides (the override wins). Any user resolves an exception with a note; who and when are logged.

/** Must match the API's EXCEPTION_GATE (apps/api/services/warehouseConcept/services/osd.ts). */
export const EXCEPTION_GATE = "No open exceptions";
export const EXCEPTION_TYPES = ["Damaged", "Short", "Over"] as const;
const TYPE_TONE = { Damaged: "r", Short: "a", Over: "b" } as const;

export type ExceptionPrefill = { type: string; pieces: number; container: string; surveyPhase: string };

const isImage = (f: GateFile) => /^image\//.test(f.fileType) || /\.(jpe?g|png|gif|webp|tiff?)$/i.test(f.fileName);

/** One stored photo / document of the movement by name; a click shows it in the app's preview (useGateFilePreview). */
export function FileLink({ file, onOpen }: { file: GateFile; onOpen: () => void }) {
  return (
    <button
      type="button"
      className={`${LINK} text-[12px] bg-transparent border-0 p-0 cursor-pointer text-left max-w-[180px] truncate`}
      title={`Preview ${file.fileName}`}
      onClick={onOpen}
    >
      {file.tag ? `${file.tag} · ` : ""}
      {file.fileName}
    </button>
  );
}

/** The exceptions, open first; `onResolve` adds the "Resolve…" button (none = read-only). */
export function ExceptionList({ m, onResolve }: { m: GateMovement; onResolve?: (e: GateException) => void }) {
  const { files } = useGateFiles(m.id);
  const preview = useGateFilePreview();
  const byId = new Map(files.map((f) => [f.id, f]));
  const list = [...m.exceptions].sort((a, b) => (a.status === b.status ? b.createdAt.localeCompare(a.createdAt) : a.status === "open" ? -1 : 1));
  if (!list.length) return <div className={HINT}>No damage, short or over recorded.</div>;
  return (
    <>
      {preview.modal}
      <ul className="list-none m-0 p-0">
        {list.map((e) => {
          const open = e.status === "open";
          const photos = e.fileIds.map((id) => byId.get(id)).filter((f): f is GateFile => !!f);
          return (
            <li key={e.id} className="py-2 border-b border-slate-100 last:border-b-0 text-[13px]">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={TYPE_TONE[e.type as keyof typeof TYPE_TONE] ?? ""}>{e.type}</Badge>
                <span className="font-semibold text-slate-900 tabular-nums">
                  {e.pieces} pc{e.pieces === 1 ? "" : "s"}
                </span>
                {e.container && <span className={`${REF} text-slate-500`}>{e.container}</span>}
                <Badge tone={open ? "r" : "g"}>{open ? "Open — on hold" : "Resolved"}</Badge>
                {open && onResolve && (
                  <button type="button" className={`${btnInline} ml-auto`} onClick={() => onResolve(e)}>
                    Resolve…
                  </button>
                )}
              </div>
              {e.note && <div className="mt-1 text-slate-700 whitespace-pre-wrap break-words">{e.note}</div>}
              <div className={`mt-0.5 ${HINT}`}>
                {e.source === "survey" ? `From the ${e.surveyPhase ? `${surveyPhaseKey(e.surveyPhase)} ` : ""}survey` : e.source === "tally" ? "Found at the stripping tally" : "Recorded by hand"} · {formatDateTime(e.createdAt)}
                {e.createdBy ? ` · ${e.createdBy}` : ""}
              </div>
              {photos.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                  {photos.map((f) => (
                    <FileLink key={f.id} file={f} onOpen={() => preview.open(f)} />
                  ))}
                </div>
              )}
              {e.fileIds.length > photos.length && (
                <div className={HINT}>{e.fileIds.length - photos.length} photo(s) no longer stored</div>
              )}
              {!open && (
                <div className="mt-1 rounded-lg bg-emerald-50 px-2 py-1 text-[12px] text-emerald-700">
                  Resolved {e.resolvedAt ? formatDateTime(e.resolvedAt) : ""}
                  {e.resolvedBy ? ` by ${e.resolvedBy}` : ""}
                  {e.resolutionNote ? ` — ${e.resolutionNote}` : ""}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
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
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-700 flex flex-wrap items-center gap-2">
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
      <p className={`${HINT} mt-0`}>
        While it is open the cargo is on hold: the release gate &ldquo;{EXCEPTION_GATE}&rdquo; is Blocked and the WH release is refused until someone resolves it with a
        note.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className={LABEL_TEXT}>Type</span>
          <Select value={type} onChange={setType} options={EXCEPTION_TYPES.map((t) => ({ value: t, label: t }))} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL_TEXT}>Pieces</span>
          <InputNumber min={1} precision={0} value={pieces} onChange={(v) => setPieces(v == null ? null : Number(v))} suffix="pcs" className="!w-full" />
        </label>
        {m.containers.length > 0 && (
          <label className="flex flex-col gap-1 col-span-2">
            <span className={LABEL_TEXT}>Container</span>
            <Select
              value={container}
              onChange={setContainer}
              options={[{ value: "", label: "Position level" }, ...m.containers.map((c) => ({ value: c.number, label: c.number }))]}
            />
          </label>
        )}
        <label className="flex flex-col gap-1 col-span-2">
          <span className={LABEL_TEXT}>Note</span>
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} value={note} placeholder="What was found…" onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      <div className="mt-3">
        <div className={`${LABEL_TEXT} mb-1`}>Photos of this movement ({fileIds.length} chosen)</div>
        {photos.length === 0 ? (
          <div className={HINT}>No photos yet — add them in the Survey tab, then record the exception.</div>
        ) : (
          <Checkbox.Group value={fileIds} onChange={(v) => setFileIds((v as string[]).slice(0, 20))} className="!flex !flex-col max-h-[180px] overflow-y-auto">
            {photos.map((f) => (
              <Checkbox key={f.id} value={f.id}>
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
      <p className={`${HINT} mt-0`}>How was it settled? The note, who and when are logged. When no exception is left open, the hold is cleared.</p>
      <Input.TextArea autoFocus autoSize={{ minRows: 3, maxRows: 6 }} placeholder="Resolution note (required)" value={note} onChange={(e) => setNote(e.target.value)} />
    </Modal>
  );
}

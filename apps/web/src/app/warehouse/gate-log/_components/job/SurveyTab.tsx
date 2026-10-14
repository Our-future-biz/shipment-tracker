"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Input, InputNumber, Modal, Segmented, Select, Tag } from "antd";
import { CameraOutlined, DeleteOutlined, FileSearchOutlined, PlusOutlined, PrinterOutlined } from "@ant-design/icons";
import { useGateFiles, useGateFileUrl, type GateFile, type GateMovement } from "@/hooks/useGateLog";
import { useWarehouseContainers } from "@/hooks/useWarehouseRecords";
import { useToast } from "@/lib/toast";
import { formatDateTime } from "@/lib/date";
import type { interfaces } from "@/lib/api/client";
import {
  CONTAINER_TYPES,
  EXPECTED_FILE_BYTES,
  INNER_FLAGS,
  OUTER_PACKINGS,
  VISUAL_FLAGS,
  errorMessage,
  hasSurvey,
  requiredSurveyPhase,
  surveyPhaseKey,
  surveyPhaseOf,
  type SurveyPhaseKey,
} from "../../_lib/gate";
import { fmtSize, Section } from "./fields";
import { ExceptionsPanel } from "./ExceptionsPanel";

type SurveyInput = interfaces.GateSurveyInput;
type SurveyLine = interfaces.GateSurveyLine;

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const ACCEPT = "image/*,application/pdf,.tif,.tiff,.doc,.docx,.xls,.xlsx,.txt,.csv";

const blankLine = (): SurveyLine => ({ qty: null, outerPacking: "", visual: [], inner: [] });
const blankSurvey = (container: string, phase: SurveyPhaseKey): SurveyInput => ({
  container,
  phase: surveyPhaseOf(phase),
  damaged: 0,
  lost: 0,
  lines: [blankLine()],
  driverNote: "",
  warehouseNote: "",
});
// The phase is written in its current wording, so a legacy "Both" survey saves back as receipt.
const pickInput = ({ surveyedAt: _at, surveyedBy: _by, ...input }: interfaces.GateSurvey): SurveyInput => ({
  ...input,
  phase: surveyPhaseOf(surveyPhaseKey(input.phase)),
});
const PHASE_OPTIONS = [
  { value: "receipt", label: "Receipt — gate in" },
  { value: "release", label: "Release — gate out" },
];

const isImage = (f: GateFile) => f.fileType.startsWith("image/");
// A line counts as filled once it has a number of packages and an outer packing.
const lineFilled = (l: SurveyLine) => l.qty != null && !!l.outerPacking;

const readBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const label = "text-[11px] font-bold text-slate-500 uppercase tracking-wide";

export function SurveyTab({ m, saveSurvey }: { m: GateMovement; saveSurvey: (survey: SurveyInput) => Promise<unknown> }) {
  const toast = useToast();
  const { files, upload, remove } = useGateFiles(m.id);
  // Containers live in the warehouse container register; adding one here registers it on this position.
  const { create: addContainer } = useWarehouseContainers();
  const [container, setContainer] = useState(m.containers[0]?.number ?? "");
  // Receipt and release are separate passes per container; opens on the pass due now.
  const [phase, setPhase] = useState<SurveyPhaseKey>(requiredSurveyPhase(m) ?? "receipt");
  const [dialogOpen, setDialogOpen] = useState(false);
  const photosRef = useRef<HTMLDivElement>(null);

  // A container removed elsewhere falls back to the first one.
  useEffect(() => {
    if (container && !m.containers.some((c) => c.number === container)) setContainer(m.containers[0]?.number ?? "");
  }, [m.containers, container]);

  const findStored = (c: string, p: SurveyPhaseKey) => m.surveys.find((s) => s.container === c && surveyPhaseKey(s.phase) === p);
  const stored = findStored(container, phase);
  const [draft, setDraft] = useState<SurveyInput>(stored ? pickInput(stored) : blankSurvey(container, phase));
  useEffect(() => {
    const s = findStored(container, phase);
    setDraft(s ? pickInput(s) : blankSurvey(container, phase));
    // Reset only when switching container or pass; own saves echo back the same values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container, phase]);

  const pieces = m.colli;
  const persist = (next: SurveyInput) => {
    setDraft(next);
    saveSurvey(next).catch((e) => toast.error(errorMessage(e, "Failed to save the survey")));
  };
  const setLine = (i: number, patch: Partial<SurveyLine>, immediate = true) => {
    const next = { ...draft, lines: draft.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) };
    if (immediate) persist(next);
    else setDraft(next);
  };

  const surveyedCount = m.containers.filter((c) => hasSurvey(m, c.number, phase)).length;
  const flagCount = draft.lines.reduce((a, l) => a + l.visual.length, 0);
  const containerPhotos = files.filter((f) => isImage(f) && f.container === container).length;
  const canAddLine = draft.lines.length > 0 && lineFilled(draft.lines[draft.lines.length - 1]!);

  const printSurvey = () => {
    if (flagCount > 0 && containerPhotos < flagCount) {
      toast.warning(`Each condition flag needs at least one photo before the survey can be printed — ${flagCount} flag(s), ${containerPhotos} photo(s).`);
      return;
    }
    const w = window.open("", "_blank", "width=860,height=900");
    if (!w) return;
    const row = (k: string, v: string) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v || "—")}</td></tr>`;
    const lines = draft.lines
      .map(
        (l) =>
          `<tr><td>${l.qty ?? "—"}</td><td>${escapeHtml(l.outerPacking || "—")}</td><td>${escapeHtml(l.visual.join(", ") || "—")}</td><td>${escapeHtml(l.inner.join(", ") || "—")}</td></tr>`,
      )
      .join("");
    w.document.write(`<!doctype html><html><head><title>Survey ${escapeHtml(m.gateRef)}</title>
      <style>body{font-family:Arial,sans-serif;font-size:12px;margin:32px;color:#1e293b}h1{font-size:20px;margin:0 0 4px}
      table{border-collapse:collapse;width:100%;margin-top:16px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top}
      th{color:#64748b;font-size:11px;text-transform:uppercase}.kv th{width:220px}.sig{display:flex;gap:24px;margin-top:48px}
      .sig div{flex:1;border-top:1px solid #1e293b;padding-top:6px}</style></head><body>
      <h1>${escapeHtml(m.gateRef)} — Cargo survey (${phase === "release" ? "release" : "receipt"})</h1>
      <div>Customer ${escapeHtml(m.customer || "—")} · Container ${escapeHtml(container || "position level")}</div>
      <table class="kv">
        ${row("Survey pass", draft.phase)}
        ${row("Damaged pieces", pieces > 0 ? `${draft.damaged} of ${pieces}` : `${draft.damaged} (pieces unknown)`)}
        ${row("Lost / missing pieces", pieces > 0 ? `${draft.lost} of ${pieces}` : `${draft.lost} (pieces unknown)`)}
      </table>
      <table><thead><tr><th>Number</th><th>Outer packing</th><th>Visual condition</th><th>Inner content</th></tr></thead><tbody>${lines}</tbody></table>
      <table class="kv">
        ${row("Driver's note related to survey", draft.driverNote)}
        ${row("Warehouse note", draft.warehouseNote)}
        ${row("Photos", String(containerPhotos))}
        ${row("Surveyed", stored ? `${formatDateTime(stored.surveyedAt)}${stored.surveyedBy ? ` · ${stored.surveyedBy}` : ""}` : "not saved")}
      </table>
      <div class="sig"><div>Delivering driver</div><div>Warehouse surveyor</div><div>Collecting driver</div></div>
      </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <div className="space-y-5">
      <Section
        title="Cargo survey"
        icon={<FileSearchOutlined />}
        bodyClassName="p-0"
        extra={
          <>
            <Button size="small" icon={<PrinterOutlined />} onClick={printSurvey}>
              Print survey
            </Button>
            <Button size="small" type="primary" icon={<CameraOutlined />} onClick={() => photosRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              Photos &amp; documents <span className="font-mono">{files.length}</span>
            </Button>
          </>
        }
      >
        {/* container */}
        <div className="flex items-center gap-3 flex-wrap px-4 py-3 border-b border-slate-100">
          <div className="inline-flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
            <span className={label}>Container</span>
            <span className="font-mono font-semibold text-[13px] text-slate-900">{container || "Position level"}</span>
            <span className="text-xs text-slate-400">
              {m.containers.length ? `· ${surveyedCount} of ${m.containers.length} surveyed on ${phase}` : "· no container recorded"}
            </span>
          </div>
          <Button size="small" type="link" className="!px-0" onClick={() => setDialogOpen(true)}>
            {m.containers.length ? "Change container" : "Add container"}
          </Button>
          <Segmented
            size="small"
            className="ml-auto"
            aria-label="Survey pass"
            value={phase}
            options={PHASE_OPTIONS}
            onChange={(v) => setPhase(v as SurveyPhaseKey)}
          />
        </div>

        {/* survey result */}
        <div className="px-4 py-3 border-b border-slate-100">
          <div className={`${label} mb-2`}>Survey result</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-slate-500 mb-1">Damaged pieces</div>
              <PieceInput value={draft.damaged} max={pieces} onSave={(v) => persist({ ...draft, damaged: v })} />
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Lost / missing pieces</div>
              <PieceInput value={draft.lost} max={pieces} onSave={(v) => persist({ ...draft, lost: v })} />
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Survey pass</div>
              <div className="text-xs font-semibold text-slate-800 py-1">{draft.phase}</div>
            </div>
          </div>
        </div>

        {/* survey lines */}
        <div className="px-4 py-3 border-b border-slate-100">
          <div className={`${label} mb-2`}>Survey lines</div>
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full min-w-[820px] border-collapse text-xs">
              <colgroup>
                <col style={{ width: 90 }} />
                <col style={{ width: 180 }} />
                <col />
                <col />
                <col style={{ width: 44 }} />
              </colgroup>
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {["Number", "Outer packing", "Visual condition", "Inner content"].map((h) => (
                    <th key={h} className="text-left px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      {h}
                    </th>
                  ))}
                  <th className="px-2 py-1 text-right">
                    <Button
                      size="small"
                      type="text"
                      icon={<PlusOutlined />}
                      disabled={!canAddLine}
                      title={canAddLine ? "Add another line" : "Fill in number and outer packing first"}
                      aria-label="Add another line"
                      onClick={() => persist({ ...draft, lines: [...draft.lines, blankLine()] })}
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                {draft.lines.map((l, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-b-0">
                    <td className="px-3 py-1.5">
                      <InputNumber
                        size="small"
                        min={0}
                        controls={false}
                        placeholder="0"
                        aria-label="Number of packages"
                        className="w-full font-mono"
                        value={l.qty}
                        onChange={(v) => setLine(i, { qty: v == null ? null : Math.max(0, Math.floor(Number(v))) }, false)}
                        onBlur={() => persist(draft)}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <Select
                        size="small"
                        allowClear
                        placeholder="—"
                        aria-label="Outer packing"
                        className="w-full"
                        value={l.outerPacking || undefined}
                        options={OUTER_PACKINGS.map((p) => ({ value: p, label: p }))}
                        onChange={(v) => setLine(i, { outerPacking: v ?? "" })}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <FlagSelect value={l.visual} options={VISUAL_FLAGS} tone="red" onChange={(v) => setLine(i, { visual: v })} />
                    </td>
                    <td className="px-3 py-1.5">
                      <FlagSelect value={l.inner} options={INNER_FLAGS} tone="blue" onChange={(v) => setLine(i, { inner: v })} />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <Button
                        size="small"
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        disabled={draft.lines.length === 1}
                        title="Remove this line"
                        aria-label="Remove this line"
                        onClick={() => persist({ ...draft, lines: draft.lines.filter((_, idx) => idx !== i) })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500 mt-2 mb-0">
            {flagCount === 0
              ? "No condition flags — the survey can be closed as clean."
              : `${flagCount} flag${flagCount > 1 ? "s" : ""} selected — each flag requires at least one photo before the survey can be printed.`}
          </p>
        </div>

        {/* notes */}
        <div className="px-4 py-3">
          <div className={`${label} mb-2`}>Notes</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-slate-500 mb-1">Driver&apos;s note related to survey</div>
              <Input.TextArea
                autoSize={{ minRows: 3, maxRows: 8 }}
                value={draft.driverNote}
                onChange={(e) => setDraft({ ...draft, driverNote: e.target.value })}
                onBlur={() => (stored?.driverNote ?? "") !== draft.driverNote && persist(draft)}
              />
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Warehouse note</div>
              <Input.TextArea
                autoSize={{ minRows: 3, maxRows: 8 }}
                value={draft.warehouseNote}
                onChange={(e) => setDraft({ ...draft, warehouseNote: e.target.value })}
                onBlur={() => (stored?.warehouseNote ?? "") !== draft.warehouseNote && persist(draft)}
              />
            </div>
          </div>
        </div>
      </Section>

      {/* What the survey found can become a damage / short exception — the cargo is then on hold. */}
      <ExceptionsPanel m={m} survey={{ container, phase: draft.phase, damaged: draft.damaged, lost: draft.lost }} />

      <div ref={photosRef}>
        <PhotosSection
          movementId={m.id}
          files={files}
          container={container}
          pieces={pieces}
          uploading={upload.isPending}
          onUpload={async (list, tag) => {
            for (const file of Array.from(list)) {
              if (file.size > MAX_UPLOAD_BYTES) {
                toast.error(`${file.name} is larger than 25 MB`);
                continue;
              }
              try {
                const contentBase64 = await readBase64(file);
                const autoTag = file.type.startsWith("image/") ? "CTN" : "DOC";
                await upload.mutateAsync({ fileName: file.name, fileType: file.type, contentBase64, container, tag: tag || autoTag });
              } catch (e) {
                toast.error(errorMessage(e, `Failed to upload ${file.name}`));
              }
            }
          }}
          onDelete={(file) =>
            Modal.confirm({
              title: `Remove ${file.fileName}?`,
              content: "The file is taken off this movement.",
              okText: "Remove",
              okButtonProps: { danger: true },
              onOk: () => remove.mutateAsync(file.id).catch((e) => toast.error(errorMessage(e, "Failed to remove the file"))),
            })
          }
        />
      </div>

      <ContainerDialog
        open={dialogOpen}
        containers={m.containers}
        surveyed={(number) => hasSurvey(m, number, phase)}
        phase={phase}
        current={container}
        onClose={() => setDialogOpen(false)}
        onOpen={(number) => {
          setContainer(number);
          setDialogOpen(false);
        }}
        onAdd={(c) =>
          addContainer({ movementId: m.id, number: c.number, equipment: c.type, direction: m.handling === "Export" ? "Loading" : "Unloading" }).catch((e) =>
            toast.error(errorMessage(e, "Failed to add the container")),
          )
        }
      />
    </div>
  );
}

function FlagSelect({ value, options, tone, onChange }: { value: string[]; options: string[]; tone: "red" | "blue"; onChange: (v: string[]) => void }) {
  return (
    <Select
      mode="multiple"
      size="small"
      allowClear
      placeholder="—"
      className="w-full"
      maxTagCount="responsive"
      value={value}
      options={options.map((o) => ({ value: o, label: o }))}
      onChange={onChange}
      tagRender={({ label: text, closable, onClose }) => (
        <Tag color={tone} closable={closable} onClose={onClose} className="!mr-1 !text-[11px]">
          {text}
        </Tag>
      )}
    />
  );
}

// Capped at the piece count only when it is known (> 0); with no count, damage and
// shortage can still be recorded (same rule as the server).
function PieceInput({ value, max, onSave }: { value: number; max: number; onSave: (v: number) => void }) {
  const [draft, setDraft] = useState<number | null>(value);
  useEffect(() => setDraft(value), [value]);
  const known = max > 0;
  return (
    <span className="inline-flex items-center gap-2">
      <InputNumber
        size="small"
        min={0}
        max={known ? max : undefined}
        precision={0}
        controls={false}
        className="w-[90px] font-mono"
        value={draft}
        onChange={(v) => setDraft(v == null ? null : Number(v))}
        onBlur={() => {
          const n = Math.max(0, Math.floor(draft ?? 0));
          const capped = known ? Math.min(n, max) : n;
          setDraft(capped);
          if (capped !== value) onSave(capped);
        }}
      />
      <span className="text-xs text-slate-400">{known ? `of ${max} piece${max === 1 ? "" : "s"}` : "pieces unknown"}</span>
    </span>
  );
}

function PhotosSection({
  movementId,
  files,
  container,
  pieces,
  uploading,
  onUpload,
  onDelete,
}: {
  movementId: string;
  files: GateFile[];
  container: string;
  pieces: number;
  uploading: boolean;
  onUpload: (files: FileList | File[], tag: string) => Promise<void>;
  onDelete: (file: GateFile) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [tag, setTag] = useState("");
  const total = files.reduce((a, f) => a + f.fileSize, 0);

  return (
    <Section
      title="Photos & documents"
      icon={<CameraOutlined />}
      bodyClassName="p-0"
      extra={
        <>
          <Select
            size="small"
            value={tag}
            onChange={setTag}
            popupMatchSelectWidth={false}
            className="w-[150px]"
            options={[
              { value: "", label: "Tag new files: auto" },
              { value: "CTN", label: "CTN — container" },
              { value: "DOC", label: "DOC — document" },
              ...Array.from({ length: pieces }, (_, i) => ({ value: `PC ${i + 1}`, label: `PC ${i + 1} — piece` })),
            ]}
          />
          <span>{uploading ? "uploading…" : `${files.length} file${files.length === 1 ? "" : "s"} · ${fmtSize(total)}`}</span>
        </>
      }
    >
      <div
        className={`grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-2.5 p-4 ${drag ? "outline-2 outline-dashed outline-indigo-400 -outline-offset-4 rounded-xl" : ""}`}
        onDragEnter={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrag(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (e.dataTransfer.files.length) onUpload(e.dataTransfer.files, tag);
        }}
      >
        {files.map((f) => (
          <FileCard key={f.id} movementId={movementId} file={f} onDelete={() => onDelete(f)} />
        ))}
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="min-h-[120px] border-[1.5px] border-dashed border-slate-300 rounded-lg bg-transparent text-xs font-semibold text-slate-400 hover:border-indigo-400 hover:text-indigo-500 cursor-pointer"
        >
          + Add photo
          <br />
          or document
          {container && <span className="block font-normal mt-1">to {container}</span>}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          accept={ACCEPT}
          onChange={(e) => {
            if (e.target.files?.length) onUpload(Array.from(e.target.files), tag);
            e.target.value = "";
          }}
        />
      </div>
      <div className="px-4 pb-4">
        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.min(100, Math.round((total / EXPECTED_FILE_BYTES) * 100))}%` }} />
        </div>
        <div className="flex justify-between gap-2 flex-wrap text-[11px] text-slate-400 mt-1.5">
          <span>{fmtSize(total)} used of the 20 MB expected per shipment</span>
          <span className="font-mono">jpg ≈ 400 kB · pdf / tiff / png</span>
        </div>
      </div>
    </Section>
  );
}

function FileCard({ movementId, file, onDelete }: { movementId: string; file: GateFile; onDelete: () => void }) {
  const image = isImage(file);
  const [wantUrl, setWantUrl] = useState(image);
  const { data: url } = useGateFileUrl(movementId, file, wantUrl);
  const pendingOpen = useRef(false);

  useEffect(() => {
    if (url && pendingOpen.current) {
      pendingOpen.current = false;
      window.open(url, "_blank", "noopener");
    }
  }, [url]);

  const ext = file.fileName.includes(".") ? file.fileName.split(".").pop()!.toUpperCase().slice(0, 4) : "FILE";
  const open = () => {
    if (url) window.open(url, "_blank", "noopener");
    else {
      pendingOpen.current = true;
      setWantUrl(true);
    }
  };

  return (
    <div
      onClick={open}
      title={`Open ${file.fileName}`}
      className="group relative flex flex-col border border-slate-200 rounded-lg overflow-hidden bg-white cursor-pointer hover:border-indigo-400 transition-colors"
    >
      <div
        className={`relative aspect-[4/3] grid place-items-center text-[11px] font-bold tracking-wider text-slate-400 ${
          file.tag.startsWith("PC") ? "bg-gradient-to-br from-red-50 to-slate-50" : "bg-gradient-to-br from-slate-50 to-slate-100"
        }`}
      >
        {file.tag && (
          <span className="absolute top-1.5 left-1.5 z-10 text-[9.5px] font-bold tracking-wide bg-white border border-slate-200 rounded px-1.5 text-slate-600">
            {file.tag}
          </span>
        )}
        {image && url ? (
          // Local object URL of the stored bytes — next/image can't optimise it.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={file.fileName} className="w-full h-full object-cover" />
        ) : (
          ext
        )}
      </div>
      <div className="px-2 py-1.5 text-[11px]">
        <div className="font-semibold text-slate-800 truncate" title={file.fileName}>
          {file.fileName.replace(/\.[^.]+$/, "")}
        </div>
        <div className="font-mono text-slate-400">{fmtSize(file.fileSize)}</div>
      </div>
      <button
        type="button"
        title={`Remove ${file.fileName}`}
        aria-label={`Remove ${file.fileName}`}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute top-1.5 right-1.5 z-10 w-5 h-5 rounded-full border border-slate-200 bg-white text-slate-400 text-xs leading-none grid place-items-center p-0 cursor-pointer opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-red-500 hover:border-red-400"
      >
        ×
      </button>
    </div>
  );
}

function ContainerDialog({
  open,
  containers,
  surveyed,
  phase,
  current,
  onClose,
  onOpen,
  onAdd,
}: {
  open: boolean;
  containers: interfaces.GateContainer[];
  surveyed: (number: string) => boolean;
  phase: SurveyPhaseKey;
  current: string;
  onClose: () => void;
  onOpen: (number: string) => void;
  onAdd: (c: { number: string; type: string }) => void;
}) {
  const [picked, setPicked] = useState(current);
  const [number, setNumber] = useState("");
  const [type, setType] = useState(CONTAINER_TYPES[2]!);
  useEffect(() => {
    if (open) setPicked(current);
  }, [open, current]);

  const add = () => {
    const n = number.trim().toUpperCase();
    if (!n || containers.some((c) => c.number === n)) return;
    onAdd({ number: n, type });
    setPicked(n);
    setNumber("");
  };

  return (
    <Modal
      open={open}
      title="Select container"
      onCancel={onClose}
      width={460}
      okText="Open survey"
      okButtonProps={{ disabled: !picked && containers.length > 0 }}
      onOk={() => onOpen(picked)}
    >
      <div className="flex flex-col -mx-2 max-h-[50vh] overflow-auto">
        {containers.length === 0 && <div className="py-6 text-center text-xs text-slate-400">No containers recorded on this movement yet.</div>}
        {containers.map((c) => (
          <button
            key={c.number}
            type="button"
            aria-current={picked === c.number}
            onClick={() => setPicked(c.number)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-md border-0 text-left cursor-pointer ${
              picked === c.number ? "bg-indigo-50" : "bg-transparent hover:bg-slate-50"
            }`}
          >
            <span className="font-mono font-semibold text-[13px] flex-1 text-slate-900">{c.number}</span>
            <span className="text-xs text-slate-400">
              {c.type} · {phase} {surveyed(c.number) ? "surveyed" : "survey pending"}
            </span>
          </button>
        ))}
      </div>
      <div className="flex gap-2 pt-3 mt-2 border-t border-slate-100">
        <Input size="small" placeholder="MSKU 123456-7" value={number} onChange={(e) => setNumber(e.target.value)} onPressEnter={add} />
        <Select size="small" className="w-[110px] shrink-0" value={type} onChange={setType} options={CONTAINER_TYPES.map((t) => ({ value: t, label: t }))} />
        <Button size="small" onClick={add} disabled={!number.trim()}>
          Add
        </Button>
      </div>
    </Modal>
  );
}

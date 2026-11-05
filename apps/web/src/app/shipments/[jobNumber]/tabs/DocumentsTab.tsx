"use client";

import { useMemo, useRef, useState } from "react";
import { Select, Tooltip } from "antd";
import { useToast } from "@/lib/toast";
import {
  InboxOutlined,
  FileTextOutlined,
  EyeOutlined,
  CheckOutlined,
  CloseOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { useMutation } from "@tanstack/react-query";
import { useShipmentAttachments, type AttachmentItem } from "@/hooks/useShipmentAttachments";
import { api, apiFileUrl } from "@/lib/api";
import { fileToBase64 } from "@/lib/files";
import { formatFileSize, docPlural } from "./docsShared";
import type { ShipmentItem } from "@/hooks/useShipments";
import { formatDate } from "@/lib/date";
import {
  DOCUMENT_TYPES,
  REQUIRED_DOCUMENT_TYPES,
  guessDocumentType,
  isReviewedDocumentType,
  isKnownDocumentType,
  DOCUMENT_GROUPS,
  documentGroupOf,
  documentTypeLabel,
} from "@/lib/documentTypes";
import { CARD } from "../_components/detailStyles";
import { RowActionsMenu } from "../../_components/RowActionsMenu";

type AttachmentFile = AttachmentItem;

// The Documents tab in the look of the Shipment Details cards: one Documents card with the app's
// light indigo bar, adding files and the search on top, then one table where each group is a small
// heading over its files; the required-documents checklist in a card of its own on the right, as
// Tasks is. Only the look; every action and rule is as before. The Customs section keeps its own
// look (docsShared), so the file badge and the customs pill here are this tab's own.

/** Focus ring for the tab's own buttons and links. */
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1";
/** The column heads: bold black caps, as the field labels of the Shipment Details cards. */
const TH = "text-left px-2 pb-2 text-[11px] leading-[14px] font-bold uppercase tracking-wide text-slate-900 border-b border-slate-200 whitespace-nowrap";
const TD = "px-2 py-2 align-middle border-b border-slate-100";
/** A small icon button of a row (Preview, Remove). */
const ICON_BTN = `w-7 h-7 rounded-md grid place-items-center text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors ${FOCUS}`;
/** A soft pill (as the check pills under the Cargo tables). */
const PILL = "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ring-1 ring-inset";

/** Whether a drag carries files (not text or a link). */
const isFileDrag = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

/** The app's card header (as SectionHeader in Shipment Details): a light indigo bar, icon, caps title. */
function CardBar({ id, icon, title, right }: { id?: string; icon: React.ReactNode; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 min-h-[42px] px-4 py-1.5 bg-indigo-50 border-b border-indigo-100">
      <span aria-hidden className="text-indigo-500 text-[15px] leading-none shrink-0">{icon}</span>
      <h3 id={id} className="m-0 min-w-0 text-[13px] leading-tight font-bold uppercase tracking-wider text-slate-800">
        {title}
      </h3>
      {right && <div className="ml-auto flex items-center gap-3">{right}</div>}
    </div>
  );
}

/** The file's extension in a small coloured chip. */
function ExtChip({ fileName }: { fileName: string }) {
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  const kind = ext === "pdf"
    ? "pdf"
    : ["xls", "xlsx", "csv"].includes(ext)
      ? "xls"
      : ["jpg", "jpeg", "png", "heic", "gif", "webp"].includes(ext)
        ? "img"
        : "other";
  const cls = {
    pdf: "bg-red-50 text-red-600 ring-red-200",
    xls: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    img: "bg-indigo-50 text-indigo-600 ring-indigo-200",
    other: "bg-slate-50 text-slate-500 ring-slate-200",
  }[kind];
  return (
    <span aria-hidden className={`flex-none w-8 h-7 rounded-md grid place-items-center text-[9px] font-bold tracking-tight ring-1 ring-inset ${cls}`}>
      {ext.slice(0, 4).toUpperCase() || "FILE"}
    </span>
  );
}

/** Customs' verdict on a file: Approved / Declined / Awaiting review. */
function ReviewPill({ status }: { status: string }) {
  if (status === "approved")
    return (
      <span className={`${PILL} bg-emerald-50 text-emerald-700 ring-emerald-200`}>
        <CheckOutlined aria-hidden className="text-[10px]" />
        Approved
      </span>
    );
  if (status === "declined")
    return (
      <span className={`${PILL} bg-red-50 text-red-700 ring-red-200`}>
        <CloseOutlined aria-hidden className="text-[10px]" />
        Declined
      </span>
    );
  return <span className={`${PILL} bg-slate-50 text-slate-600 ring-slate-200`}>Awaiting review</span>;
}

/**
 * The required documents as milestones, in the look of the shipment's progress bar: one full-length
 * segment per document, its name above and its state below - green and Received once a file of that
 * type is in, grey and Missing until then. A missing one is a button: it opens the file picker with
 * that type chosen.
 */
function RequiredMilestones({
  byType,
  onPick,
  loading,
}: {
  byType: Map<string, AttachmentFile>;
  onPick: (type: string) => void;
  /** While the list loads the states are not known yet: grey bars, no Missing. */
  loading: boolean;
}) {
  const have = REQUIRED_DOCUMENT_TYPES.filter((t) => byType.has(t)).length;
  const left = REQUIRED_DOCUMENT_TYPES.length - have;
  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <h3 id="req-docs-title" className="m-0 text-[11px] leading-[14px] font-bold uppercase tracking-wide text-slate-900">
          Required documents
        </h3>
        <span className="text-[12px] font-medium text-indigo-600 tabular-nums">
          {have} / {REQUIRED_DOCUMENT_TYPES.length}
        </span>
        {!loading && (
          <span className={`ml-auto text-[12.5px] font-medium ${left ? "text-amber-700" : "text-emerald-700"}`}>
            {left
              ? left === 1
                ? "1 required document is missing"
                : `${left} required documents are missing`
              : "All required documents are in place"}
          </span>
        )}
      </div>
      <ol aria-labelledby="req-docs-title" className="list-none m-0 p-0 grid grid-cols-3 md:grid-cols-6 gap-x-1.5 gap-y-3">
        {REQUIRED_DOCUMENT_TYPES.map((type) => {
          const file = byType.get(type);
          const done = !!file;
          const label = documentTypeLabel(type);
          const body = (
            <>
              <span
                className={`block truncate text-center text-[12.5px] leading-4 mb-1.5 ${
                  done ? "text-slate-700" : "text-slate-900 font-medium group-hover:text-indigo-700"
                }`}
              >
                {label}
              </span>
              <span
                aria-hidden
                className={`block h-1.5 w-full rounded-full transition-colors ${
                  loading ? "bg-slate-100 animate-pulse" : done ? "bg-emerald-500" : "bg-slate-200 group-hover:bg-indigo-300"
                }`}
              />
              {!loading && (
                <span
                  className={`mt-1 flex items-center justify-center gap-1 text-[10.5px] font-semibold uppercase tracking-wide ${
                    done ? "text-emerald-700" : "text-amber-700"
                  }`}
                >
                  {done && <CheckOutlined aria-hidden className="text-[10px]" />}
                  {done ? "Received" : "Missing"}
                </span>
              )}
            </>
          );
          return (
            <li key={type} className="min-w-0">
              {done || loading ? (
                <Tooltip title={file?.fileName}>
                  <div className="px-1 py-1">{body}</div>
                </Tooltip>
              ) : (
                <Tooltip title={`Add the ${label.toLowerCase()}`}>
                  <button
                    type="button"
                    onClick={() => onPick(type)}
                    className={`group block w-full px-1 py-1 rounded-md border-0 bg-transparent cursor-pointer hover:bg-slate-50 transition-colors ${FOCUS}`}
                  >
                    {body}
                  </button>
                </Tooltip>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** A file waiting to be classified before it is uploaded (docPending in the mockup). */
interface PendingFile {
  file: File;
  name: string;
  size: number;
  type: string;
  /** true when the type came from the file name rather than the user */
  guessed: boolean;
}

export function DocumentsTab({ shipment }: { shipment: ShipmentItem }) {
  const toast = useToast();
  // A document added, removed or classified also changes the shipment itself: its customs
  // status follows the invoice and the packing list, and so do the "received" ticks.
  const { attachments, isLoading, refresh: refreshDocuments } = useShipmentAttachments(shipment.id);
  const [search, setSearch] = useState("");

  // Files are classified BEFORE they are uploaded — nothing reaches the list
  // without a document type, so the checklist can never go stale.
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Type pre-selected by clicking a "Missing" row in the checklist.
  const presetRef = useRef<string | null>(null);

  const addFiles = (list: FileList | File[] | null) => {
    if (!list || list.length === 0) return;
    const preset = presetRef.current;
    const next = Array.from(list).map((f) => {
      const guess = preset || guessDocumentType(f.name);
      return { file: f, name: f.name, size: f.size, type: guess, guessed: !preset && !!guess };
    });
    presetRef.current = null;
    setPending((p) => [...p, ...next]);
  };

  const openPicker = (preset?: string) => {
    presetRef.current = preset ?? null;
    fileInputRef.current?.click();
  };

  const deleteAttachment = useMutation({
    mutationFn: (attachmentId: string) => api.shipments.attachmentDelete(shipment.id, attachmentId),
    onSuccess: refreshDocuments,
  });

  // Uploads the whole classified queue in one go ("Add to list" in the mockup).
  const savePending = async () => {
    if (pending.length === 0 || pending.some((p) => !p.type)) return;
    setSaving(true);
    const failed: string[] = [];
    for (const p of pending) {
      try {
        const contentBase64 = await fileToBase64(p.file);
        await api.shipments.attachmentCreate(shipment.id, {
          fileName: p.name,
          fileSize: p.size,
          fileType: p.file.type || "application/octet-stream",
          contentBase64,
          documentType: p.type,
        });
      } catch (err) {
        // Surface the real reason (size limit, network, server) instead of a
        // generic failure — a silent no-op is impossible to diagnose.
        console.error("Attachment upload failed", p.name, err);
        failed.push(`${p.name}: ${err instanceof Error ? err.message : "unknown error"}`);
      }
    }
    await refreshDocuments();
    setSaving(false);

    if (failed.length === 0) {
      toast.success(pending.length === 1 ? "Document added" : `${pending.length} documents added`);
      setPending([]);
      return;
    }
    // Keep the failed ones in the queue so the user can retry without re-picking.
    toast.error(failed[0] ?? "Could not add the document", 8);
    const failedNames = new Set(failed.map((f) => f.split(":")[0]));
    setPending((list) => list.filter((p) => failedNames.has(p.name)));
  };

  // Assign a business document type. Separate from upload so a file can be
  // re-classified later without re-uploading it.
  const classify = useMutation({
    mutationFn: ({ id, documentType }: { id: string; documentType: string }) =>
      api.shipments.attachmentClassify(shipment.id, id, { documentType }),
    onSuccess: refreshDocuments,
    onError: () => toast.error("Could not save the document type"),
  });


  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? attachments.filter((a) => a.fileName.toLowerCase().includes(q)) : attachments;
  }, [attachments, search]);

  const byType = useMemo(() => {
    const m = new Map<string, AttachmentFile>();
    for (const a of attachments) if (a.documentType && !m.has(a.documentType)) m.set(a.documentType, a);
    return m;
  }, [attachments]);

  // Both cards take dropped files, so a drop that just misses the strip still lands. Only a drag
  // of files is taken - text dragged onto the search box goes in as usual.
  const dropProps = {
    onDragOver: (e: React.DragEvent<HTMLElement>) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      setDragOver(true);
    },
    onDragLeave: (e: React.DragEvent<HTMLElement>) => {
      // Moving between the card's own parts is not leaving it.
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      setDragOver(false);
    },
    onDrop: (e: React.DragEvent<HTMLElement>) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      setDragOver(false);
      addFiles(e.dataTransfer.files);
    },
  };

  return (
    // Adding files (with the required documents as milestones under it) and the list of files,
    // each in its own card.
    <div className="flex flex-col gap-3 min-w-0">
      {/* Add documents, with no title bar (Browse says it): Browse, the drop strip (a click on it
          opens the picker too) and the files waiting for their type. */}
      <section aria-label="Add documents" className={CARD} {...dropProps}>
        <div className="p-4">
          {/* Hidden input so a Missing milestone can open the picker with a preset type. */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            {/*
              Plain drop zone rather than Upload.Dragger's own upload pipeline:
              files are queued for classification first, and both the drop and the
              Browse button hand over real File objects (antd's beforeUpload passes
              a wrapped RcFile, which does not survive the queue reliably).
            */}
            <div
              onClick={() => openPicker()}
              className={[
                "flex-1 min-w-[280px] flex items-center gap-3.5 flex-wrap rounded-lg border border-dashed px-4 py-4 cursor-pointer transition-colors",
                dragOver
                  ? "border-indigo-500 bg-indigo-50 ring-4 ring-indigo-100"
                  : "border-slate-300 bg-slate-50/60 hover:border-indigo-300 hover:bg-indigo-50/40",
              ].join(" ")}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openPicker();
                }}
                className={`inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-indigo-600 text-white text-[14px] font-medium border-0 cursor-pointer shadow-sm hover:bg-indigo-700 transition-colors ${FOCUS}`}
              >
                Browse files
              </button>
              <InboxOutlined aria-hidden className="text-slate-400 text-[18px]" />
              <span className="text-[14px] font-medium text-slate-700">Drag files here</span>
              <span className="text-[13px] text-slate-500">PDF, XLSX, DOCX, JPG</span>
            </div>
          </div>

          {pending.length > 0 && (
            // The files waiting for their type, one line each: the file, its type, Remove; the
            // last line also carries Cancel / Add to list (and how many still need a type).
            <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50/30 overflow-hidden">
              {pending.map((p, i) => {
                const last = i === pending.length - 1;
                const untyped = pending.filter((x) => !x.type).length;
                return (
                  <div
                    key={`${p.name}-${i}`}
                    className="flex items-center gap-3 px-4 py-3 flex-wrap sm:flex-nowrap border-b border-indigo-100 last:border-b-0"
                  >
                    <ExtChip fileName={p.name} />
                    <span className="min-w-[80px] flex-1 truncate text-[14px] font-medium text-slate-900" title={p.name}>
                      {p.name}
                    </span>
                    <span className="text-[13px] text-slate-500 tabular-nums whitespace-nowrap">{formatFileSize(p.size)}</span>
                    {p.guessed && p.type && (
                      <Tooltip title="Guessed from the file name">
                        <span className={`${PILL} bg-emerald-50 text-emerald-700 ring-emerald-200`}>Guessed</span>
                      </Tooltip>
                    )}
                    <Select
                      value={p.type || undefined}
                      placeholder="Select type"
                      options={DOCUMENT_TYPES.map((t) => ({ value: t, label: documentTypeLabel(t) }))}
                      onChange={(v) =>
                        setPending((list) =>
                          list.map((x, xi) => (xi === i ? { ...x, type: v, guessed: false } : x)),
                        )
                      }
                      className="w-[190px] shrink-0"
                      status={p.type ? undefined : "warning"}
                    />
                    {/* Remove takes one file out of several; with a single file Cancel does the same. */}
                    {pending.length > 1 && (
                      <Tooltip title="Remove">
                        <button
                          type="button"
                          aria-label={`Remove ${p.name}`}
                          onClick={() => setPending((list) => list.filter((_, xi) => xi !== i))}
                          className={`${ICON_BTN} border-0 bg-transparent cursor-pointer hover:!bg-red-50 hover:!text-red-600`}
                        >
                          <CloseOutlined aria-hidden />
                        </button>
                      </Tooltip>
                    )}
                    {last && (
                      <div className="ml-auto flex items-center gap-2 shrink-0">
                        {untyped > 0 && (
                          <span className="text-[13px] font-medium whitespace-nowrap text-amber-700">
                            {untyped === 1 ? "1 file still needs a type" : `${untyped} files still need a type`}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => setPending([])}
                          className={`h-9 px-4 rounded-lg border border-slate-200 bg-white text-[14px] font-medium text-slate-700 cursor-pointer hover:bg-slate-50 transition-colors ${FOCUS}`}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={saving || pending.some((x) => !x.type)}
                          onClick={savePending}
                          className={`h-9 px-4 rounded-lg bg-indigo-600 text-white text-[14px] font-medium border-0 cursor-pointer shadow-sm hover:bg-indigo-700 transition-colors disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:bg-indigo-600 ${FOCUS}`}
                        >
                          {saving ? "Adding…" : "Add to list"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* The required documents as milestones, in a card of their own (as the shipment's progress bar). */}
      <section aria-labelledby="req-docs-title" className={`${CARD} px-4 pt-3.5 pb-3`} {...dropProps}>
        <RequiredMilestones byType={byType} onPick={openPicker} loading={isLoading} />
      </section>

      {/* Documents: how many, the search, and one table for all the groups, so their columns line
          up; each group is a band over its files, and a group with none is just its band. */}
      <section aria-labelledby="docs-title" className={CARD} {...dropProps}>
        <CardBar
          id="docs-title"
          icon={<FileTextOutlined />}
          title="Documents"
          right={
            <>
              <span className="text-[12px] font-medium text-indigo-600 tabular-nums whitespace-nowrap">{docPlural(attachments.length)}</span>
              {/* One search for all the groups below, in the card's bar. */}
              <label className="flex items-center gap-2 h-8 w-[200px] sm:w-[240px] rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition-colors">
                <SearchOutlined aria-hidden className="text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by file name"
                  aria-label="Search documents by file name"
                  className="border-0 bg-transparent outline-none w-full text-slate-900 placeholder:text-slate-400"
                />
              </label>
            </>
          }
        />
        <div className="p-4">
          <div className="overflow-x-auto">
            <table className="w-full table-fixed border-separate border-spacing-0 min-w-[720px]">
              <thead>
                <tr>
                  <th scope="col" className={`${TH} w-[34%]`}>File</th>
                  <th scope="col" className={TH}>Document type</th>
                  <th scope="col" className={`${TH} w-[136px]`}>Customs</th>
                  <th scope="col" className={`${TH} w-[150px]`}>Uploaded by</th>
                  <th scope="col" className={`${TH} w-[92px]`}>Date</th>
                  <th scope="col" className={`${TH} w-[64px]`}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              {DOCUMENT_GROUPS.map((group, gi) => {
                const inGroup = (a: AttachmentFile) => documentGroupOf(a.documentType) === group;
                const all = attachments.filter(inGroup);
                const rows = filtered.filter(inGroup);
                return (
                  <tbody key={group.title} className="[&>tr:last-child>td]:border-b-0">
                    {/* Air between the groups (none above the first, which sits under the column heads). */}
                    {gi > 0 && (
                      <tr aria-hidden>
                        <td colSpan={6} className="h-4 p-0" />
                      </tr>
                    )}
                    {/* The group's band: light indigo with a firm indigo edge on the left, so each
                        group stands apart at a glance. */}
                    <tr>
                      <th
                        scope="colgroup"
                        colSpan={6}
                        className="text-left px-3 py-2.5 bg-indigo-50 shadow-[inset_3px_0_0_#6366f1] text-[13px] leading-tight font-bold uppercase tracking-wide text-indigo-800 whitespace-nowrap"
                      >
                        <span className="inline-flex items-center gap-2">
                          {group.title}
                          <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-white text-[12px] font-semibold text-indigo-600 ring-1 ring-inset ring-indigo-200 tabular-nums">
                            {all.length}
                          </span>
                        </span>
                      </th>
                    </tr>
                    {rows.length > 0 ? (
                      rows.map((file) => (
                        <tr key={file.id} className="hover:bg-slate-50 transition-colors">
                          <td className={TD}>
                            <div className="flex items-center gap-2.5 min-w-0">
                              <ExtChip fileName={file.fileName} />
                              <span className="min-w-0 flex-1">
                                <a
                                  href={apiFileUrl(file.contentUrl)}
                                  target="_blank"
                                  rel="noreferrer"
                                  title={file.fileName}
                                  className={`block truncate text-[13px] font-medium text-indigo-600 hover:text-indigo-700 hover:underline rounded-sm ${FOCUS}`}
                                >
                                  {file.fileName}
                                </a>
                              </span>
                            </div>
                          </td>
                          <td className={TD}>
                            {/* The type is chosen before a file is added and is fixed from then on; a wrong
                                one is put right by deleting the file and adding it again. Only a file with
                                no type or an old, unknown one still gets the picker, so it can be filed.
                                The Select follows the saved value, so a failed save snaps back. */}
                            {isKnownDocumentType(file.documentType) ? (
                              <span className="block truncate whitespace-nowrap text-[13px] text-slate-700" title={documentTypeLabel(file.documentType)}>
                                {documentTypeLabel(file.documentType)}
                              </span>
                            ) : (
                              <Select
                                size="small"
                                value={isKnownDocumentType(file.documentType) ? file.documentType : undefined}
                                placeholder={file.documentType || "Select type"}
                                options={DOCUMENT_TYPES.map((t) => ({ value: t, label: documentTypeLabel(t) }))}
                                onChange={(v) => classify.mutate({ id: file.id, documentType: v })}
                                disabled={classify.isPending && classify.variables?.id === file.id}
                                loading={classify.isPending && classify.variables?.id === file.id}
                                className="w-full max-w-[180px]"
                                status={isKnownDocumentType(file.documentType) ? undefined : "warning"}
                              />
                            )}
                          </td>
                          <td className={TD}>
                            <div className="flex flex-col gap-1 items-start">
                              {/* Commercial and customs documents go to customs for review; shipping ones do not. A file
                                  that was reviewed under another type still shows its verdict (and note). */}
                              {isReviewedDocumentType(file.documentType) || file.customsStatus ? (
                                <ReviewPill status={file.customsStatus} />
                              ) : (
                                <span className="text-slate-300" title="Not reviewed by customs">—</span>
                              )}
                              {file.customsStatus === "declined" && file.customsNote && (
                                <span className="text-[12px] italic text-red-700/80 max-w-[210px]">
                                  “{file.customsNote}”
                                </span>
                              )}
                            </div>
                          </td>
                          <td className={TD}>
                            <span className="block truncate text-[13px] text-slate-700" title={file.uploadedByName || "Unknown"}>
                              {file.uploadedByName || "Unknown"}
                            </span>
                          </td>
                          <td className={TD}>
                            <span className="block whitespace-nowrap text-[13px] text-slate-700 tabular-nums">{formatDate(file.createdAt)}</span>
                          </td>
                          <td className={TD}>
                            <div className="flex items-center justify-end gap-0.5">
                              <Tooltip title="Preview">
                                <a
                                  href={apiFileUrl(file.contentUrl)}
                                  target="_blank"
                                  rel="noreferrer"
                                  aria-label={`Preview ${file.fileName}`}
                                  className={ICON_BTN}
                                >
                                  <EyeOutlined aria-hidden />
                                </a>
                              </Tooltip>
                              {/* Download and Delete behind "⋯", as the rows of Container and Cargo Details. */}
                              <RowActionsMenu
                                label={`Actions for ${file.fileName}`}
                                downloadHref={apiFileUrl(file.contentUrl, true)}
                                onDelete={() => deleteAttachment.mutate(file.id)}
                              />
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : isLoading || all.length > 0 ? (
                      // An empty group is just its band (the count says 0); a line shows only while the
                      // list loads, or when the search hides the group's files.
                      <tr>
                        <td colSpan={6} className="px-2 py-2 text-[12.5px] text-slate-400">
                          {isLoading ? (
                            <span aria-hidden className="block h-4 w-1/2 rounded bg-slate-100 animate-pulse" />
                          ) : (
                            `No file matches “${search}”.`
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                );
              })}
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

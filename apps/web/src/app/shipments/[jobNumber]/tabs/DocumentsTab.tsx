"use client";

import { useMemo, useRef, useState } from "react";
import { Select, Tooltip } from "antd";
import { useToast } from "@/lib/toast";
import { useCanManageDocuments } from "@/lib/auth/AuthContext";
import { useDocumentChangeRequests } from "@/hooks/useDocumentChangeRequests";
import { ChangeAfterApprovalModal, ChangeRequestNote } from "./ChangeAfterApprovalModal";
import {
  InboxOutlined,
  FileTextOutlined,
  CheckOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { useMutation } from "@tanstack/react-query";
import { useShipmentAttachments, type AttachmentItem } from "@/hooks/useShipmentAttachments";
import { api, apiFileUrl } from "@/lib/api";
import { useFilePreview } from "@/hooks/useFilePreview";
import { PreviewButton } from "@/components/PreviewButton";
import { isDangerousShipment } from "@/lib/cargo";
import { fileToBase64 } from "@/lib/files";
import { formatFileSize, docPlural, ExtBadge, CustomsPill } from "./docsShared";
import type { ShipmentItem } from "@/hooks/useShipments";
import { formatDate } from "@/lib/date";
import {
  DOCUMENT_TYPES,
  REQUIRED_DOCUMENT_TYPES,
  SAFETY_PAPERWORK_TYPES,
  requiredDocumentTypes,
  receivedDocumentsByType,
  guessDocumentType,
  isReviewedDocumentType,
  isKnownDocumentType,
  DOCUMENT_GROUPS,
  documentGroupOf,
  documentTypeLabel,
} from "@/lib/documentTypes";
import { CARD } from "../_components/detailStyles";
import { RowActionsMenu } from "../../_components/RowActionsMenu";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Pill } from "@/components/Pill";
import { CountChip } from "@/components/SectionCard";
import {
  BTN,
  BTN_PRIMARY,
  CARD_BAR,
  CARD_ICON,
  CARD_TITLE,
  EMPTY,
  INPUT,
  LABEL_TEXT,
  LINK,
  TD,
  TH,
} from "@/styles/ui";

type AttachmentFile = AttachmentItem;

// The Documents tab in the look of the Shipment Details cards, three cards one under another:
// adding files, the required documents as milestones, and Documents (the app's light indigo bar
// with the count and the search, then one table where each group is a band over its files). The
// file badge and the customs pill are the ones of the Customs section (docsShared).

/** Focus ring for the tab's own links and milestones. */
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1";

/** Whether a drag carries files (not text or a link). */
const isFileDrag = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

/** The app's card header (styles/ui.ts, as SectionHeader in Shipment Details): a light indigo bar, icon, caps title. */
function CardBar({ id, icon, title, right }: { id?: string; icon: React.ReactNode; title: string; right?: React.ReactNode }) {
  return (
    <div className={CARD_BAR}>
      <span aria-hidden className={`${CARD_ICON} shrink-0`}>{icon}</span>
      <h3 id={id} className={`${CARD_TITLE} min-w-0`}>
        {title}
      </h3>
      {right && <div className="ml-auto flex items-center gap-3">{right}</div>}
    </div>
  );
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
  dangerous,
}: {
  byType: Map<string, AttachmentFile>;
  onPick: (type: string) => void;
  /** While the list loads the states are not known yet: grey bars, no Missing. */
  loading: boolean;
  /** Dangerous goods: the safety paperwork is required too. */
  dangerous: boolean;
}) {
  const required = requiredDocumentTypes(dangerous);
  const have = required.filter((t) => byType.has(t)).length;
  const left = required.length - have;
  const milestone = (type: string) => {
      const file = byType.get(type);
      const done = !!file;
      const label = documentTypeLabel(type);
      const body = (
        <>
          <span
            className={`block truncate text-center text-[13px] leading-4 mb-1.5 ${
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
              className={`mt-1 flex items-center justify-center gap-1 text-[11px] font-semibold uppercase tracking-wide ${
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
            <Tooltip title={`Add the ${label === "MSDS" ? label : label.toLowerCase()}`}>
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
  };
  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <h3 id="req-docs-title" className={`m-0 ${LABEL_TEXT}`}>
          Required documents
        </h3>
        <span className="text-[12px] font-medium text-indigo-600 tabular-nums">
          {have} / {required.length}
        </span>
        {!loading && (
          <span className={`ml-auto text-[13px] font-medium ${left ? "text-amber-700" : "text-emerald-700"}`}>
            {left
              ? left === 1
                ? "1 required document is missing"
                : `${left} required documents are missing`
              : "All required documents are in place"}
          </span>
        )}
      </div>
      <ol aria-labelledby="req-docs-title" className="list-none m-0 p-0 grid grid-cols-3 md:grid-cols-6 gap-x-1.5 gap-y-3">
        {REQUIRED_DOCUMENT_TYPES.map(milestone)}
      </ol>
      {dangerous && (
        <div className="mt-3">
          <h3 id="safety-docs-title" className={`m-0 mb-2.5 ${LABEL_TEXT}`}>
            Safety Paperwork
          </h3>
          <ol aria-labelledby="safety-docs-title" className="list-none m-0 p-0 grid grid-cols-2 md:grid-cols-3 gap-x-1.5 gap-y-3">
            {SAFETY_PAPERWORK_TYPES.map(milestone)}
          </ol>
        </div>
      )}
    </div>
  );
}

/** A file waiting to be classified before it is uploaded (docPending in the mockup). */
interface PendingFile {
  id: number;
  file: File;
  name: string;
  size: number;
  type: string;
  /** true when the type came from the file name rather than the user */
  guessed: boolean;
  /** "added": saved and in the Documents list, its line kept in the box until none is left to do. */
  status: "waiting" | "saving" | "added";
}

/** The box's lines, none at all once every one of them is added. */
const clearedWhenDone = (list: PendingFile[]) => (list.every((p) => p.status === "added") ? [] : list);

export function DocumentsTab({ shipment }: { shipment: ShipmentItem }) {
  const toast = useToast();
  const filePreview = useFilePreview();
  const dangerous = isDangerousShipment(shipment);
  // Anyone can add a document; only a manager, an admin or a superadmin can delete one.
  const canManageDocuments = useCanManageDocuments();
  // A regular user changes an approved document by a request for a manager's approval, with the new file.
  const changeRequests = useDocumentChangeRequests(shipment.id, true);
  const [changing, setChanging] = useState<AttachmentFile | null>(null);
  // A document added, removed or classified also changes the shipment itself: its customs
  // status follows the invoice and the packing list, and so do the "received" ticks.
  const { attachments, isLoading, refresh: refreshDocuments, previewSource } = useShipmentAttachments(shipment.id);
  const [search, setSearch] = useState("");

  // Files are classified BEFORE they are uploaded — nothing reaches the list
  // without a document type, so the checklist can never go stale.
  const [pending, setPending] = useState<PendingFile[]>([]);
  const nextPendingId = useRef(0);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Type pre-selected by clicking a "Missing" row in the checklist.
  const presetRef = useRef<string | null>(null);

  // preset: the type of the Missing milestone that opened the picker; files dropped have none.
  const addFiles = (list: FileList | File[] | null, preset: string | null) => {
    if (!list || list.length === 0) return;
    const next = Array.from(list).map((f) => {
      const guess = preset || guessDocumentType(f.name);
      return { id: nextPendingId.current++, file: f, name: f.name, size: f.size, type: guess, guessed: !preset && !!guess, status: "waiting" as const };
    });
    setPending((p) => [...p, ...next]);
  };

  const openPicker = (preset?: string) => {
    presetRef.current = preset ?? null;
    fileInputRef.current?.click();
  };

  // The file is removed from storage too, so Delete asks first.
  const [confirmDelete, setConfirmDelete] = useState<AttachmentFile | null>(null);
  const deleteAttachment = useMutation({
    mutationFn: (attachmentId: string) => api.shipments.attachmentDelete(shipment.id, attachmentId),
    onSuccess: refreshDocuments,
    onError: (e) => toast.error(e instanceof Error && e.message ? e.message : "Could not delete the document"),
  });

  // Saves the given lines: Add to list on one line, or Add to list all on every waiting one.
  const saveLines = async (lines: PendingFile[]) => {
    if (lines.length === 0 || lines.some((p) => !p.type)) return;
    const setStatus = (id: number, status: PendingFile["status"]) =>
      setPending((list) => list.map((x) => (x.id === id ? { ...x, status } : x)));
    const ids = new Set(lines.map((p) => p.id));
    setPending((list) => list.map((x) => (ids.has(x.id) ? { ...x, status: "saving" } : x)));
    const failed: string[] = [];
    for (const p of lines) {
      try {
        const contentBase64 = await fileToBase64(p.file);
        await api.shipments.attachmentCreate(shipment.id, {
          fileName: p.name,
          fileSize: p.size,
          fileType: p.file.type || "application/octet-stream",
          contentBase64,
          documentType: p.type,
        });
        setStatus(p.id, "added");
      } catch (err) {
        // Surface the real reason (size limit, network, server) instead of a
        // generic failure — a silent no-op is impossible to diagnose.
        console.error("Attachment upload failed", p.name, err);
        failed.push(`${p.name}: ${err instanceof Error ? err.message : "unknown error"}`);
        // Back to waiting, so the user can retry without re-picking.
        setStatus(p.id, "waiting");
      }
    }
    // The list first, so a file is never out of both the box and the list.
    await refreshDocuments();
    setPending(clearedWhenDone);

    if (failed.length > 0) {
      toast.error(failed[0] ?? "Could not add the document");
    } else {
      toast.success(lines.length === 1 ? "Document added" : `${lines.length} documents added`);
    }
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

  const byType = useMemo(() => receivedDocumentsByType(attachments), [attachments]);

  // Every card takes dropped files, so a drop that just misses the strip still lands. Only a drag
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
      addFiles(e.dataTransfer.files, null);
    },
  };

  // Safety Paperwork is listed for dangerous goods, or once such a file is on the shipment.
  const shownGroups = DOCUMENT_GROUPS.filter((g) => g.title !== "Safety Paperwork" || dangerous || attachments.some((a) => documentGroupOf(a.documentType) === g));

  return (
    // Adding files (with the required documents as milestones under it) and the list of files,
    // each in its own card.
    <div className="flex flex-col gap-3 min-w-0">
      {filePreview.modal}
      {changing && (
        <ChangeAfterApprovalModal
          document={changing}
          documentSource={previewSource(changing)}
          saving={changeRequests.ask.isPending}
          onSend={(attachmentId, file, reason) => changeRequests.ask.mutateAsync({ attachmentId, file, reason })}
          onClose={() => setChanging(null)}
        />
      )}
      <ConfirmModal
        open={!!confirmDelete}
        danger
        title="Delete document?"
        description={confirmDelete ? `"${confirmDelete.fileName}" will be deleted, the file with it. It cannot be brought back.` : ""}
        confirmLabel="Delete"
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) deleteAttachment.mutate(confirmDelete.id);
          setConfirmDelete(null);
        }}
      />
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
              addFiles(e.target.files, presetRef.current);
              presetRef.current = null;
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
                className={BTN_PRIMARY}
              >
                Browse files
              </button>
              <InboxOutlined aria-hidden className="text-slate-400 text-[18px]" />
              <span className="text-[14px] font-medium text-slate-700">Drag files here</span>
              <span className="text-[13px] text-slate-500">PDF, XLSX, DOCX, JPG</span>
            </div>
          </div>

          {pending.length > 0 && (
            // The files of this upload, one line each. Waiting: the file, its size and type in the
            // middle, its own Cancel / Add to list on the right. Added: size and type move to the
            // right. Under them, for several waiting files, Cancel all / Add to list all.
            <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50/30 overflow-hidden">
              {pending.map((p) => {
                const added = p.status === "added";
                const lineSaving = p.status === "saving";
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 px-4 py-3 flex-wrap lg:flex-nowrap border-b border-indigo-100 last:border-b-0"
                  >
                    <ExtBadge fileName={p.name} className="w-8 h-7" />
                    <span className="min-w-[80px] flex-1 truncate text-[14px] font-medium text-slate-900" title={p.name}>
                      {p.name}
                    </span>
                    {added ? (
                      <Pill tone="green">Added</Pill>
                    ) : (
                      p.guessed && p.type && (
                        <Tooltip title="Guessed from the file name">
                          <Pill tone="green">Guessed</Pill>
                        </Tooltip>
                      )
                    )}
                    <span className="text-[13px] text-slate-500 tabular-nums whitespace-nowrap">{formatFileSize(p.size)}</span>
                    <Select
                      value={p.type || undefined}
                      placeholder="Select type"
                      options={DOCUMENT_TYPES.map((t) => ({ value: t, label: documentTypeLabel(t) }))}
                      onChange={(v) =>
                        setPending((list) =>
                          list.map((x) => (x.id === p.id ? { ...x, type: v, guessed: false } : x)),
                        )
                      }
                      className="w-[190px] shrink-0"
                      status={p.type ? undefined : "warning"}
                      // An added file's type is fixed: no arrow, as nothing can be picked.
                      disabled={added || lineSaving}
                      suffixIcon={added ? null : undefined}
                    />
                    {!added && (
                      <div className="ml-auto flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={lineSaving}
                          onClick={() => setPending((list) => clearedWhenDone(list.filter((x) => x.id !== p.id)))}
                          className={BTN}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={lineSaving || !p.type}
                          onClick={() => saveLines([p])}
                          className={`${BTN_PRIMARY} min-w-[92px] justify-center disabled:hover:bg-indigo-600`}
                        >
                          {lineSaving ? "Adding…" : "Add to list"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {(() => {
                const waiting = pending.filter((x) => x.status === "waiting");
                const untyped = waiting.filter((x) => !x.type).length;
                // One waiting file has its own buttons, the same two again would say nothing.
                const several = waiting.length > 1;
                if (!several && untyped === 0) return null;
                return (
                  <div className="flex items-center justify-end gap-2 flex-wrap px-4 py-3">
                    {untyped > 0 && (
                      <span className="text-[13px] font-medium whitespace-nowrap text-amber-700">
                        {untyped === 1 ? "1 file still needs a type" : `${untyped} files still need a type`}
                      </span>
                    )}
                    {several && (
                      <>
                        {/* Clears the box: what is added stays in the Documents list. */}
                        <button
                          type="button"
                          disabled={pending.some((x) => x.status === "saving")}
                          onClick={() => setPending([])}
                          className={BTN}
                        >
                          Cancel all
                        </button>
                        <button
                          type="button"
                          disabled={untyped > 0 || pending.some((x) => x.status === "saving")}
                          onClick={() => saveLines(waiting)}
                          className={`${BTN_PRIMARY} disabled:hover:bg-indigo-600`}
                        >
                          Add to list all
                        </button>
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </section>

      {/* The required documents as milestones, in a card of their own (as the shipment's progress bar). */}
      <section aria-labelledby="req-docs-title" className={`${CARD} px-4 pt-3.5 pb-3`} {...dropProps}>
        <RequiredMilestones byType={byType} onPick={openPicker} loading={isLoading} dangerous={dangerous} />
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
              <CountChip count={docPlural(attachments.length)} />
              {/* One search for all the groups below, in the card's bar. */}
              <label className={`${INPUT} flex items-center gap-2 w-[200px] sm:w-[240px] focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100`}>
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
              {shownGroups.map((group, gi) => {
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
                        scope="rowgroup"
                        colSpan={6}
                        className={`text-left px-3 py-2.5 bg-indigo-50 shadow-[inset_3px_0_0_var(--color-indigo-500)] whitespace-nowrap ${CARD_TITLE}`}
                      >
                        <span className="inline-flex items-center gap-2">
                          {group.title}
                          <CountChip count={all.length} />
                        </span>
                      </th>
                    </tr>
                    {rows.length > 0 ? (
                      rows.map((file) => (
                        <tr key={file.id} className="hover:bg-slate-50 transition-colors">
                          <td className={TD}>
                            <div className="flex items-center gap-2.5 min-w-0">
                              <ExtBadge fileName={file.fileName} className="w-8 h-7" />
                              <span className="min-w-0 flex-1">
                                <a
                                  href={apiFileUrl(file.contentUrl)}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={filePreview.previewOnClick(previewSource(file))}
                                  title={file.fileName}
                                  className={`block truncate text-[13px] font-medium rounded-sm ${LINK} ${FOCUS}`}
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
                              // No value: the stored type is unknown, so it shows as the placeholder until one is picked.
                              <Select<string>
                                size="small"
                                value={undefined}
                                placeholder={file.documentType || "Select type"}
                                options={DOCUMENT_TYPES.map((t) => ({ value: t, label: documentTypeLabel(t) }))}
                                onChange={(v) => classify.mutate({ id: file.id, documentType: v })}
                                disabled={classify.isPending && classify.variables?.id === file.id}
                                loading={classify.isPending && classify.variables?.id === file.id}
                                className="w-full max-w-[180px]"
                                status="warning"
                              />
                            )}
                          </td>
                          <td className={TD}>
                            <div className="flex flex-col gap-1 items-start">
                              {/* Commercial and customs documents go to customs for review; shipping ones do not. A file
                                  that was reviewed under another type still shows its verdict (and note). */}
                              {isReviewedDocumentType(file.documentType) || file.customsStatus ? (
                                <CustomsPill status={file.customsStatus} />
                              ) : (
                                <span className={EMPTY} title="Not reviewed by customs">—</span>
                              )}
                              {file.customsStatus === "approved" && !canManageDocuments && changeRequests.newestOf.get(file.id)?.status !== "pending" && (
                                <button
                                  type="button"
                                  onClick={() => setChanging(file)}
                                  className={`${LINK} whitespace-nowrap text-[12px] font-medium cursor-pointer bg-transparent border-none p-0`}
                                >
                                  Change after approval
                                </button>
                              )}
                              {file.customsStatus === "approved" && <ChangeRequestNote request={changeRequests.newestOf.get(file.id)} canAnswer={canManageDocuments} preview={filePreview} />}
                              {file.customsStatus === "declined" && file.customsNote && (
                                <span className="text-[12px] italic text-red-700/80 break-words max-w-full">
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
                              <PreviewButton fileName={file.fileName} onClick={() => void filePreview.open(previewSource(file))} />
                              {/* Download and Delete behind "⋯", as the rows of Container and Cargo Details. Download
                                  stays on the page, and a link that no longer works says so. */}
                              <RowActionsMenu
                                label={`Actions for ${file.fileName}`}
                                onDownload={() => void filePreview.download(previewSource(file))}
                                onDelete={canManageDocuments ? () => setConfirmDelete(file) : undefined}
                              />
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : isLoading || all.length > 0 ? (
                      // An empty group is just its band (the count says 0); a line shows only while the
                      // list loads, or when the search hides the group's files.
                      <tr>
                        <td colSpan={6} className="px-2 py-2 text-[13px] text-slate-400">
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

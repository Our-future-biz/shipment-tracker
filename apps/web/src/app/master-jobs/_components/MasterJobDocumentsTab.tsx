"use client";

import { useMemo, useRef, useState } from "react";
import { Select, Tooltip } from "antd";
import { useMutation } from "@tanstack/react-query";
import { FileTextOutlined, InboxOutlined, SearchOutlined } from "@ant-design/icons";
import { useToast } from "@/lib/toast";
import { useCanManageDocuments } from "@/lib/auth/AuthContext";
import { api, apiFileUrl } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import { useFilePreview } from "@/hooks/useFilePreview";
import { PreviewButton } from "@/components/PreviewButton";
import { useMasterJobDocuments, type MasterJobDocumentItem } from "@/hooks/useMasterJobDocuments";
import { fileToBase64 } from "@/lib/files";
import { formatDate } from "@/lib/date";
import { DOCUMENT_GROUPS, DOCUMENT_TYPES, documentGroupOf, documentTypeLabel, guessDocumentType } from "@/lib/documentTypes";
import { ExtBadge, docPlural, formatFileSize } from "@/app/shipments/[jobNumber]/tabs/docsShared";
import { CARD } from "@/app/shipments/[jobNumber]/_components/detailStyles";
import { RowActionsMenu } from "@/app/shipments/_components/RowActionsMenu";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Pill } from "@/components/Pill";
import { CountChip } from "@/components/SectionCard";
import { BTN, BTN_PRIMARY, CARD_BAR, CARD_ICON, CARD_TITLE, INPUT, LINK, TD, TH } from "@/styles/ui";

// A master job's Documents tab, in the shape of a shipment's (DocumentsTab): adding files, each with
// its type chosen before it goes up, and one table of the files in the shipment's groups. The files
// are the master job's own, apart from its houses' documents, so there are no required-document
// milestones and no customs review here (those are a shipment's). Anyone adds a document; only a
// manager, an admin or a superadmin deletes one.

/** Focus ring for the tab's own links. */
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1";

/** Whether a drag carries files (not text or a link). */
const isFileDrag = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

/** A file waiting for its type before it is added. */
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

const TYPE_OPTIONS = DOCUMENT_TYPES.map((t) => ({ value: t, label: documentTypeLabel(t) }));

export function MasterJobDocumentsTab({ masterJob }: { masterJob: interfaces.MasterJobItem }) {
  const toast = useToast();
  const filePreview = useFilePreview();
  const canManageDocuments = useCanManageDocuments();
  const { documents, isLoading, isError, refetch, refresh, previewSource } = useMasterJobDocuments(masterJob.id);
  const [search, setSearch] = useState("");

  // Files get their type BEFORE they are uploaded, so nothing reaches the list unfiled.
  const [pending, setPending] = useState<PendingFile[]>([]);
  const nextPendingId = useRef(0);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | File[] | null) => {
    if (!list || list.length === 0) return;
    const next = Array.from(list).map((f) => {
      const guess = guessDocumentType(f.name);
      return { id: nextPendingId.current++, file: f, name: f.name, size: f.size, type: guess, guessed: !!guess, status: "waiting" as const };
    });
    setPending((p) => [...p, ...next]);
  };

  // The file is removed from storage too, so Delete asks first.
  const [confirmDelete, setConfirmDelete] = useState<MasterJobDocumentItem | null>(null);
  const deleteDocument = useMutation({
    mutationFn: (documentId: string) => api.shipments.masterJobDocumentDelete(masterJob.id, documentId),
    // Read again either way: a document someone else already deleted leaves the list too.
    onSettled: refresh,
    onError: (e) => toast.error(e instanceof Error && e.message ? e.message : "Could not delete the document"),
  });

  // Saves the given lines one after another: Add to list on one line, or Add to list all.
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
        await api.shipments.masterJobDocumentCreate(masterJob.id, {
          fileName: p.name,
          fileType: p.file.type || "application/octet-stream",
          contentBase64,
          documentType: p.type,
        });
        setStatus(p.id, "added");
      } catch (err) {
        // The real reason (size limit, network, server), not a generic failure.
        console.error("Master job document upload failed", p.name, err);
        failed.push(`${p.name}: ${err instanceof Error ? err.message : "unknown error"}`);
        // Back to waiting, so the user can try again without picking the file again.
        setStatus(p.id, "waiting");
      }
    }
    // The list first, so a file is never out of both the box and the list.
    await refresh();
    setPending(clearedWhenDone);

    if (failed.length > 0) toast.error(failed[0] ?? "Could not add the document");
    else toast.success(lines.length === 1 ? "Document added" : `${lines.length} documents added`);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? documents.filter((d) => d.fileName.toLowerCase().includes(q)) : documents;
  }, [documents, search]);

  // Both cards take dropped files, so a drop that just misses the strip still lands. Only a drag of
  // files is taken - text dragged onto the search box goes in as usual.
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

  // The shipment's groups; Safety Paperwork only once such a file is here (a master job has no dangerous-goods flag).
  const shownGroups = DOCUMENT_GROUPS.filter((g) => g.title !== "Safety Paperwork" || documents.some((d) => documentGroupOf(d.documentType) === g));

  return (
    <div className="flex flex-col gap-3 min-w-0">
      {filePreview.modal}
      <ConfirmModal
        open={!!confirmDelete}
        danger
        title="Delete document?"
        description={confirmDelete ? `"${confirmDelete.fileName}" will be deleted, the file with it. It cannot be brought back.` : ""}
        confirmLabel="Delete"
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) deleteDocument.mutate(confirmDelete.id);
          setConfirmDelete(null);
        }}
      />

      {/* Add documents, with no title bar (Browse says it): Browse, the drop strip (a click on it opens
          the picker too) and the files waiting for their type. */}
      <section aria-label="Add documents" className={CARD} {...dropProps}>
        <div className="p-4">
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
            {/* A plain drop zone rather than Upload.Dragger's own pipeline: files wait for their type
                first, and both the drop and Browse hand over real File objects. */}
            <div
              onClick={() => fileInputRef.current?.click()}
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
                  fileInputRef.current?.click();
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
            // The files of this upload, one line each: the file, its size and type, its own Cancel /
            // Add to list. Under them, for several waiting files, Cancel all / Add to list all.
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
                      p.guessed &&
                      p.type && (
                        <Tooltip title="Guessed from the file name">
                          <Pill tone="green">Guessed</Pill>
                        </Tooltip>
                      )
                    )}
                    <span className="text-[13px] text-slate-500 tabular-nums whitespace-nowrap">{formatFileSize(p.size)}</span>
                    <Select
                      value={p.type || undefined}
                      placeholder="Select type"
                      aria-label={`Document type of ${p.name}`}
                      options={TYPE_OPTIONS}
                      onChange={(v) => setPending((list) => list.map((x) => (x.id === p.id ? { ...x, type: v, guessed: false } : x)))}
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
                // One waiting file has its own buttons; the same two again would say nothing.
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

      {/* Documents: how many, the search, and one table for all the groups, so their columns line up;
          each group is a band over its files, and a group with none is just its band. */}
      <section aria-labelledby="mj-docs-title" className={CARD} {...dropProps}>
        <div className={CARD_BAR}>
          <span aria-hidden className={`${CARD_ICON} shrink-0`}>
            <FileTextOutlined />
          </span>
          <h3 id="mj-docs-title" className={`${CARD_TITLE} min-w-0`}>
            Documents
          </h3>
          <div className="ml-auto flex items-center gap-3">
            <CountChip count={docPlural(documents.length)} />
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
          </div>
        </div>
        <div className="p-4">
          {isError ? (
            // A list that failed to load is not an empty one.
            <div role="alert" className="flex items-center gap-3 text-[13px] text-red-600">
              Could not load the documents.
              <button type="button" onClick={() => refetch()} className={BTN}>
                Try again
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-separate border-spacing-0 min-w-[620px]">
                <thead>
                  <tr>
                    <th scope="col" className={`${TH} w-[40%]`}>File</th>
                    <th scope="col" className={TH}>Document type</th>
                    <th scope="col" className={`${TH} w-[180px]`}>Uploaded by</th>
                    <th scope="col" className={`${TH} w-[92px]`}>Date</th>
                    <th scope="col" className={`${TH} w-[64px]`}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                {shownGroups.map((group, gi) => {
                  const inGroup = (d: MasterJobDocumentItem) => documentGroupOf(d.documentType) === group;
                  const all = documents.filter(inGroup);
                  const rows = filtered.filter(inGroup);
                  return (
                    <tbody key={group.title} className="[&>tr:last-child>td]:border-b-0">
                      {/* Air between the groups (none above the first, which sits under the column heads). */}
                      {gi > 0 && (
                        <tr aria-hidden>
                          <td colSpan={5} className="h-4 p-0" />
                        </tr>
                      )}
                      {/* The group's band: light indigo with a firm indigo edge on the left. */}
                      <tr>
                        <th
                          scope="rowgroup"
                          colSpan={5}
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
                              {/* The type is chosen before a file is added and is fixed from then on; a wrong one
                                  is put right by deleting the file and adding it again. */}
                              <span className="block truncate whitespace-nowrap text-[13px] text-slate-700" title={documentTypeLabel(file.documentType)}>
                                {documentTypeLabel(file.documentType)}
                              </span>
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
                                {/* Download and Delete behind "⋯", as on a shipment's documents. Download stays on
                                    the page, and a link that no longer works says so. */}
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
                          <td colSpan={5} className="px-2 py-2 text-[13px] text-slate-400">
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
          )}
        </div>
      </section>
    </div>
  );
}

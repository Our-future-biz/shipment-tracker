"use client";

import { useCanManageDocuments } from "@/lib/auth/AuthContext";
import { useRef, useState } from "react";
import { Button, Input, Tooltip } from "antd";
import { useMessages } from "@/lib/toast";
import { DeleteOutlined, DownloadOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { useMutation } from "@tanstack/react-query";
import { api, apiFileUrl } from "@/lib/api";
import { useFilePreview } from "@/hooks/useFilePreview";
import { PreviewButton } from "@/components/PreviewButton";
import { ConfirmModal } from "@/components/ConfirmModal";
import { fileToBase64, formatFileSize } from "@/lib/files";
import { useShipmentAttachments, type AttachmentItem } from "@/hooks/useShipmentAttachments";
import { guessDocumentType } from "@/lib/documentTypes";
import { ExtBadge } from "@/app/shipments/[jobNumber]/tabs/docsShared";
import { HINT, ICON_BTN_GHOST, LINK } from "@/styles/ui";

// The shipment's documents, as a side panel: just the list, with drag & drop and "+".
// The full page with the required-document checklist lives in the Documents tab.

export function DocumentsPanel({ shipmentId }: { shipmentId: string }) {
  // Anyone can add a document; only a manager, an admin or a superadmin can delete one.
  const canManageDocuments = useCanManageDocuments();
  const messageApi = useMessages();
  const [search, setSearch] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const filePreview = useFilePreview();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { attachments, isLoading, refresh, previewSource } = useShipmentAttachments(shipmentId);
  const files = attachments.filter((a) => a.fileName.toLowerCase().includes(search.trim().toLowerCase()));

  // The file is removed from storage too, so Delete asks first (as in the Documents tab).
  const [confirmDelete, setConfirmDelete] = useState<AttachmentItem | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => api.shipments.attachmentDelete(shipmentId, id),
    onSuccess: refresh,
    onError: () => messageApi.error("Could not delete the document"),
  });

  // The document type is guessed from the file name; it can be corrected in the Documents tab
  // until customs has reviewed the document.
  const upload = async (list: FileList | File[] | null) => {
    const picked = Array.from(list ?? []);
    if (picked.length === 0) return;
    setUploading(true);
    let failed = 0;
    for (const file of picked) {
      try {
        await api.shipments.attachmentCreate(shipmentId, {
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type || "application/octet-stream",
          contentBase64: await fileToBase64(file),
          documentType: guessDocumentType(file.name) || "",
        });
      } catch (err) {
        console.error("Attachment upload failed", file.name, err);
        failed += 1;
      }
    }
    await refresh();
    setUploading(false);
    if (failed) messageApi.error(failed === picked.length ? "Upload failed" : `${failed} of ${picked.length} files failed`);
    else messageApi.success(picked.length === 1 ? "Document added" : `${picked.length} documents added`);
  };

  return (
    <div
      className={`flex flex-col h-full ${dragOver ? "bg-indigo-50" : "bg-white"}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        void upload(e.dataTransfer.files);
      }}
    >
      <input ref={fileInputRef} type="file" multiple hidden onChange={(e) => void upload(e.target.files).finally(() => (e.target.value = ""))} />

      <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-slate-200">
        <Input
          size="small"
          allowClear
          prefix={<SearchOutlined className="text-slate-400" />}
          placeholder="Search by file name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Tooltip title="Add documents">
          <Button
            type="primary"
            aria-label="Add documents"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            icon={<PlusOutlined />}
            className="shrink-0"
          />
        </Tooltip>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && <p className={`${HINT} text-center py-6`}>Loading…</p>}
        {!isLoading && files.length === 0 && (
          <p className={`${HINT} text-center py-10 px-6`}>
            {search ? "No file matches the search." : "No documents yet — drop files here or add them with +."}
          </p>
        )}
        {files.map((f) => (
          <div key={f.id} className="group flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 hover:bg-slate-50">
            <ExtBadge fileName={f.fileName} />
            <div className="min-w-0 flex-1">
              {/* The name opens the file in the app's preview, as the eye does. */}
              <a
                href={apiFileUrl(f.contentUrl)}
                target="_blank"
                rel="noreferrer"
                onClick={filePreview.previewOnClick(previewSource(f))}
                title={f.fileName}
                className={`block text-[13px] font-medium truncate rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${LINK}`}
              >
                {f.fileName}
              </a>
              <div className={`${HINT} truncate`}>
                {formatFileSize(f.fileSize)}
                {f.documentType ? ` · ${f.documentType}` : ""}
                {f.uploadedByName ? ` · ${f.uploadedByName}` : ""}
              </div>
            </div>
            <PreviewButton fileName={f.fileName} onClick={() => void filePreview.open(previewSource(f))} />
            {/* Download stays on the page, and a link that no longer works says so. */}
            <Tooltip title="Download">
              <button
                type="button"
                aria-label={`Download ${f.fileName}`}
                onClick={() => void filePreview.download(previewSource(f))}
                className={`${ICON_BTN_GHOST} !text-slate-500 hover:!text-slate-900`}
              >
                <DownloadOutlined aria-hidden />
              </button>
            </Tooltip>
            {canManageDocuments && (
            <Tooltip title="Delete">
              <button
                type="button"
                aria-label={`Delete ${f.fileName}`}
                onClick={() => setConfirmDelete(f)}
                // Shown on hover, and also when reached with the keyboard.
                className={`${ICON_BTN_GHOST} opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 hover:!text-red-600`}
              >
                <DeleteOutlined />
              </button>
            </Tooltip>
            )}
          </div>
        ))}
      </div>

      {filePreview.modal}
      <ConfirmModal
        open={!!confirmDelete}
        danger
        title="Delete document?"
        description={confirmDelete ? `"${confirmDelete.fileName}" will be deleted, the file with it. It cannot be brought back.` : ""}
        confirmLabel="Delete"
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) remove.mutate(confirmDelete.id);
          setConfirmDelete(null);
        }}
      />

      <div className={`${HINT} shrink-0 px-4 py-2 border-t border-slate-200`}>
        {uploading ? "Uploading…" : dragOver ? "Drop the files to attach them" : `${files.length} file${files.length === 1 ? "" : "s"} · drop files anywhere in this panel`}
      </div>
    </div>
  );
}

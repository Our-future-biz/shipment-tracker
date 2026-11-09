"use client";

import { useCanManageDocuments } from "@/lib/auth/AuthContext";
import { useRef, useState } from "react";
import { Button, Input, Tooltip } from "antd";
import { useMessages } from "@/lib/toast";
import { DeleteOutlined, DownloadOutlined, EyeOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { useMutation } from "@tanstack/react-query";
import { api, apiFileUrl } from "@/lib/api";
import { useFilePreview } from "@/hooks/useFilePreview";
import { fileToBase64, formatFileSize } from "@/lib/files";
import { useShipmentAttachments } from "@/hooks/useShipmentAttachments";
import { guessDocumentType } from "@/lib/documentTypes";
import { ExtBadge } from "@/app/shipments/[jobNumber]/tabs/docsShared";
import { HINT, ICON_BTN_GHOST } from "@/styles/ui";

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

  const { attachments, isLoading, refresh } = useShipmentAttachments(shipmentId);
  const files = attachments.filter((a) => a.fileName.toLowerCase().includes(search.trim().toLowerCase()));

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
              <div className="text-[13px] font-medium text-slate-900 truncate" title={f.fileName}>
                {f.fileName}
              </div>
              <div className={`${HINT} truncate`}>
                {formatFileSize(f.fileSize)}
                {f.documentType ? ` · ${f.documentType}` : ""}
                {f.uploadedByName ? ` · ${f.uploadedByName}` : ""}
              </div>
            </div>
            <Tooltip title="View">
              <button
                type="button"
                aria-label={`View ${f.fileName}`}
                onClick={() => void filePreview.open(f)}
                className={ICON_BTN_GHOST}
              >
                <EyeOutlined />
              </button>
            </Tooltip>
            <Tooltip title="Download">
              <a
                href={apiFileUrl(f.contentUrl, true)}
                // "!": antd colours every <a> in unlayered CSS, which beats the plain utility.
                className={`${ICON_BTN_GHOST} !text-slate-500 hover:!text-slate-900`}
                aria-label={`Download ${f.fileName}`}
              >
                <DownloadOutlined />
              </a>
            </Tooltip>
            {canManageDocuments && (
            <Tooltip title="Delete">
              <button
                type="button"
                aria-label={`Delete ${f.fileName}`}
                onClick={() => remove.mutate(f.id)}
                className={`${ICON_BTN_GHOST} opacity-0 group-hover:opacity-100 hover:!text-red-600`}
              >
                <DeleteOutlined />
              </button>
            </Tooltip>
            )}
          </div>
        ))}
      </div>

      {filePreview.modal}

      <div className={`${HINT} shrink-0 px-4 py-2 border-t border-slate-200`}>
        {uploading ? "Uploading…" : dragOver ? "Drop the files to attach them" : `${files.length} file${files.length === 1 ? "" : "s"} · drop files anywhere in this panel`}
      </div>
    </div>
  );
}

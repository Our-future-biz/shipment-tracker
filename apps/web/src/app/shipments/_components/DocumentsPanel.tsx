"use client";

import { useRef, useState } from "react";
import { Input, Modal, Tooltip, message } from "antd";
import { DeleteOutlined, DownloadOutlined, EyeOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { attachmentContentUrl, fileToBase64 } from "@/lib/files";
import { guessDocumentType } from "@/lib/documentTypes";
import { formatFileSize, ExtBadge } from "@/app/shipments/[jobNumber]/tabs/docsShared";

// The shipment's documents, as a side panel: just the list, with drag & drop and "+".
// The full page with the required-document checklist lives in the Documents tab.

export function DocumentsPanel({ shipmentId }: { shipmentId: string }) {
  const queryClient = useQueryClient();
  const [messageApi, contextHolder] = message.useMessage();
  const [search, setSearch] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Preview is rendered from a blob of the file, not by opening the API URL in a tab:
  // ad blockers tend to block that URL outright (ERR_BLOCKED_BY_CLIENT).
  const [preview, setPreview] = useState<{ name: string; url: string; type: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["shipment-attachments", shipmentId],
    queryFn: () => api.shipments.attachmentList(shipmentId),
  });
  const files = (data?.attachments ?? []).filter((a) => a.fileName.toLowerCase().includes(search.trim().toLowerCase()));

  // The list rows carry the shipment's document types (the Customs "received" ticks follow them).
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["shipments"] });
    return queryClient.invalidateQueries({ queryKey: ["shipment-attachments", shipmentId] });
  };

  const remove = useMutation({
    mutationFn: (id: string) => api.shipments.attachmentDelete(shipmentId, id),
    onSuccess: refresh,
    onError: () => messageApi.error("Could not delete the document"),
  });

  // The document type is guessed from the file name; it can be changed in the Documents tab.
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

  const openPreview = async (f: { id: string; fileName: string; fileType: string }) => {
    try {
      const resp = await fetch(attachmentContentUrl(shipmentId, f.id));
      if (!resp.ok) throw new Error(String(resp.status));
      const blob = await resp.blob();
      setPreview({ name: f.fileName, url: URL.createObjectURL(blob), type: f.fileType });
    } catch {
      messageApi.error("Could not open the document — try downloading it instead");
    }
  };

  const closePreview = () => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
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
      {contextHolder}
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
          <button
            type="button"
            aria-label="Add documents"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 transition-colors border-none cursor-pointer"
          >
            <PlusOutlined />
          </button>
        </Tooltip>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && <p className="text-center text-xs text-slate-400 py-6">Loading…</p>}
        {!isLoading && files.length === 0 && (
          <p className="text-center text-xs text-slate-400 py-10 px-6">
            {search ? "No file matches the search." : "No documents yet — drop files here or add them with +."}
          </p>
        )}
        {files.map((f) => (
          <div key={f.id} className="group flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 hover:bg-slate-50">
            <ExtBadge fileName={f.fileName} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-slate-800 truncate" title={f.fileName}>
                {f.fileName}
              </div>
              <div className="text-[11px] text-slate-400 truncate">
                {formatFileSize(f.fileSize)}
                {f.documentType ? ` · ${f.documentType}` : ""}
                {f.uploadedByName ? ` · ${f.uploadedByName}` : ""}
              </div>
            </div>
            <Tooltip title="View">
              <button
                type="button"
                aria-label={`View ${f.fileName}`}
                onClick={() => void openPreview(f)}
                className="text-slate-400 hover:text-indigo-500 bg-transparent border-none cursor-pointer p-1"
              >
                <EyeOutlined />
              </button>
            </Tooltip>
            <Tooltip title="Download">
              <a
                href={attachmentContentUrl(shipmentId, f.id, true)}
                className="text-slate-400 hover:text-indigo-500 p-1"
                aria-label={`Download ${f.fileName}`}
              >
                <DownloadOutlined />
              </a>
            </Tooltip>
            <Tooltip title="Delete">
              <button
                type="button"
                aria-label={`Delete ${f.fileName}`}
                onClick={() => remove.mutate(f.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 hover:text-red-500 bg-transparent border-none cursor-pointer p-1"
              >
                <DeleteOutlined />
              </button>
            </Tooltip>
          </div>
        ))}
      </div>

      <Modal open={!!preview} title={preview?.name} onCancel={closePreview} footer={null} width="80vw" styles={{ body: { padding: 0, height: "78vh" } }} destroyOnHidden>
        {preview &&
          (preview.type.startsWith("image/") ? (
            <div className="h-full overflow-auto bg-slate-100 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview.url} alt={preview.name} className="max-w-full max-h-full object-contain" />
            </div>
          ) : (
            <iframe src={preview.url} title={preview.name} className="w-full h-full border-0" />
          ))}
      </Modal>

      <div className="shrink-0 px-4 py-2 border-t border-slate-200 text-[11px] text-slate-400">
        {uploading ? "Uploading…" : dragOver ? "Drop the files to attach them" : `${files.length} file${files.length === 1 ? "" : "s"} · drop files anywhere in this panel`}
      </div>
    </div>
  );
}

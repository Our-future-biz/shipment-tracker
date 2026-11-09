"use client";

import { useState } from "react";
import { useCanManageDocuments } from "@/lib/auth/AuthContext";
import { Button, Tooltip, Upload } from "antd";
import { CloseOutlined, DeleteOutlined, DownloadOutlined, FileOutlined, FilePdfOutlined, FileExcelOutlined, FileWordOutlined, InboxOutlined } from "@ant-design/icons";
import { useMutation } from "@tanstack/react-query";
import { api, apiErrorMessage, apiFileUrl } from "@/lib/api";
import { useFilePreview } from "@/hooks/useFilePreview";
import { PreviewButton } from "@/components/PreviewButton";
import { useToast } from "@/lib/toast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { fileToBase64, formatFileSize } from "@/lib/files";
import { useShipmentAttachments } from "@/hooks/useShipmentAttachments";
import { HINT, ICON_BTN_DANGER, ICON_BTN_GHOST, LINK, MODAL_TITLE, REF } from "@/styles/ui";

interface AttachmentsPanelProps {
  shipmentId: string;
  jobNumber: string;
  context?: string;
  onClose: () => void;
}

const fileIcon = (type: string, name: string) => {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (type === "application/pdf" || ext === "pdf") return <FilePdfOutlined className="text-red-500" />;
  if (ext === "xls" || ext === "xlsx") return <FileExcelOutlined className="text-emerald-600" />;
  if (ext === "doc" || ext === "docx") return <FileWordOutlined className="text-indigo-600" />;
  return <FileOutlined className="text-slate-400" />;
};

export const AttachmentsPanel = ({ shipmentId, jobNumber, context, onClose }: AttachmentsPanelProps) => {
  const { attachments: files, refresh, previewSource } = useShipmentAttachments(shipmentId);
  // Anyone can add a document; only a manager, an admin or a superadmin can delete one.
  const canManageDocuments = useCanManageDocuments();

  const toast = useToast();
  const filePreview = useFilePreview();
  // The file whose Delete waits for a yes: a document is not removed by a stray click.
  const [toDelete, setToDelete] = useState<{ id: string; fileName: string } | null>(null);
  const deleteAttachment = useMutation({
    mutationFn: (attachmentId: string) => api.shipments.attachmentDelete(shipmentId, attachmentId),
    onSuccess: () => {
      setToDelete(null);
      refresh();
    },
    onError: (e) => toast.error(`Could not delete the file: ${apiErrorMessage(e)}`),
  });

  const uploadAttachment = useMutation({
    mutationFn: async (file: File) => {
      const contentBase64 = await fileToBase64(file);
      await api.shipments.attachmentCreate(shipmentId, {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type || "application/octet-stream",
        contentBase64,
      });
    },
    onSuccess: refresh,
  });

  return (
    <div className="flex flex-col h-full w-[300px] border-l border-slate-200 bg-white">
      {filePreview.modal}
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-3.5 py-2.5 border-b border-slate-200">
        <div>
          <span className={MODAL_TITLE}>Attachments</span>
          <span className={`${HINT} ${REF} ml-1.5`}>{jobNumber}</span>
          {files.length > 0 && <span className={`${HINT} ml-1`}>({files.length})</span>}
        </div>
        <Button type="text" size="small" onClick={onClose} aria-label="Close" icon={<CloseOutlined className="text-xs" />} />
      </div>

      {/* Context */}
      {context && <div className={`${HINT} px-3.5 py-1.5 border-b border-slate-100`}>{context}</div>}

      {/* Drop zone */}
      <div className="mx-3.5 my-3">
        <Upload.Dragger
          name="file"
          multiple
          showUploadList={false}
          customRequest={({ file, onSuccess, onError }) => {
            uploadAttachment.mutate(file as File, {
              onSuccess: () => onSuccess?.("ok"),
              onError: (err) => {
                toast.error(`Could not upload ${(file as File).name}: ${apiErrorMessage(err)}`);
                onError?.(err as Error);
              },
            });
          }}
        >
          <p className="m-0">
            <InboxOutlined className="text-xl text-indigo-600" />
          </p>
          <p className={`${HINT} mt-1 mb-0`}>{uploadAttachment.isPending ? "Uploading…" : "Drop files or click"}</p>
        </Upload.Dragger>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto px-3.5">
        {files.length === 0 && <p className={`${HINT} text-center p-6`}>No attachments yet</p>}
        {files.map((file) => (
          <div key={file.id} className="flex items-center gap-2 py-1.5 border-b border-slate-100">
            {fileIcon(file.fileType, file.fileName)}
            <div className="flex-1 min-w-0">
              {/* The name opens the file in the app's preview, as the eye does. */}
              <a
                href={apiFileUrl(file.contentUrl)}
                target="_blank"
                rel="noreferrer"
                onClick={filePreview.previewOnClick(previewSource(file))}
                title={file.fileName}
                className={`block text-[13px] font-medium truncate rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${LINK}`}
              >
                {file.fileName}
              </a>
              <div className={`${HINT} tabular-nums`}>{formatFileSize(file.fileSize)}</div>
            </div>
            {/* The row's icons in one look; Download stays on the page, and a link that no longer works says so. */}
            <div className="flex items-center gap-0.5 shrink-0">
              <PreviewButton fileName={file.fileName} onClick={() => void filePreview.open(previewSource(file))} />
              <Tooltip title="Download">
                <button
                  type="button"
                  aria-label={`Download ${file.fileName}`}
                  onClick={() => void filePreview.download(previewSource(file))}
                  className={`${ICON_BTN_GHOST} !text-slate-500 hover:!text-slate-900`}
                >
                  <DownloadOutlined aria-hidden />
                </button>
              </Tooltip>
              {canManageDocuments && (
                <Tooltip title="Delete">
                  <button
                    type="button"
                    aria-label={`Delete ${file.fileName}`}
                    onClick={() => setToDelete({ id: file.id, fileName: file.fileName })}
                    className={ICON_BTN_DANGER}
                  >
                    <DeleteOutlined aria-hidden />
                  </button>
                </Tooltip>
              )}
            </div>
          </div>
        ))}
      </div>
      <ConfirmModal
        open={!!toDelete}
        danger
        title="Delete file?"
        description={`${toDelete?.fileName ?? "The file"} will be deleted from this shipment.`}
        confirmLabel="Delete"
        loading={deleteAttachment.isPending}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && deleteAttachment.mutate(toDelete.id)}
      />
    </div>
  );
};

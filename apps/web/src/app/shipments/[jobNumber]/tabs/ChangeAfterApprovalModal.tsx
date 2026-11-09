"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Input, Modal } from "antd";
import { UploadOutlined } from "@ant-design/icons";
import type { DocumentChangeRequestItem } from "@/hooks/useDocumentChangeRequests";
import { useFilePreview, type PreviewSource } from "@/hooks/useFilePreview";
import { PreviewButton } from "@/components/PreviewButton";
import { useToast } from "@/lib/toast";
import { api, apiErrorMessage, apiFileUrl } from "@/lib/api";
import { formatFileSize } from "./docsShared";
import { HINT, LABEL_TEXT, LINK } from "@/styles/ui";

/** A file at a signed link of the API, as the app's preview opens it. */
type LinkSource = Extract<PreviewSource, { contentUrl: string }>;

interface ChangeAfterApprovalModalProps {
  document: { id: string; fileName: string; documentType: string };
  /** The approved document, for the app's preview; left out, its name is plain text. */
  documentSource?: LinkSource;
  saving: boolean;
  onSend: (attachmentId: string, file: File, reason: string) => Promise<unknown>;
  onClose: () => void;
}

// The request to replace an approved document: the new file and why. It goes to the managers; the
// approved document stays in force until one approves. Both files open in the app's preview.
export function ChangeAfterApprovalModal({ document, documentSource, saving, onSend, onClose }: ChangeAfterApprovalModalProps) {
  const toast = useToast();
  const preview = useFilePreview();
  const [file, setFile] = useState<File | null>(null);
  const [reason, setReason] = useState("");
  const send = () => {
    if (!file) return;
    onSend(document.id, file, reason.trim())
      .then(() => {
        toast.success("Request sent for a manager's approval");
        onClose();
      })
      .catch((e) => toast.error(`Could not send the request: ${apiErrorMessage(e)}`));
  };

  return (
    <>
      {preview.modal}
      <Modal
        open
        title="Change after approval"
        okText="Send request"
        okButtonProps={{ disabled: !file || reason.trim().length < 3, loading: saving }}
        onOk={send}
        onCancel={onClose}
        destroyOnHidden
      >
        <p className={`${HINT} mb-3`}>
          The approved document stays in force until a manager approves. Then the new file takes its place and goes back to customs for review. You will see the answer under the bell.
        </p>
        <div className={`${LABEL_TEXT} mb-1`}>Approved document</div>
        <div className="flex items-center gap-1 mb-3 min-w-0">
          <p className="m-0 min-w-0 text-[13px] text-slate-900 break-words">
            {documentSource ? (
              <a href={apiFileUrl(documentSource.contentUrl)} target="_blank" rel="noreferrer" onClick={preview.previewOnClick(documentSource)} className={LINK}>
                {document.fileName}
              </a>
            ) : (
              document.fileName
            )}
            {document.documentType ? ` · ${document.documentType}` : ""}
          </p>
          {documentSource && <PreviewButton fileName={document.fileName} onClick={() => void preview.open(documentSource)} />}
        </div>
        <div className={`${LABEL_TEXT} mb-1`}>New file</div>
        <div className="flex items-center gap-3 mb-3 min-w-0">
          <label className="shrink-0">
            <input type="file" hidden aria-label="New file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <Button icon={<UploadOutlined />} onClick={(e) => (e.currentTarget.parentElement?.querySelector("input") as HTMLInputElement | null)?.click()}>
              Choose file
            </Button>
          </label>
          {file && (
            // The file picked, as it will be sent: a look at it before sending.
            <span className="min-w-0 flex items-center gap-1 text-[13px] text-slate-900">
              <button
                type="button"
                title={file.name}
                onClick={() => void preview.open(localSource(file))}
                className={`${LINK} min-w-0 truncate bg-transparent border-0 p-0 cursor-pointer text-left`}
              >
                {file.name}
              </button>
              <span className="shrink-0 whitespace-nowrap">· {formatFileSize(file.size)}</span>
              <PreviewButton fileName={file.name} onClick={() => void preview.open(localSource(file))} />
            </span>
          )}
        </div>
        <label className={`block ${LABEL_TEXT} mb-1`}>Why does it have to change?</label>
        <Input.TextArea rows={3} maxLength={1000} value={reason} aria-label="Why does it have to change?" onChange={(e) => setReason(e.target.value)} />
      </Modal>
    </>
  );
}

/** A file picked on this computer, for the app's preview. */
const localSource = (file: File): PreviewSource => ({ fileName: file.name, fileType: file.type, load: async () => file });

// What became of the newest request to replace an approved document, while it still says something:
// an approved one is the document now shown. With the page's preview, the new file waiting opens in it.
export function ChangeRequestNote({
  request,
  canAnswer,
  preview,
}: {
  request?: DocumentChangeRequestItem;
  canAnswer: boolean;
  preview?: Pick<ReturnType<typeof useFilePreview>, "previewOnClick">;
}) {
  if (request?.status === "pending") {
    const { id, shipmentId, newFileName, newFileUrl } = request;
    const newFile =
      preview && newFileUrl ? (
        <a
          href={apiFileUrl(newFileUrl)}
          target="_blank"
          rel="noreferrer"
          onClick={preview.previewOnClick({
            fileName: newFileName,
            contentUrl: newFileUrl,
            // The link lasts an hour; a fresh one comes with the shipment's requests read again.
            refreshUrl: async () => (await api.shipments.documentChangeRequestsOfShipment(shipmentId)).requests.find((r) => r.id === id)?.newFileUrl,
          })}
          className={LINK}
        >
          {newFileName}
        </a>
      ) : (
        newFileName
      );
    return (
      <small className="col-span-2 block w-full whitespace-normal text-[11px] leading-4 text-amber-700">
        {request.requestedByName || "Someone"} asked to replace it with {newFile}: waiting for a manager&apos;s approval.
        {canAnswer && (
          <Link href="/warehouse-concept/managers?tab=approvals" className={`${LINK} ml-1`}>
            Answer in Approvals
          </Link>
        )}
      </small>
    );
  }
  if (request?.status === "rejected") {
    return (
      <small className="col-span-2 block w-full whitespace-normal text-[11px] leading-4 text-red-700">
        Change to {request.newFileName} rejected{request.decidedByName ? ` by ${request.decidedByName}` : ""}: {request.comment}
      </small>
    );
  }
  return null;
}

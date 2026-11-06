"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Input, Modal } from "antd";
import { UploadOutlined } from "@ant-design/icons";
import type { DocumentChangeRequestItem } from "@/hooks/useDocumentChangeRequests";
import { useToast } from "@/lib/toast";
import { formatFileSize } from "./docsShared";
import { HINT, LABEL_TEXT, LINK } from "@/styles/ui";

interface ChangeAfterApprovalModalProps {
  document: { id: string; fileName: string; documentType: string };
  saving: boolean;
  onSend: (attachmentId: string, file: File, reason: string) => Promise<unknown>;
  onClose: () => void;
}

// The request to replace an approved document: the new file and why. It goes to the managers; the
// approved document stays in force until one approves.
export function ChangeAfterApprovalModal({ document, saving, onSend, onClose }: ChangeAfterApprovalModalProps) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [reason, setReason] = useState("");
  const send = () => {
    if (!file) return;
    onSend(document.id, file, reason.trim())
      .then(() => {
        toast.success("Request sent for a manager's approval");
        onClose();
      })
      .catch((e) => toast.error(e instanceof Error && e.message ? e.message : "Could not send the request"));
  };

  return (
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
      <p className="text-[13px] text-slate-900 mb-3 break-words">
        {document.fileName}
        {document.documentType ? ` · ${document.documentType}` : ""}
      </p>
      <div className={`${LABEL_TEXT} mb-1`}>New file</div>
      <div className="flex items-center gap-3 mb-3 min-w-0">
        <label className="shrink-0">
          <input type="file" hidden aria-label="New file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <Button icon={<UploadOutlined />} onClick={(e) => (e.currentTarget.parentElement?.querySelector("input") as HTMLInputElement | null)?.click()}>
            Choose file
          </Button>
        </label>
        {file && (
          <span className="min-w-0 truncate text-[13px] text-slate-900" title={file.name}>
            {file.name} · {formatFileSize(file.size)}
          </span>
        )}
      </div>
      <label className={`block ${LABEL_TEXT} mb-1`}>Why does it have to change?</label>
      <Input.TextArea rows={3} maxLength={1000} value={reason} aria-label="Why does it have to change?" onChange={(e) => setReason(e.target.value)} />
    </Modal>
  );
}

// What became of the newest request to replace an approved document, while it still says something:
// an approved one is the document now shown.
export function ChangeRequestNote({ request, canAnswer }: { request?: DocumentChangeRequestItem; canAnswer: boolean }) {
  if (request?.status === "pending") {
    return (
      <small className="col-span-2 block w-full whitespace-normal text-[11px] leading-4 text-amber-700">
        {request.requestedByName || "Someone"} asked to replace it with {request.newFileName}: waiting for a manager&apos;s approval.
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

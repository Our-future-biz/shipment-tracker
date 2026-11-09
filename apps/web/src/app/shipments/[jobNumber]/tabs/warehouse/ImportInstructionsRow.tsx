"use client";

import { useState } from "react";
import { Alert, Button, Form, Input, Modal, Popconfirm } from "antd";
import { CheckCircleFilled, CopyOutlined, EyeOutlined, LinkOutlined } from "@ant-design/icons";
import type { Messages } from "@/lib/toast";
import { ImportInstructionsFields, completeAnswers, type ImportAnswers } from "@/components/ImportInstructionsFields";
import { useImportInstructions } from "@/hooks/useImportInstructions";
import { apiErrorMessage } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import { formatDate, formatDateTime } from "@/lib/date";
import { BTN_BAR, BTN_BAR_PRIMARY, HINT, LABEL_TEXT } from "@/styles/ui";

type State = interfaces.ImportInstructionState;

const COMPARED: { key: keyof interfaces.ImportInstructionShipmentValues; label: string }[] = [
  { key: "customsProcedure", label: "Customs Procedure" },
  { key: "customsOffice", label: "Customs Office" },
  { key: "hsCode", label: "HS code" },
  { key: "deliveryAddress", label: "Delivery address" },
];

// Import Instructions in Shipments → Warehouse → Push to customers: the link for the customer, and once
// it is filled in the preview in which whoever may change the shipment's details (its Person in Charge,
// its Holiday Cover or a manager) edits, approves or rejects. An approved form shows what was approved,
// and what the customer had sent of each answer changed before approving.
export function ImportInstructionsRow({ shipmentId, className, messageApi }: { shipmentId: string; className: string; messageApi: Messages }) {
  const { state, askable, canAsk, createLink, cancelLink, approve, reject } = useImportInstructions(shipmentId);
  const [url, setUrl] = useState("");
  const [reviewing, setReviewing] = useState(false);

  if (!askable && !state) return null;

  const status = state && !state.expired ? state.status : null;
  const create = () =>
    createLink.mutate(undefined, {
      onSuccess: (answer) => setUrl(answer.url),
      onError: (e) => messageApi.error(apiErrorMessage(e)),
    });
  const copy = () =>
    void navigator.clipboard.writeText(url).then(
      () => messageApi.success("Link copied"),
      () => messageApi.error("Could not copy the link: select it and copy it by hand"),
    );

  return (
    <li className={`flex items-center gap-3 min-h-[40px] py-1.5 ${className}`}>
      <span className={`${LABEL_TEXT} w-[120px] shrink-0`}>Import Instructions</span>
      <span className="flex-1 min-w-0">
        {status === "open" && <span className="text-[13px] font-medium text-slate-700">Link created · valid until {formatDate(state!.expiresAt)}</span>}
        {status === "submitted" && <span className="text-[13px] font-medium text-amber-700">Completed by {state!.answers?.name || "the customer"} · waiting for approval</span>}
        {status === "approved" && (
          <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-emerald-700">
            <CheckCircleFilled /> Approved {state!.decidedAt ? formatDate(state!.decidedAt) : ""}
          </span>
        )}
        {status === "rejected" && (
          <>
            <span className="text-[13px] font-medium text-red-600">Rejected {state!.decidedAt ? formatDate(state!.decidedAt) : ""}</span>
            <span className={`block truncate ${HINT}`} title={state!.reason}>{state!.reason}</span>
          </>
        )}
        {!status && <span className="text-[13px] text-slate-400">{state?.expired ? "The link expired" : "Not sent"}</span>}
      </span>
      {(status === "submitted" || status === "approved") && (
        <button type="button" className={status === "submitted" && state!.canAnswer ? BTN_BAR_PRIMARY : BTN_BAR} onClick={() => setReviewing(true)}>
          <EyeOutlined /> {status === "submitted" && state!.canAnswer ? "Review" : "View"}
        </button>
      )}
      {status === "open" && state!.canAnswer && (
        <Popconfirm title="Cancel this link?" description="The customer will no longer be able to use it." okText="Cancel link" cancelText="Keep it" onConfirm={() => cancelLink.mutate(undefined, { onError: (e) => messageApi.error(apiErrorMessage(e)) })}>
          <button type="button" className={BTN_BAR}>Cancel link</button>
        </Popconfirm>
      )}
      {(!status || status === "rejected") && askable && canAsk && (
        <button type="button" className={BTN_BAR_PRIMARY} disabled={createLink.isPending} onClick={create}>
          <LinkOutlined /> Create link
        </button>
      )}

      <Modal open={!!url} title="Import Instructions link" onCancel={() => setUrl("")} footer={<Button onClick={() => setUrl("")}>Close</Button>} destroyOnHidden>
        <div className="flex flex-col gap-2 pt-1">
          <Alert type="success" showIcon message="The link is ready. Copy it now and send it to the customer: it can't be shown again." />
          <div className="flex gap-2">
            <Input readOnly aria-label="Import Instructions link" value={url} onFocus={(e) => e.target.select()} />
            <Button type="primary" icon={<CopyOutlined />} onClick={copy}>Copy</Button>
          </div>
          <span className={HINT}>It can be used once, for 14 days.</span>
        </div>
      </Modal>

      {reviewing && state && (
        <ReviewModal
          state={state}
          readOnly={status !== "submitted" || !state.canAnswer}
          busy={approve.isPending || reject.isPending}
          onClose={() => setReviewing(false)}
          onApprove={(answers) =>
            approve.mutate(answers, {
              onSuccess: () => {
                setReviewing(false);
                messageApi.success("Import Instructions approved");
              },
              onError: (e) => messageApi.error(apiErrorMessage(e)),
            })
          }
          onReject={(reason) =>
            reject.mutate(reason, {
              onSuccess: () => {
                setReviewing(false);
                messageApi.success("Import Instructions rejected");
              },
              onError: (e) => messageApi.error(apiErrorMessage(e)),
            })
          }
        />
      )}
    </li>
  );
}

interface ReviewModalProps {
  state: State;
  readOnly: boolean;
  busy: boolean;
  onClose: () => void;
  onApprove: (answers: ImportAnswers) => void;
  onReject: (reason: string) => void;
}

function ReviewModal({ state, readOnly, busy, onClose, onApprove, onReject }: ReviewModalProps) {
  const [form] = Form.useForm<ImportAnswers>();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const handleApprove = async () => {
    try {
      onApprove(completeAnswers(await form.validateFields()));
    } catch {
      // The form shows what is missing.
    }
  };

  const footer = readOnly ? (
    <Button onClick={onClose}>Close</Button>
  ) : rejecting ? (
    <div className="flex justify-end gap-2">
      <Button onClick={() => setRejecting(false)} disabled={busy}>Back</Button>
      <Button danger type="primary" loading={busy} disabled={reason.trim().length < 3} onClick={() => onReject(reason)}>Reject</Button>
    </div>
  ) : (
    <div className="flex justify-end gap-2">
      <Button onClick={onClose} disabled={busy}>Close</Button>
      <Button danger onClick={() => setRejecting(true)} disabled={busy}>Reject</Button>
      <Button type="primary" loading={busy} onClick={() => void handleApprove()}>Approve</Button>
    </div>
  );

  return (
    <Modal open title="Import Instructions" onCancel={onClose} footer={footer} width={760} maskClosable={false} destroyOnHidden>
      <div className={`${HINT} mb-3`}>
        {state.submittedAt ? `Completed ${formatDateTime(state.submittedAt)}` : ""}
        {state.decidedBy ? ` · approved by ${state.decidedBy}` : ""}
      </div>
      {state.changes.length > 0 && (
        <Alert
          type="warning"
          showIcon
          className="!mb-3"
          message={`Changed on approval${state.decidedBy ? ` by ${state.decidedBy}` : ""}: below is what was approved. The customer had sent:`}
          description={
            <dl className="m-0 grid grid-cols-[150px_1fr] gap-y-1 text-[13px]">
              {state.changes.map((c) => (
                <div key={c.field} className="contents">
                  <dt className="text-slate-500">{c.label}</dt>
                  <dd className="m-0 min-w-0 break-words text-slate-900">{c.sent || <span className="text-slate-400">Empty</span>}</dd>
                </div>
              ))}
            </dl>
          }
        />
      )}
      {rejecting && (
        <label className="block mb-3">
          <span className={`block ${LABEL_TEXT} mb-1`}>Why are they rejected?</span>
          <Input.TextArea autoFocus rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          <span className={`block ${HINT} mt-1`}>Nothing reaches the shipment. You then tell the customer yourself and can create a new link.</span>
        </label>
      )}
      {/* What was approved once it is; until then the customer's answers, as sent, for the reviewer to edit. */}
      <Form form={form} layout="vertical" requiredMark={false} initialValues={state.approvedAnswers ?? state.answers ?? undefined} disabled={readOnly || busy}>
        <ImportInstructionsFields form={form} />
      </Form>
      {!readOnly && (
        <div className="border-t border-slate-200 pt-3 mt-2">
          <div className={`${LABEL_TEXT} mb-1`}>On the shipment now</div>
          <p className={`${HINT} mt-0 mb-2`}>Approving fills only the empty ones. What is filled in already stays.</p>
          <dl className="m-0 grid grid-cols-[150px_1fr] gap-y-1 text-[13px]">
            {COMPARED.map((c) => (
              <div key={c.key} className="contents">
                <dt className="text-slate-500">{c.label}</dt>
                <dd className="m-0 text-slate-900">{state.onShipment[c.key] || <span className="text-slate-400">Empty</span>}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </Modal>
  );
}

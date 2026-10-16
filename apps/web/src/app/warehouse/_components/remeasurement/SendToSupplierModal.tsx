"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Input, Modal, Spin, Tag } from "antd";
import { PaperClipOutlined, LinkOutlined } from "@ant-design/icons";
import { APIError, ErrCode } from "@/lib/api/client";
import { useToast } from "@/lib/toast";
import { errorMessage } from "../../gate-log/_lib/gate";
import { uuid } from "../../floor/_lib/queue";
import type { SupplierKind } from "@/hooks/useWarehouseSettings";
import { useSendToSupplier, useSupplierEmailPreview } from "@/hooks/useSupplierEmail";

// "Send VGM / survey / remeasurement": shows who gets it, the subject, the text and the files, then
// e-mails it. Only when the provider took it is it recorded as sent; a failure is shown here in red
// with "Retry" and nothing is marked as sent.

export const SEND_LABEL: Record<SupplierKind, string> = { vgm: "VGM", survey: "survey", remeasurement: "remeasurement" };
const TITLE: Record<SupplierKind, string> = { vgm: "VGM", survey: "Survey", remeasurement: "Remeasurement" };
const HOW: Record<string, string> = { attached: "attached", linked: "download link (7 days)", listed: "named only — on file" };

const size = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} kB`);

export function SendToSupplierModal({ taskId, what, onClose }: { taskId: string; what: SupplierKind | null; onClose: () => void }) {
  const toast = useToast();
  const preview = useSupplierEmailPreview(taskId, what);
  const send = useSendToSupplier(taskId);
  const [note, setNote] = useState("");
  const [requestId, setRequestId] = useState(() => uuid());
  const [failure, setFailure] = useState<string | null>(null);
  // How the last try ended when it was not a plain failure: "sent" = e-mailed but not marked as
  // sent (no resend — record it with Mark as sent); "unsure" = no answer in time (may have gone out).
  const [outcome, setOutcome] = useState<"failed" | "sent" | "unsure">("failed");

  // A new send each time the dialog opens.
  useEffect(() => {
    if (!what) return;
    setNote("");
    setFailure(null);
    setOutcome("failed");
    setRequestId(uuid());
  }, [what]);

  const close = () => {
    if (send.isPending) return;
    onClose();
  };

  const doSend = async () => {
    if (!what || outcome === "sent") return;
    setFailure(null);
    try {
      const res = await send.mutateAsync({ what, note: note.trim(), clientRequestId: requestId });
      toast.success(`${TITLE[what]} e-mailed to ${(res.email?.to ?? []).join(", ")} — recorded as sent and logged`);
      onClose();
    } catch (e) {
      // A refused send (provider error, no key) is a finished attempt: a retry is a new send.
      // A lost answer or "still being sent" keeps the same id, so the server answers what it did.
      // E-mailed but not marked as sent (Internal): no new send at all — it is recorded with Mark
      // as sent. No answer from the provider in time (DeadlineExceeded): it may have gone out, so
      // sending again is an explicit "Send again anyway".
      const code = e instanceof APIError ? e.code : null;
      setOutcome(code === ErrCode.Internal ? "sent" : code === ErrCode.DeadlineExceeded ? "unsure" : "failed");
      if (code && code !== ErrCode.Aborted && code !== ErrCode.Internal) setRequestId(uuid());
      setFailure(errorMessage(e, "The e-mail could not be sent — check the connection and retry"));
    }
  };

  const p = preview.data;
  const notSetUp = preview.error instanceof APIError && preview.error.code === ErrCode.FailedPrecondition;
  return (
    <Modal
      open={!!what}
      title={what ? `Send ${SEND_LABEL[what]} to the supplier` : ""}
      onCancel={close}
      width={760}
      destroyOnHidden
      footer={[
        <Button key="cancel" onClick={close} disabled={send.isPending}>
          Cancel
        </Button>,
        <Button key="send" type="primary" onClick={doSend} loading={send.isPending} disabled={!p || preview.isFetching || (!!failure && outcome === "sent")}>
          {failure ? (outcome === "unsure" ? "Send again anyway" : outcome === "sent" ? "Already e-mailed" : "Retry") : what ? `Send ${SEND_LABEL[what]}` : "Send"}
        </Button>,
      ]}
    >
      {preview.isLoading ? (
        <div className="flex justify-center p-10">
          <Spin />
        </div>
      ) : preview.isError ? (
        <Alert
          type={notSetUp ? "info" : "error"}
          showIcon
          message={errorMessage(preview.error, "The e-mail could not be prepared — reload and try again")}
          description={notSetUp ? "Use Mark as sent to record it, or set recipients in Warehouse settings." : undefined}
        />
      ) : p ? (
        <div className="flex flex-col gap-3 text-xs">
          {failure && outcome === "sent" && (
            <Alert
              type="warning"
              showIcon
              message="E-mailed, but not marked as sent"
              description={<span className="break-words">{failure}. Close this and use Mark as sent on the row to record it.</span>}
            />
          )}
          {failure && outcome === "unsure" && (
            <Alert
              type="warning"
              showIcon
              message="Not marked as sent — the e-mail may still have gone out"
              description={<span className="break-words">{failure}</span>}
              action={
                <Button size="small" danger onClick={doSend} loading={send.isPending}>
                  Send again anyway
                </Button>
              }
            />
          )}
          {failure && outcome === "failed" && (
            <Alert
              type="error"
              showIcon
              message="Not sent — nothing was marked as sent"
              description={<span className="break-words">{failure}</span>}
              action={
                <Button size="small" danger onClick={doSend} loading={send.isPending}>
                  Retry
                </Button>
              }
            />
          )}
          <div className="grid grid-cols-[60px_1fr] gap-x-3 gap-y-1">
            <span className="text-slate-500">To</span>
            <span className="break-words">{p.to.join(", ")}</span>
            {p.cc.length > 0 && (
              <>
                <span className="text-slate-500">Cc</span>
                <span className="break-words">{p.cc.join(", ")}</span>
              </>
            )}
            <span className="text-slate-500">Subject</span>
            <span className="font-semibold text-slate-800 break-words">{p.subject}</span>
          </div>
          <pre className="m-0 max-h-[320px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50 p-3 font-sans text-xs text-slate-700">{p.text}</pre>
          {p.attachments.length > 0 && (
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">Files</div>
              <ul className="list-none m-0 p-0 flex flex-col gap-0.5">
                {p.attachments.map((a) => (
                  <li key={a.fileId} className="flex items-center gap-2">
                    {a.how === "attached" ? <PaperClipOutlined className="text-slate-400" /> : <LinkOutlined className="text-slate-400" />}
                    <span className="break-all">{a.fileName}</span>
                    <span className="text-slate-400">{size(a.size)}</span>
                    <Tag className="m-0" color={a.how === "attached" ? "blue" : undefined}>
                      {HOW[a.how] ?? a.how}
                    </Tag>
                  </li>
                ))}
              </ul>
              <div className="text-[11px] text-slate-400 mt-1">At most 5 files and 10 MB are attached; the rest go as download links.</div>
            </div>
          )}
          <Input.TextArea placeholder="Add a note to the e-mail (optional)…" rows={3} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} aria-label="Note to the supplier" />
          <p className="m-0 text-[11px] text-slate-500">
            It is recorded as sent only once the e-mail went out — with the recipients, in the history and in History.
            {what === "vgm" ? " This is a summary of the warehouse weighing, not a signed SOLAS VGM declaration." : ""}
          </p>
        </div>
      ) : null}
    </Modal>
  );
}

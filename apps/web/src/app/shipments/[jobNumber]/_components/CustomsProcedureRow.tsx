"use client";

import { useState } from "react";
import Link from "next/link";
import { ConfigProvider, Input, Modal, Select } from "antd";
import { useCustomsOfficeRequest, type CustomsOfficeRequestItem } from "@/hooks/useCustomsOfficeRequests";
import { useCanChangeCustomsOffice } from "@/lib/auth/AuthContext";
import { CUSTOMS_OFFICES, CUSTOMS_PROCEDURE_LOCKED_HINT, customsProcedureLocked, namesCustomsOffice } from "@/lib/customsOffices";
import { apiErrorMessage } from "@/lib/api";
import { foldIncludes } from "@/lib/fold";
import { useToast } from "@/lib/toast";
import { HINT, LABEL_TEXT, LINK } from "@/styles/ui";
import { EditableCell } from "./EditableCell";
import { LABEL, LABEL_W, ROW } from "./detailStyles";

const OFFICE_OPTIONS = CUSTOMS_OFFICES.map((office) => ({ value: office, label: office }));
const filterOffice = (input: string, option?: { label?: string }) => foldIncludes(option?.label ?? "", input);

interface CustomsProcedureRowProps {
  label: string;
  value?: string | null;
  shipmentId: string;
  customsOffice?: string | null;
  onCommit: (fieldKey: string, value: string) => void;
  displayStyle?: React.CSSProperties;
  labelW?: string;
}

// Customs Procedure, and beside it when that is T1 the Customs Office, picked from the list by its
// code or name. Empty, the box is marked as still to do; with no room beside, it goes under. Once
// chosen, a regular user sees both as fixed: the office changes by a request for a manager's
// approval, and leaving T1 takes a manager (the server holds to the same).
export function CustomsProcedureRow({ label, value, shipmentId, customsOffice, onCommit, displayStyle, labelW = LABEL_W }: CustomsProcedureRowProps) {
  const canChange = useCanChangeCustomsOffice();
  const t1 = namesCustomsOffice(value);
  const office = t1 ? customsOffice || "" : "";
  // The grids hold to the same check (ShipmentsTable).
  const locked = customsProcedureLocked(value, customsOffice, canChange);
  const { request, ask } = useCustomsOfficeRequest(shipmentId, !!office);
  const [asking, setAsking] = useState(false);
  const waiting = request?.status === "pending";

  return (
    // A department's own fields: not disabled with a read-only card around them.
    <ConfigProvider componentDisabled={false}>
    <div className={`${ROW} ${t1 ? "flex-wrap" : ""}`}>
      <span className={LABEL.replace(LABEL_W, labelW)}>{label}</span>
      {locked ? (
        <span className="w-[80px] shrink-0 text-slate-900" style={displayStyle} title={CUSTOMS_PROCEDURE_LOCKED_HINT}>
          {value}
        </span>
      ) : (
        <EditableCell
          className={t1 ? "w-[80px] shrink-0" : "flex-1 min-w-0"}
          fieldKey="customsProcedure"
          value={value}
          onCommit={onCommit}
          placeholder="—"
          displayClassName="text-slate-900"
          emptyClassName="text-slate-400"
          displayStyle={displayStyle}
        />
      )}
      {t1 && (
        <div className="flex items-center gap-3 flex-1 min-w-[280px]" title={office || undefined}>
          <span className={`${LABEL_TEXT} shrink-0`}>Customs Office</span>
          {locked ? (
            <span className="flex-1 min-w-0 truncate text-slate-900">{office}</span>
          ) : (
            <Select
              size="small"
              showSearch
              allowClear
              aria-label="Customs Office"
              className="flex-1 min-w-0"
              popupMatchSelectWidth={520}
              placeholder="Select customs office"
              status={office ? undefined : "warning"}
              value={office || undefined}
              options={OFFICE_OPTIONS}
              filterOption={filterOffice}
              onChange={(next) => onCommit("customsOffice", next ?? "")}
            />
          )}
        </div>
      )}
      {/* On a line of its own, so the office beside the procedure keeps its room. */}
      {locked && !waiting && (
        <div className="basis-full text-right">
          <button type="button" onClick={() => setAsking(true)} className={`${LINK} text-[12px] font-medium cursor-pointer bg-transparent border-none p-0`}>
            Request change
          </button>
        </div>
      )}
      {office && request && <RequestStatus request={request} office={office} canAnswer={canChange} />}
      {asking && (
        <RequestChangeModal
          office={office}
          saving={ask.isPending}
          onSend={(toOffice, reason) => ask.mutateAsync({ toOffice, reason })}
          onClose={() => setAsking(false)}
        />
      )}
    </div>
    </ConfigProvider>
  );
}

// What became of the newest request, while it still says something: an approved one is the office
// now shown, and a rejected one is about the office it asked to replace.
function RequestStatus({ request, office, canAnswer }: { request: CustomsOfficeRequestItem; office: string; canAnswer: boolean }) {
  if (request.status === "pending") {
    return (
      <div className={`basis-full ${HINT} !text-amber-700`}>
        {request.requestedByName || "Someone"} asked to change it to {request.toOffice}: waiting for a manager&apos;s approval.
        {canAnswer && (
          <Link href="/warehouse-concept/managers?tab=approvals" className={`${LINK} ml-1`}>
            Answer in Approvals
          </Link>
        )}
      </div>
    );
  }
  if (request.status === "rejected" && request.fromOffice === office) {
    return (
      <div className={`basis-full ${HINT} !text-red-700`}>
        Change to {request.toOffice} rejected{request.decidedByName ? ` by ${request.decidedByName}` : ""}: {request.comment}
      </div>
    );
  }
  return null;
}

interface RequestChangeModalProps {
  office: string;
  saving: boolean;
  onSend: (toOffice: string, reason: string) => Promise<unknown>;
  onClose: () => void;
}

// The request: the office wanted and why. It goes to the managers; nothing changes until one approves.
function RequestChangeModal({ office, saving, onSend, onClose }: RequestChangeModalProps) {
  const toast = useToast();
  const [toOffice, setToOffice] = useState<string>();
  const [reason, setReason] = useState("");
  const send = () => {
    if (!toOffice) return;
    onSend(toOffice, reason.trim())
      .then(() => {
        toast.success("Request sent for a manager's approval");
        onClose();
      })
      .catch((e) => toast.error(`Could not send the request: ${apiErrorMessage(e)}`));
  };

  return (
    <Modal
      open
      title="Request a change of Customs Office"
      okText="Send request"
      okButtonProps={{ disabled: !toOffice || reason.trim().length < 3, loading: saving }}
      onOk={send}
      onCancel={onClose}
      destroyOnHidden
    >
      <p className={`${HINT} mb-3`}>Nothing changes until a manager approves. You will see the answer under the bell.</p>
      <div className={`${LABEL_TEXT} mb-1`}>Current Customs Office</div>
      <p className="text-[13px] text-slate-900 mb-3">{office}</p>
      <label className={`block ${LABEL_TEXT} mb-1`}>New Customs Office</label>
      <Select
        showSearch
        autoFocus
        aria-label="New Customs Office"
        className="w-full mb-3"
        placeholder="Search by code or name"
        value={toOffice}
        options={OFFICE_OPTIONS.filter((o) => o.value !== office)}
        filterOption={filterOffice}
        onChange={setToOffice}
      />
      <label className={`block ${LABEL_TEXT} mb-1`}>Why does it have to change?</label>
      <Input.TextArea rows={3} maxLength={1000} value={reason} aria-label="Why does it have to change?" onChange={(e) => setReason(e.target.value)} />
    </Modal>
  );
}

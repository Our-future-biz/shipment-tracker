"use client";

import { useState } from "react";
import { Input, Button, Modal, Upload } from "antd";
import { CheckCircleFilled, InboxOutlined, SendOutlined } from "@ant-design/icons";
import type { MessageInstance } from "antd/es/message/interface";
import { SectionChangedError, useWarehouseSection } from "@/hooks/useWarehouseSection";
import { apiErrorMessage } from "@/lib/api";
import { SectionCard as Card } from "@/components/SectionCard";
import { formatDate } from "@/lib/date";
import { HINT, LABEL_TEXT } from "@/styles/ui";
import { BAR_BTN_PRIMARY, rowLine } from "./warehouseUi";

interface JobSectionData {
  notes?: string;
  vgm_sent?: string;
  survey_sent?: string;
  remeasurement_sent?: string;
  inform_operations_sent?: string;
  [key: string]: string | undefined;
}

function asJob(data: unknown): JobSectionData {
  return data && typeof data === "object" ? (data as JobSectionData) : {};
}

// Shipment Details are saved field by field: a save writes its own field only, and only while it
// still holds what this page showed - so the notes, the remeasured lines and the "sent" marks never
// take each other back. Refused, the section reloads and shows what was saved meanwhile.
const saveFailed = (e: unknown) => (e instanceof SectionChangedError ? e.message : `Failed to save: ${apiErrorMessage(e)}`);

// ─── Job Notes ──────────────────────────────────────────────────
export function JobNotes({ ownerId, messageApi }: { ownerId: string; messageApi: MessageInstance }) {
  const { data, saveKeys, isSaving } = useWarehouseSection(ownerId, "job");
  const section = asJob(data);
  const savedNotes = section.notes ?? "";
  // What is typed belongs to the saved text it was typed over; a newly saved text replaces it.
  const [typed, setTyped] = useState({ over: savedNotes, text: savedNotes });
  const notes = typed.over === savedNotes ? typed.text : savedNotes;
  const setNotes = (text: string) => setTyped({ over: savedNotes, text });
  const dirty = notes !== savedNotes;

  return (
    <Card
      title="Notes"
      extra={
        dirty && (
          <Button
            size="small"
            type="primary"
            className={BAR_BTN_PRIMARY}
            loading={isSaving}
            onClick={() =>
              saveKeys([{ key: "notes", value: notes, expected: savedNotes }])
                .then(() => messageApi.success("Saved"))
                .catch((e) => messageApi.error(saveFailed(e)))
            }
          >
            Save
          </Button>
        )
      }
    >
      <Input.TextArea
        autoSize={{ minRows: 4, maxRows: 10 }}
        value={notes}
        placeholder="Warehouse notes…"
        aria-label="Warehouse notes"
        onChange={(e) => setNotes(e.target.value)}
        className="!text-[13px]"
      />
    </Card>
  );
}

// ─── Action Push Buttons (VGM / Survey / Remeasurement) ─────────
interface ActionModalState {
  actionKey: string;
  label: string;
  note: string;
  fileList: unknown[];
}

const ACTIONS = [
  { key: "vgm_sent", label: "VGM" },
  { key: "survey_sent", label: "Survey" },
  { key: "remeasurement_sent", label: "Remeasurement" },
];

function parseActionData(val: string | undefined): { timestamp: string; note?: string } | null {
  if (!val) return null;
  try {
    return JSON.parse(val);
  } catch {
    return { timestamp: val };
  }
}

export function ActionPushButtons({ ownerId, messageApi }: { ownerId: string; messageApi: MessageInstance }) {
  const { data, saveKeys, isSaving } = useWarehouseSection(ownerId, "job");
  const section = asJob(data);
  const [modalState, setModalState] = useState<ActionModalState | null>(null);

  const handleSend = async () => {
    if (!modalState) return;
    const key = modalState.actionKey;
    try {
      await saveKeys([{ key, value: JSON.stringify({ timestamp: new Date().toISOString(), note: modalState.note }), expected: section[key] ?? "" }]);
      setModalState(null);
      messageApi.success("Sent");
    } catch (e) {
      messageApi.error(saveFailed(e));
    }
  };

  return (
    <Card title="Push to suppliers" bodyClassName="px-4 py-1">
      {/* One row per push: what it is, sent or not (with its note), and Send while it is not */}
      <ul className="m-0 p-0 list-none">
        {ACTIONS.map((action, i) => {
          const parsed = parseActionData(section[action.key]);
          return (
            <li key={action.key} className={`flex items-center gap-3 min-h-[40px] py-1.5 ${rowLine(i, ACTIONS.length)}`}>
              <span className={`${LABEL_TEXT} w-[120px] shrink-0`}>{action.label}</span>
              <span className="flex-1 min-w-0">
                {parsed ? (
                  <>
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-emerald-700">
                      <CheckCircleFilled /> Sent {formatDate(parsed.timestamp)}
                    </span>
                    {parsed.note && <span className={`block truncate ${HINT}`} title={parsed.note}>{parsed.note}</span>}
                  </>
                ) : (
                  <span className="text-[13px] text-slate-400">Not sent</span>
                )}
              </span>
              {!parsed && (
                <button
                  type="button"
                  className={BAR_BTN_PRIMARY}
                  onClick={() => setModalState({ actionKey: action.key, label: action.label, note: "", fileList: [] })}
                >
                  <SendOutlined /> Send {action.label}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <Modal
        open={!!modalState}
        title={`Send ${modalState?.label || ""}`}
        onCancel={() => setModalState(null)}
        footer={[
          <Button key="cancel" onClick={() => setModalState(null)}>Cancel</Button>,
          <Button key="send" type="primary" onClick={handleSend} loading={isSaving}>Send</Button>,
        ]}
        destroyOnHidden
      >
        <div className="mb-4">
          <Upload.Dragger name="file" multiple beforeUpload={() => false} onChange={(info) => modalState && setModalState({ ...modalState, fileList: info.fileList })}>
            <p><InboxOutlined className="text-[28px] text-indigo-500" /></p>
            <p className="text-sm mt-2">Attach files (optional)</p>
          </Upload.Dragger>
        </div>
        <Input.TextArea placeholder="Add a note..." rows={3} value={modalState?.note || ""} onChange={(e) => modalState && setModalState({ ...modalState, note: e.target.value })} />
      </Modal>
    </Card>
  );
}

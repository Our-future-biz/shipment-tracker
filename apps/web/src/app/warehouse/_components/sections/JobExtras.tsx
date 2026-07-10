"use client";

import { useEffect, useState } from "react";
import { Input, Button, Space, Tag, Modal, Upload } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import type { MessageInstance } from "antd/es/message/interface";
import { useWarehouseSection } from "@/hooks/useWarehouseSection";

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

// ─── Job Notes ──────────────────────────────────────────────────
export function JobNotes({ ownerId, messageApi }: { ownerId: string; messageApi: MessageInstance }) {
  const { data, save, isSaving } = useWarehouseSection(ownerId, "job");
  const section = asJob(data);
  const savedNotes = section.notes ?? "";
  const [notes, setNotes] = useState(savedNotes);
  useEffect(() => setNotes(section.notes ?? ""), [section.notes]);
  const dirty = notes !== savedNotes;

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <strong className="text-xs">Notes</strong>
        {dirty && (
          <Button size="small" type="primary" loading={isSaving} onClick={() => save({ ...section, notes }).then(() => messageApi.success("Saved")).catch(() => messageApi.error("Failed to save"))}>
            Save
          </Button>
        )}
      </div>
      <Input.TextArea rows={2} value={notes} placeholder="Warehouse notes…" onChange={(e) => setNotes(e.target.value)} />
    </div>
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
  const { data, save, isSaving } = useWarehouseSection(ownerId, "job");
  const section = asJob(data);
  const [modalState, setModalState] = useState<ActionModalState | null>(null);

  const handleSend = async () => {
    if (!modalState) return;
    try {
      await save({ ...section, [modalState.actionKey]: JSON.stringify({ timestamp: new Date().toISOString(), note: modalState.note }) });
      setModalState(null);
      messageApi.success("Sent");
    } catch {
      messageApi.error("Failed to save");
    }
  };

  return (
    <div className="mt-4">
      <strong className="text-xs block mb-2">Push to Suppliers</strong>
      <Space>
        {ACTIONS.map((action) => {
          const parsed = parseActionData(section[action.key]);
          return parsed ? (
            <Tag key={action.key} color="green" className="text-[11px]">
              {action.label} — {new Date(parsed.timestamp).toLocaleDateString()}
              {parsed.note && <span className="block text-[10px] text-slate-500">{parsed.note}</span>}
            </Tag>
          ) : (
            <Button key={action.key} size="small" onClick={() => setModalState({ actionKey: action.key, label: action.label, note: "", fileList: [] })}>
              Send {action.label}
            </Button>
          );
        })}
      </Space>

      <Modal
        open={!!modalState}
        title={`Send ${modalState?.label || ""}`}
        onCancel={() => setModalState(null)}
        footer={[
          <Button key="cancel" onClick={() => setModalState(null)}>Cancel</Button>,
          <Button key="send" type="primary" onClick={handleSend} loading={isSaving}>Send</Button>,
        ]}
        destroyOnClose
      >
        <div className="mb-4">
          <Upload.Dragger name="file" multiple beforeUpload={() => false} onChange={(info) => modalState && setModalState({ ...modalState, fileList: info.fileList })}>
            <p><InboxOutlined className="text-[28px] text-indigo-500" /></p>
            <p className="text-sm mt-2">Attach files (optional)</p>
          </Upload.Dragger>
        </div>
        <Input.TextArea placeholder="Add a note..." rows={3} value={modalState?.note || ""} onChange={(e) => modalState && setModalState({ ...modalState, note: e.target.value })} />
      </Modal>
    </div>
  );
}

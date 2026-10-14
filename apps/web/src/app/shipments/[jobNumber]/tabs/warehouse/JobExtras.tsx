"use client";

import { useEffect, useState } from "react";
import { Input, Button, Space, Tag, Modal } from "antd";
import type { MessageInstance } from "antd/es/message/interface";
import { useWarehouseSection } from "@/hooks/useWarehouseSection";
import { SectionCard as Card } from "@/components/SectionCard";
import { formatDate } from "@/lib/date";

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

// Save state shown in a card header: "Unsaved changes" while edited, "Saved HH:mm" after a save.
export function SaveStatus({ dirty, savedAt }: { dirty: boolean; savedAt: Date | null }) {
  if (dirty) {
    return (
      <Tag color="orange" className="m-0 !text-[11px]">
        Unsaved changes
      </Tag>
    );
  }
  if (!savedAt) return null;
  const hhmm = savedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return <span className="text-[11px] text-emerald-600">Saved {hhmm}</span>;
}

// ─── Job Notes ──────────────────────────────────────────────────
export function JobNotes({ ownerId, messageApi, readOnly = false }: { ownerId: string; messageApi: MessageInstance; readOnly?: boolean }) {
  const { data, save, isSaving } = useWarehouseSection(ownerId, "job");
  const section = asJob(data);
  const savedNotes = section.notes ?? "";
  const [notes, setNotes] = useState(savedNotes);
  useEffect(() => setNotes(section.notes ?? ""), [section.notes]);
  const dirty = notes !== savedNotes;
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  return (
    <Card
      title="Notes"
      extra={
        !readOnly && (
          <Space size={8}>
            <SaveStatus dirty={dirty} savedAt={savedAt} />
            {dirty && (
              <Button
                size="small"
                type="primary"
                loading={isSaving}
                onClick={() =>
                  save({ ...section, notes })
                    .then(() => {
                      setSavedAt(new Date());
                      messageApi.success("Saved");
                    })
                    .catch(() => messageApi.error("Failed to save"))
                }
              >
                Save
              </Button>
            )}
          </Space>
        )
      }
    >
      {readOnly ? (
        <p className={`text-xs whitespace-pre-wrap ${notes ? "text-slate-900" : "text-slate-300"}`}>{notes || "—"}</p>
      ) : (
        <Input.TextArea rows={2} value={notes} placeholder="Warehouse notes…" onChange={(e) => setNotes(e.target.value)} />
      )}
    </Card>
  );
}

// ─── "Mark as sent" (VGM / Survey / Remeasurement) ───────────────
// Nothing is e-mailed from here: the button only records that the document was sent to the
// supplier outside the app (when and an optional note). Real sending comes later.
interface ActionModalState {
  actionKey: string;
  label: string;
  note: string;
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

  const handleMark = async () => {
    if (!modalState) return;
    try {
      await save({ ...section, [modalState.actionKey]: JSON.stringify({ timestamp: new Date().toISOString(), note: modalState.note }) });
      setModalState(null);
      messageApi.success("Marked as sent");
    } catch {
      messageApi.error("Failed to save");
    }
  };

  return (
    <Card title="Sent to suppliers">
      <Space wrap>
        {ACTIONS.map((action) => {
          const parsed = parseActionData(section[action.key]);
          return parsed ? (
            <Tag key={action.key} color="green" className="text-[11px]">
              {action.label} marked sent — {formatDate(parsed.timestamp)}
              {parsed.note && <span className="block text-[10px] text-slate-500">{parsed.note}</span>}
            </Tag>
          ) : (
            <Button key={action.key} size="small" onClick={() => setModalState({ actionKey: action.key, label: action.label, note: "" })}>
              Mark {action.label} as sent
            </Button>
          );
        })}
      </Space>

      <Modal
        open={!!modalState}
        title={`Mark ${modalState?.label || ""} as sent`}
        onCancel={() => setModalState(null)}
        footer={[
          <Button key="cancel" onClick={() => setModalState(null)}>Cancel</Button>,
          <Button key="mark" type="primary" onClick={handleMark} loading={isSaving}>Mark as sent</Button>,
        ]}
        destroyOnHidden
      >
        <p className="text-xs text-slate-500 mt-0 mb-3">Nothing is e-mailed — this only records that it was sent outside the app.</p>
        <Input.TextArea placeholder="Add a note..." rows={3} value={modalState?.note || ""} onChange={(e) => modalState && setModalState({ ...modalState, note: e.target.value })} />
      </Modal>
    </Card>
  );
}

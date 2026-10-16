"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Alert, Input, Button, Space, Tag, Modal } from "antd";
import type { MessageInstance } from "antd/es/message/interface";
import { SECTION_CONFLICT_TEXT, SectionConflictError, useWarehouseSection } from "@/hooks/useWarehouseConceptSection";
import { APIError } from "@/lib/api/client";
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

// Error text for a failed Shipment Details save: a conflict asks to check and save again.
export function sectionSaveError(e: unknown, fallback = "Failed to save"): string {
  if (e instanceof SectionConflictError) return SECTION_CONFLICT_TEXT;
  return e instanceof APIError ? e.message : fallback;
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

// Someone else saved a field while the user was editing it: their version is shown next to the
// user's edit. Save stays refused until the user picks one — "Keep mine" then overwrites theirs
// knowingly, "Use theirs" drops the edit.
export function SavedMeanwhile({ theirs, onUseTheirs, onKeepMine }: { theirs: ReactNode; onUseTheirs: () => void; onKeepMine: () => void }) {
  return (
    <Alert
      type="warning"
      showIcon
      className="!mb-2"
      message={<span className="text-xs font-semibold">Saved meanwhile by someone else</span>}
      description={
        <div className="text-xs">
          <div className="text-[11px] text-slate-500 mb-1">Their version:</div>
          <div className="whitespace-pre-wrap text-slate-900">{theirs}</div>
          <Space size={8} className="mt-2">
            <Button size="small" onClick={onUseTheirs}>
              Use theirs
            </Button>
            <Button size="small" type="primary" onClick={onKeepMine}>
              Keep mine
            </Button>
          </Space>
        </div>
      }
    />
  );
}

// ─── Job Notes ──────────────────────────────────────────────────
export function JobNotes({ ownerId, messageApi, readOnly = false }: { ownerId: string; messageApi: MessageInstance; readOnly?: boolean }) {
  const { data, saveKeys, isSaving } = useWarehouseSection(ownerId, "job");
  const section = asJob(data);
  const savedNotes = section.notes ?? "";
  const [notes, setNotes] = useState(savedNotes);
  // The saved text the user's edit started from; a save only replaces exactly that text.
  const [base, setBase] = useState(savedNotes);
  // A newer saved text replaces the box only while it holds no edit of the user's own. With an
  // edit, the newer text is shown beside it until the user chooses (Save is held back).
  useEffect(() => {
    if (notes === base || notes === savedNotes) {
      setNotes(savedNotes);
      setBase(savedNotes);
    }
  }, [savedNotes, notes, base]);
  const conflict = savedNotes !== base && notes !== savedNotes;
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
                disabled={conflict}
                title={conflict ? "Someone else saved the notes meanwhile — choose which version to keep first" : undefined}
                onClick={() =>
                  saveKeys([{ key: "notes", value: notes, expected: base }])
                    .then(() => {
                      setSavedAt(new Date());
                      messageApi.success("Saved");
                    })
                    .catch((e) => messageApi.error(sectionSaveError(e)))
                }
              >
                Save
              </Button>
            )}
          </Space>
        )
      }
    >
      {!readOnly && conflict && (
        <SavedMeanwhile
          theirs={savedNotes || "(no notes)"}
          onUseTheirs={() => {
            setNotes(savedNotes);
            setBase(savedNotes);
          }}
          onKeepMine={() => setBase(savedNotes)}
        />
      )}
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
  const { data, saveKeys, isSaving } = useWarehouseSection(ownerId, "job");
  const section = asJob(data);
  const [modalState, setModalState] = useState<ActionModalState | null>(null);

  const handleMark = async () => {
    if (!modalState) return;
    try {
      const value = JSON.stringify({ timestamp: new Date().toISOString(), note: modalState.note });
      // Expected = what this page shows (normally not set), so a second "mark sent" from another
      // screen is refused instead of overwriting the first.
      await saveKeys([{ key: modalState.actionKey, value, expected: section[modalState.actionKey] ?? "" }]);
      setModalState(null);
      messageApi.success("Marked as sent");
    } catch (e) {
      if (e instanceof SectionConflictError) {
        setModalState(null);
        messageApi.warning(`${modalState.label} was already marked as sent by someone else — reloaded`);
      } else {
        messageApi.error(sectionSaveError(e));
      }
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

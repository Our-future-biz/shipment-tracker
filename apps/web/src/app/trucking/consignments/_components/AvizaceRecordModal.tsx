"use client";

import { useState } from "react";
import dayjs, { type Dayjs } from "dayjs";
import { DatePicker, Input, Modal, Select } from "antd";
import type { AvizaceChannel, AvizaceRecordRequest } from "@/hooks/useTruckingControl";
import { AVIZACE_CHANNEL_LABELS, avizaceRecordProblems } from "../../_lib/avizace";
import { TruckingField } from "../../_components/TruckingField";

const CHANNEL_OPTIONS = (Object.keys(AVIZACE_CHANNEL_LABELS) as AvizaceChannel[]).map((c) => ({ value: c, label: AVIZACE_CHANNEL_LABELS[c] }));

const toIso = (d: Dayjs | null) => (d ? d.toISOString() : null);

interface AvizaceRecordModalProps {
  /** Who to reach, as stored on the delivery stop. */
  defaultContact: string;
  onClose: () => void;
  /** Rejects to keep the dialog open (the caller reports the error). */
  onSave: (req: AvizaceRecordRequest) => Promise<unknown>;
}

// Records how the delivery was agreed with the consignee: channel, who, the agreed window and a note.
export const AvizaceRecordModal = ({ defaultContact, onClose, onSave }: AvizaceRecordModalProps) => {
  const [channel, setChannel] = useState<AvizaceChannel>("PHONE");
  const [contact, setContact] = useState(defaultContact);
  const [from, setFrom] = useState<Dayjs | null>(null);
  const [to, setTo] = useState<Dayjs | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const req: AvizaceRecordRequest = { channel, contact: contact.trim(), agreedFrom: toIso(from), agreedTo: toIso(to), note: note.trim() };
  const problems = avizaceRecordProblems(req);

  const handleOk = async () => {
    setBusy(true);
    try {
      await onSave(req);
      onClose();
    } catch {
      // Reported by the caller.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title="Record avizace" okText="Record" okButtonProps={{ disabled: problems.length > 0 }} confirmLoading={busy} onOk={handleOk} onCancel={onClose} destroyOnHidden>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <TruckingField label="How">
            <Select aria-label="Avizace channel" value={channel} options={CHANNEL_OPTIONS} onChange={setChannel} />
          </TruckingField>
          <TruckingField label="Who was reached">
            <Input aria-label="Contact reached" value={contact} placeholder="Name, phone or e-mail" onChange={(e) => setContact(e.target.value)} />
          </TruckingField>
          <TruckingField label="Agreed from">
            <DatePicker aria-label="Agreed from" showTime={{ format: "HH:mm", minuteStep: 15 }} format="DD.MM.YYYY HH:mm" value={from} onChange={setFrom} className="w-full" />
          </TruckingField>
          <TruckingField label="Agreed to">
            <DatePicker
              aria-label="Agreed to"
              showTime={{ format: "HH:mm", minuteStep: 15 }}
              format="DD.MM.YYYY HH:mm"
              value={to}
              defaultPickerValue={from ?? dayjs()}
              onChange={setTo}
              className="w-full"
            />
          </TruckingField>
        </div>
        <TruckingField label="Note">
          <Input.TextArea aria-label="Avizace note" autoSize={{ minRows: 2, maxRows: 5 }} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </TruckingField>
        {problems.length > 0 && contact.trim() && <div className="text-[12px] text-red-600">{problems.join(" · ")}</div>}
      </div>
    </Modal>
  );
};

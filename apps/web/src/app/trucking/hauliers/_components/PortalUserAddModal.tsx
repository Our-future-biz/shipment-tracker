"use client";

import { useState } from "react";
import { Button, Input, Modal } from "antd";
import { portalUserProblem } from "@/app/haulier/_lib/portal";
import type { PortalUserCreate } from "@/hooks/useTrucking";
import { TruckingField } from "../../_components/TruckingField";
import { limitCzechPhone } from "@/lib/phone";

const EMPTY: PortalUserCreate = { email: "", name: "", phone: "" };

interface PortalUserAddModalProps {
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onCreate: (req: PortalUserCreate) => void;
}

// Add user…: who at the haulier signs in to the portal. Saving gives the one-time invitation link.
export const PortalUserAddModal = ({ open, loading, onClose, onCreate }: PortalUserAddModalProps) => {
  const [draft, setDraft] = useState<PortalUserCreate>(EMPTY);
  const problem = portalUserProblem(draft);
  const set = (key: keyof PortalUserCreate, value: string) => setDraft((d) => ({ ...d, [key]: value }));

  return (
    <Modal
      open={open}
      title="Add portal user"
      onCancel={loading ? undefined : onClose}
      afterClose={() => setDraft(EMPTY)}
      destroyOnHidden
      footer={
        <div className="flex items-center justify-end gap-2">
          {problem && (draft.name || draft.email) && <span className="mr-auto text-xs text-red-600">{problem}</span>}
          <Button onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="primary"
            disabled={!!problem}
            loading={loading}
            onClick={() => onCreate({ email: draft.email.trim(), name: draft.name.trim(), phone: draft.phone.trim() })}
          >
            Add and get the link
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <TruckingField label="Name">
          <Input aria-label="Name" autoFocus value={draft.name} onChange={(e) => set("name", e.target.value)} />
        </TruckingField>
        <TruckingField label="E-mail" hint="What the user signs in with.">
          <Input aria-label="E-mail" type="email" value={draft.email} onChange={(e) => set("email", e.target.value)} />
        </TruckingField>
        <TruckingField label="Phone">
          <Input aria-label="Phone" value={draft.phone} onChange={(e) => set("phone", limitCzechPhone(e.target.value))} />
        </TruckingField>
      </div>
    </Modal>
  );
};

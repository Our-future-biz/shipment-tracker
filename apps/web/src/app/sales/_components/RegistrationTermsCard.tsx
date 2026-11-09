"use client";

import { useState } from "react";
import { Button, Input } from "antd";
import { SectionCard } from "@/components/SectionCard";
import { useRegistrationSettings } from "@/hooks/useCompanyRegistration";
import { useSalesPermissions } from "@/hooks/useSalesPermissions";
import { apiErrorMessage } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { HINT, LABEL_TEXT } from "@/styles/ui";

// What a company accepts on the registration form: what the terms are called, and where they are read.
// A registration link can't be created before the address is set. Managers and admins only.
export function RegistrationTermsCard() {
  const { settings, save } = useRegistrationSettings();
  const canEdit = useSalesPermissions().canEditCompanyDetails;
  const toast = useToast();
  const [edits, setEdits] = useState<{ termsName?: string; termsUrl?: string }>({});
  const termsName = edits.termsName ?? settings?.termsName ?? "";
  const termsUrl = edits.termsUrl ?? settings?.termsUrl ?? "";
  const changed = edits.termsName !== undefined || edits.termsUrl !== undefined;

  const handleSave = () =>
    save.mutate(
      { termsName, termsUrl },
      {
        onSuccess: () => {
          setEdits({});
          toast.success("Registration terms saved");
        },
        onError: (e) => toast.error(apiErrorMessage(e)),
      },
    );

  return (
    <div className="mt-4">
    <SectionCard title="Registration terms">
      <p className={`${HINT} mt-0`}>What a company accepts on the registration form it gets by link. A registration link can&apos;t be created until the web address is set.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block">
          <span className={`block ${LABEL_TEXT} mb-1.5`}>Name on the form</span>
          <Input maxLength={200} disabled={!canEdit} value={termsName} onChange={(e) => setEdits((v) => ({ ...v, termsName: e.target.value }))} />
        </label>
        <label className="block">
          <span className={`block ${LABEL_TEXT} mb-1.5`}>Web address of the terms</span>
          <Input maxLength={1000} disabled={!canEdit} placeholder="https://…" value={termsUrl} onChange={(e) => setEdits((v) => ({ ...v, termsUrl: e.target.value }))} />
        </label>
      </div>
      {canEdit && (
        <div className="mt-3">
          <Button type="primary" disabled={!changed || !termsUrl.trim()} loading={save.isPending} onClick={handleSave}>
            Save
          </Button>
        </div>
      )}
    </SectionCard>
    </div>
  );
}

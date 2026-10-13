"use client";

import { useState } from "react";
import { Alert, Button, Input } from "antd";
import { SectionCard } from "@/components/SectionCard";
import { useSalesPermissions } from "@/hooks/useSalesPermissions";
import { useCompanyDetails } from "@/hooks/useSalesPrefs";
import { useToast } from "@/lib/toast";
import { COMPANY_DETAIL_FIELDS, asCompanyDetails, type CompanyDetails } from "../_lib/companyDetails";
import { quoteProblem } from "../_lib/quoteProblem";
import { ManagersOnlyNote } from "./ManagersOnlyNote";

// Who quotes are from. The details go on every quote of the company, so typing alone
// stores nothing: only Save writes. The form cannot be edited before the stored details are on
// screen and is not shown at all when they could not be read - saved from an empty form, blanks
// would replace them. "Stored" means read for this visit (`fresh`): a copy remembered from
// another screen may predate what a colleague saved, and is shown locked until it is confirmed.
// Only managers and admins change the details - the server's answer, and the server refuses
// anybody else: for them the form is there to read, without Save.
export function CompanyDetailsCard() {
  const { status, details: stored, reload, save } = useCompanyDetails({ fresh: true });
  const permissions = useSalesPermissions();
  const canEdit = permissions.canEditCompanyDetails;
  const toast = useToast();
  // Only what the user changed: every other field shows what is stored, also when that arrives or
  // is read again after the form appeared.
  const [edits, setEdits] = useState<Partial<CompanyDetails>>({});
  const [saving, setSaving] = useState(false);

  const form: CompanyDetails = { ...stored, ...edits };
  const dirty = COMPANY_DETAIL_FIELDS.some((field) => form[field] !== stored[field]);
  const locked = status !== "ready" || saving;

  const handleSave = async () => {
    setSaving(true);
    try {
      await save(asCompanyDetails(form));
      setEdits({});
      toast.success("Saved");
    } catch (err) {
      toast.error(`Not saved - ${quoteProblem(err).reason}`);
    } finally {
      setSaving(false);
    }
  };

  const field = (name: keyof CompanyDetails, label: string, rows?: number) => {
    const props = {
      value: form[name],
      disabled: locked,
      readOnly: !canEdit,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setEdits({ ...edits, [name]: e.target.value }),
    };
    return (
      <label className="block">
        <span className="block text-[13px] font-medium text-slate-700 mb-1">{label}</span>
        {rows ? <Input.TextArea rows={rows} {...props} /> : <Input {...props} />}
      </label>
    );
  };

  return (
    <SectionCard title="Company details">
      <p className="text-xs text-slate-500 mb-3">Printed on every quote, so the customer sees who it is from.</p>

      {status === "error" ? (
        <Alert
          type="error"
          showIcon
          message="Could not load the company details"
          description="The stored details are not shown, so nothing can be saved over them."
          action={
            <Button size="small" onClick={() => reload()}>
              Retry
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div className="flex flex-col gap-3">
              {field("name", "Company name")}
              {field("address", "Address", 4)}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 content-start">
              {field("companyId", "Company ID")}
              {field("vatId", "VAT ID")}
              {field("phone", "Phone")}
              {field("email", "Email")}
              <div className="col-span-2">{field("website", "Website")}</div>
            </div>
          </div>
          {canEdit && (
            <div className="flex items-center justify-end gap-3 mt-3">
              {dirty && <span className="text-xs text-slate-400">Unsaved changes</span>}
              <Button type="primary" size="small" loading={saving} disabled={status !== "ready" || !dirty} onClick={handleSave}>
                Save
              </Button>
            </div>
          )}
          <ManagersOnlyNote status={permissions.status} allowed={canEdit} onRetry={() => permissions.reload()} className="mt-3 text-right" />
        </>
      )}
    </SectionCard>
  );
}

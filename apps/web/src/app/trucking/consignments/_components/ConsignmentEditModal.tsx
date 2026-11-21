"use client";

import { useMemo, useState } from "react";
import { Alert, Button, Checkbox, Modal } from "antd";
import { apiErrorMessage } from "@/lib/api";
import type { ConsignmentDetail, ConsignmentUpdate } from "@/hooks/useTruckingConsignments";
import { consignmentFormProblems, fixedDayMissing, formFromDetail, toUpdateRequest, type ConsignmentForm } from "../../_lib/consignmentForm";
import { isVersionConflict } from "../../_lib/saveConflict";
import { ConsignmentFormFields } from "../../_components/ConsignmentFormFields";

interface ConsignmentEditModalProps {
  c: ConsignmentDetail;
  /** After the pick-up only references and notes are saved. */
  limited: boolean;
  onClose: () => void;
  onSave: (req: ConsignmentUpdate) => Promise<unknown>;
}

// Edit a consignment: the same fields as Create, the job and customer fixed. A tariff or quote price
// stays unless "Price again" is ticked; a changed agreed price is saved as given. A save over someone
// else's change is refused (reload first).
export const ConsignmentEditModal = ({ c, limited, onClose, onSave }: ConsignmentEditModalProps) => {
  const [form, setForm] = useState<ConsignmentForm>(() => formFromDetail(c));
  const [reprice, setReprice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  // An older Express fixed date one without its agreed day saves without it; Needs attention asks for it (mock council R24).
  const dayMissing = fixedDayMissing(c);
  // The job and quote are fixed; their checks do not apply here.
  const problems = useMemo(() => consignmentFormProblems({ ...form, source: "new" }, { limited, fixedDateMissingAllowed: dayMissing }), [form, limited, dayMissing]);

  const handleSave = async () => {
    setBusy(true);
    setRefusal(null);
    try {
      await onSave(toUpdateRequest(form, c.version, reprice));
      onClose();
    } catch (e) {
      setRefusal(isVersionConflict(e) ? `${c.ref} was changed by someone else. Close this, reload and make the change again.` : `Not saved — ${apiErrorMessage(e)}.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title={`Edit ${c.ref}`} width={1080} onCancel={busy ? undefined : onClose} maskClosable={false} footer={null} destroyOnHidden>
      <div className="flex flex-col gap-4">
        <div className="text-[13px] text-slate-600">
          Customer <b>{c.customerName}</b> · job {c.jobNumber}
          {c.quoteNumber ? ` · quote ${c.quoteNumber}` : ""}
        </div>
        {limited && <Alert type="info" showIcon message="Picked up — only the references and notes for the driver can change now." />}
        {!limited && dayMissing && !form.fixedDeliveryDate && form.serviceLevel === c.serviceLevel && (
          <Alert type="warning" showIcon message="No fixed delivery date agreed with the customer yet. Give it when it is known; this edit saves without it." />
        )}
        <ConsignmentFormFields form={form} onChange={setForm} limited={limited} />
        {/* An agreed price is saved as typed; only a tariff or quote price is priced again (mock test run F2). */}
        {!limited && form.priceSource === "MANUAL" && (
          <div className="text-[12px] text-slate-600">A changed agreed price is saved as the new price; the job&apos;s selling costs follow.</div>
        )}
        {!limited && form.priceSource !== "MANUAL" && (
          <Checkbox checked={reprice} onChange={(e) => setReprice(e.target.checked)}>
            Price again from the {form.priceSource === "QUOTE" ? "quote" : "tariff"} (the stored price is kept otherwise; the job&apos;s selling costs follow)
          </Checkbox>
        )}
        {problems.length > 0 && (
          <div className="text-[12px] text-amber-700">
            <span className="font-semibold">Still needed: </span>
            {problems.join(" · ")}
          </div>
        )}
        {refusal && <Alert type="error" showIcon message={refusal} />}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="primary" onClick={handleSave} loading={busy} disabled={problems.length > 0}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
};

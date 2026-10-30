"use client";

import { useState } from "react";
import { Button } from "antd";
import { AppModal } from "@/components/AppModal";
import type { VersionDatesChange } from "@/hooks/useSupplierTariffs";
import { apiErrorMessage } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { datesProblem } from "../_lib/railTariffs";
import { DayField } from "./TariffFormParts";

interface TariffVersionDatesModalProps {
  open: boolean;
  onClose: () => void;
  version: { id: string; validFrom: string | null; validTo: string | null };
  /** "v2", for the title and the toast */
  label: string;
  /** The tariff's name, under the title */
  tariffName: string;
  setDates: (change: VersionDatesChange) => Promise<unknown>;
  isSaving: boolean;
}

// Changes the dates of an approved version (managers and admins): it prices from the new start to
// the new end, or with no end. The server refuses dates that overlap another active version of the
// tariff and says which.
export function TariffVersionDatesModal({ open, onClose, version, label, tariffName, setDates, isSaving }: TariffVersionDatesModalProps) {
  const toast = useToast();
  const [dates, setDraft] = useState({ validFrom: version.validFrom, validTo: version.validTo });
  const problem = datesProblem(dates, version);

  const handleSave = async () => {
    if (!dates.validFrom) return;
    try {
      await setDates({ id: version.id, validFrom: dates.validFrom, validTo: dates.validTo });
      toast.success(`Dates of ${label} changed`);
      onClose();
    } catch (e) {
      toast.error(`Could not change the dates: ${apiErrorMessage(e)}`, 8);
    }
  };

  return (
    <AppModal
      open={open}
      onClose={() => !isSaving && onClose()}
      title={`Change the dates of ${label}`}
      subtitle={tariffName}
      footer={
        <div className="flex items-center justify-end gap-2">
          {problem && <span className="mr-auto text-[12.5px] text-slate-500">{problem}</span>}
          <Button disabled={isSaving} onClick={onClose}>
            Cancel
          </Button>
          <Button type="primary" loading={isSaving} disabled={!!problem} onClick={handleSave}>
            Save
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <DayField label="Valid from" value={dates.validFrom} onChange={(validFrom) => setDraft({ ...dates, validFrom })} disabled={isSaving} />
          <DayField label="Valid to" value={dates.validTo} onChange={(validTo) => setDraft({ ...dates, validTo })} disabled={isSaving} />
        </div>
        <div className="text-[12px] text-slate-400">
          Leave “Valid to” empty for no end date. The tariff prices with the new dates straight away, also in “Tariffs available” on quotes. The dates may not overlap
          another active version of this tariff.
        </div>
      </div>
    </AppModal>
  );
}

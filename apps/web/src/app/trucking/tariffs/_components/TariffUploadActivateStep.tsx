"use client";

import { useState } from "react";
import dayjs from "dayjs";
import { Alert, Button, DatePicker } from "antd";
import { apiErrorMessage } from "@/lib/api";
import { businessToday, formatDate } from "@/lib/date";
import type { TariffVersionDetail } from "@/hooks/useTrucking";
import { defaultActivationDate } from "../../_lib/tariffUpload";
import { countErrors, versionLabel } from "../../_lib/tariffs";
import { TruckingField } from "../../_components/TruckingField";

interface TariffUploadActivateStepProps {
  version: TariffVersionDetail;
  activating: boolean;
  onActivate: (validFrom: string) => Promise<void>;
  onKeepDraft: () => void;
}

// The last step of the upload: activate the draft from today or a later day, or keep it as a draft
// for later. A draft with errors cannot be activated.
export const TariffUploadActivateStep = ({ version, activating, onActivate, onKeepDraft }: TariffUploadActivateStepProps) => {
  const today = businessToday();
  const [validFrom, setValidFrom] = useState(() => defaultActivationDate(version.validFrom, today));
  const [refusal, setRefusal] = useState<string | null>(null);
  const errors = countErrors(version.findings);

  const handleActivate = async () => {
    setRefusal(null);
    try {
      await onActivate(validFrom);
    } catch (e) {
      setRefusal(`Not activated — ${apiErrorMessage(e)}.`);
    }
  };

  return (
    <div className="flex flex-col gap-4 max-w-[560px]">
      {errors > 0 ? (
        <Alert
          type="error"
          showIcon
          message={`${versionLabel(version)} has ${errors} error${errors === 1 ? "" : "s"} and cannot be activated.`}
          description="Fix them in the file and upload it again (step 1). This draft can be kept or discarded on the tariff page."
        />
      ) : (
        <>
          <TruckingField label="Valid from" hint="Today or later. The version now active (or scheduled) ends the day before.">
            <DatePicker
              aria-label="Valid from"
              format="DD.MM.YYYY"
              allowClear={false}
              value={dayjs(validFrom)}
              disabledDate={(d) => d.format("YYYY-MM-DD") < today}
              onChange={(d) => d && setValidFrom(d.format("YYYY-MM-DD"))}
              className="w-full"
            />
          </TruckingField>
          <p className="m-0 text-[13px] text-slate-600">
            {validFrom === today ? "It prices consignments from today." : `It is scheduled and prices consignments from ${formatDate(validFrom)}.`}
            {version.warningCount > 0 && ` It has ${version.warningCount} warning${version.warningCount === 1 ? "" : "s"}, accepted by activating.`}
          </p>
        </>
      )}
      {refusal && <Alert type="error" showIcon message={refusal} />}
      <div className="flex flex-wrap gap-2">
        <Button type="primary" loading={activating} disabled={errors > 0} onClick={handleActivate}>
          Activate {versionLabel(version)}
        </Button>
        <Button onClick={onKeepDraft} disabled={activating}>
          Keep as draft
        </Button>
      </div>
    </div>
  );
};

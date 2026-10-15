"use client";

import { useState } from "react";
import dayjs from "dayjs";
import { Alert, Button, DatePicker, Modal, Spin } from "antd";
import { apiErrorMessage } from "@/lib/api";
import { businessToday, formatDate } from "@/lib/date";
import { useTariffVersion, type TariffVersionSummary } from "@/hooks/useTrucking";
import { countErrors, versionLabel } from "../../_lib/tariffs";
import { TruckingField } from "../../_components/TruckingField";
import { TariffFindingList } from "./TariffFindingList";

interface TariffActivateDialogProps {
  /** The draft to activate; null keeps the dialog closed. */
  version: TariffVersionSummary | null;
  loading: boolean;
  onClose: () => void;
  onActivate: (validFrom: string) => Promise<void>;
}

// Activate… a draft from a date (manager). A version with errors cannot be activated: the dialog
// says so and lists them; whatever else the server refuses is shown here too.
export const TariffActivateDialog = ({ version, loading, onClose, onActivate }: TariffActivateDialogProps) => {
  const today = businessToday();
  const [validFrom, setValidFrom] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const { version: detail, isLoading } = useTariffVersion(version?.id ?? null, { enabled: !!version });
  const from = validFrom ?? (version && version.validFrom >= today ? version.validFrom : today);
  const errors = detail ? countErrors(detail.findings) : 0;

  const handleActivate = async () => {
    setRefusal(null);
    try {
      await onActivate(from);
    } catch (e) {
      setRefusal(`Not activated — ${apiErrorMessage(e)}.`);
    }
  };

  return (
    <Modal
      open={!!version}
      title={version ? `Activate ${versionLabel(version)}` : "Activate"}
      onCancel={loading ? undefined : onClose}
      footer={null}
      width={520}
      destroyOnHidden
      afterClose={() => {
        setValidFrom(null);
        setRefusal(null);
      }}
    >
      {isLoading || !detail ? (
        <div className="flex justify-center py-8">
          <Spin />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {errors > 0 ? (
            <>
              <Alert
                type="error"
                showIcon
                message={`This version has ${errors} error${errors === 1 ? "" : "s"} and cannot be activated.`}
                description="Fix them in the price list file and upload it again as a new version."
              />
              <TariffFindingList findings={detail.findings.filter((f) => f.severity === "error")} limit={8} />
            </>
          ) : (
            <>
              <TruckingField label="Valid from" hint="The version now active (or scheduled) ends the day before.">
                <DatePicker
                  aria-label="Valid from"
                  format="DD.MM.YYYY"
                  allowClear={false}
                  value={dayjs(from)}
                  disabledDate={(d) => d.format("YYYY-MM-DD") < today}
                  onChange={(d) => setValidFrom(d ? d.format("YYYY-MM-DD") : null)}
                  className="w-full"
                />
              </TruckingField>
              <p className="m-0 text-[13px] text-slate-600">
                {from === today ? "It prices consignments from today." : `It is scheduled and prices consignments from ${formatDate(from)}.`}
                {detail.warningCount > 0 && ` It has ${detail.warningCount} warning${detail.warningCount === 1 ? "" : "s"} — see the version.`}
              </p>
            </>
          )}
          {refusal && <Alert type="error" showIcon message={refusal} />}
        </div>
      )}
      <div className="flex justify-end gap-2 mt-5">
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button type="primary" loading={loading} disabled={!detail || errors > 0} onClick={handleActivate}>
          Activate
        </Button>
      </div>
    </Modal>
  );
};

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Spin } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { ConfirmModal } from "@/components/ConfirmModal";
import { InfoRow } from "@/components/InfoRow";
import { Pill } from "@/components/Pill";
import { CountChip, PillTabs, SectionCard } from "@/components/SectionCard";
import { apiErrorMessage, isNotFound } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatDateTime } from "@/lib/date";
import { useToast } from "@/lib/toast";
import { fetchTariffTemplate, fetchTariffVersionSource, useTariff, useTariffVersion, useTruckingSettings } from "@/hooks/useTrucking";
import { isTruckingManager } from "../../_lib/roles";
import { buildLevelMatrices, countErrors, formatMoney, formatQty, validityLabel, versionLabel, type ServiceLevelCode } from "../../_lib/tariffs";
import { TariffVersionStatusChip } from "../../_components/TariffVersionStatusChip";
import { TariffActivateDialog } from "./TariffActivateDialog";
import { TariffDiffPanel } from "./TariffDiffPanel";
import { TariffDownloadButton } from "./TariffDownloadButton";
import { TariffFindingList } from "./TariffFindingList";
import { TariffMatrix } from "./TariffMatrix";
import { TariffSurchargesTable } from "./TariffSurchargesTable";
import { TariffZonesTable } from "./TariffZonesTable";

interface TariffVersionViewProps {
  tariffId: string;
  versionId: string;
}

// One version of a tariff, read-only: the file it came from, what the server found in it, how it
// compares with the active version, its validity, factors and rounding, the zones, a price matrix
// per service level and the surcharges. A manager activates or discards a draft from here too.
export const TariffVersionView = ({ tariffId, versionId }: TariffVersionViewProps) => {
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const { tariff, activate, isActivating, discard, isDiscarding } = useTariff(tariffId);
  const { version, isLoading, error } = useTariffVersion(versionId);
  const { settings } = useTruckingSettings();
  const [level, setLevel] = useState<ServiceLevelCode | null>(null);
  const [activateOpen, setActivateOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  const matrices = useMemo(() => (version ? buildLevelMatrices(version.input) : []), [version]);
  const levelLabel = useMemo(() => {
    const labels = new Map(settings?.serviceLevels.map((l) => [l.code as string, l.label]) ?? []);
    return (code: string) => labels.get(code) ?? code;
  }, [settings]);

  const tariffHref = `/trucking/tariffs/${tariffId}`;

  if (isLoading) {
    return (
      <div className="flex justify-center p-20">
        <Spin size="large" />
      </div>
    );
  }
  if (!version || version.tariffId !== tariffId) {
    return (
      <div className="p-10 text-center text-slate-500">
        {version || isNotFound(error) ? "This version does not exist." : `Could not load the version: ${apiErrorMessage(error)}.`}{" "}
        <Link href={tariffHref} className="text-indigo-500">
          Back to the tariff
        </Link>
      </div>
    );
  }

  const input = version.input;
  const currency = tariff?.currency ?? "";
  const errors = countErrors(version.findings);
  const canManage = isTruckingManager(user) && version.status === "DRAFT";
  const shown = matrices.find((m) => m.level === level) ?? matrices[0] ?? null;
  // Compared with the active version unless it is the active one (a discount tariff has no versions).
  const comparable = !!tariff && tariff.activeVersion?.id !== version.id;

  const handleActivate = async (validFrom: string) => {
    await activate({ versionId: version.id, validFrom });
    toast.success(`${versionLabel(version)} activated`);
    setActivateOpen(false);
  };
  const handleDiscard = async () => {
    try {
      await discard(version.id);
      toast.success(`Draft ${versionLabel(version)} discarded`);
      router.push(tariffHref);
    } catch (e) {
      toast.error(`Could not discard the draft: ${apiErrorMessage(e)}`);
    }
  };

  return (
    <div className="bg-slate-50 min-h-full">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex flex-wrap items-start gap-2">
          <Link href={tariffHref} aria-label="Back to the tariff" className="mt-1 text-slate-400 hover:text-indigo-500 p-1">
            <ArrowLeftOutlined />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[22px] font-bold text-slate-800 m-0">
                {tariff?.name ?? "Tariff"} · {versionLabel(version)}
              </h1>
              <TariffVersionStatusChip status={version.status} />
              {errors > 0 && <Pill tone="red">{`${errors} error${errors === 1 ? "" : "s"}`}</Pill>}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Valid {validityLabel(version.validFrom, version.validTo)} · created {formatDateTime(version.createdAt)}
              {version.createdBy ? ` by ${version.createdBy}` : ""}
              {version.activatedAt ? ` · activated ${formatDateTime(version.activatedAt)}${version.activatedBy ? ` by ${version.activatedBy}` : ""}` : ""}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-slate-500">
              <span>{version.sourceFileName ? `Uploaded from ${version.sourceFileName}` : "Not uploaded from a file"}</span>
              {version.sourceFileName && (
                <TariffDownloadButton size="small" load={() => fetchTariffVersionSource(version.id)} ariaLabel={`Download ${version.sourceFileName}`}>
                  Download file
                </TariffDownloadButton>
              )}
              <TariffDownloadButton size="small" load={() => fetchTariffTemplate(tariffId, version.id)}>
                Download as template
              </TariffDownloadButton>
              {comparable && (
                <a href="#compare" className="text-indigo-600 hover:underline">
                  Compare with active
                </a>
              )}
            </div>
          </div>
          {canManage && (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="primary" onClick={() => setActivateOpen(true)}>
                Activate…
              </Button>
              <Button danger onClick={() => setDiscardOpen(true)}>
                Discard draft
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto p-4 sm:p-6 flex flex-col gap-4">
        {errors > 0 && <Alert type="error" showIcon message={`${errors} error${errors === 1 ? "" : "s"} — this version cannot be activated.`} />}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <SectionCard title="Findings" extra={<CountChip count={version.findings.length} />}>
            <TariffFindingList findings={version.findings} />
          </SectionCard>

          <SectionCard title="Validity and calculation">
            <InfoRow label="Valid">{validityLabel(input.validFrom, input.validTo)}</InfoRow>
            <InfoRow label="kg per LDM">{formatQty(input.factors.kgPerLdm)}</InfoRow>
            <InfoRow label="kg per m³">{formatQty(input.factors.kgPerCbm)}</InfoRow>
            <InfoRow label="kg per pallet place">{formatQty(input.factors.kgPerPalletPlace)}</InfoRow>
            <InfoRow label="Weight rounded up to">{formatQty(input.rounding.weightStepKg)} kg</InfoRow>
            <InfoRow label="Amounts rounded to">{formatMoney(input.rounding.moneyStep, currency)}</InfoRow>
            {input.notes && <InfoRow label="Notes">{input.notes}</InfoRow>}
          </SectionCard>
        </div>

        {comparable && (
          <div id="compare" className="scroll-mt-4">
            <SectionCard title="Compare with active">
              <TariffDiffPanel versionId={version.id} currency={currency} side={tariff.side} levelLabel={levelLabel} />
            </SectionCard>
          </div>
        )}

        <SectionCard title="Prices" bodyClassName="p-0">
          {shown ? (
            <>
              <div className="px-4 pt-3 pb-2">
                <PillTabs tabs={matrices.map((m) => ({ key: m.level, label: levelLabel(m.level) }))} active={shown.level} onChange={setLevel} />
              </div>
              <TariffMatrix matrix={shown} currency={currency} />
              <p className="m-0 px-4 py-2 text-[11px] text-slate-400">Darker cells are dearer. * remote area. Hover a zone for its postcodes.</p>
            </>
          ) : (
            <p className="m-0 p-4 text-[13px] text-slate-500">This version has no prices.</p>
          )}
        </SectionCard>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <SectionCard title="Zones" extra={<CountChip count={input.zones.length} />} bodyClassName="p-0">
            <TariffZonesTable zones={input.zones} />
          </SectionCard>
          <SectionCard title="Surcharges" extra={<CountChip count={input.surcharges.length} />} bodyClassName="p-0">
            <TariffSurchargesTable surcharges={input.surcharges} currency={currency} />
          </SectionCard>
        </div>
      </div>

      <TariffActivateDialog version={activateOpen ? version : null} loading={isActivating} onClose={() => setActivateOpen(false)} onActivate={handleActivate} />
      <ConfirmModal
        open={discardOpen}
        onClose={() => setDiscardOpen(false)}
        onConfirm={handleDiscard}
        title={`Discard draft ${versionLabel(version)}?`}
        description="The draft is removed from the versions. It was never used for pricing."
        confirmLabel="Discard draft"
        danger
        loading={isDiscarding}
      />
    </div>
  );
};

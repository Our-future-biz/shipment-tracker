"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Spin, Steps } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { SectionCard } from "@/components/SectionCard";
import { apiErrorMessage, isNotFound } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthContext";
import { fileToBase64 } from "@/lib/files";
import { useToast } from "@/lib/toast";
import { useTariff, useTariffImport, useTruckingSettings, type TariffImportResult } from "@/hooks/useTrucking";
import { isTruckingManager } from "../../_lib/roles";
import { DISCOUNT_NO_FILE, UPLOAD_STEPS, tariffFileProblem } from "../../_lib/tariffUpload";
import { countErrors, versionLabel } from "../../_lib/tariffs";
import { TariffDiffPanel } from "./TariffDiffPanel";
import { TariffFindingGroups } from "./TariffFindingGroups";
import { TariffSheetReportTable } from "./TariffSheetReportTable";
import { TariffTestLane } from "./TariffTestLane";
import { TariffUploadActivateStep } from "./TariffUploadActivateStep";
import { TariffUploadFileStep } from "./TariffUploadFileStep";

const STEP_HINTS: Record<(typeof UPLOAD_STEPS)[number]["key"], string> = {
  file: "Choose the filled-in template.",
  read: "What was read from each sheet of the file.",
  check: "What the server found in the prices.",
  compare: "What changes against the active version.",
  test: "Price one lane with this version before it is used.",
  activate: "Choose the first day it prices consignments.",
};

interface TariffUploadWizardProps {
  tariffId: string;
}

// Uploading a price list (manager), step by step: the file, what was read from each sheet, the
// findings, the comparison with the active version, a test lane and activation. The upload is
// saved as a draft at once, so leaving the wizard from step 2 on keeps it on the tariff page.
export const TariffUploadWizard = ({ tariffId }: TariffUploadWizardProps) => {
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const { tariff, isLoading, error, activate, isActivating } = useTariff(tariffId);
  const { upload, isUploading } = useTariffImport(tariffId);
  const { settings } = useTruckingSettings();
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<TariffImportResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

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
  if (!tariff) {
    return (
      <div className="p-10 text-center text-slate-500">
        {isNotFound(error) ? "This tariff does not exist." : `Could not load the tariff: ${apiErrorMessage(error)}.`}{" "}
        <Link href="/trucking?tab=tariffs" className="text-indigo-500">
          Back to Tariffs
        </Link>
      </div>
    );
  }

  const version = result?.version ?? null;
  const errors = version ? countErrors(version.findings) : 0;
  const isDiscount = tariff.mode === "DISCOUNT";
  const canUpload = isTruckingManager(user) && !isDiscount;

  const handleFile = async (file: File) => {
    setFileName(file.name);
    const tooBig = tariffFileProblem(file);
    setProblem(tooBig);
    if (tooBig) return;
    try {
      const res = await upload({ fileName: file.name, fileBase64: await fileToBase64(file) });
      setResult(res);
      setStep(1);
    } catch (e) {
      setProblem(apiErrorMessage(e));
    }
  };
  const handleActivate = async (validFrom: string) => {
    if (!version) return;
    await activate({ versionId: version.id, validFrom });
    toast.success(`${versionLabel(version)} activated`);
    router.push(tariffHref);
  };
  const handleKeepDraft = () => {
    if (version) toast.success(`Draft ${versionLabel(version)} kept on the tariff`);
    router.push(tariffHref);
  };

  const shown = UPLOAD_STEPS[step] ?? UPLOAD_STEPS[0];
  const current = shown.key;
  const body = (() => {
    if (current === "file" || !result || !version) {
      return (
        <TariffUploadFileStep tariff={tariff} uploading={isUploading} fileName={fileName} problem={problem} draft={version} onFile={(f) => void handleFile(f)} />
      );
    }
    if (current === "read") return <TariffSheetReportTable sheets={result.sheets} />;
    if (current === "check") return <TariffFindingGroups findings={version.findings} />;
    if (current === "compare") return <TariffDiffPanel versionId={version.id} currency={tariff.currency} side={tariff.side} levelLabel={levelLabel} />;
    if (current === "test") return <TariffTestLane tariff={tariff} version={version} />;
    return <TariffUploadActivateStep version={version} activating={isActivating} onActivate={handleActivate} onKeepDraft={handleKeepDraft} />;
  })();

  return (
    <div className="bg-slate-50 min-h-full">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex flex-wrap items-start gap-2">
          <Link href={tariffHref} aria-label="Back to the tariff" className="mt-1 text-slate-400 hover:text-indigo-500 p-1">
            <ArrowLeftOutlined />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] font-bold text-slate-800 m-0">Upload a price list · {tariff.name}</h1>
            <div className="text-xs text-slate-500 mt-1">
              {version
                ? `Saved as draft ${versionLabel(version)}. Leaving the wizard keeps it as a draft on the tariff page.`
                : "The file is saved as a draft from step 2 on; leaving the wizard keeps it."}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto p-4 sm:p-6 flex flex-col gap-4">
        {isDiscount && <Alert type="info" showIcon message={DISCOUNT_NO_FILE} description="Its prices come from the Standard sell list active on the rating day, with the discount." />}
        {!isDiscount && !canUpload && <Alert type="info" showIcon message="Only a manager uploads a price list." />}

        {canUpload && (
          <>
            <Steps
              size="small"
              current={step}
              onChange={setStep}
              items={UPLOAD_STEPS.map((s, i) => ({
                title: s.title,
                disabled: i > 0 && !result,
                status: s.key === "check" && result && errors > 0 ? "error" : undefined,
              }))}
            />
            <SectionCard title={shown.title}>
              <p className="mt-0 mb-4 text-[12px] text-slate-500">{STEP_HINTS[current]}</p>
              {body}
            </SectionCard>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => setStep(step - 1)} disabled={step === 0 || isActivating}>
                Back
              </Button>
              {step < UPLOAD_STEPS.length - 1 && (
                <Button type="primary" onClick={() => setStep(step + 1)} disabled={!result || isUploading}>
                  Next
                </Button>
              )}
              {current === "check" && errors > 0 && <span className="text-xs text-red-600">Errors stop activation — fix the file and upload it again in step 1.</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

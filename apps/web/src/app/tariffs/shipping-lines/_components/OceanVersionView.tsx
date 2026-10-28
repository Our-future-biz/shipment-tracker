"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Spin, Tooltip } from "antd";
import { ArrowLeftOutlined, CheckOutlined, DeleteOutlined, DownloadOutlined } from "@ant-design/icons";
import { ConfirmModal } from "@/components/ConfirmModal";
import { fetchOceanTariffSource, useOceanTariffActions, useOceanTariffVersion, type OceanLayout } from "@/hooks/useOceanTariffs";
import { apiErrorMessage, isNotFound } from "@/lib/api";
import { useCanManageTariffs } from "@/lib/auth/AuthContext";
import { formatDate, formatDateTime } from "@/lib/date";
import { downloadDataUrl, fileDataUrl } from "@/lib/files";
import { formatNumber } from "@/lib/number";
import { useToast } from "@/lib/toast";
import { shippingLineHref } from "../../_lib/oceanTariffs";
import { LAYOUT_SOURCE_LABEL, STATUS_CHIP, validityText, versionLabel } from "../../_lib/railTariffs";
import { RailVersionFindings } from "../../rail-operators/_components/RailVersionFindings";
import { DirectionChips } from "./OceanDirectionFields";
import { OceanVersionLayoutCard } from "./OceanVersionLayoutCard";
import { OceanVersionPorts } from "./OceanVersionPorts";
import { OceanVersionRates } from "./OceanVersionRates";
import { OceanVersionSurcharges } from "./OceanVersionSurcharges";

interface OceanVersionViewProps {
  customerId: string;
  versionId: string;
}

// One version of a shipping line's tariff: what was uploaded and how it was read, what the checks
// found, its ports, rates and surcharges. A manager matches the ports the code could not and
// corrects a draft's layout, then approves the draft (it prices from its start date) or discards it.
export const OceanVersionView = ({ customerId, versionId }: OceanVersionViewProps) => {
  const router = useRouter();
  const toast = useToast();
  const canManage = useCanManageTariffs();
  const { version, isLoading, error } = useOceanTariffVersion(versionId);
  const { relayout, isRelayouting, approve, isApproving, discard, isDiscarding } = useOceanTariffActions();
  const [confirm, setConfirm] = useState<"approve" | "discard" | null>(null);
  const [downloading, setDownloading] = useState(false);

  const backHref = shippingLineHref(customerId);

  if (isLoading) {
    return (
      <div className="flex justify-center p-20">
        <Spin size="large" />
      </div>
    );
  }
  if (!version) {
    return (
      <div className="p-10 text-center text-slate-500">
        {isNotFound(error) ? "This tariff version does not exist." : `Could not load the tariff version: ${apiErrorMessage(error)}.`}{" "}
        <Link href={backHref} className="text-indigo-500">
          Back to the shipping line
        </Link>
      </div>
    );
  }

  const isDraft = version.status === "draft";
  const editable = canManage && isDraft;
  const chip = STATUS_CHIP[version.status];
  const title = `${version.tariff.name} · ${versionLabel(version)}`;

  const handleRelayout = async (layout: OceanLayout) => {
    try {
      const read = await relayout({ id: version.id, layout });
      toast.success(
        `Read again: ${formatNumber(read.rowCount)} rates, ${read.pendingPorts} ports to pick, ${read.errorCount} errors, ${read.warningCount} warnings`,
      );
      return read;
    } catch (e) {
      toast.error(`Could not read the file again: ${apiErrorMessage(e)}`, 8);
      throw e;
    }
  };

  const handleApprove = async () => {
    try {
      await approve(version.id);
      toast.success(`${versionLabel(version)} approved`);
      setConfirm(null);
    } catch (e) {
      toast.error(`Could not approve: ${apiErrorMessage(e)}`, 8);
    }
  };

  const handleDiscard = async () => {
    try {
      await discard(version.id);
      toast.success(`Draft ${versionLabel(version)} discarded`);
      router.push(backHref);
    } catch (e) {
      toast.error(`Could not discard: ${apiErrorMessage(e)}`, 8);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const file = await fetchOceanTariffSource(version.id);
      downloadDataUrl(fileDataUrl(file), file.fileName);
    } catch (e) {
      toast.error(`Could not download the file: ${apiErrorMessage(e)}`);
    } finally {
      setDownloading(false);
    }
  };

  const approveBlocked =
    version.errorCount > 0
      ? "The draft has errors; correct them first"
      : !version.validFrom
        ? "The draft has no start date"
        : version.pendingPorts > 0
          ? "Pick the ports still to match first"
          : null;
  const approveText =
    `It prices from ${formatDate(version.validFrom)}${version.validTo ? ` to ${formatDate(version.validTo)}` : " with no end date"}. ` +
    "An active version of this tariff that started earlier ends the day before; one that starts on that day or later is replaced.";

  return (
    <div className="bg-slate-50 min-h-full">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex flex-wrap items-start gap-2">
          <Link href={backHref} aria-label={`Back to ${version.tariff.supplierName || "the shipping line"}`} className="mt-1 text-slate-400 hover:text-indigo-500 p-1">
            <ArrowLeftOutlined />
          </Link>
          <div className="min-w-0 flex-1">
            <Link href={backHref} className="text-xs !text-indigo-500 hover:!text-indigo-600">
              {version.tariff.supplierName || "Shipping line"}
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-bold text-slate-800 m-0">{title}</h1>
              <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${chip.className}`}>{chip.label}</span>
              <DirectionChips directions={version.tariff.directions} />
            </div>
            <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-1">
              <span>{validityText(version)}</span>
              {version.currency && <span>· {version.currency}</span>}
              <span>· {formatNumber(version.rowCount)} rates</span>
              {version.pendingPorts > 0 && <span className="text-amber-700">· {version.pendingPorts} ports to pick</span>}
              {version.sourceFileName && <span>· {version.sourceFileName}</span>}
              <span>· {LAYOUT_SOURCE_LABEL[version.layoutSource]}</span>
            </div>
            <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-1">
              <span>
                Uploaded {formatDateTime(version.createdAt)}
                {version.createdBy ? ` by ${version.createdBy}` : ""}
              </span>
              {version.activatedAt && (
                <span>
                  · Approved {formatDateTime(version.activatedAt)}
                  {version.activatedBy ? ` by ${version.activatedBy}` : ""}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {version.sourceFileName && (
              <Button icon={<DownloadOutlined />} loading={downloading} onClick={handleDownload}>
                Download file
              </Button>
            )}
            {editable && (
              <>
                <Button danger icon={<DeleteOutlined />} onClick={() => setConfirm("discard")}>
                  Discard
                </Button>
                <Tooltip title={approveBlocked}>
                  <Button type="primary" icon={<CheckOutlined />} disabled={!!approveBlocked} onClick={() => setConfirm("approve")}>
                    Approve
                  </Button>
                </Tooltip>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto p-4 sm:p-6 flex flex-col gap-4 min-w-0">
        <RailVersionFindings findings={version.findings} isDraft={isDraft} />
        <OceanVersionPorts version={version} editable={editable} />
        <OceanVersionRates version={version} />
        <OceanVersionSurcharges layout={version.layout} />
        <OceanVersionLayoutCard version={version} editable={editable} isRelayouting={isRelayouting} onRelayout={handleRelayout} />
      </div>

      <ConfirmModal
        open={confirm === "approve"}
        onClose={() => setConfirm(null)}
        onConfirm={handleApprove}
        title={`Approve ${versionLabel(version)}?`}
        description={approveText}
        confirmLabel="Approve"
        loading={isApproving}
      />
      <ConfirmModal
        open={confirm === "discard"}
        onClose={() => setConfirm(null)}
        onConfirm={handleDiscard}
        title={`Discard draft ${versionLabel(version)}?`}
        description="The draft and everything read from it are thrown away. Upload the file again to start over."
        confirmLabel="Discard"
        danger
        loading={isDiscarding}
      />
    </div>
  );
};

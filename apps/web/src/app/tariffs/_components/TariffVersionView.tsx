"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Spin, Tooltip } from "antd";
import { CheckOutlined, DeleteOutlined, DownloadOutlined } from "@ant-design/icons";
import { BackLink } from "@/components/BackLink";
import { LINK_CLASS } from "@/components/linkClass";
import { ConfirmModal } from "@/components/ConfirmModal";
import type { SupplierTariffVersion } from "@/hooks/useSupplierTariffs";
import { apiErrorMessage, isNotFound } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import { useCanManageTariffs } from "@/lib/auth/AuthContext";
import { formatDate, formatDateTime } from "@/lib/date";
import { downloadDataUrl, fileDataUrl } from "@/lib/files";
import { useToast } from "@/lib/toast";
import { LAYOUT_SOURCE_LABEL, STATUS_CHIP, validityText, versionLabel } from "../_lib/railTariffs";
import { TariffVersionFindings } from "./TariffVersionFindings";

/** What every kind of tariff version has: its summary, the tariff it belongs to and what the checks found. */
interface TariffVersionCore extends SupplierTariffVersion {
  tariff: { name: string; supplierName: string };
  findings: interfaces.TariffFinding[];
}

interface TariffVersionActions {
  approve: (id: string) => Promise<unknown>;
  isApproving: boolean;
  discard: (id: string) => Promise<unknown>;
  isDiscarding: boolean;
  /** The file the version was read from */
  fetchSource: (id: string) => Promise<interfaces.TariffFile>;
}

interface TariffVersionViewProps<V extends TariffVersionCore> {
  version: V | null;
  isLoading: boolean;
  error: unknown;
  /** The supplier's page */
  backHref: string;
  /** The supplier in words, when the version does not name it: "Rail operator" */
  supplierLabel: string;
  /** Beside the title: what the tariff is for, as chips */
  titleChips?: (version: V) => ReactNode;
  /** First in the line under the title: what the tariff is for, in words */
  forText?: (version: V) => string;
  /** The version's rows in words: "1 234 rows" */
  rowsText: (version: V) => string;
  /** After the rows: anything else the line under the title says; nothing when falsy */
  moreFacts?: (version: V) => ReactNode;
  /** Why the draft cannot be approved yet, besides errors and a missing start date */
  approveBlockedBy?: (version: V) => string | null;
  actions: TariffVersionActions;
  /** What discarding throws away */
  discardDescription: string;
  /** The version's cards below the checks; `editable` when a manager looks at a draft */
  children: (version: V, editable: boolean) => ReactNode;
}

// One version of a supplier's tariff: what was uploaded and how it was read, what the checks found,
// and the cards of its kind below. A manager approves the draft (it prices from its start date) or
// discards it.
export function TariffVersionView<V extends TariffVersionCore>({
  version,
  isLoading,
  error,
  backHref,
  supplierLabel,
  titleChips,
  forText,
  rowsText,
  moreFacts,
  approveBlockedBy,
  actions,
  discardDescription,
  children,
}: TariffVersionViewProps<V>) {
  const router = useRouter();
  const toast = useToast();
  const canManage = useCanManageTariffs();
  const [confirm, setConfirm] = useState<"approve" | "discard" | null>(null);
  const [downloading, setDownloading] = useState(false);

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
        <Link href={backHref} className={LINK_CLASS}>
          Back to the {supplierLabel.toLowerCase()}
        </Link>
      </div>
    );
  }

  const isDraft = version.status === "draft";
  const editable = canManage && isDraft;
  const chip = STATUS_CHIP[version.status];
  const label = versionLabel(version);

  const handleApprove = async () => {
    try {
      await actions.approve(version.id);
      toast.success(`${label} approved`);
      setConfirm(null);
    } catch (e) {
      toast.error(`Could not approve: ${apiErrorMessage(e)}`, 8);
    }
  };

  const handleDiscard = async () => {
    try {
      await actions.discard(version.id);
      toast.success(`Draft ${label} discarded`);
      router.push(backHref);
    } catch (e) {
      toast.error(`Could not discard: ${apiErrorMessage(e)}`, 8);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const file = await actions.fetchSource(version.id);
      downloadDataUrl(fileDataUrl(file), file.fileName);
    } catch (e) {
      toast.error(`Could not download the file: ${apiErrorMessage(e)}`);
    } finally {
      setDownloading(false);
    }
  };

  const approveBlocked =
    version.errorCount > 0 ? "The draft has errors; correct them first" : !version.validFrom ? "The draft has no start date" : (approveBlockedBy?.(version) ?? null);
  const approveText =
    `It prices from ${formatDate(version.validFrom)}${version.validTo ? ` to ${formatDate(version.validTo)}` : " with no end date"}. ` +
    "An active version of this tariff that started earlier ends the day before; one that starts on that day or later is replaced.";

  const lead = forText?.(version);
  const more = moreFacts?.(version);
  const facts: ReactNode[] = [
    ...(lead ? [<span key="for" className="font-medium text-slate-700">{lead}</span>] : []),
    validityText(version),
    ...(version.currency ? [version.currency] : []),
    rowsText(version),
    ...(more ? [more] : []),
    ...(version.sourceFileName ? [version.sourceFileName] : []),
    LAYOUT_SOURCE_LABEL[version.layoutSource],
  ];

  return (
    <div className="bg-slate-50 min-h-full">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <BackLink href={backHref}>{version.tariff.supplierName || supplierLabel}</BackLink>
        <div className="flex flex-wrap items-start gap-2 mt-1">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-bold text-slate-800 m-0">
                {version.tariff.name} · {label}
              </h1>
              <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${chip.className}`}>{chip.label}</span>
              {titleChips?.(version)}
            </div>
            <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-1">
              {facts.map((fact, i) => (
                <span key={i}>
                  {i > 0 && "· "}
                  {fact}
                </span>
              ))}
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
        <TariffVersionFindings findings={version.findings} isDraft={isDraft} />
        {children(version, editable)}
      </div>

      <ConfirmModal
        open={confirm === "approve"}
        onClose={() => setConfirm(null)}
        onConfirm={handleApprove}
        title={`Approve ${label}?`}
        description={approveText}
        confirmLabel="Approve"
        loading={actions.isApproving}
      />
      <ConfirmModal
        open={confirm === "discard"}
        onClose={() => setConfirm(null)}
        onConfirm={handleDiscard}
        title={`Discard draft ${label}?`}
        description={discardDescription}
        confirmLabel="Discard"
        danger
        loading={actions.isDiscarding}
      />
    </div>
  );
}

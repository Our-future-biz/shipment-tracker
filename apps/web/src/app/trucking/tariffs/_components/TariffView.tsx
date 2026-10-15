"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Alert, Button, Input, InputNumber, Radio, Spin } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { ConfirmModal } from "@/components/ConfirmModal";
import { CountChip, SectionCard } from "@/components/SectionCard";
import { apiErrorMessage, isNotFound } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthContext";
import { useToast } from "@/lib/toast";
import { useTariff, useTruckingSettings, type TariffDetail, type TariffUpdate, type TariffVersionSummary } from "@/hooks/useTrucking";
import { useUnsavedGuard } from "@/app/warehouse/_lib/useUnsavedGuard";
import { TERMS } from "../../_lib/glossary";
import { isTruckingManager } from "../../_lib/roles";
import { SCOPE_LABELS, TARIFF_SIDES, ZONE_BY_LABELS, discountLabel, modeLabel, ownerLabel, versionLabel } from "../../_lib/tariffs";
import { TruckingField } from "../../_components/TruckingField";
import { TariffActivateDialog } from "./TariffActivateDialog";
import { TariffVersionsTable } from "./TariffVersionsTable";

/** What the header form edits; the discount may be empty while typing (the save checks it). */
interface TariffDraft {
  name: string;
  discountPercent: number | null;
  zoneBy: NonNullable<TariffUpdate["zoneBy"]>;
}

const draftOf = (t: TariffDetail): TariffDraft => ({ name: t.name, discountPercent: t.discountPercent, zoneBy: t.zoneBy });
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Where an owner's own page is: a haulier's in Trucking, a customer's in the Customer Database. */
const ownerHref = (t: TariffDetail) => {
  if (!t.ownerCustomerId) return null;
  return t.side === "BUY" ? `/trucking/hauliers/${t.ownerCustomerId}` : `/customers/${t.ownerCustomerId}`;
};

interface TariffViewProps {
  tariffId: string;
}

// One tariff: whose it is and how it prices, its name, discount and zone rule (manager), and its
// versions — a manager activates a draft from a date or discards it.
export const TariffView = ({ tariffId }: TariffViewProps) => {
  const toast = useToast();
  const { user } = useAuth();
  const { tariff, isLoading, error, save, isSaving, activate, isActivating, discard, isDiscarding } = useTariff(tariffId);
  const { settings } = useTruckingSettings();
  const [draft, setDraft] = useState<TariffDraft | null>(null);
  const [activating, setActivating] = useState<TariffVersionSummary | null>(null);
  const [discarding, setDiscarding] = useState<TariffVersionSummary | null>(null);

  // The tariff as read (set while rendering): a newer one replaces the draft only while nothing is edited here.
  const [seen, setSeen] = useState<TariffDetail | null>(null);
  if (tariff && tariff !== seen) {
    setSeen(tariff);
    if (!draft || !seen || same(draft, draftOf(seen))) setDraft(draftOf(tariff));
  }
  const dirty = !!draft && !!tariff && !same(draft, draftOf(tariff));
  useUnsavedGuard(dirty, "trucking-tariff");

  const levelLabel = useMemo(() => {
    const labels = new Map(settings?.serviceLevels.map((l) => [l.code as string, l.label]) ?? []);
    return (code: string) => labels.get(code) ?? code;
  }, [settings]);

  if (isLoading) {
    return (
      <div className="flex justify-center p-20">
        <Spin size="large" />
      </div>
    );
  }
  if (!tariff || !draft) {
    return (
      <div className="p-10 text-center text-slate-500">
        {isNotFound(error) ? "This tariff does not exist." : `Could not load the tariff: ${apiErrorMessage(error)}.`}{" "}
        <Link href="/trucking?tab=tariffs" className="text-indigo-500">
          Back to Tariffs
        </Link>
      </div>
    );
  }

  const canManage = isTruckingManager(user);
  const backHref = `/trucking?tab=tariffs&side=${tariff.side.toLowerCase()}`;
  const sideLabel = TARIFF_SIDES.find((s) => s.key === tariff.side)!.label;
  const owner = ownerLabel(tariff);
  const ownerLink = ownerHref(tariff);
  const isDiscount = tariff.mode === "DISCOUNT";
  const nameProblem = draft.name.trim() ? null : "Name the tariff";
  const discountProblem = isDiscount && (draft.discountPercent == null || Math.abs(draft.discountPercent) >= 100) ? "Discount must be between −100 % and 100 %" : null;
  const problems = [nameProblem, discountProblem].filter(Boolean);

  const handleSave = async () => {
    try {
      const req: TariffUpdate = { name: draft.name.trim(), zoneBy: draft.zoneBy };
      if (isDiscount && draft.discountPercent != null) req.discountPercent = draft.discountPercent;
      const res = await save(req);
      setDraft(draftOf(res.tariff));
      toast.success("Tariff saved");
    } catch (e) {
      toast.error(`Could not save the tariff: ${apiErrorMessage(e)}`);
    }
  };
  const handleActivate = async (validFrom: string) => {
    if (!activating) return;
    await activate({ versionId: activating.id, validFrom });
    toast.success(`${versionLabel(activating)} activated`);
    setActivating(null);
  };
  const handleDiscard = async () => {
    if (!discarding) return;
    try {
      await discard(discarding.id);
      toast.success(`Draft ${versionLabel(discarding)} discarded`);
      setDiscarding(null);
    } catch (e) {
      toast.error(`Could not discard the draft: ${apiErrorMessage(e)}`);
    }
  };

  return (
    <div className="bg-slate-50 min-h-full">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex flex-wrap items-start gap-2">
          <Link href={backHref} aria-label="Back to Tariffs" className="mt-1 text-slate-400 hover:text-indigo-500 p-1">
            <ArrowLeftOutlined />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] font-bold text-slate-800 m-0">{tariff.name}</h1>
            <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-1">
              <span>{sideLabel} tariff</span>
              <span>·</span>
              {ownerLink ? (
                <Link href={ownerLink} className="text-indigo-600 hover:underline">
                  {owner}
                </Link>
              ) : (
                <span>{owner}</span>
              )}
              <span>· {SCOPE_LABELS[tariff.scope]}</span>
              <span>· {modeLabel(tariff)}</span>
              <span>· {tariff.currency}</span>
              <span>
                · {TERMS.zone} from the {ZONE_BY_LABELS[tariff.zoneBy].toLowerCase()}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto p-4 sm:p-6 flex flex-col gap-4">
        {isDiscount ? (
          <Alert
            type="info"
            showIcon
            message={`No price sheet of its own: prices come from the Standard sell list active on the rating day, ${discountLabel(tariff.discountPercent)}.`}
          />
        ) : (
          <Alert type="info" showIcon message="Uploading a price list from Excel arrives in the next step (Phase 2b); each upload becomes a draft version here." />
        )}

        <SectionCard title="Tariff">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <TruckingField label="Name">
              <Input aria-label="Tariff name" value={draft.name} maxLength={120} disabled={!canManage} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </TruckingField>
            {isDiscount && (
              <TruckingField label="Discount (%)" hint={draft.discountPercent != null ? `Reads ${discountLabel(draft.discountPercent)}. Negative = uplift.` : "Negative = uplift."}>
                <InputNumber
                  aria-label="Discount percent"
                  min={-99.9}
                  max={99.9}
                  step={0.5}
                  value={draft.discountPercent}
                  disabled={!canManage}
                  onChange={(v) => setDraft({ ...draft, discountPercent: v ?? null })}
                  className="w-full"
                />
              </TruckingField>
            )}
            <TruckingField label={`${TERMS.zone} taken from`}>
              <Radio.Group
                aria-label="Zone taken from"
                value={draft.zoneBy}
                disabled={!canManage}
                options={(Object.keys(ZONE_BY_LABELS) as TariffDraft["zoneBy"][]).map((k) => ({ value: k, label: ZONE_BY_LABELS[k] }))}
                onChange={(e) => setDraft({ ...draft, zoneBy: e.target.value })}
              />
            </TruckingField>
          </div>
          {canManage ? (
            <div className="flex flex-wrap items-center gap-3 mt-4">
              <Button type="primary" onClick={handleSave} loading={isSaving} disabled={!dirty || problems.length > 0}>
                Save changes
              </Button>
              <Button onClick={() => setDraft(draftOf(tariff))} disabled={!dirty || isSaving}>
                Discard
              </Button>
              {dirty && !problems.length && <span className="text-xs text-amber-700">unsaved changes</span>}
              {problems.length > 0 && <span className="text-xs text-red-600">{problems.join(" · ")}</span>}
            </div>
          ) : (
            <p className="mt-3 mb-0 text-[11px] text-slate-400">Only a manager changes a tariff.</p>
          )}
        </SectionCard>

        <SectionCard title="Versions" extra={<CountChip count={tariff.versions.length} />} bodyClassName="p-0">
          <TariffVersionsTable
            tariffId={tariff.id}
            versions={tariff.versions}
            canManage={canManage}
            levelLabel={levelLabel}
            onActivate={setActivating}
            onDiscard={setDiscarding}
          />
        </SectionCard>
      </div>

      <TariffActivateDialog version={activating} loading={isActivating} onClose={() => setActivating(null)} onActivate={handleActivate} />
      <ConfirmModal
        open={!!discarding}
        onClose={() => setDiscarding(null)}
        onConfirm={handleDiscard}
        title={discarding ? `Discard draft ${versionLabel(discarding)}?` : "Discard draft?"}
        description="The draft is removed from the versions. It was never used for pricing."
        confirmLabel="Discard draft"
        danger
        loading={isDiscarding}
      />
    </div>
  );
};

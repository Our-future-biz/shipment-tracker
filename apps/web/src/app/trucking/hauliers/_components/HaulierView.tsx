"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dayjs from "dayjs";
import { Alert, Button, DatePicker, Input, InputNumber, Select, Spin, Switch, Tooltip } from "antd";
import { ArrowLeftOutlined, LockOutlined, UnlockOutlined } from "@ant-design/icons";
import { SectionCard } from "@/components/SectionCard";
import { apiErrorMessage, isNotFound } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthContext";
import { businessToday, formatDate, businessDateTime } from "@/lib/date";
import { useToast } from "@/lib/toast";
import { useHaulier, useTruckingSettings, type HaulierDetail, type HaulierUpdate } from "@/hooks/useTrucking";
import { useUnsavedGuard } from "@/app/warehouse/_lib/useUnsavedGuard";
import { TERMS } from "../../_lib/glossary";
import { COST_SPLIT_LABELS, CURRENCIES, profileProblems, type LaneDraft } from "../../_lib/hauliers";
import { isTruckingManager, managerOnlyReason } from "../../_lib/roles";
import { HAULIER_CONFLICT_TEXT, isVersionConflict } from "../../_lib/saveConflict";
import { HaulierIssueList } from "../../_components/HaulierIssueList";
import { HaulierStatusChip } from "../../_components/HaulierStatusChip";
import { TruckingField } from "../../_components/TruckingField";
import { HaulierBankAccounts } from "./HaulierBankAccounts";
import { HaulierBlockDialog } from "./HaulierBlockDialog";
import { HaulierLanesTable } from "./HaulierLanesTable";
import { HaulierPortalUsers } from "./HaulierPortalUsers";

type ProfileDraft = Omit<HaulierUpdate, "version" | "preferredLanes"> & { preferredLanes: LaneDraft[] };

const draftOf = (h: HaulierDetail): ProfileDraft => {
  const p = h.profile;
  return {
    insurer: p.insurer,
    insurancePolicyNo: p.insurancePolicyNo,
    insuranceLimit: p.insuranceLimit,
    insuranceCurrency: p.insuranceCurrency,
    insuranceValidTo: p.insuranceValidTo,
    licenceNo: p.licenceNo,
    licenceValidTo: p.licenceValidTo,
    licenceUnlimited: p.licenceUnlimited,
    adrCapable: p.adrCapable,
    vehicleTypes: [...p.vehicleTypes],
    paymentDays: p.paymentDays,
    currency: p.currency,
    vatUnreliable: p.vatUnreliable,
    bankAccountPublished: p.bankAccountPublished,
    // Profiles saved before Phase 6 have no list yet.
    bankAccounts: [...(p.bankAccounts ?? [])],
    vatCheckedAt: p.vatCheckedAt,
    costSplitBasis: p.costSplitBasis,
    notes: p.notes,
    preferredLanes: p.preferredLanes.map((l) => ({ ...l, key: l.id })),
  };
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c, label: c }));
const COST_SPLIT_OPTIONS = (Object.keys(COST_SPLIT_LABELS) as (keyof typeof COST_SPLIT_LABELS)[]).map((k) => ({ value: k, label: COST_SPLIT_LABELS[k] }));

interface DateFieldProps {
  label: string;
  value: string | null;
  disabled?: boolean;
  onChange: (value: string | null) => void;
}

const DateField = ({ label, value, disabled, onChange }: DateFieldProps) => (
  <DatePicker
    aria-label={label}
    format="DD.MM.YYYY"
    value={value ? dayjs(value) : null}
    disabled={disabled}
    onChange={(d) => onChange(d ? d.format("YYYY-MM-DD") : null)}
    className="w-full"
  />
);

interface HaulierViewProps {
  customerId: string;
}

// One haulier: who it is, why it can or cannot be put on a trip, and its Trucking profile. Anyone
// fills in the profile; a manager blocks or unblocks and manages its portal users. Saves carry the version read.
export const HaulierView = ({ customerId }: HaulierViewProps) => {
  const toast = useToast();
  const { user } = useAuth();
  const { haulier, isLoading, error, reload, save, isSaving, block, unblock, isBlocking } = useHaulier(customerId);
  const { settings } = useTruckingSettings();
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [conflict, setConflict] = useState(false);
  const [blockMode, setBlockMode] = useState<"block" | "unblock" | null>(null);

  // The haulier as read (set while rendering): a newer one replaces the draft only while nothing is edited here.
  const [seen, setSeen] = useState<HaulierDetail | null>(null);
  if (haulier && haulier !== seen) {
    setSeen(haulier);
    if (!draft || !seen || same(draft, draftOf(seen))) setDraft(draftOf(haulier));
  }

  // A link to the VAT register card (from a blocked haulier invoice) lands there once the page is drawn.
  const loaded = !!haulier;
  useEffect(() => {
    if (loaded && window.location.hash === "#vat-register") document.getElementById("vat-register")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [loaded]);

  const dirty = !!draft && !!haulier && !same(draft, draftOf(haulier));
  useUnsavedGuard(dirty, "trucking-haulier");
  const problems = useMemo(() => (draft ? profileProblems(draft) : []), [draft]);

  // Active vehicle types, plus any the haulier still has that were switched off since.
  const vehicleOptions = useMemo(() => {
    const types = settings?.vehicleTypes ?? [];
    const chosen = new Set(draft?.vehicleTypes ?? []);
    const known = new Set(types.map((t) => t.code));
    return [
      ...types.filter((t) => t.active || chosen.has(t.code)).map((t) => ({ value: t.code, label: t.active ? t.label : `${t.label} (switched off)` })),
      ...[...chosen].filter((c) => !known.has(c)).map((c) => ({ value: c, label: c })),
    ];
  }, [settings, draft?.vehicleTypes]);

  if (isLoading) {
    return (
      <div className="flex justify-center p-20">
        <Spin size="large" />
      </div>
    );
  }
  if (!haulier || !draft) {
    return (
      <div className="p-10 text-center text-slate-500">
        {isNotFound(error) ? "This company is not a haulier. Give it the Haulier role in the Customer Database first." : `Could not load the haulier: ${apiErrorMessage(error)}.`}{" "}
        <Link href="/trucking?tab=hauliers" className="text-indigo-500">
          Back to Hauliers
        </Link>
      </div>
    );
  }

  const p = haulier.profile;
  const canBlock = isTruckingManager(user);
  const blockReason = managerOnlyReason(user, "block or unblock a haulier");
  // The 30-day hold after a bank-account change (owner decision 6), while it runs.
  const bankHold = p.bankChangeHoldUntil && Date.parse(p.bankChangeHoldUntil) > Date.now() ? p.bankChangeHoldUntil : null;
  const set = <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));

  const handleSave = async () => {
    try {
      const res = await save({ ...draft, preferredLanes: draft.preferredLanes.map(({ key: _key, ...lane }) => lane), version: p.version });
      setDraft(draftOf(res.haulier));
      setConflict(false);
      toast.success("Haulier saved");
    } catch (e) {
      if (isVersionConflict(e)) setConflict(true);
      else toast.error(`Could not save the haulier: ${apiErrorMessage(e)}`);
    }
  };
  const handleReload = async () => {
    const res = await reload();
    if (!res.data) return;
    setDraft(draftOf(res.data.haulier));
    setConflict(false);
  };
  const handleBlockConfirm = async (reason: string) => {
    try {
      if (blockMode === "block") await block(reason);
      else await unblock(reason);
      toast.success(blockMode === "block" ? "Haulier blocked" : "Haulier unblocked");
      setBlockMode(null);
    } catch (e) {
      toast.error(`Could not ${blockMode} the haulier: ${apiErrorMessage(e)}`);
    }
  };

  return (
    <div className="bg-slate-50 min-h-full">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex flex-wrap items-start gap-2">
          <Link href="/trucking?tab=hauliers" aria-label="Back to Hauliers" className="mt-1 text-slate-400 hover:text-indigo-500 p-1">
            <ArrowLeftOutlined />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[22px] font-bold text-slate-800 m-0">{haulier.companyName}</h1>
              <HaulierStatusChip status={haulier.status} />
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {TERMS.haulier} · IČO {haulier.ico || "—"}
              {haulier.dic ? ` · DIČ ${haulier.dic}` : ""}
              {haulier.city ? ` · ${haulier.city}` : ""}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/customers/${customerId}`} className="text-[13px] font-semibold text-indigo-600 hover:underline">
              Open in Customer Database
            </Link>
            <Tooltip title={blockReason || undefined}>
              {p.blocked ? (
                <Button icon={<UnlockOutlined />} disabled={!canBlock} onClick={() => setBlockMode("unblock")}>
                  Unblock…
                </Button>
              ) : (
                <Button danger icon={<LockOutlined />} disabled={!canBlock} onClick={() => setBlockMode("block")}>
                  Block…
                </Button>
              )}
            </Tooltip>
          </div>
        </div>
        <div className="mt-3 max-w-[900px]">
          <HaulierIssueList issues={haulier.issues} />
          {p.blocked && (
            <p className="mt-1 mb-0 text-xs text-slate-500">
              Blocked{p.blockedBy ? ` by ${p.blockedBy}` : ""}
              {p.blockedAt ? ` on ${businessDateTime(p.blockedAt)}` : ""}
              {p.blockReason ? `: “${p.blockReason}”` : ""}
            </p>
          )}
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto p-4 sm:p-6 flex flex-col gap-4">
        {p.version === 0 && <Alert type="info" showIcon message="No Trucking profile yet — fill in insurance and licence, then save. Until then the haulier stays blocked." />}
        {conflict && (
          <Alert
            type="error"
            showIcon
            message={HAULIER_CONFLICT_TEXT}
            action={
              <Button size="small" onClick={handleReload}>
                Reload
              </Button>
            }
          />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <SectionCard title={TERMS.liabilityInsurance}>
            <div className="grid grid-cols-2 gap-3">
              <TruckingField label="Insurer">
                <Input aria-label="Insurer" value={draft.insurer} onChange={(e) => set("insurer", e.target.value)} />
              </TruckingField>
              <TruckingField label="Policy no.">
                <Input aria-label="Insurance policy number" value={draft.insurancePolicyNo} onChange={(e) => set("insurancePolicyNo", e.target.value)} />
              </TruckingField>
              <TruckingField label="Limit">
                <div className="flex gap-2">
                  <InputNumber
                    aria-label="Insurance limit"
                    min={0}
                    step={100000}
                    value={draft.insuranceLimit}
                    onChange={(v) => set("insuranceLimit", v ?? null)}
                    className="flex-1"
                  />
                  <Select aria-label="Insurance currency" value={draft.insuranceCurrency} options={CURRENCY_OPTIONS} onChange={(v) => set("insuranceCurrency", v)} className="w-[84px]" />
                </div>
              </TruckingField>
              <TruckingField label="Valid to">
                <DateField label="Insurance valid to" value={draft.insuranceValidTo} onChange={(v) => set("insuranceValidTo", v)} />
              </TruckingField>
            </div>
          </SectionCard>

          <SectionCard title={TERMS.transportLicence}>
            <div className="grid grid-cols-2 gap-3">
              <TruckingField label="Licence no.">
                <Input aria-label="Licence number" value={draft.licenceNo} onChange={(e) => set("licenceNo", e.target.value)} />
              </TruckingField>
              <TruckingField label="Valid to">
                <DateField label="Licence valid to" value={draft.licenceUnlimited ? null : draft.licenceValidTo} disabled={draft.licenceUnlimited} onChange={(v) => set("licenceValidTo", v)} />
              </TruckingField>
              <div className="col-span-2 flex items-center gap-2">
                <Switch size="small" checked={draft.licenceUnlimited} aria-label="Licence has no end date" onChange={(on) => set("licenceUnlimited", on)} />
                <span className="text-[13px] text-slate-700">No end date</span>
                <span className="text-[11px] text-slate-400">— a Czech licence (koncese) is usually issued without one</span>
              </div>
            </div>
          </SectionCard>

          <div id="vat-register" className="scroll-mt-4">
            <SectionCard title="VAT register">
              <div className="flex flex-col gap-3">
                {!canBlock && (
                  <Alert
                    type="info"
                    showIcon
                    icon={<LockOutlined />}
                    message="Only a manager can change the VAT register and bank-account details. Every change is logged with before and after."
                  />
                )}
                <div className="flex items-center gap-2">
                  <Switch size="small" checked={draft.vatUnreliable} disabled={!canBlock} aria-label={TERMS.unreliableVatPayer} onChange={(on) => set("vatUnreliable", on)} />
                  <span className={`text-[13px] ${draft.vatUnreliable ? "font-semibold text-red-700" : "text-slate-700"}`}>{TERMS.unreliableVatPayer}</span>
                  {draft.vatUnreliable && <span className="text-[11px] text-red-600">— blocks the haulier</span>}
                </div>
                <div className="flex items-center gap-2">
                  <Switch size="small" checked={draft.bankAccountPublished} disabled={!canBlock} aria-label="Bank account published" onChange={(on) => set("bankAccountPublished", on)} />
                  <span className="text-[13px] text-slate-700">Bank account published in the VAT register</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[13px] text-slate-700">
                  <span>Last checked: {draft.vatCheckedAt ? formatDate(draft.vatCheckedAt) : "never"}</span>
                  {canBlock && (
                    <Button size="small" onClick={() => set("vatCheckedAt", businessToday())} disabled={draft.vatCheckedAt === businessToday()}>
                      Mark checked today
                    </Button>
                  )}
                </div>
                <HaulierBankAccounts accounts={draft.bankAccounts ?? []} onChange={(v) => set("bankAccounts", v)} readOnly={!canBlock} />
                {bankHold && (
                  <Alert
                    type="warning"
                    showIcon
                    message={`Bank accounts changed${p.bankAccountsChangedBy ? ` by ${p.bankAccountsChangedBy}` : ""} on ${businessDateTime(p.bankAccountsChangedAt!)}`}
                    description={`Until ${businessDateTime(bankHold)} an invoice from this haulier is never approved automatically, even on an exact match: a manager approves it.`}
                  />
                )}
                <p className="m-0 text-[11px] text-slate-400">
                  Checked by hand in the VAT register for now; a check older than 30 days shows a warning. A haulier invoice is blocked while the haulier is an unreliable VAT
                  payer, its account is not published, or the invoice&apos;s account is not one listed here. For 30 days after an account is added - and always when the
                  user who added it enters the invoice - an exact match waits for a manager&apos;s approval.
                </p>
              </div>
            </SectionCard>
          </div>

          <SectionCard title="Capabilities and terms">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 flex items-center gap-2">
                <Switch size="small" checked={draft.adrCapable} aria-label="ADR capable" onChange={(on) => set("adrCapable", on)} />
                <span className="text-[13px] text-slate-700">{TERMS.adr} capable (dangerous goods)</span>
              </div>
              <div className="col-span-2">
                <TruckingField label={`${TERMS.vehicleType}s`}>
                  <Select
                    mode="multiple"
                    aria-label="Vehicle types"
                    value={draft.vehicleTypes}
                    options={vehicleOptions}
                    placeholder="Choose the vehicle types it sends"
                    onChange={(v: string[]) => set("vehicleTypes", v)}
                    className="w-full"
                  />
                </TruckingField>
              </div>
              <TruckingField label="Payment days">
                <InputNumber aria-label="Payment days" min={0} precision={0} value={draft.paymentDays} onChange={(v) => set("paymentDays", v ?? 0)} className="w-full" />
              </TruckingField>
              <TruckingField label="Currency">
                <Select aria-label="Currency" value={draft.currency} options={CURRENCY_OPTIONS} onChange={(v) => set("currency", v)} className="w-full" />
              </TruckingField>
              <div className="col-span-2">
                <TruckingField label={TERMS.costSplit} hint="How its price for a whole trip is shared across the consignments on it.">
                  <Select aria-label="Cost split basis" value={draft.costSplitBasis} options={COST_SPLIT_OPTIONS} onChange={(v) => set("costSplitBasis", v)} className="w-full" />
                </TruckingField>
              </div>
            </div>
          </SectionCard>
        </div>

        <SectionCard title={`${TERMS.preferredLane}s`}>
          <HaulierLanesTable lanes={draft.preferredLanes} onChange={(lanes) => set("preferredLanes", lanes)} />
        </SectionCard>

        <SectionCard title="Notes">
          <Input.TextArea aria-label="Notes" autoSize={{ minRows: 3, maxRows: 10 }} value={draft.notes} onChange={(e) => set("notes", e.target.value)} />
        </SectionCard>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="primary" onClick={handleSave} loading={isSaving} disabled={!dirty || problems.length > 0}>
            Save changes
          </Button>
          <Button onClick={() => setDraft(draftOf(haulier))} disabled={!dirty || isSaving}>
            Discard
          </Button>
          {dirty && !problems.length && <span className="text-xs text-amber-700">unsaved changes</span>}
          {problems.length > 0 && <span className="text-xs text-red-600">{problems.join(" · ")}</span>}
        </div>

        <HaulierPortalUsers customerId={customerId} manageReason={managerOnlyReason(user, "add, reset or disable portal users")} />
      </div>

      <HaulierBlockDialog
        open={blockMode !== null}
        mode={blockMode ?? "block"}
        companyName={haulier.companyName}
        loading={isBlocking}
        onClose={() => setBlockMode(null)}
        onConfirm={handleBlockConfirm}
      />
    </div>
  );
};

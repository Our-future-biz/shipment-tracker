"use client";

import { useState } from "react";
import { InputNumber, Spin, Switch } from "antd";
import { Pill } from "@/components/Pill";
import { useClaimTimeLimits, useClaimTimeLimitsSave } from "@/hooks/useClaimTimeLimits";
import { apiErrorMessage } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { BTN_PRIMARY, BTN_SM, CARD, CARD_BAR, CARD_TITLE, HINT, TD, TH } from "@/styles/ui";
import {
  CLAIM_LIMIT_MODES,
  GENERAL_PRACTICE_NOTE,
  NOTICE_DAYS_MAX,
  SUIT_MONTHS_MAX,
  confirmedText,
  daysText,
  draftOfSettings,
  isGeneralPractice,
  limitsChanged,
  limitsProblem,
  monthsText,
  saveMeaning,
  saveRequest,
  savedText,
  type ClaimMode,
  type ClaimTimeLimitsSettings,
  type LimitsDraft,
} from "../_lib/claimTimeLimits";

// Shipments → Managers → Settings: the company's claim time limits (Council Outlay 11, D21). The
// numbers by mode, the general practice beside them, the switch and who confirmed them. Off until a
// manager switches them on - saving with the switch On is the confirmation the server stamps. The
// server checks every save again; its refusals are shown as they come.

export function ClaimTimeLimitsPanel() {
  const { settings, isLoading, isError } = useClaimTimeLimits();
  return (
    <section aria-label="Claim time limits" className={`${CARD} overflow-hidden`}>
      <div className={CARD_BAR}>
        <span className={CARD_TITLE}>Claim time limits</span>
        {settings && (
          <Pill tone={settings.enabled ? "green" : "slate"} className="ml-auto">
            {settings.enabled ? "On" : "Off"}
          </Pill>
        )}
      </div>
      {isLoading ? (
        <div className="p-6">
          <Spin />
        </div>
      ) : isError || !settings ? (
        <div className="p-4 text-[13px] text-red-600">Could not load the claim time limits.</div>
      ) : (
        // Filled anew from what the server keeps after each save.
        <LimitsForm key={`${settings.enabled}:${settings.updatedAt ?? ""}`} settings={settings} />
      )}
    </section>
  );
}

const HEAD = `${TH} !px-3`;
const CELL = `${TD} !px-3`;

function LimitsForm({ settings }: { settings: ClaimTimeLimitsSettings }) {
  const toast = useToast();
  const save = useClaimTimeLimitsSave();
  const [draft, setDraft] = useState<LimitsDraft>(() => draftOfSettings(settings));
  const [error, setError] = useState("");
  const saving = save.isPending;
  const problem = limitsProblem(draft);
  const changed = limitsChanged(draft, settings);
  const confirmed = confirmedText(settings);

  const setNumber = (mode: ClaimMode, field: "noticeDays" | "suitMonths", value: number | null) =>
    setDraft((d) => ({ ...d, limits: { ...d.limits, [mode]: { ...d.limits[mode], [field]: value } } }));

  const send = () => {
    if (problem || saving || !changed) return;
    setError("");
    save
      .mutateAsync(saveRequest(draft))
      .then((saved) => toast.success(saved.enabled ? "Claim time limits switched on and confirmed" : "Claim time limits saved, switched off"))
      .catch((e) => setError(apiErrorMessage(e)));
  };

  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">{GENERAL_PRACTICE_NOTE}</div>

      <div className="overflow-x-auto">
        <table className="w-full max-w-[720px] border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={HEAD}>Mode</th>
              <th className={HEAD}>Notify the carrier within</th>
              <th className={HEAD}>Suit within</th>
              <th className={HEAD}>General practice</th>
            </tr>
          </thead>
          <tbody>
            {CLAIM_LIMIT_MODES.map(({ key, label }) => {
              const general = settings.generalPractice[key];
              const asGeneral = isGeneralPractice(draft, settings.generalPractice, key);
              return (
                <tr key={key}>
                  <td className={`${CELL} font-semibold text-slate-900`}>{label}</td>
                  <td className={CELL}>
                    <span className="flex items-center gap-2">
                      <InputNumber<number>
                        aria-label={`${label}: days to notify the carrier`}
                        size="small"
                        className="!w-20"
                        min={1}
                        max={NOTICE_DAYS_MAX}
                        precision={0}
                        value={draft.limits[key].noticeDays}
                        onChange={(v) => setNumber(key, "noticeDays", v ?? null)}
                        disabled={saving}
                      />
                      <span className={HINT}>days after delivery</span>
                    </span>
                  </td>
                  <td className={CELL}>
                    <span className="flex items-center gap-2">
                      <InputNumber<number>
                        aria-label={`${label}: months to bring a suit`}
                        size="small"
                        className="!w-20"
                        min={1}
                        max={SUIT_MONTHS_MAX}
                        precision={0}
                        value={draft.limits[key].suitMonths}
                        onChange={(v) => setNumber(key, "suitMonths", v ?? null)}
                        disabled={saving}
                      />
                      <span className={HINT}>months</span>
                    </span>
                  </td>
                  <td className={`${CELL} whitespace-nowrap ${asGeneral ? "text-slate-500" : "text-amber-700"}`} title={asGeneral ? "As general practice" : "Changed from general practice"}>
                    {daysText(general.noticeDays)} · {monthsText(general.suitMonths)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className={`${HINT} -mt-2`}>The notice runs from the job&apos;s delivery, else its ATA; the suit time bar from the same day.</div>

      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-2 cursor-pointer w-fit">
          <Switch
            aria-label="Claim time limits switched on"
            checked={draft.enabled}
            onChange={(enabled) => setDraft((d) => ({ ...d, enabled }))}
            checkedChildren="On"
            unCheckedChildren="Off"
            disabled={saving}
          />
          <span className="text-[13px] text-slate-700">Show the deadlines on each job's Claim tab and as signals on the Cockpit</span>
        </label>
        {confirmed && <div className="text-[13px] font-medium text-emerald-700">{confirmed}</div>}
        <div className={HINT}>{savedText(settings)}</div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button type="button" onClick={send} disabled={saving || !!problem || !changed} className={`${BTN_PRIMARY} ${BTN_SM}`}>
          {saving ? "Saving…" : "Save"}
        </button>
        <span className={problem ? "text-[12px] text-red-600" : HINT}>{problem ? `${problem}.` : changed ? saveMeaning(draft, settings) : "Nothing changed."}</span>
      </div>
      <div aria-live="polite">{error && <div className="text-[13px] text-red-600">Not saved: {error}</div>}</div>
    </div>
  );
}

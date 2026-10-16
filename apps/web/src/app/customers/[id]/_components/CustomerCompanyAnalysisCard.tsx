"use client";

import { DatePicker, Select, Tag } from "antd";
import dayjs from "dayjs";
import { SectionCard } from "@/components/SectionCard";
import type { CustomerItem } from "@/hooks/useCustomers";
import type { interfaces } from "@/lib/api/client";
import {
  calcCompanyAge,
  calcRisk,
  calcStability,
  getNaceInfo,
  isNewCompany,
  parseNaceCodes,
  RISK_CLASS,
} from "../../_lib/companyAnalysis";
import type { RiskLevel } from "../../_lib/companyAnalysis";
import { CustomerInfoRow } from "./CustomerInfoRow";
import { EditableText } from "./EditableText";
import { SELECT_PROPS, SELECT_WRAPPER_CLASS } from "./inlineSelect";
import { useCustomerEdits } from "./useCustomerEdits";
import { useCanManageCustomers } from "@/lib/auth/AuthContext";

const MAX_SECONDARY_ACTIVITIES = 6;

interface CustomerCompanyAnalysisCardProps {
  customer: CustomerItem;
}

const RISK_LEVELS: RiskLevel[] = ["Low", "Medium", "High"];

function RiskPill({ level }: { level: RiskLevel }) {
  return (
    <span
      className={`inline-flex rounded-xl text-[11px] font-medium px-2.5 py-0.5 leading-[18px] ${RISK_CLASS[level]}`}
    >
      {level}
    </span>
  );
}

// What the registry data says about the company: what it trades in on the left, how established and how
// risky it is on the right. The two groups sit side by side once the card is wide enough for both.
// Every fact can be corrected by hand: a typed value replaces the derived one, which stays shown in grey
// until then (and comes back when the typed value is cleared). The age and stability follow the registration date.
export function CustomerCompanyAnalysisCard({ customer }: CustomerCompanyAnalysisCardProps) {
  const { shown, save } = useCustomerEdits(customer);
  // The analysis overrides are a manager's call; the server refuses anyone else, so for others they are shown, not edited.
  const lockedReason = useCanManageCustomers() ? undefined : "Only a manager can change the company analysis";
  const naceInfo = getNaceInfo(parseNaceCodes(shown.nace));
  const { primary } = naceInfo;
  const risk = calcRisk(shown.registrationDate, naceInfo);
  const age = calcCompanyAge(shown.registrationDate);
  // Without a usable registration date neither the age nor the stability derived from it is known.
  const ageKnown =
    !!shown.registrationDate && !Number.isNaN(new Date(shown.registrationDate).getTime());
  const derivedStability = ageKnown ? calcStability(age.years) : "";
  const riskLevel: RiskLevel = shown.riskLevel || risk.level;
  const registrationDate = shown.registrationDate ? dayjs(shown.registrationDate) : null;
  const secondaryLabels = [...new Set(naceInfo.secondary.map((hit) => hit.label))]
    .filter((label) => label !== primary?.label)
    .slice(0, MAX_SECONDARY_ACTIVITIES);

  const riskOptions = [
    {
      value: "",
      label: <span className="text-slate-500">Auto ({risk.level})</span>,
    },
    ...RISK_LEVELS.map((level) => ({
      value: level,
      label: <RiskPill level={level} />,
    })),
  ];

  return (
    <SectionCard title="Company analysis" bodyClassName="p-4 @container">
      <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-x-8">
        <div>
          <CustomerInfoRow label="Primary industry">
            <EditableText
              value={shown.industry}
              placeholder={primary?.label ?? "add…"}
              onCommit={(value) => save({ industry: value })}
              label="Primary industry"
              readOnlyReason={lockedReason}
            />
          </CustomerInfoRow>
          <CustomerInfoRow label="Typical cargo">
            <EditableText
              value={shown.typicalCargo}
              placeholder={primary?.cargo ?? "add…"}
              onCommit={(value) => save({ typicalCargo: value })}
              label="Typical cargo"
              readOnlyReason={lockedReason}
            />
          </CustomerInfoRow>
          {secondaryLabels.length > 0 && (
            <CustomerInfoRow label="Secondary activities">
              <div className="flex flex-wrap gap-1.5">
                {secondaryLabels.map((label) => (
                  <Tag key={label} className="!m-0 !whitespace-normal">
                    {label}
                  </Tag>
                ))}
              </div>
            </CustomerInfoRow>
          )}
        </div>

        <div className="border-t border-slate-100 @3xl:border-t-0">
          <CustomerInfoRow label="Registration date">
            <DatePicker
              size="small"
              variant="borderless"
              format="DD.MM.YYYY"
              placeholder="add…"
              aria-label="Registration date"
              className="-ml-2 rounded transition-colors hover:bg-slate-100 [&_input]:!text-xs"
              value={registrationDate && registrationDate.isValid() ? registrationDate : null}
              onChange={(date) => save({ registrationDate: date ? date.format("YYYY-MM-DD") : "" })}
            />
          </CustomerInfoRow>
          <CustomerInfoRow label="Company age">
            {ageKnown ? (
              <span className="inline-flex items-center gap-1.5 flex-wrap">
                {age.label}
                {isNewCompany(shown.registrationDate) && (
                  <Tag color="gold" className="!m-0">
                    NEW
                  </Tag>
                )}
              </span>
            ) : null}
          </CustomerInfoRow>
          <CustomerInfoRow label="Stability">
            <EditableText
              value={shown.stability}
              placeholder={derivedStability || "add…"}
              onCommit={(value) => save({ stability: value })}
              label="Stability"
              readOnlyReason={lockedReason}
            />
          </CustomerInfoRow>
          <CustomerInfoRow label="Risk level">
            <div className={SELECT_WRAPPER_CLASS}>
              <Select
                {...SELECT_PROPS}
                aria-label="Risk level"
                disabled={!!lockedReason}
                title={lockedReason}
                value={shown.riskLevel}
                options={riskOptions}
                labelRender={({ value }) =>
                  value ? (
                    <RiskPill level={riskLevel} />
                  ) : (
                    <span className="inline-flex items-center gap-1.5">
                      <RiskPill level={risk.level} />
                      <span className="text-slate-400">auto</span>
                    </span>
                  )
                }
                onChange={(value: interfaces.RiskLevelOverride) => save({ riskLevel: value })}
              />
            </div>
          </CustomerInfoRow>
          {risk.reasons.length > 0 && (
            <CustomerInfoRow label="Risk factors">
              <ul className="space-y-0.5">
                {risk.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </CustomerInfoRow>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

"use client";

import { Tag } from "antd";
import { SectionCard } from "@/components/SectionCard";
import type { CustomerItem } from "@/hooks/useCustomers";
import {
  calcCompanyAge,
  calcRisk,
  calcStability,
  getNaceInfo,
  isNewCompany,
  parseNaceCodes,
  RISK_COLOR,
} from "../../_lib/companyAnalysis";
import { CustomerInfoRow } from "./CustomerInfoRow";

const MAX_SECONDARY_ACTIVITIES = 6;

interface CustomerCompanyAnalysisCardProps {
  customer: CustomerItem;
}

// What the registry data says about the company: what it trades in on the left, how established and how
// risky it is on the right. The two groups sit side by side once the card is wide enough for both.
export function CustomerCompanyAnalysisCard({ customer }: CustomerCompanyAnalysisCardProps) {
  const naceInfo = getNaceInfo(parseNaceCodes(customer.nace));
  const { primary } = naceInfo;
  const risk = calcRisk(customer.companyStatus, customer.registrationDate, naceInfo);
  const riskColor = RISK_COLOR[risk.level];
  const age = calcCompanyAge(customer.registrationDate);
  // Without a usable registration date neither the age nor the stability derived from it is known.
  const ageKnown = !!customer.registrationDate && !Number.isNaN(new Date(customer.registrationDate).getTime());
  const secondaryLabels = [...new Set(naceInfo.secondary.map((hit) => hit.label))]
    .filter((label) => label !== primary?.label)
    .slice(0, MAX_SECONDARY_ACTIVITIES);

  return (
    <SectionCard title="Company analysis" bodyClassName="p-4 @container">
      <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-x-8">
        <div>
          <CustomerInfoRow label="Primary industry">{primary?.label}</CustomerInfoRow>
          <CustomerInfoRow label="Typical cargo">
            {primary ? (
              <Tag color="blue" className="!m-0 !whitespace-normal">
                {primary.cargo}
              </Tag>
            ) : null}
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
          <CustomerInfoRow label="Company age">
            {ageKnown ? (
              <span className="inline-flex items-center gap-1.5 flex-wrap">
                {age.label}
                {isNewCompany(customer.registrationDate) && (
                  <Tag color="gold" className="!m-0">
                    NEW
                  </Tag>
                )}
              </span>
            ) : null}
          </CustomerInfoRow>
          <CustomerInfoRow label="Stability">{ageKnown ? calcStability(age.years) : null}</CustomerInfoRow>
          <CustomerInfoRow label="Risk level">
            <span
              className="inline-flex rounded-xl text-[11px] font-medium px-2.5 py-0.5 leading-[18px]"
              style={{ backgroundColor: riskColor.bg, color: riskColor.text }}
            >
              {risk.level}
            </span>
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

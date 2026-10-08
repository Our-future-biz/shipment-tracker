"use client";

import { InfoCircleFilled, WarningFilled } from "@ant-design/icons";
import type { CustomerItem } from "@/hooks/useCustomers";
import { calcRisk, getNaceInfo, isNewCompany, isRegistryActive, parseNaceCodes } from "../../_lib/companyAnalysis";

type BannerTone = "red" | "amber";

interface CustomerBanner {
  key: string;
  tone: BannerTone;
  text: string;
}

const TONE_CLASS: Record<BannerTone, string> = {
  red: "bg-red-50 border-red-200 text-red-700",
  amber: "bg-amber-50 border-amber-200 text-amber-700",
};

interface CustomerBannersProps {
  customer: CustomerItem;
}

// Warning strips on top of the Overview: what to check before quoting or extending credit.
export function CustomerBanners({ customer }: CustomerBannersProps) {
  const naceInfo = getNaceInfo(parseNaceCodes(customer.nace));
  const risk = calcRisk(customer.companyStatus, customer.registrationDate, naceInfo);
  // The risk that comes from the industry alone, i.e. with a clean registry status and no "new company" flag.
  const industryRisk = calcRisk("", "", naceInfo);

  const banners: CustomerBanner[] = [];
  if (!isRegistryActive(customer.companyStatus)) {
    banners.push({
      key: "registry",
      tone: "red",
      text: `Registry status is "${customer.companyStatus}" — verify the company is still trading before quoting.`,
    });
  }
  if (isNewCompany(customer.registrationDate)) {
    banners.push({ key: "new-company", tone: "amber", text: "New company (less than 2 years old) — consider prepayment terms." });
  }
  // The registry status and the company age already have their own strip, so the risk strip only adds
  // what those two do not say; otherwise the same fact would be shown twice.
  if (risk.level !== "Low" && (industryRisk.reasons.length > 0 || banners.length === 0)) {
    banners.push({
      key: "risk",
      tone: risk.level === "High" ? "red" : "amber",
      text: `Risk level ${risk.level}: ${industryRisk.reasons.join("; ") || "review before extending credit"}.`,
    });
  }

  if (banners.length === 0) return null;

  return (
    <div className="space-y-2">
      {banners.map((banner) => (
        <div key={banner.key} className={`flex items-start gap-2 border rounded-xl px-3 py-2 text-[13px] ${TONE_CLASS[banner.tone]}`}>
          {banner.tone === "red" ? (
            <WarningFilled aria-hidden className="mt-[3px] shrink-0" />
          ) : (
            <InfoCircleFilled aria-hidden className="mt-[3px] shrink-0" />
          )}
          <span>{banner.text}</span>
        </div>
      ))}
    </div>
  );
}

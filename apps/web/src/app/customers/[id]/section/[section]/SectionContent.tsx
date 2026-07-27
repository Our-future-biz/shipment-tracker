"use client";

import { useParams, useRouter } from "next/navigation";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useCustomer } from "@/hooks/useCustomers";
import { SECTION_DEFS } from "../_sections/shared";
import { FinancialSection } from "../_sections/FinancialSection";
import { CreditSection } from "../_sections/CreditSection";
import { ShipmentsSection } from "../_sections/ShipmentsSection";
import { QuotesSection } from "../_sections/QuotesSection";
import { ContactsSection } from "../_sections/ContactsSection";
import { DocumentsSection } from "../_sections/DocumentsSection";
import { CommunicationSection } from "../_sections/CommunicationSection";
import { PaymentSection } from "../_sections/PaymentSection";

export function SectionContent() {
  const { id, section } = useParams<{ id: string; section: string }>();
  const router = useRouter();
  const { customer } = useCustomer(id);

  const def = SECTION_DEFS.find((s) => s.key === section);

  return (
    <div className="bg-slate-50 min-h-full p-6">
      <div className="max-w-[1500px] mx-auto">
        <button
          onClick={() => router.push(`/customers/${id}`)}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-3"
        >
          <ArrowLeftOutlined className="text-xs" /> {customer?.companyName ?? "Customer"}
        </button>
        <h1 className="text-xl font-bold text-slate-800 mb-1">{def?.label ?? "Section"}</h1>

        {/* Section switcher tabs */}
        <div className="flex gap-0 mb-5 border-b border-slate-200 overflow-x-auto">
          {SECTION_DEFS.map((s) => (
            <div
              key={s.key}
              onClick={() => router.push(`/customers/${id}/section/${s.key}`)}
              className={`px-3.5 py-2.5 text-sm cursor-pointer whitespace-nowrap transition-all duration-150 border-b-2 ${
                s.key === section
                  ? "font-semibold text-indigo-500 border-indigo-500"
                  : "font-normal text-slate-400 border-transparent hover:text-slate-600"
              }`}
            >
              {s.label}
            </div>
          ))}
        </div>

        {section === "financial" && <FinancialSection customerId={id} />}
        {section === "credit" && <CreditSection customerId={id} />}
        {section === "shipments" && <ShipmentsSection customerId={id} />}
        {section === "quotes" && <QuotesSection customerId={id} />}
        {section === "contacts" && <ContactsSection customerId={id} />}
        {section === "documents" && <DocumentsSection customerId={id} />}
        {section === "communication" && <CommunicationSection customerId={id} />}
        {section === "payment" && <PaymentSection customerId={id} />}
        {!def && <div className="text-slate-400 text-center py-12">Unknown section.</div>}
      </div>
    </div>
  );
}

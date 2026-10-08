"use client";

import { CheckCircleFilled, RightOutlined } from "@ant-design/icons";
import { SectionCard } from "@/components/SectionCard";
import { useCustomerContacts } from "@/hooks/useCustomerContacts";
import { useCustomerNotes } from "@/hooks/useCustomerNotes";
import type { CustomerItem } from "@/hooks/useCustomers";

const STEP_BUTTON_CLASS = [
  "w-full flex items-center gap-2.5 px-2 py-2 rounded-lg bg-transparent border-0 text-left text-[13px]",
  "cursor-pointer transition-colors hover:bg-slate-50",
].join(" ");

interface CustomerNextStepsCardProps {
  customer: CustomerItem;
  onSelectTab: (key: string) => void;
}

// Onboarding checklist of a new customer. Each step opens the tab where it is done; the card goes away
// once nothing is left to do.
export function CustomerNextStepsCard({ customer, onSelectTab }: CustomerNextStepsCardProps) {
  const { contacts, isLoading: contactsLoading } = useCustomerContacts(customer.id);
  const { notes, isLoading: notesLoading } = useCustomerNotes(customer.id);

  // Until both lists are in, a finished checklist would flash on screen as unfinished and then disappear.
  if (contactsLoading || notesLoading) return null;

  const steps = [
    { tab: "contacts", label: "Add contacts", done: contacts.length > 0 },
    { tab: "finance", label: "Set credit limit", done: customer.creditLimit > 0 },
    { tab: "communication", label: "Log first interaction", done: notes.length > 0 },
  ];
  const doneCount = steps.filter((step) => step.done).length;

  if (doneCount === steps.length) return null;

  return (
    <SectionCard
      title="Next steps"
      bodyClassName="p-2"
      extra={
        <span className="text-xs font-medium text-slate-500 tabular-nums">
          {doneCount} of {steps.length} done
        </span>
      }
    >
      <ul>
        {steps.map((step) => (
          <li key={step.tab}>
            <button type="button" onClick={() => onSelectTab(step.tab)} className={STEP_BUTTON_CLASS}>
              {/* The colour sits on a wrapper: antd icons always take the text colour of their parent. */}
              <span className={`flex shrink-0 text-[15px] ${step.done ? "text-green-500" : "text-slate-300"}`}>
                <CheckCircleFilled aria-hidden />
              </span>
              <span className="sr-only">{step.done ? "Done:" : "To do:"}</span>
              <span className={`flex-1 min-w-0 ${step.done ? "text-slate-400 line-through" : "text-slate-700"}`}>{step.label}</span>
              {!step.done && (
                <span className="flex shrink-0 text-[10px] text-slate-400">
                  <RightOutlined aria-hidden />
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

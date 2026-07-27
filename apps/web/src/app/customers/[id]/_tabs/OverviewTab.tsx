"use client";

import { useRouter } from "next/navigation";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { CheckCircleFilled, RightOutlined, FileAddOutlined, UserAddOutlined, MessageOutlined } from "@ant-design/icons";
import { useCustomer } from "@/hooks/useCustomers";
import { useCustomerShipments } from "@/hooks/useCustomerShipments";
import { useCustomerContacts } from "@/hooks/useCustomerContacts";
import { useCustomerNotes } from "@/hooks/useCustomerNotes";
import { fmtMoney, marginPct } from "../../_lib/constants";
import {
  parseNaceCodes,
  getNaceInfo,
  calcCompanyAge,
  calcRisk,
  calcStability,
  RISK_COLOR,
} from "../../_lib/companyAnalysis";

const dash = <span className="text-slate-300">—</span>;

function daysAgoLabel(iso: string): string {
  if (!iso) return "—";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d <= 0) return "Today";
  if (d === 1) return "Yesterday";
  return `${d} days ago`;
}

export function OverviewTab({ customerId }: { customerId: string }) {
  const router = useRouter();
  const { customer } = useCustomer(customerId);
  const { shipments } = useCustomerShipments(customerId);
  const { contacts } = useCustomerContacts(customerId);
  const { notes } = useCustomerNotes(customerId);

  if (!customer) return null;

  const naceInfo = getNaceInfo(parseNaceCodes(customer.nace));
  const age = calcCompanyAge(customer.registrationDate);
  const risk = calcRisk(customer.companyStatus, customer.registrationDate, naceInfo);
  const riskColor = RISK_COLOR[risk.level];
  const margin = marginPct(customer.totalRevenue, customer.totalProfit);
  const cost = Math.max(0, customer.totalRevenue - customer.totalProfit);
  const cur = customer.currency;

  const inProgress = shipments.filter((s) => s.status !== "Completed" && s.status !== "Pending").length;
  const completed = shipments.filter((s) => s.status === "Completed").length;

  const steps = [
    { label: "Add contacts", done: contacts.length > 0, go: () => router.push(`/customers/${customerId}?tab=contacts`) },
    { label: "Set credit limit", done: customer.creditLimit > 0, go: () => router.push(`/customers/${customerId}/section/credit`) },
    { label: "Log first interaction", done: notes.length > 0, go: () => router.push(`/customers/${customerId}?tab=communication`) },
  ];
  const lastNote = notes[0];

  const donutData = [
    { name: "Profit", value: customer.totalProfit },
    { name: "Cost", value: cost },
  ];

  return (
    <div className="grid grid-cols-3 gap-4 items-start">
      <Card title="Company analysis">
        <div className="space-y-2.5 text-[13px]">
          <Row label="Primary industry" value={naceInfo.primary?.label ?? "—"} />
          <Row
            label="Likely cargo"
            value={naceInfo.primary ? <Pill className="bg-blue-50 text-blue-700">{naceInfo.primary.cargo}</Pill> : dash}
          />
          <Row
            label="Company age"
            value={
              <span>
                {age.label}
                {age.years < 2 && age.years >= 0 && customer.registrationDate && (
                  <Pill className="bg-emerald-50 text-emerald-700 ml-1.5">NEW</Pill>
                )}
              </span>
            }
          />
          <Row label="Stability" value={calcStability(age.years)} />
          <Row label="Risk level" value={<Pill style={{ backgroundColor: riskColor.bg, color: riskColor.text }}>{risk.level}</Pill>} />
          {risk.reasons.length > 0 && (
            <ul className="list-disc list-inside text-slate-500 text-xs space-y-0.5">
              {risk.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <ClickableCard title="Financial summary" onClick={() => router.push(`/customers/${customerId}/section/financial`)}>
        <div className="flex items-center gap-3">
          <div className="relative w-[120px] h-[120px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={donutData} dataKey="value" innerRadius={40} outerRadius={56} startAngle={90} endAngle={-270}>
                  <Cell fill="#16a34a" />
                  <Cell fill="#f97316" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-bold text-slate-800">{margin}%</span>
              <span className="text-[10px] text-slate-400">margin</span>
            </div>
          </div>
          <div className="space-y-1.5 text-[13px] flex-1">
            <Row label="Revenue" value={fmtMoney(customer.totalRevenue, cur)} />
            <Row label="Profit" value={<span className="text-green-600">{fmtMoney(customer.totalProfit, cur)}</span>} />
            <Row label="Cost" value={<span className="text-orange-600">{fmtMoney(cost, cur)}</span>} />
            <Row label="Shipments" value={String(customer.totalShipments)} />
          </div>
        </div>
      </ClickableCard>

      <Card title="Next steps">
        <div className="space-y-2">
          {steps.map((s) => (
            <div
              key={s.label}
              onClick={s.go}
              className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 rounded-lg px-2 py-1.5"
            >
              <CheckCircleFilled className={s.done ? "text-green-500" : "text-slate-200"} />
              <span className={`text-[13px] flex-1 ${s.done ? "text-slate-400 line-through" : "text-slate-700"}`}>{s.label}</span>
              {!s.done && <RightOutlined className="text-[10px] text-slate-300" />}
            </div>
          ))}
        </div>
      </Card>

      <ClickableCard title="Shipments history" onClick={() => router.push(`/customers/${customerId}/section/shipments`)}>
        <div className="grid grid-cols-2 gap-3">
          <MiniStat label="In progress" value={inProgress} tone="text-blue-600" />
          <MiniStat label="Completed" value={completed} tone="text-green-600" />
        </div>
      </ClickableCard>

      <ClickableCard title="Payment terms" onClick={() => router.push(`/customers/${customerId}/section/payment`)}>
        <div className="space-y-1.5 text-[13px]">
          <PaymentRow label="General" value={customer.paymentTerms} />
          <PaymentRow label="Freight" value={customer.freightPaymentTerms} />
          <PaymentRow label="Duty" value={customer.dutyPaymentTerms} />
        </div>
      </ClickableCard>

      <Card title="Last interaction">
        {lastNote ? (
          <div className="text-[13px]">
            <div className="flex items-center gap-2 mb-1">
              <Pill className="bg-slate-100 text-slate-600">{lastNote.type}</Pill>
              <span className="text-xs text-slate-400">{daysAgoLabel(lastNote.createdAt)}</span>
            </div>
            <div className="text-slate-700 line-clamp-3">{lastNote.content}</div>
            {lastNote.author && <div className="text-xs text-slate-400 mt-1">— {lastNote.author}</div>}
          </div>
        ) : (
          <div className="text-slate-400 text-[13px]">No interactions logged yet.</div>
        )}
      </Card>

      <Card title="Quick actions">
        <div className="space-y-1.5">
          <QuickAction icon={<UserAddOutlined />} label="Add contact" onClick={() => router.push(`/customers/${customerId}?tab=contacts`)} />
          <QuickAction icon={<FileAddOutlined />} label="Add document" onClick={() => router.push(`/customers/${customerId}?tab=documents`)} />
          <QuickAction icon={<MessageOutlined />} label="Log interaction" onClick={() => router.push(`/customers/${customerId}?tab=communication`)} />
        </div>
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="text-sm font-semibold text-slate-800 mb-3">{title}</div>
      {children}
    </div>
  );
}

function ClickableCard({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClick} className="bg-white border border-slate-200 rounded-2xl p-4 cursor-pointer hover:border-indigo-300 hover:shadow-sm transition">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-slate-800">{title}</span>
        <RightOutlined className="text-[11px] text-slate-300" />
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-slate-400 shrink-0">{label}</span>
      <span className="text-slate-700 text-right">{value}</span>
    </div>
  );
}

function Pill({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <span className={`rounded-md text-[11px] font-medium px-2 py-0.5 ${className ?? ""}`} style={style}>
      {children}
    </span>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 text-center">
      <div className={`text-2xl font-bold ${tone}`}>{value}</div>
      <div className="text-[11px] text-slate-400 mt-0.5">{label}</div>
    </div>
  );
}

function PaymentRow({ label, value }: { label: string; value: string }) {
  const isPrepay = value === "PREPAYMENT";
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-400">{label}</span>
      <span className={isPrepay ? "text-red-600 font-medium" : value ? "text-slate-700" : "text-slate-300"}>
        {value || "—"}
      </span>
    </div>
  );
}

function QuickAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 text-[13px] text-slate-600 hover:text-indigo-600 hover:bg-slate-50 rounded-lg px-2 py-1.5 text-left"
    >
      <span className="text-indigo-400">{icon}</span>
      {label}
    </button>
  );
}

"use client";

import { Table, type TableColumnsType } from "antd";
import { CountChip, SectionCard } from "@/components/SectionCard";
import type { OceanLayout } from "@/hooks/useOceanTariffs";
import type { interfaces } from "@/lib/api/client";
import { formatQty } from "@/lib/number";
import { SURCHARGE_BASIS_TEXT, SURCHARGE_CHARGE_TEXT, SURCHARGE_CONDITION_TEXT, surchargeScopeText } from "../../_lib/oceanTariffs";

type Surcharge = interfaces.OceanSurcharge;

// The surcharge rules the AI read from the tariff's text: how much, per what, on which rates and
// when, and the quote line each one goes on.
export const OceanVersionSurcharges = ({ layout }: { layout: Pick<OceanLayout, "surcharges" | "tables"> }) => {
  const columns: TableColumnsType<Surcharge> = [
    { key: "code", title: "Code", render: (_, s) => <span className="font-semibold text-slate-800">{s.code}</span> },
    { key: "name", title: "Name", render: (_, s) => s.name },
    {
      key: "amount",
      title: "Amount",
      align: "right",
      render: (_, s) => (
        <span className="whitespace-nowrap tabular-nums">
          {formatQty(s.amount)} {s.currency}
        </span>
      ),
    },
    { key: "basis", title: "Basis", render: (_, s) => <span className="whitespace-nowrap">{SURCHARGE_BASIS_TEXT[s.basis]}</span> },
    { key: "for", title: "For", render: (_, s) => <span className="text-xs text-slate-600">{surchargeScopeText(s, layout.tables)}</span> },
    { key: "condition", title: "When", render: (_, s) => SURCHARGE_CONDITION_TEXT[s.condition] || "always" },
    { key: "charge", title: "Quote charge", render: (_, s) => SURCHARGE_CHARGE_TEXT[s.charge] },
  ];

  return (
    <SectionCard title="Surcharges" extra={<CountChip count={layout.surcharges.length} />} bodyClassName="p-0">
      <Table<Surcharge>
        size="small"
        rowKey={(s) => layout.surcharges.indexOf(s)}
        columns={columns}
        dataSource={layout.surcharges}
        scroll={{ x: "max-content" }}
        pagination={false}
        locale={{ emptyText: "No surcharges were read." }}
      />
    </SectionCard>
  );
};

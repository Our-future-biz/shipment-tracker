"use client";

import { Table } from "antd";
import type { interfaces } from "@/lib/api/client";
import { formatPsc } from "../../_lib/hauliers";

interface TariffZonesTableProps {
  zones: interfaces.TariffZone[];
}

// The zones of a version: the postcode (PSČ) ranges each one covers.
export const TariffZonesTable = ({ zones }: TariffZonesTableProps) => (
  <Table<interfaces.TariffZone>
    size="small"
    rowKey={(z) => `${z.code}-${z.postcodeFrom}`}
    dataSource={zones}
    pagination={false}
    locale={{ emptyText: "No zones." }}
    columns={[
      { key: "code", title: "Zone", render: (_, z) => <span className="font-semibold">{z.code}</span> },
      { key: "label", title: "Name", dataIndex: "label" },
      { key: "from", title: "PSČ from", render: (_, z) => <span className="tabular-nums">{formatPsc(z.postcodeFrom)}</span> },
      { key: "to", title: "PSČ to", render: (_, z) => <span className="tabular-nums">{formatPsc(z.postcodeTo)}</span> },
      { key: "remote", title: "Remote area", render: (_, z) => (z.remote ? "Yes" : <span className="text-slate-400">No</span>) },
    ]}
  />
);

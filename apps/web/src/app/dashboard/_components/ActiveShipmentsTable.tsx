import { STATUS_COLORS } from "@/lib/enums";
import type { interfaces } from "@/lib/api/client";

type ShipmentItem = interfaces.ShipmentItem;

interface ActiveShipmentsTableProps {
  shipments: ShipmentItem[];
}

export const ActiveShipmentsTable = ({ shipments }: ActiveShipmentsTableProps) => (
  <section>
    <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
      Active Shipments ({shipments.length})
    </h2>
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            <th className="text-left px-3 py-2 font-semibold text-gray-500">Job Number</th>
            <th className="text-left px-3 py-2 font-semibold text-gray-500">Shipper</th>
            <th className="text-left px-3 py-2 font-semibold text-gray-500">Consignee</th>
            <th className="text-left px-3 py-2 font-semibold text-gray-500">Status</th>
            <th className="text-left px-3 py-2 font-semibold text-gray-500">POL</th>
            <th className="text-left px-3 py-2 font-semibold text-gray-500">POD</th>
          </tr>
        </thead>
        <tbody>
          {shipments.map((s) => {
            const statusColor = STATUS_COLORS[s.status] || "#94a3b8";
            return (
              <tr key={s.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="px-3 py-2 font-mono text-teal-600 dark:text-teal-400">{s.jobNumber}</td>
                <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{s.shipper || "—"}</td>
                <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{s.consignee || "—"}</td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap" style={{ backgroundColor: statusColor + "22", color: statusColor, border: `1px solid ${statusColor}44` }}>
                    {s.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{s.pol || "—"}</td>
                <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{s.pod || "—"}</td>
              </tr>
            );
          })}
          {shipments.length === 0 && (
            <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">No active shipments</td></tr>
          )}
        </tbody>
      </table>
    </div>
  </section>
);

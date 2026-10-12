"use client";

import { useState } from "react";
import Link from "next/link";
import { App, Button, Checkbox, Input, Modal, Popconfirm, Spin } from "antd";
import { DisconnectOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useDebounced } from "@/hooks/useDebounced";
import type { MasterJobItem, MasterJobShipmentItem } from "@/hooks/useMasterJobs";

interface MasterJobShipmentsProps {
  masterJob: MasterJobItem;
  shipments: MasterJobShipmentItem[];
  onLink: (shipmentIds: string[]) => Promise<unknown>;
  onUnlink: (shipmentId: string) => Promise<unknown>;
}

const TH = "px-2 py-2 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wide";
const TD = "px-2 py-2 text-slate-700";

// The house shipments under the master job, with linking and unlinking right here.
export function MasterJobShipments({ masterJob, shipments, onLink, onUnlink }: MasterJobShipmentsProps) {
  const { message } = App.useApp();
  const [adding, setAdding] = useState(false);

  const handleUnlink = async (s: MasterJobShipmentItem) => {
    try {
      await onUnlink(s.id);
      message.success(`${s.jobNumber} removed from ${masterJob.mczNumber}`);
    } catch {
      message.error("Removing the shipment failed");
    }
  };

  return (
    <>
      {shipments.length === 0 ? (
        <div className="py-4 text-center text-xs text-slate-400">No shipments linked yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-slate-200">
              <tr>
                <th className={TH}>Job Number</th>
                <th className={TH}>Customer</th>
                <th className={TH}>Shipper</th>
                <th className={TH}>Consignee</th>
                <th className={TH}>Direction</th>
                <th className={TH}>Containers</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {shipments.map((s) => (
                <tr key={s.id} className="border-b border-slate-100 last:border-b-0">
                  <td className={TD}>
                    <Link href={`/shipments/${s.id}`} className="font-mono font-semibold text-indigo-600 hover:underline">
                      {s.jobNumber}
                    </Link>
                  </td>
                  <td className={TD}>{s.customer || "—"}</td>
                  <td className={TD}>{s.shipper || "—"}</td>
                  <td className={TD}>{s.consignee || "—"}</td>
                  <td className={TD}>{s.tradeDirection || "—"}</td>
                  <td className={`${TD} font-mono`}>{s.containerNumber || "—"}</td>
                  <td className="px-2 py-2 text-right">
                    <Popconfirm
                      title={`Remove ${s.jobNumber} from ${masterJob.mczNumber}?`}
                      description="The shipment keeps the values it got from the master job."
                      okText="Remove"
                      onConfirm={() => handleUnlink(s)}
                    >
                      <Button size="small" type="text" icon={<DisconnectOutlined />} aria-label={`Remove ${s.jobNumber}`} />
                    </Popconfirm>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Button size="small" type="dashed" icon={<PlusOutlined />} className="mt-3" onClick={() => setAdding(true)}>
        Add shipments
      </Button>
      <AddShipmentsModal
        open={adding}
        masterJob={masterJob}
        linkedIds={new Set(shipments.map((s) => s.id))}
        onClose={() => setAdding(false)}
        onLink={onLink}
      />
    </>
  );
}

interface AddShipmentsModalProps {
  open: boolean;
  masterJob: MasterJobItem;
  linkedIds: Set<string>;
  onClose: () => void;
  onLink: (shipmentIds: string[]) => Promise<unknown>;
}

function AddShipmentsModal({ open, masterJob, linkedIds, onClose, onLink }: AddShipmentsModalProps) {
  const { message } = App.useApp();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [linking, setLinking] = useState(false);
  const search = useDebounced(query, 300);

  // Searched on the server over every shipment, not only the newest loaded ones.
  const results = useQuery({
    queryKey: ["shipments", "master-job-picker", search],
    queryFn: () => api.shipments.shipmentList({ search, limit: 50 }),
    enabled: open,
  });
  const candidates = (results.data?.data ?? []).filter((s) => !linkedIds.has(s.id) && !s.jobNumber.startsWith("CZQ"));

  const handleClose = () => {
    setQuery("");
    setSelected([]);
    onClose();
  };

  const handleLink = async () => {
    setLinking(true);
    try {
      await onLink(selected);
      message.success(`Linked ${selected.length} shipment${selected.length === 1 ? "" : "s"} to ${masterJob.mczNumber}`);
      handleClose();
    } catch {
      message.error("Linking the shipments failed");
    } finally {
      setLinking(false);
    }
  };

  return (
    <Modal
      open={open}
      title={`Add shipments to ${masterJob.mczNumber}`}
      onCancel={handleClose}
      okText={selected.length ? `Link ${selected.length}` : "Link"}
      okButtonProps={{ disabled: selected.length === 0, loading: linking }}
      onOk={handleLink}
      width={720}
    >
      <p className="text-xs text-slate-500 mb-3">
        Linked shipments take over the master job&apos;s synced MBL details.
      </p>
      <Input
        autoFocus
        allowClear
        prefix={<SearchOutlined className="text-slate-400" />}
        placeholder="Search job number, customer, shipper, consignee, POL, POD…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="mt-3 max-h-[420px] overflow-y-auto border border-slate-200 rounded-lg">
        {results.isLoading ? (
          <div className="flex justify-center py-8">
            <Spin />
          </div>
        ) : candidates.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">No shipments found.</div>
        ) : (
          <Checkbox.Group className="w-full flex-col" value={selected} onChange={(v) => setSelected(v as string[])}>
            {candidates.map((s) => (
              <label
                key={s.id}
                className="flex items-center gap-3 px-3 py-2 border-b border-slate-100 last:border-b-0 text-xs cursor-pointer hover:bg-slate-50"
              >
                <Checkbox value={s.id} />
                <span className="font-mono font-semibold w-[110px] shrink-0">{s.jobNumber}</span>
                <span className="flex-1 min-w-0 truncate text-slate-700">{s.customer || s.shipper || "—"}</span>
                <span className="w-[120px] shrink-0 text-slate-500 truncate">
                  {[s.pol, s.pod].filter(Boolean).join(" → ")}
                </span>
                {s.masterJobMczNumber && (
                  <span className="shrink-0 text-amber-600" title="Linking moves it to this master job">
                    on {s.masterJobMczNumber}
                  </span>
                )}
              </label>
            ))}
          </Checkbox.Group>
        )}
      </div>
    </Modal>
  );
}

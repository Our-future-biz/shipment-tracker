"use client";

import { useState } from "react";
import Link from "next/link";
import { App, Button, Checkbox, Input, Modal, Popconfirm, Spin } from "antd";
import { DisconnectOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { api, apiErrorMessage } from "@/lib/api";
import { useDebounced } from "@/hooks/useDebounced";
import { useAuth } from "@/lib/auth/AuthContext";
import { canChangeShipmentDetails } from "@/lib/shipmentEditRule";
import { LINK_REFUSED_HINT } from "@/app/shipments/_components/MasterJobDialog";
import type { MasterJobItem, MasterJobShipmentItem } from "@/hooks/useMasterJobs";
import { EMPTY_CELL } from "@/components/EmptyCell";
import { HINT, LINK, REF, TD, TH } from "@/styles/ui";

interface MasterJobShipmentsProps {
  masterJob: MasterJobItem;
  shipments: MasterJobShipmentItem[];
  onLink: (shipmentIds: string[]) => Promise<unknown>;
  onUnlink: (shipmentId: string) => Promise<unknown>;
}

// The house shipments under the master job, with linking and unlinking right here.
export function MasterJobShipments({ masterJob, shipments, onLink, onUnlink }: MasterJobShipmentsProps) {
  const { message } = App.useApp();
  const [adding, setAdding] = useState(false);

  const handleUnlink = async (s: MasterJobShipmentItem) => {
    try {
      await onUnlink(s.id);
      message.success(`${s.jobNumber} removed from ${masterJob.mczNumber}`);
    } catch (e) {
      // Refused, e.g., for a shipment the user may not change (lib/shipmentEditRule): the server says why.
      message.error(`Removing the shipment failed: ${apiErrorMessage(e)}`);
    }
  };

  return (
    <>
      {shipments.length === 0 ? (
        <div className={`py-4 text-center ${HINT}`}>No shipments linked yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className={TH}>Job Number</th>
                <th className={TH}>Customer</th>
                <th className={TH}>Shipper</th>
                <th className={TH}>Consignee</th>
                <th className={TH}>Direction</th>
                <th className={TH}>Containers</th>
                <th className={`${TH} w-10`} />
              </tr>
            </thead>
            <tbody>
              {shipments.map((s) => (
                <tr key={s.id}>
                  <td className={TD}>
                    <Link href={`/shipments/${s.id}`} className={`${REF} font-semibold ${LINK}`}>
                      {s.jobNumber}
                    </Link>
                  </td>
                  <td className={TD}>{s.customer || EMPTY_CELL}</td>
                  <td className={TD}>{s.shipper || EMPTY_CELL}</td>
                  <td className={TD}>{s.consignee || EMPTY_CELL}</td>
                  <td className={TD}>{s.tradeDirection || EMPTY_CELL}</td>
                  <td className={`${TD} ${REF}`}>{s.containerNumber || EMPTY_CELL}</td>
                  <td className={`${TD} text-right`}>
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
      <Button size="small" icon={<PlusOutlined />} className="mt-3" onClick={() => setAdding(true)}>
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
  // The server links all of them or none, and refuses a shipment whose details the user may not
  // change: such a one is shown, not offered.
  const { user } = useAuth();
  const mayLink = (s: (typeof candidates)[number]) => canChangeShipmentDetails(user, s);

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
    } catch (e) {
      message.error(`Linking the shipments failed: ${apiErrorMessage(e)}`);
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
      <p className={`${HINT} mb-3`}>
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
          <div className={`py-8 text-center ${HINT}`}>No shipments found.</div>
        ) : (
          <Checkbox.Group className="w-full flex-col" value={selected} onChange={(v) => setSelected(v as string[])}>
            {candidates.map((s) => (
              <label
                key={s.id}
                title={mayLink(s) ? undefined : LINK_REFUSED_HINT}
                className={`flex items-center gap-3 px-3 py-2 border-b border-slate-100 last:border-b-0 text-[12px] ${
                  mayLink(s) ? "cursor-pointer hover:bg-slate-50" : "cursor-not-allowed opacity-50"
                }`}
              >
                <Checkbox value={s.id} disabled={!mayLink(s)} />
                <span className={`${REF} font-semibold w-[110px] shrink-0`}>{s.jobNumber}</span>
                <span className="flex-1 min-w-0 truncate text-slate-700">{s.customer || s.shipper || EMPTY_CELL}</span>
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

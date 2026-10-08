"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Input, Modal, Radio, Select } from "antd";
import { useShipments } from "@/hooks/useShipments";

// Asked when shipments are released from Stock (Vyskladnit): do they leave on a new truck
// or on one that is already being loaded? A new truck gets the next TCZ reference when the
// release is confirmed, and its plate number if it is known already; the trucks on offer
// are the ones shipments in Out Warehouse are on.
export function ReleaseToTruckModal({
  shipmentIds,
  onClose,
  onRelease,
}: {
  /** The ticked shipments; null keeps the dialog closed. */
  shipmentIds: string[] | null;
  onClose: () => void;
  /**
   * Releases the shipments on the truck (null: a new one, with the plate number if one was
   * typed); resolves to whether it went through.
   */
  onRelease: (shipmentIds: string[], truck: string | null, plateNumber?: string) => Promise<boolean>;
}) {
  const { shipments } = useShipments();
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [existing, setExisting] = useState<string>();
  const [plate, setPlate] = useState("");
  const [releasing, setReleasing] = useState(false);
  // A second click before the first release has finished must not create a second truck.
  const busy = useRef(false);

  // Trucks already in use, newest reference first, each with its plate number and how
  // many shipments it carries.
  const trucks = useMemo(() => {
    const byRef = new Map<string, { count: number; plate: string }>();
    for (const s of shipments) {
      if (!s.warehouseReleasedDate || !s.warehouseTruck) continue;
      const truck = byRef.get(s.warehouseTruck) ?? { count: 0, plate: "" };
      byRef.set(s.warehouseTruck, { count: truck.count + 1, plate: truck.plate || s.plateNumber });
    }
    return [...byRef].sort((a, b) => b[0].localeCompare(a[0]));
  }, [shipments]);

  const open = shipmentIds !== null;
  useEffect(() => {
    if (!open) return;
    setMode("new");
    setExisting(undefined);
    setPlate("");
  }, [open]);

  const count = shipmentIds?.length ?? 0;
  const ready = mode === "new" || !!existing;

  const release = async () => {
    if (!shipmentIds || !ready || busy.current) return;
    busy.current = true;
    setReleasing(true);
    const done = mode === "new" ? await onRelease(shipmentIds, null, plate.trim().toUpperCase()) : await onRelease(shipmentIds, existing!);
    busy.current = false;
    setReleasing(false);
    if (done) onClose();
  };

  return (
    <Modal
      open={open}
      title="Release from warehouse"
      okText="Release"
      cancelText="Cancel"
      width={440}
      centered
      destroyOnHidden
      confirmLoading={releasing}
      okButtonProps={{ disabled: !ready }}
      onOk={release}
      onCancel={onClose}
    >
      <p className="mt-0 mb-3 text-[13px] text-slate-600">
        Release {count} shipment{count === 1 ? "" : "s"} to a new truck, or add {count === 1 ? "it" : "them"} to an existing one?
      </p>
      <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)} className="flex flex-col gap-3 w-full">
        <div>
          <Radio value="new">New truck</Radio>
          {mode === "new" && (
            <div className="mt-2 ml-6">
              <Input
                placeholder="Plate number (optional)"
                maxLength={20}
                value={plate}
                onChange={(e) => setPlate(e.target.value)}
                onPressEnter={release}
              />
              <p className="mt-1.5 mb-0 text-xs text-slate-400">A new truck reference (TCZ) is created on release.</p>
            </div>
          )}
        </div>
        <div>
          <Radio value="existing" disabled={trucks.length === 0}>
            Existing truck
            {trucks.length === 0 && <span className="ml-2 text-xs text-slate-400">none yet</span>}
          </Radio>
          {mode === "existing" && (
            <div className="mt-2 ml-6">
              <Select
                showSearch
                placeholder="Select a truck"
                className="w-full"
                value={existing}
                onChange={setExisting}
                options={trucks.map(([ref, t]) => ({
                  value: ref,
                  label: `${ref}${t.plate ? ` \u00b7 ${t.plate}` : ""} \u00b7 ${t.count} shipment${t.count === 1 ? "" : "s"}`,
                }))}
              />
            </div>
          )}
        </div>
      </Radio.Group>
    </Modal>
  );
}

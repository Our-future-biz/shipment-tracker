"use client";

import { useState, useEffect } from "react";
import { Drawer, Input, Button, message } from "antd";
import type { ShipmentItem } from "@/hooks/useShipments";

export function NotesDrawer({
  shipment,
  open,
  onClose,
  onSave,
}: {
  shipment: ShipmentItem;
  open: boolean;
  onClose: () => void;
  onSave: (value: string) => void;
}) {
  const saved = shipment.freeComments ?? "";
  const [draft, setDraft] = useState(saved);

  useEffect(() => {
    setDraft(shipment.freeComments ?? "");
  }, [shipment.freeComments, open]);

  const dirty = draft !== (shipment.freeComments ?? "");

  const handleSave = () => {
    onSave(draft);
    message.success("Notes saved");
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={420}
      title="Notes"
      extra={dirty ? <Button type="primary" size="small" onClick={handleSave}>Save</Button> : null}
    >
      <Input.TextArea
        autoSize={{ minRows: 10 }}
        value={draft}
        placeholder="Notes about this shipment…"
        onChange={(e) => setDraft(e.target.value)}
      />
    </Drawer>
  );
}

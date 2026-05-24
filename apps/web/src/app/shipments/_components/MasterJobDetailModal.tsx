"use client";

import { useMemo } from "react";
import { Modal, Table, Tag, Button, Popconfirm } from "antd";
import { DisconnectOutlined } from "@ant-design/icons";
import { type ShipmentItem } from "@/hooks/useShipments";

interface MasterJobDetailModalProps {
  mczNumber: string;
  open: boolean;
  onClose: () => void;
  shipments: ShipmentItem[];
  onUnlink: (shipment: ShipmentItem) => void;
}

export const MasterJobDetailModal = ({ mczNumber, open, onClose, shipments, onUnlink }: MasterJobDetailModalProps) => {
  const members = useMemo(
    () => shipments.filter((s) => s.masterJobMczNumber === mczNumber),
    [shipments, mczNumber],
  );

  const columns = [
    {
      title: "Job Number",
      dataIndex: "jobNumber",
      key: "jobNumber",
      render: (val: string) => <span style={{ fontFamily: "monospace", color: "#0d9488", fontWeight: 500 }}>{val}</span>,
    },
    { title: "Shipper", dataIndex: "shipper", key: "shipper" },
    { title: "Consignee", dataIndex: "consignee", key: "consignee" },
    { title: "Status", dataIndex: "status", key: "status", render: (val: string) => val ? <Tag>{val}</Tag> : "—" },
    { title: "POL", dataIndex: "pol", key: "pol" },
    { title: "POD", dataIndex: "pod", key: "pod" },
    {
      title: "",
      key: "actions",
      width: 40,
      render: (_: unknown, record: ShipmentItem) => (
        <Popconfirm title={`Remove ${record.jobNumber} from ${mczNumber}?`} onConfirm={() => onUnlink(record)} okType="danger">
          <Button type="text" size="small" danger icon={<DisconnectOutlined />} title="Unlink" />
        </Popconfirm>
      ),
    },
  ];

  return (
    <Modal
      title={<span>Master Job <strong style={{ fontFamily: "monospace", color: "#f59e0b" }}>{mczNumber}</strong></span>}
      open={open}
      onCancel={onClose}
      footer={<Button onClick={onClose}>Close</Button>}
      width={700}
      destroyOnClose
    >
      <p style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
        {members.length} shipment{members.length !== 1 ? "s" : ""} in this master job
      </p>
      <Table
        dataSource={members}
        columns={columns}
        rowKey="id"
        size="small"
        pagination={false}
      />
    </Modal>
  );
};

"use client";

import { Modal, Form, Input, Select } from "antd";
import { TRADE_DIRECTIONS, LOAD_TYPES } from "@/lib/enums";
import type { controllers } from "@/lib/api/client";

interface CreateShipmentModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: controllers.ShipmentCreateRequest) => void;
  isLoading: boolean;
}

export const CreateShipmentModal = ({ open, onClose, onSubmit, isLoading }: CreateShipmentModalProps) => {
  const [form] = Form.useForm();

  const handleFinish = (values: controllers.ShipmentCreateRequest) => {
    onSubmit(values);
    form.resetFields();
  };

  return (
    <Modal title="New Shipment" open={open} onCancel={onClose} onOk={() => form.submit()} confirmLoading={isLoading} width={480}>
      <Form form={form} layout="vertical" onFinish={handleFinish} size="small">
        <Form.Item name="jobNumber" label="Job Number" rules={[{ required: true }]}>
          <Input placeholder="CZ25000006" />
        </Form.Item>
        <div className="grid grid-cols-2 gap-3">
          <Form.Item name="shipper" label="Shipper"><Input /></Form.Item>
          <Form.Item name="consignee" label="Consignee"><Input /></Form.Item>
          <Form.Item name="pol" label="POL"><Input /></Form.Item>
          <Form.Item name="pod" label="POD"><Input /></Form.Item>
          <Form.Item name="tradeDirection" label="Direction">
            <Select options={TRADE_DIRECTIONS.map((d) => ({ value: d, label: d }))} />
          </Form.Item>
          <Form.Item name="loadType" label="Load Type">
            <Select options={LOAD_TYPES.map((l) => ({ value: l, label: l }))} />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
};

"use client";

import { useState } from "react";
import { DatePicker, Form, Input, InputNumber, Modal, Select } from "antd";
import type { Dayjs } from "dayjs";
import { useCustomerInvoices } from "@/hooks/useCustomerInvoices";
import { useToast } from "@/lib/toast";
import { INVOICE_STATUSES } from "../../_lib/constants";
import { moneyInputParser } from "../../_lib/customerMoney";

// Dates are picked in the app's display format and stored as ISO, like every other date in the app.
const DISPLAY_DATE_FORMAT = "DD.MM.YYYY";
const STORED_DATE_FORMAT = "YYYY-MM-DD";

const STATUS_OPTIONS = INVOICE_STATUSES.map((status) => ({ value: status, label: status }));

interface CustomerInvoiceFormValues {
  invoiceNumber: string;
  amount: number;
  status: string;
  issuedAt?: Dayjs | null;
  dueDate?: Dayjs | null;
}

interface CustomerInvoiceDialogProps {
  customerId: string;
  currency: string;
  open: boolean;
  onClose: () => void;
}

// Dialog that records a new invoice for the customer.
export function CustomerInvoiceDialog({ customerId, currency, open, onClose }: CustomerInvoiceDialogProps) {
  const toast = useToast();
  const { createInvoice } = useCustomerInvoices(customerId);
  const [form] = Form.useForm<CustomerInvoiceFormValues>();
  const [saving, setSaving] = useState(false);

  const handleFinish = async (values: CustomerInvoiceFormValues) => {
    setSaving(true);
    try {
      await createInvoice({
        invoiceNumber: values.invoiceNumber.trim(),
        amount: values.amount,
        status: values.status,
        issuedAt: values.issuedAt?.format(STORED_DATE_FORMAT),
        dueDate: values.dueDate?.format(STORED_DATE_FORMAT),
      });
      toast.success("Invoice added");
      onClose();
    } catch {
      toast.error("Failed to add the invoice");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      // Validation runs inside the form; handleFinish is only called with valid values.
      onOk={() => form.submit()}
      title="Add Invoice"
      okText="Add"
      confirmLoading={saving}
      destroyOnHidden
    >
      <Form<CustomerInvoiceFormValues>
        form={form}
        layout="vertical"
        className="pt-2"
        preserve={false}
        initialValues={{ status: "Open" }}
        onFinish={handleFinish}
      >
        <Form.Item
          name="invoiceNumber"
          label="Invoice #"
          rules={[{ required: true, whitespace: true, message: "Invoice number is required" }]}
        >
          <Input autoFocus />
        </Form.Item>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
          <Form.Item name="amount" label="Amount" rules={[{ required: true, message: "Amount is required" }]}>
            {/* Width needs "!": antd's own input-number width is unlayered CSS and would win over a plain utility. */}
            <InputNumber<number> className="!w-full" min={0} precision={2} controls={false} parser={moneyInputParser} suffix={currency} />
          </Form.Item>
          <Form.Item name="status" label="Status">
            <Select options={STATUS_OPTIONS} />
          </Form.Item>
          <Form.Item name="issuedAt" label="Issued">
            <DatePicker className="w-full" format={DISPLAY_DATE_FORMAT} />
          </Form.Item>
          <Form.Item name="dueDate" label="Due" extra="Decides when the invoice counts as overdue.">
            <DatePicker className="w-full" format={DISPLAY_DATE_FORMAT} />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}

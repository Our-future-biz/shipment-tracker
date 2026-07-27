"use client";

import { useEffect, useState } from "react";
import { Modal, Button, Form, Input } from "antd";
import { PaperClipOutlined, CheckCircleFilled } from "@ant-design/icons";
import type { SalesQuoteData } from "@/app/sales/_lib/types";
import { useToast } from "@/lib/toast";

interface EmailFormValues {
  to: string;
  cc?: string;
  subject: string;
  message: string;
}

export function EmailQuoteModal({
  open,
  quoteNumber,
  data,
  onClose,
}: {
  open: boolean;
  quoteNumber: string;
  data: SalesQuoteData;
  onClose: () => void;
}) {
  const [form] = Form.useForm<EmailFormValues>();
  const toast = useToast();
  const [sent, setSent] = useState(false);
  const [sentTo, setSentTo] = useState("");

  const defaultMessage = `Dear ${data.customerContact || "Sir/Madam"},\n\nPlease find our quotation ${quoteNumber} for your shipment ${data.origin || ""} → ${data.destination || ""}.\n\nBest regards,\n${data.salesOwner || "Sales"}`;

  useEffect(() => {
    if (open) {
      setSent(false);
      setSentTo("");
      form.setFieldsValue({
        to: data.customerEmail ?? "",
        cc: "",
        subject: `Freight quotation ${quoteNumber}`,
        message: defaultMessage,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSend = () => {
    form
      .validateFields()
      .then((values) => {
        // MOCK: no real email is sent.
        setSentTo(values.to);
        setSent(true);
        toast.success("Quotation sent (demo)");
      })
      .catch(() => {
        /* validation errors are shown inline */
      });
  };

  return (
    <Modal open={open} onCancel={onClose} width={560} title="Send quotation" footer={null} destroyOnHidden>
      {sent ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <CheckCircleFilled className="text-4xl text-green-500" />
          <div className="text-base font-semibold text-slate-800">Quotation sent to {sentTo}</div>
          <div className="text-[13px] text-slate-500">
            {quoteNumber} has been delivered (demo — no email was actually sent).
          </div>
          <Button type="primary" className="mt-2" onClick={onClose}>
            Close
          </Button>
        </div>
      ) : (
        <>
          <Form form={form} layout="vertical" className="pt-2">
            <Form.Item
              name="to"
              label="To"
              rules={[
                { required: true, message: "Recipient is required" },
                { type: "email", message: "Enter a valid email" },
              ]}
            >
              <Input placeholder="customer@example.com" />
            </Form.Item>
            <Form.Item name="cc" label="CC" rules={[{ type: "email", message: "Enter a valid email" }]}>
              <Input placeholder="Optional" />
            </Form.Item>
            <Form.Item name="subject" label="Subject" rules={[{ required: true, message: "Subject is required" }]}>
              <Input />
            </Form.Item>
            <Form.Item name="message" label="Message">
              <Input.TextArea rows={7} />
            </Form.Item>
          </Form>

          <div className="mb-4">
            <div className="mb-1 text-xs text-slate-400">Attachment</div>
            <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">
              <PaperClipOutlined />
              {quoteNumber}.pdf
            </span>
          </div>

          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button type="primary" onClick={handleSend}>
              Send
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Form, Input } from "antd";
import { FilePdfOutlined } from "@ant-design/icons";
import { LINK_CLASS } from "@/components/linkClass";
import { SalesDialog } from "@/app/sales/_components/SalesDialog";
import type { SalesQuoteData } from "@/app/sales/_lib/types";
import { UNSENT_QUOTE_STATUSES } from "@/app/sales/_lib/types";
import { businessToday } from "@/app/sales/_lib/salesQuote";

interface EmailFormValues {
  to: string;
  cc?: string;
  subject: string;
  message?: string;
}

// The message as a mailto: link (RFC 6068). Every value is percent-encoded - a space as %20,
// because a "+" would arrive as a plus sign - line breaks travel as CRLF, and the "@" of an
// address stays readable, as mail programs expect it.
function mailtoLink({ to = "", cc = "", subject = "", message = "" }: Partial<EmailFormValues>): string {
  const address = (value: string) => encodeURIComponent(value.trim()).replace(/%40/g, "@");
  const headers = [
    cc.trim() && `cc=${address(cc)}`,
    `subject=${encodeURIComponent(subject)}`,
    `body=${encodeURIComponent(message.replace(/\r\n|\r|\n/g, "\r\n"))}`,
  ].filter(Boolean);
  return `mailto:${address(to)}?${headers.join("&")}`;
}

// The app cannot send email. This dialog prepares the message, hands it to the user's own email
// program and then asks whether the quote went out - only the user knows that.
export function EmailQuoteModal({
  open,
  quoteNumber,
  data,
  validUntil,
  onExportPdf,
  onMarkSent,
  onClose,
}: {
  open: boolean;
  quoteNumber: string;
  data: SalesQuoteData;
  // The quote's validity date as the server keeps it.
  validUntil: string | null;
  onExportPdf: () => void;
  // Asks the server to make the quote Quoted. Resolves with why it refused - a sentence that
  // finishes "QCZ… - …" - or with null once the quote is Quoted.
  onMarkSent: () => Promise<string | null>;
  onClose: () => void;
}) {
  const [form] = Form.useForm<EmailFormValues>();
  const values = Form.useWatch([], form);
  const [valid, setValid] = useState(false);
  // The email program was opened from this dialog at least once.
  const [opened, setOpened] = useState(false);
  const [marking, setMarking] = useState(false);
  // Why the server did not mark the quote as sent.
  const [refusal, setRefusal] = useState<string | null>(null);

  const defaultMessage = `Dear ${data.customerContact || "Sir/Madam"},\n\nPlease find our quotation ${quoteNumber} for your shipment ${data.origin || ""} → ${data.destination || ""}.\n\nBest regards,\n${data.salesOwner || "Sales"}`;

  useEffect(() => {
    if (open) {
      setOpened(false);
      setRefusal(null);
      form.setFieldsValue({
        to: data.customerEmail ?? "",
        cc: "",
        subject: `Freight quotation ${quoteNumber}`,
        message: defaultMessage,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Whether the message may go out is known before the click: the button that hands it over is a
  // real link, and a link has to be stopped in the click itself, not after an asynchronous
  // validation.
  useEffect(() => {
    if (!open) return;
    let latest = true;
    form.validateFields({ validateOnly: true }).then(
      () => latest && setValid(true),
      () => latest && setValid(false),
    );
    return () => {
      latest = false;
    };
  }, [open, form, values]);

  // A real link, opened in a new tab: an email program takes it over from there, and webmail that
  // handles mailto: links opens beside the quote instead of replacing this page and its question.
  const mailLink = {
    href: mailtoLink(values ?? {}),
    target: "_blank",
    rel: "noreferrer",
    onClick: (e: React.MouseEvent) => {
      if (valid) {
        setOpened(true);
        return;
      }
      e.preventDefault();
      // Shows next to the fields what is missing.
      form.validateFields().catch(() => {});
    },
  };

  // The dialog closes only once the quote is Quoted. Refused, it stays with the reason, so the
  // question can be answered again when that is dealt with.
  const markSent = async () => {
    setMarking(true);
    setRefusal(null);
    const refused = await onMarkSent();
    setMarking(false);
    if (refused) setRefusal(refused);
    else onClose();
  };

  // Only a quote that has not gone out yet becomes Quoted by being sent; sending any other
  // again changes nothing about the quote. Still asked while the answer is on its way, although
  // the quote on screen may be Quoted by then.
  const askSent = marking || UNSENT_QUOTE_STATUSES.includes(data.quoteStatus ?? "draft");
  // Marking as sent names no new validity, so a quote whose date has passed is refused for that:
  // the date has to be set first.
  const validityPassed = validUntil !== null && validUntil < businessToday();

  // What the dialog offers next: to hand the message over, then - once the email program was
  // opened - the answer to whether the quote went out.
  let buttons = (
    <>
      <Button onClick={onClose}>Cancel</Button>
      <Button type="primary" {...mailLink}>
        Open in email program
      </Button>
    </>
  );
  if (opened) {
    buttons = askSent ? (
      <>
        <Button disabled={marking} onClick={onClose}>
          Not yet
        </Button>
        <Button type="primary" loading={marking} onClick={markSent}>
          Mark as sent
        </Button>
      </>
    ) : (
      <Button type="primary" onClick={onClose}>
        Close
      </Button>
    );
  }

  return (
    <SalesDialog
      open={open}
      onClose={onClose}
      // While the answer about "Mark as sent" is on its way the dialog stays: a refusal is shown in it.
      busy={marking}
      title="Email quote"
      subtitle="This opens the message in your own email program - the app does not send email."
      footer={buttons}
    >
      <div className="mb-4">
        <Alert
          type="info"
          showIcon
          message="The PDF is not attached automatically. Export it, save it as a PDF and attach it to the message before you send it."
          action={
            <Button size="small" icon={<FilePdfOutlined />} onClick={onExportPdf}>
              Export PDF
            </Button>
          }
        />
      </div>

      <Form form={form} layout="vertical" disabled={marking}>
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
        <Form.Item name="message" label="Message" className="!mb-0">
          <Input.TextArea rows={7} />
        </Form.Item>
      </Form>

      {opened && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <div className="text-[13px] text-slate-600">
            Your email program should now show the message. Nothing there?{" "}
            <a {...mailLink} className={LINK_CLASS}>
              Open it again
            </a>
            .
          </div>
          {askSent && (
            <div className="mt-1.5 text-[13px] font-medium text-slate-800">
              Was the quote sent? Marking it as sent sets its status to Quoted.
            </div>
          )}
          {refusal && (
            <div className="mt-2">
              <Alert
                type="error"
                showIcon
                message={`${quoteNumber} - ${refusal}`}
                description={validityPassed ? "Set Valid until under Shipping terms, then mark as sent." : undefined}
              />
            </div>
          )}
        </div>
      )}
    </SalesDialog>
  );
}

"use client";

import { Alert, Button, Modal } from "antd";
import { FilePdfOutlined, MailOutlined } from "@ant-design/icons";
import { MAILTO_LINK_TARGET } from "@/lib/mailto";
import { EMPTY, HINT, REF } from "@/styles/ui";

export interface IssuedInvoiceEmail {
  id: string;
  number: string;
  to: string;
  subject: string;
  /** The mailto: link of the email. */
  href: string;
}

interface IssuedInvoiceEmailModalProps {
  email: IssuedInvoiceEmail;
  downloading: boolean;
  onDownload: () => void;
  onClose: () => void;
}

// Shown once an invoice is issued, while the email program opens: a browser cannot attach a file to
// an email, so this says to attach the PDF - and offers the email again, for a browser that did not
// open it by itself, and the PDF again.
export function IssuedInvoiceEmailModal({ email, downloading, onDownload, onClose }: IssuedInvoiceEmailModalProps) {
  return (
    <Modal
      open
      centered
      width={520}
      title={`Invoice ${email.number} issued`}
      onCancel={onClose}
      footer={[
        <Button key="pdf" icon={<FilePdfOutlined />} loading={downloading} onClick={onDownload}>
          Download PDF again
        </Button>,
        <Button key="email" icon={<MailOutlined />} href={email.href} {...MAILTO_LINK_TARGET}>
          Open email again
        </Button>,
        <Button key="done" type="primary" onClick={onClose}>
          Done
        </Button>,
      ]}
    >
      <Alert
        type="warning"
        showIcon
        className="mb-3"
        message={
          <>
            The PDF is not attached automatically. Drag <strong className={REF}>{email.number}.pdf</strong> from your downloads into the email before you send it.
          </>
        }
      />
      <dl className="m-0 grid grid-cols-[64px_1fr] gap-y-1 text-[13px]">
        <dt className={HINT}>To</dt>
        <dd className="m-0 min-w-0 truncate text-slate-900">{email.to || <span className={EMPTY}>Fill in the recipient in the email</span>}</dd>
        <dt className={HINT}>Subject</dt>
        <dd className="m-0 min-w-0 truncate text-slate-900">{email.subject}</dd>
      </dl>
    </Modal>
  );
}

"use client";

import { useRef, useState } from "react";
import { Dropdown, Modal } from "antd";
import { DownOutlined, FileTextOutlined } from "@ant-design/icons";
import { fetchReceivableStatement, useReceivableStatementSend } from "@/hooks/useReceivables";
import { apiErrorMessage } from "@/lib/api";
import { saveBlob } from "@/lib/files";
import { useMessages, useToast } from "@/lib/toast";
import { BTN, BTN_BAR, HINT } from "@/styles/ui";
import { base64Blob, newIdempotencyKey, statementSendAnswer } from "../_lib/receivables";

// A customer's statement in one currency (step 7): every invoice still owed in it, as at today, as a PDF or a CSV to
// save, and - for managers - e-mailed to the customer's reminder contact. The file comes as base64 (sent only with the
// login header), so it is loaded and saved as bytes, as the invoice PDF is, never linked. While e-mail from the app is
// switched off the server answers "off" and nothing is sent: the user is told so, never that it went. The
// customer's Finance tab uses this menu too (CustomerStatementMenu), so a statement is asked for, confirmed and sent
// the same way everywhere: one key per "Send" dialog, and the app's mail log read again after it.

export function StatementMenu({ customerId, customer, currency, canSend, small, label = "Statement" }: {
  customerId: string;
  customer: string;
  currency: string;
  /** A manager: may e-mail it */
  canSend: boolean;
  /** The bar's small button (the drawer); the table's plain one otherwise */
  small?: boolean;
  /** The button's text: "Statement", or "Statement EUR" where several currencies stand side by side */
  label?: string;
}) {
  const toast = useToast();
  const message = useMessages();
  const send = useReceivableStatementSend();
  const [asking, setAsking] = useState(false);
  // Downloads on their way, so a second click does not save the file twice.
  const loading = useRef(new Set<string>());
  // One key per "Send" dialog: a double click or a retry after a lost answer sends one e-mail.
  const key = useRef<string | null>(null);

  const download = async (format: "pdf" | "csv") => {
    if (loading.current.has(format)) return;
    loading.current.add(format);
    const notice = `statement:${customerId}:${currency}:${format}`;
    void message.open({ key: notice, type: "loading", content: `Making the ${currency} statement…`, duration: 0 });
    try {
      const file = await fetchReceivableStatement(customerId, currency, format);
      saveBlob(base64Blob(file.contentBase64, file.contentType || (format === "pdf" ? "application/pdf" : "text/csv")), file.fileName.trim() || `statement-${currency}.${format}`);
    } catch (e) {
      toast.error(`Could not make the statement: ${apiErrorMessage(e)}`);
    } finally {
      loading.current.delete(format);
      message.destroy(notice);
    }
  };

  const openSend = () => {
    key.current = newIdempotencyKey().replace(/^ar-payment:/, "ar-statement:");
    setAsking(true);
  };

  const doSend = () => {
    const idempotencyKey = key.current ?? newIdempotencyKey();
    key.current = idempotencyKey;
    send
      .mutateAsync({ customerId, currency, idempotencyKey })
      .then((answer) => {
        // The server answered: a new send is a new e-mail.
        key.current = null;
        setAsking(false);
        const said = statementSendAnswer(answer);
        if (said.tone === "success") toast.success(said.text);
        else if (said.tone === "warning") toast.warning(said.text);
        else toast.error(said.text);
      })
      // No answer, or a refusal: the dialog stays, and a retry sends the same key.
      .catch((e) => toast.error(`The statement was not sent: ${apiErrorMessage(e)}`));
  };

  const items = [
    { key: "pdf", label: "Download PDF", onClick: () => void download("pdf") },
    { key: "csv", label: "Download CSV", onClick: () => void download("csv") },
    ...(canSend ? [{ type: "divider" as const }, { key: "send", label: "Send by e-mail…", onClick: openSend }] : []),
  ];

  return (
    // The table row opens on a click: the menu keeps its clicks to itself.
    <span onClick={(e) => e.stopPropagation()} className="inline-flex">
      <Dropdown trigger={["click"]} placement="bottomRight" menu={{ items }}>
        <button type="button" className={small ? BTN_BAR : `${BTN} !h-7 !px-2.5 !text-[12px]`} aria-label={`Statement of ${customer || "the customer"} in ${currency}`}>
          <FileTextOutlined />
          {label}
          <DownOutlined className="text-[10px]" />
        </button>
      </Dropdown>
      <Modal
        open={asking}
        title={`E-mail the ${currency} statement`}
        onCancel={() => !send.isPending && setAsking(false)}
        okText="Send the statement"
        onOk={doSend}
        okButtonProps={{ loading: send.isPending }}
        cancelButtonProps={{ disabled: send.isPending }}
        destroyOnHidden
      >
        <p className="text-[13px] text-slate-700">
          The statement of {customer || "the customer"} in {currency} (every invoice still owed in {currency}, as at today) goes as a PDF to the customer&apos;s contact that reminders go to:
          Accounts payable, else Finance / Accounting, else the main contact.
        </p>
        <p className={HINT}>The app keeps a record of the e-mail. If e-mail from the app is switched off, nothing is sent and you are told so.</p>
      </Modal>
    </span>
  );
}

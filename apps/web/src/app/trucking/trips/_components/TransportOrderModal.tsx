"use client";

import { useRef, useState } from "react";
import { Alert, Button, Input, Modal, Radio, type InputRef } from "antd";
import { CopyOutlined } from "@ant-design/icons";
import { apiErrorMessage } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { useCustomerContacts } from "@/hooks/useCustomerContacts";
import type { TransportOrderLanguage, TransportOrderPdfRequest, TransportOrderSendRequest, TripDetail, TruckingFile } from "@/hooks/useTruckingConsignments";
import { TERMS } from "../../_lib/glossary";
import { pragueDate } from "../../_lib/format";
import {
  DISPATCH_ROLE,
  LANGUAGE_OPTIONS,
  LINK_SHOWN_ONCE,
  PIN_EXPLANATION,
  afterRecordedSend,
  copyText,
  invalidRecipients,
  linkViewText,
  orderFileName,
  orderRecipientsOf,
  parseRecipients,
  pdfNotDownloadedText,
  pinProblem,
  pinValue,
  sendDialogText,
} from "../../_lib/transportOrder";
import { useTruckingSettings } from "@/hooks/useTrucking";
import { savePdf } from "../../_lib/pdfFile";
import { TruckingField } from "../../_components/TruckingField";

interface TransportOrderModalProps {
  mode: "print" | "send";
  trip: TripDetail;
  onClose: () => void;
  onPrint: (req: TransportOrderPdfRequest) => Promise<{ file: TruckingFile }>;
  /** haulierLink: the haulier's new link, given only in this answer (null or missing: none, as on an LTL trip). */
  onSend: (req: TransportOrderSendRequest) => Promise<{ recordedOnly: boolean; file: TruckingFile; trip: TripDetail; haulierLink?: string | null }>;
}

// Print… and Record as sent… of a transport order. The pick-up PIN is typed here because Shipments
// shows it only once: it travels with this one request, is printed on the PDF and is never stored or logged.
// While e-mail is off (the settings' emailConfigured), Record as sent records the order as sent (recorded only) and hands over the
// PDF — with the haulier's link to confirm it and upload the POD — to send by hand. The link is also shown
// here once to copy (T8/E1, owner's answer Q25): the server keeps only its hash, so it is gone once the
// dialog closes. "To" starts with the haulier's dispatch contacts from the Customer Database.
export const TransportOrderModal = ({ mode, trip, onClose, onPrint, onSend }: TransportOrderModalProps) => {
  const toast = useToast();
  const [pin, setPin] = useState("");
  const [language, setLanguage] = useState<TransportOrderLanguage>("both");
  // null until the user types: "To" shows the haulier's contacts as they load.
  const [toText, setToText] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  // The haulier's link after Record as sent, kept only while the dialog is open.
  const [shown, setShown] = useState<{ link: string; expiresAt: string | null; recordedOnly: boolean } | null>(null);
  // A send recorded whose PDF did not download: not a refusal, the order is recorded as sent.
  const [pdfFailed, setPdfFailed] = useState<string | null>(null);
  const linkRef = useRef<InputRef>(null);
  const { contacts } = useCustomerContacts(mode === "send" ? trip.haulierCustomerId : "");
  const suggestedTo = orderRecipientsOf(contacts);
  const to = toText ?? suggestedTo;
  const orderNumber = trip.transportOrder?.number ?? trip.ref;
  const pinError = pinProblem(pin);
  const recipients = parseRecipients(to);
  const badRecipients = invalidRecipients(recipients);
  const resend = !!trip.transportOrder?.sentAt;
  const ftl = trip.kind === "FTL";
  // "E-mail sending is off" only when the server really cannot e-mail (the settings say so).
  const { settings } = useTruckingSettings();
  const sendText = sendDialogText(settings ? settings.emailConfigured : null, recipients.length, ftl);

  const handleSubmit = async () => {
    setBusy(true);
    setRefusal(null);
    setPdfFailed(null);
    let keepOpen = false;
    try {
      if (mode === "print") {
        const res = await onPrint({ pickupPin: pinValue(pin), language });
        savePdf(res.file, orderFileName(orderNumber));
        toast.success(pinValue(pin) ? "Transport order downloaded — the PIN is printed on it, not kept" : "Transport order downloaded");
      } else {
        const res = await onSend({ pickupPin: pinValue(pin), language, to: recipients, note: note.trim() });
        // Recorded from here on: the one-time link is shown before the PDF, and a failed download keeps the dialog open to say so.
        const link = res.haulierLink;
        const downloaded = afterRecordedSend(
          () => {
            if (link) setShown({ link, expiresAt: res.trip.transportOrder?.podLinkExpiresAt ?? null, recordedOnly: res.recordedOnly });
          },
          () => savePdf(res.file, orderFileName(orderNumber)),
        );
        if (downloaded) toast.success(res.recordedOnly ? "Recorded as sent — the PDF is downloaded; send it to the haulier yourself" : `Sent to ${recipients.join(", ")}`);
        else setPdfFailed(pdfNotDownloadedText(!!link));
        keepOpen = !!link || !downloaded;
      }
      if (!keepOpen) onClose();
    } catch (e) {
      setRefusal(`${mode === "print" ? "Not printed" : "Not recorded as sent"} — ${apiErrorMessage(e)}.`);
    } finally {
      setBusy(false);
    }
  };

  // The clipboard is missing on a page not served over https, or may be refused: the link is then selected to copy by hand.
  const handleCopy = async () => {
    if (!shown) return;
    if (await copyText(shown.link, typeof navigator === "undefined" ? undefined : navigator.clipboard)) {
      toast.success("Link copied");
    } else {
      linkRef.current?.focus();
      linkRef.current?.select();
      toast.error("Could not copy — the link is selected: copy it with Ctrl+C (⌘C on a Mac)");
    }
  };

  if (shown) {
    const said = linkViewText(orderNumber, shown.recordedOnly, !pdfFailed);
    return (
      <Modal
        open
        title={`Haulier's link · ${trip.haulierName}`}
        width={560}
        onCancel={onClose}
        maskClosable={false}
        destroyOnHidden
        footer={
          <Button type="primary" onClick={onClose}>
            Done
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          {pdfFailed && <Alert type="warning" showIcon message={pdfFailed} />}
          <Alert type="success" showIcon message={said.message} description={said.description} />
          <div className="flex gap-2">
            <Input ref={linkRef} readOnly aria-label="Haulier's link" value={shown.link} onFocus={(e) => e.target.select()} />
            <Button icon={<CopyOutlined />} onClick={handleCopy}>
              Copy
            </Button>
          </div>
          <div className="text-[13px] text-slate-600">
            {LINK_SHOWN_ONCE}
            {shown.expiresAt ? ` Valid to ${pragueDate(shown.expiresAt)}.` : ""}
          </div>
        </div>
      </Modal>
    );
  }

  const title = mode === "print" ? `Print ${TERMS.transportOrder.toLowerCase()}` : `Record ${TERMS.transportOrder.toLowerCase()} as sent${resend ? " again" : ""}`;

  return (
    <Modal open title={`${title} · ${trip.haulierName}`} width={560} onCancel={busy ? undefined : onClose} maskClosable={false} footer={null} destroyOnHidden>
      <div className="flex flex-col gap-3">
        {mode === "send" && sendText.banner && <Alert type="info" showIcon message={sendText.banner.message} description={sendText.banner.description} />}
        <TruckingField label="Pick-up PIN" hint={PIN_EXPLANATION}>
          <Input
            aria-label="Pick-up PIN"
            inputMode="numeric"
            autoComplete="off"
            maxLength={7}
            placeholder="Leave empty to print no PIN"
            status={pinError ? "error" : undefined}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
        </TruckingField>
        {pinError && <div className="-mt-2 text-[12px] text-red-600">{pinError}</div>}
        <TruckingField label="Language">
          <Radio.Group aria-label="Language" value={language} options={LANGUAGE_OPTIONS} onChange={(e) => setLanguage(e.target.value)} />
        </TruckingField>
        {mode === "send" && (
          <>
            <TruckingField
              label="To"
              hint={`${sendText.toHint}${toText === null && suggestedTo ? ` — filled in from its contacts in the Customer Database (${DISPATCH_ROLE} first)` : ""}`}
            >
              <Input.TextArea aria-label="Recipients" autoSize={{ minRows: 1, maxRows: 3 }} placeholder="dispatch@haulier.cz" value={to} onChange={(e) => setToText(e.target.value)} />
            </TruckingField>
            {badRecipients.length > 0 && <div className="-mt-2 text-[12px] text-red-600">Not an e-mail address: {badRecipients.join(", ")}</div>}
            <TruckingField label="Note">
              <Input.TextArea aria-label="Note" autoSize={{ minRows: 1, maxRows: 4 }} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
            </TruckingField>
          </>
        )}
        {pdfFailed && <Alert type="warning" showIcon message={pdfFailed} />}
        {refusal && <Alert type="error" showIcon message={refusal} />}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="primary" onClick={handleSubmit} loading={busy} disabled={!!pinError || badRecipients.length > 0}>
            {mode === "print" ? "Download PDF" : sendText.button}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

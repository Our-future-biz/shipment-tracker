"use client";

import { useState } from "react";
import { Alert, Button, Input, Modal, Radio } from "antd";
import { apiErrorMessage } from "@/lib/api";
import { downloadDataUrl } from "@/lib/files";
import { useToast } from "@/lib/toast";
import type { TransportOrderLanguage, TransportOrderPdfRequest, TransportOrderSendRequest, TripDetail, TruckingFile } from "@/hooks/useTruckingConsignments";
import { TERMS } from "../../_lib/glossary";
import { LANGUAGE_OPTIONS, PIN_EXPLANATION, invalidRecipients, orderFileName, parseRecipients, pinProblem, pinValue } from "../../_lib/transportOrder";
import { fileDataUrl } from "../../_lib/tariffUpload";
import { TruckingField } from "../../_components/TruckingField";

interface TransportOrderModalProps {
  mode: "print" | "send";
  trip: TripDetail;
  onClose: () => void;
  onPrint: (req: TransportOrderPdfRequest) => Promise<{ file: TruckingFile }>;
  onSend: (req: TransportOrderSendRequest) => Promise<{ recordedOnly: boolean; file: TruckingFile }>;
}

const savePdf = (file: TruckingFile, orderNumber: string) => downloadDataUrl(fileDataUrl({ ...file, contentType: file.contentType || "application/pdf" }), file.fileName || orderFileName(orderNumber));

// Print… and Send… of a transport order. The pick-up PIN is typed here because Shipments shows it
// only once: it travels with this one request, is printed on the PDF and is never stored or logged.
// E-mail is off in this app, so Send records the order as sent (recorded only) and hands over the
// PDF — with the haulier's link to confirm it and upload the POD — to send by hand.
export const TransportOrderModal = ({ mode, trip, onClose, onPrint, onSend }: TransportOrderModalProps) => {
  const toast = useToast();
  const [pin, setPin] = useState("");
  const [language, setLanguage] = useState<TransportOrderLanguage>("both");
  const [toText, setToText] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const orderNumber = trip.transportOrder?.number ?? trip.ref;
  const pinError = pinProblem(pin);
  const recipients = parseRecipients(toText);
  const badRecipients = invalidRecipients(recipients);
  const resend = !!trip.transportOrder?.sentAt;

  const handleSubmit = async () => {
    setBusy(true);
    setRefusal(null);
    try {
      if (mode === "print") {
        const res = await onPrint({ pickupPin: pinValue(pin), language });
        savePdf(res.file, orderNumber);
        toast.success(pinValue(pin) ? "Transport order downloaded — the PIN is printed on it, not kept" : "Transport order downloaded");
      } else {
        const res = await onSend({ pickupPin: pinValue(pin), language, to: recipients, note: note.trim() });
        savePdf(res.file, orderNumber);
        toast.success(res.recordedOnly ? "Marked as sent (recorded only) — the PDF is downloaded; send it to the haulier yourself" : `Sent to ${recipients.join(", ")}`);
      }
      onClose();
    } catch (e) {
      setRefusal(`${mode === "print" ? "Not printed" : "Not marked as sent"} — ${apiErrorMessage(e)}.`);
    } finally {
      setBusy(false);
    }
  };

  const title = mode === "print" ? `Print ${TERMS.transportOrder.toLowerCase()}` : `${resend ? "Send again" : "Send"} ${TERMS.transportOrder.toLowerCase()}`;

  return (
    <Modal open title={`${title} · ${trip.haulierName}`} width={560} onCancel={busy ? undefined : onClose} maskClosable={false} footer={null} destroyOnHidden>
      <div className="flex flex-col gap-3">
        {mode === "send" && (
          <Alert
            type="info"
            showIcon
            message="E-mail sending is off in this app"
            description="The order is recorded as sent — nothing is e-mailed — and its PDF downloads for you to send to the haulier. The PDF carries the haulier's link to confirm the order and upload the POD; sending again renews the link."
          />
        )}
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
            <TruckingField label="To" hint="The haulier's addresses, recorded with the order (not e-mailed)">
              <Input.TextArea aria-label="Recipients" autoSize={{ minRows: 1, maxRows: 3 }} placeholder="dispatch@haulier.cz" value={toText} onChange={(e) => setToText(e.target.value)} />
            </TruckingField>
            {badRecipients.length > 0 && <div className="-mt-2 text-[12px] text-red-600">Not an e-mail address: {badRecipients.join(", ")}</div>}
            <TruckingField label="Note">
              <Input.TextArea aria-label="Note" autoSize={{ minRows: 1, maxRows: 4 }} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
            </TruckingField>
          </>
        )}
        {refusal && <Alert type="error" showIcon message={refusal} />}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="primary" onClick={handleSubmit} loading={busy} disabled={!!pinError || badRecipients.length > 0}>
            {mode === "print" ? "Download PDF" : "Mark as sent (recorded only)"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Input, Radio, Select } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppModal } from "@/components/AppModal";
import { findContact, useCustomerContacts } from "@/hooks/useCustomerContacts";
import type { ShipmentItem } from "@/hooks/useShipments";
import { useTrackingActions, type ShipmentTracking } from "@/hooks/useShipmentTracking";
import { api, apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatDate } from "@/lib/date";
import { mailtoLink } from "@/lib/mailto";
import { useToast } from "@/lib/toast";
import { HINT, LABEL_TEXT } from "@/styles/ui";
import { NOTICE_KIND_OPTIONS, draftValues, fillDraft, standardDraft, toTemplate, type DraftText, type NoticeKindValue, type NoticeLanguage } from "./customerDraft";

const PREF_KEY = "tracking-email-templates";
type MyTexts = Record<string, DraftText>;

/** Each user's own wording, by kind and language, kept with their preferences. */
function useMyTexts() {
  const queryClient = useQueryClient();
  const queryKey = ["user-prefs", PREF_KEY];
  const { data, isSuccess } = useQuery({ queryKey, queryFn: () => api.shipments.userPrefGet(PREF_KEY), staleTime: 5 * 60 * 1000 });
  const texts = useMemo<MyTexts>(() => {
    try {
      const parsed: unknown = data?.value ? JSON.parse(data.value) : {};
      return parsed && typeof parsed === "object" ? (parsed as MyTexts) : {};
    } catch {
      return {};
    }
  }, [data?.value]);
  const save = useMutation({
    mutationFn: (next: MyTexts) => api.shipments.userPrefSet(PREF_KEY, { value: JSON.stringify(next) }),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
  return { texts, ready: isSuccess, save };
}

interface TellCustomerModalProps {
  shipment: ShipmentItem;
  tracking: ShipmentTracking;
  initialKind: NoticeKindValue;
  /** The checklist tick this notice comes with. */
  taskKey?: string;
  onClose: () => void;
}

/**
 * The app can't send e-mail: this drafts the message for the user's own mail program, or for a phone
 * call, and then records their word that the customer was told, with the dates as they stand.
 */
export function TellCustomerModal({ shipment, tracking, initialKind, taskKey, onClose }: TellCustomerModalProps) {
  const { user } = useAuth();
  const toast = useToast();
  const { tellCustomer } = useTrackingActions(shipment.id);
  const { contacts } = useCustomerContacts(shipment.customerId ?? "");
  const { texts, ready, save } = useMyTexts();

  const [kind, setKind] = useState<NoticeKindValue>(initialKind);
  const [language, setLanguage] = useState<NoticeLanguage>("en");
  const [channel, setChannel] = useState("email");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const contact = useMemo(() => findContact(contacts, shipment.customerPicContactId, shipment.customerPic), [contacts, shipment.customerPicContactId, shipment.customerPic]);
  const contactName = contact ? [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.name : (shipment.customerPic ?? "");
  const values = useMemo(
    () => draftValues(shipment, tracking.milestones, language, contactName, user?.displayName || user?.email || ""),
    [shipment, tracking.milestones, language, contactName, user?.displayName, user?.email],
  );
  const draftKey = `${kind}:${language}`;

  // The customer's person in charge, once the contacts are here; the user can change it.
  useEffect(() => {
    if (contact?.email) setTo((current) => current || contact.email);
  }, [contact?.email]);

  // A new kind or language starts from its wording.
  useEffect(() => {
    const filled = fillDraft(texts[draftKey] ?? standardDraft(kind, language), values);
    setSubject(filled.subject);
    setMessage(filled.message);
  }, [draftKey, kind, language, texts, values]);

  const copy = () =>
    navigator.clipboard.writeText(`${subject}\n\n${message}`).then(
      () => toast.success("Copied to clipboard"),
      () => toast.error("Could not copy the message"),
    );

  const markTold = () => {
    setError(null);
    tellCustomer.mutate(
      { kind, channel, toldTo: to.trim() || undefined, subject: channel === "email" ? subject.trim() || undefined : undefined, note: note.trim() || undefined, taskKey },
      { onSuccess: onClose, onError: (err) => setError(apiErrorMessage(err)) },
    );
  };

  const otherEmails = contacts.filter((c) => c.email.trim() && c.email.trim().toLowerCase() !== to.trim().toLowerCase()).map((c) => ({ value: c.email.trim(), label: c.email.trim() }));
  const toOptions = contacts.filter((c) => c.email.trim()).map((c) => ({ value: c.email.trim(), label: `${[c.firstName, c.lastName].filter(Boolean).join(" ") || c.name} <${c.email.trim()}>` }));
  const told = [
    tracking.milestones.find((m) => m.key === "arrived")?.planned && `ETA ${formatDate(shipment.estimatedArrival)}`,
    shipment.etaWarehouse && `ETA warehouse ${formatDate(shipment.etaWarehouse)}`,
    shipment.plannedDeliveryDate && `Delivery ${formatDate(shipment.plannedDeliveryDate)}`,
  ].filter(Boolean);

  return (
    <AppModal
      open
      onClose={onClose}
      title="Tell the customer"
      subtitle="This opens the message in your own email program. The app does not send email."
      size="large"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          {channel === "email" && (
            <>
              <Button onClick={copy}>Copy</Button>
              <Button href={mailtoLink({ to, cc: cc.join(","), subject, message })} target="_blank" rel="noreferrer">
                Open in mail
              </Button>
            </>
          )}
          <Button type="primary" loading={tellCustomer.isPending} onClick={markTold}>
            Mark as told
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {error && <Alert type="error" showIcon message={error} />}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="notice-kind" className={LABEL_TEXT}>What</label>
            <Select id="notice-kind" className="w-full mt-1" value={kind} onChange={setKind} disabled={!!taskKey} options={[...NOTICE_KIND_OPTIONS]} />
          </div>
          <div>
            <span className={LABEL_TEXT}>How</span>
            <Radio.Group className="block mt-1" size="small" optionType="button" value={channel} onChange={(e) => setChannel(e.target.value)} options={[{ value: "email", label: "E-mail" }, { value: "phone", label: "Phone" }, { value: "other", label: "Other" }]} />
          </div>
          <div>
            <span className={LABEL_TEXT}>Language</span>
            <Radio.Group className="block mt-1" size="small" optionType="button" value={language} onChange={(e) => setLanguage(e.target.value)} options={[{ value: "en", label: "English" }, { value: "cs", label: "Čeština" }]} />
          </div>
        </div>
        <div>
          <label htmlFor="notice-to" className={LABEL_TEXT}>To</label>
          {channel === "email" && toOptions.length > 0 ? (
            <Select id="notice-to" className="w-full mt-1" showSearch value={to || undefined} onChange={setTo} options={toOptions} placeholder="Choose a contact" />
          ) : (
            <Input id="notice-to" className="mt-1" maxLength={500} value={to} onChange={(e) => setTo(e.target.value)} placeholder={channel === "email" ? "E-mail address" : "Who you spoke to"} />
          )}
        </div>
        {channel === "email" && (
          <>
            {otherEmails.length > 0 && (
              <div>
                <label htmlFor="notice-cc" className={LABEL_TEXT}>Copy</label>
                <Select id="notice-cc" className="w-full mt-1" mode="multiple" value={cc} onChange={setCc} options={otherEmails} placeholder="Anyone else at this customer" />
              </div>
            )}
            <div>
              <label htmlFor="notice-subject" className={LABEL_TEXT}>Subject</label>
              <Input id="notice-subject" className="mt-1" maxLength={500} value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div>
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="notice-message" className={LABEL_TEXT}>Message</label>
                <Button
                  size="small"
                  type="link"
                  disabled={!ready}
                  loading={save.isPending}
                  onClick={() =>
                    save.mutate(
                      { ...texts, [draftKey]: toTemplate({ subject, message }, values) },
                      { onSuccess: () => toast.success("Saved as your wording"), onError: (err) => toast.error(apiErrorMessage(err)) },
                    )
                  }
                >
                  Keep this as my wording
                </Button>
              </div>
              <Input.TextArea id="notice-message" className="mt-1" rows={9} value={message} onChange={(e) => setMessage(e.target.value)} />
              <p className={`${HINT} m-0 mt-1`}>A long message may be cut by a mail program: use Copy then. Attach files in your mail program.</p>
            </div>
          </>
        )}
        <div>
          <label htmlFor="notice-note" className={LABEL_TEXT}>Note (kept here, not sent)</label>
          <Input id="notice-note" className="mt-1" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <p className={`${HINT} m-0`}>
          {told.length > 0 ? `Marking it told keeps these dates: ${told.join(" · ")}. If one moves later, you are told.` : "This job has no ETA or delivery date to keep yet."}
        </p>
      </div>
    </AppModal>
  );
}

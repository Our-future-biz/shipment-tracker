"use client";

import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Checkbox, Form, Input, Spin } from "antd";
import { CheckCircleFilled, PrinterOutlined } from "@ant-design/icons";
import { apiErrorMessage, isAPIError, isNotFound, publicApi } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import { businessDateTime } from "@/lib/date";
import { ImportInstructionsFields, REQUIRED_MARK, completeAnswers, type ImportAnswers } from "@/components/ImportInstructionsFields";
import { CARD, HINT, LABEL_TEXT, PAGE_SUBTITLE, PAGE_TITLE } from "@/styles/ui";
import { answerSummary, usedLinkText } from "./summary";

// The Import Instructions a customer fills in through its link: the paper form, section by section. Only
// when it is confirmed can it be sent; a colleague then checks it before anything reaches the shipment.

function Page({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 print:bg-white print:p-0">
      <div className="mx-auto max-w-[720px]">{children}</div>
    </main>
  );
}

function Message({ title, text, done }: { title: string; text: string; done?: boolean }) {
  return (
    <Page>
      <section className={`${CARD} px-6 py-10 text-center`}>
        {done && <CheckCircleFilled aria-hidden className="text-emerald-600 text-[36px]" />}
        <h1 className={`${PAGE_TITLE} ${done ? "mt-3" : ""}`}>{title}</h1>
        <p className={`${PAGE_SUBTITLE} mt-1 mb-0`}>{text}</p>
      </section>
    </Page>
  );
}

/** The company a used link names (the server's not-found answer carries it for a link that once was). */
const companyOfUsedLink = (err: unknown): string | null => {
  if (!isAPIError(err)) return null;
  const name: unknown = err.details?.companyName;
  return typeof name === "string" ? name : null;
};

interface Sent {
  answers: ImportAnswers;
  reference: string;
  companyName: string;
  /** ISO time it was sent */
  at: string;
}

// What was sent, to read or print (user council E12): the customer keeps a copy without a download.
function SentSummary({ sent }: { sent: Sent }) {
  const rows = answerSummary(sent.answers);
  return (
    <Page>
      <section className={`${CARD} px-6 py-6`}>
        <div className="flex items-start gap-3">
          <CheckCircleFilled aria-hidden className="text-emerald-600 text-[28px] print:hidden" />
          <div className="min-w-0 flex-1">
            {sent.companyName && <p className={`${LABEL_TEXT} m-0 mb-1`}>{sent.companyName}</p>}
            <h1 className={PAGE_TITLE}>Thank you</h1>
            <p className={`${PAGE_SUBTITLE} m-0`}>
              We have received your Import Instructions for {sent.reference}, sent {businessDateTime(sent.at)}. A colleague checks them; if
              anything is unclear, {sent.companyName || "we"} will contact you.
            </p>
          </div>
          <Button icon={<PrinterOutlined />} className="print:hidden" onClick={() => window.print()}>
            Print
          </Button>
        </div>
        <p className={`${HINT} mt-3 mb-2 print:hidden`}>Your answers, as sent. Print this page or save it as PDF from the print dialog to keep a copy.</p>
        <dl className="m-0 mt-3 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-[220px_1fr]">
          <dt className="text-[13px] text-slate-500">Job / shipment reference number</dt>
          <dd className="m-0 text-[14px] text-slate-900">{sent.reference}</dd>
          {rows.map((r) => (
            <div key={r.key} className="contents">
              <dt className="text-[13px] text-slate-500">{r.label}</dt>
              <dd className="m-0 whitespace-pre-wrap break-words text-[14px] text-slate-900">{r.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </Page>
  );
}

export function ImportInstructionsForm({ token }: { token: string }) {
  const form = useQuery({ queryKey: ["public-import-instructions", token], queryFn: () => publicApi.shipments.publicImportInstructionsForm(token), retry: false });
  const [sent, setSent] = useState<Sent | null>(null);

  if (sent) return <SentSummary sent={sent} />;
  if (form.isLoading) {
    return (
      <Page>
        <div className="flex justify-center py-20">
          <Spin />
        </div>
      </Page>
    );
  }
  if (!form.data) {
    return isNotFound(form.error) ? (
      <Message title="This link is no longer valid" text={usedLinkText(companyOfUsedLink(form.error))} />
    ) : (
      <Message title="The form could not be opened" text="Please try again in a moment." />
    );
  }
  const data = form.data.form;
  return <Filling token={token} data={data} onDone={(answers) => setSent({ answers, reference: data.reference, companyName: data.companyName, at: new Date().toISOString() })} />;
}

function Filling({ token, data, onDone }: { token: string; data: interfaces.PublicImportInstructionForm; onDone: (answers: ImportAnswers) => void }) {
  const [form] = Form.useForm<ImportAnswers>();
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleConfirm = async () => {
    if (submitting || !confirmed) return;
    let values: ImportAnswers;
    try {
      values = await form.validateFields();
    } catch {
      setError("Please fill in what is marked above.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const answers = completeAnswers(values);
      await publicApi.shipments.publicImportInstructionsSubmit(token, { confirmed, answers });
      onDone(answers);
    } catch (err) {
      setError(isNotFound(err) ? `This link is no longer valid. Please ask ${companyOfUsedLink(err) || data.companyName || "your contact"} for a new one.` : apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Page>
      {/* Whose form it is and whom to ask: the company's name only, as the tracking page shows it (no staff
          names or e-mails on a public page; owner, User Council Q16). */}
      <header className="mb-4">
        {data.companyName && <p className={`${LABEL_TEXT} m-0 mb-1`}>{data.companyName}</p>}
        <h1 className={PAGE_TITLE}>Import Instructions</h1>
        <p className={`${PAGE_SUBTITLE} m-0`}>To be completed by the recipient of the arrival notice.</p>
        <p className={`${PAGE_SUBTITLE} m-0`}>Questions: contact {data.companyName || "whoever sent you this link"}.</p>
        <p className={`${PAGE_SUBTITLE} m-0`}>
          <span className="text-red-500">{REQUIRED_MARK}</span> marks what must be filled in.
        </p>
      </header>
      <section className={`${CARD} px-6 py-5`}>
        <Form form={form} layout="vertical" initialValues={data.prefill} disabled={submitting}>
          <div className="mb-3">
            <h2 className={`m-0 mb-2 ${LABEL_TEXT}`}>1. Job / shipment reference number</h2>
            <Input value={data.reference} disabled aria-label="Job / shipment reference number" />
          </div>
          <div className="border-t border-slate-200 pt-3">
            <ImportInstructionsFields form={form} markRequired />
          </div>
        </Form>
        <div className="border-t border-slate-200 pt-4 mt-2">
          <Checkbox checked={confirmed} disabled={submitting} onChange={(e) => setConfirmed(e.target.checked)}>
            I confirm that these instructions are correct
          </Checkbox>
        </div>
        {error && <Alert type="error" showIcon className="!mt-3" message={error} />}
        <div className="flex justify-end mt-4">
          <Button type="primary" size="large" disabled={!confirmed} loading={submitting} onClick={() => void handleConfirm()}>
            Confirm the Instructions
          </Button>
        </div>
      </section>
    </Page>
  );
}

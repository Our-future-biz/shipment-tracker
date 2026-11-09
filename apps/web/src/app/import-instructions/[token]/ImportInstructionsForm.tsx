"use client";

import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Checkbox, Form, Input, Spin } from "antd";
import { CheckCircleFilled } from "@ant-design/icons";
import { apiErrorMessage, isNotFound, publicApi } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import { ImportInstructionsFields, completeAnswers, type ImportAnswers } from "@/components/ImportInstructionsFields";
import { CARD, LABEL_TEXT, PAGE_SUBTITLE, PAGE_TITLE } from "@/styles/ui";

// The Import Instructions a customer fills in through its link: the paper form, section by section. Only
// when it is confirmed can it be sent; a colleague then checks it before anything reaches the shipment.

function Page({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
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

export function ImportInstructionsForm({ token }: { token: string }) {
  const form = useQuery({ queryKey: ["public-import-instructions", token], queryFn: () => publicApi.shipments.publicImportInstructionsForm(token), retry: false });
  const [done, setDone] = useState(false);

  if (done) return <Message done title="Thank you" text="We have received your Import Instructions." />;
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
      <Message title="This link is no longer valid" text="It was already used, it has expired or it was cancelled. Please ask your contact for a new one." />
    ) : (
      <Message title="The form could not be opened" text="Please try again in a moment." />
    );
  }
  return <Filling token={token} data={form.data.form} onDone={() => setDone(true)} />;
}

function Filling({ token, data, onDone }: { token: string; data: interfaces.PublicImportInstructionForm; onDone: () => void }) {
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
      await publicApi.shipments.publicImportInstructionsSubmit(token, { confirmed, answers: completeAnswers(values) });
      onDone();
    } catch (err) {
      setError(isNotFound(err) ? "This link is no longer valid. Please ask your contact for a new one." : apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Page>
      <header className="mb-4">
        <h1 className={PAGE_TITLE}>Import Instructions</h1>
        <p className={`${PAGE_SUBTITLE} m-0`}>To be completed by the recipient of the arrival notice.</p>
      </header>
      <section className={`${CARD} px-6 py-5`}>
        <Form form={form} layout="vertical" requiredMark={false} initialValues={data.prefill} disabled={submitting}>
          <div className="mb-3">
            <h2 className={`m-0 mb-2 ${LABEL_TEXT}`}>1. Job / shipment reference number</h2>
            <Input value={data.reference} disabled aria-label="Job / shipment reference number" />
          </div>
          <div className="border-t border-slate-200 pt-3">
            <ImportInstructionsFields form={form} />
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

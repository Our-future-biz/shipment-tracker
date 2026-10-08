"use client";

import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Button, Form, Input, Modal } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { api, ErrCode, isAPIError } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";
import { formatDate } from "@/lib/date";
import { useToast } from "@/lib/toast";
import { CustomerInfoRow } from "../[id]/_components/CustomerInfoRow";
import { legalFormText, parseNaceCodes } from "../_lib/companyAnalysis";

const ICO_LENGTH = 8;
const ICO_INPUT_ID = "add-customer-ico";
// A company can list dozens of NACE codes; the preview shows the first few.
const MAX_NACE_CODES = 8;

interface AddCustomerModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (customerId: string) => void;
  // Passed in by the list page, so the dialog does not start a customers query of its own.
  createCustomer: (ico: string) => Promise<controllers.CustomerCreateResponse>;
  isCreating: boolean;
}

// The API says what went wrong ("A customer with this IČO already exists", "ARES registry
// unavailable"). The fixed text covers failures without such a message: no connection, or a
// reply that did not come from the API (the client then reports the code "unknown").
function errorMessage(err: unknown, fallback: string): string {
  return isAPIError(err) && err.code !== ErrCode.Unknown && err.message ? err.message : fallback;
}

export function AddCustomerModal({ open, onClose, onCreated, createCustomer, isCreating }: AddCustomerModalProps) {
  const toast = useToast();
  const [ico, setIco] = useState("");
  const [preview, setPreview] = useState<interfaces.AresResult | null>(null);
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState("");
  // Number of the latest lookup. A response that carries an older number is dropped, so a
  // slow earlier request can never replace the result of a newer one.
  const lookupSeq = useRef(0);

  const resetLookup = () => {
    lookupSeq.current += 1;
    setPreview(null);
    setError("");
    setLooking(false);
  };

  const handleIcoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value.replace(/\D/g, "").slice(0, ICO_LENGTH);
    if (next === ico) return;
    setIco(next);
    // The preview is what gets created, so it must never describe another IČO than the field.
    resetLookup();
  };

  const handleLookup = async () => {
    if (ico.length !== ICO_LENGTH) {
      setError(`IČO must be exactly ${ICO_LENGTH} digits`);
      return;
    }
    lookupSeq.current += 1;
    const seq = lookupSeq.current;
    setError("");
    setLooking(true);
    try {
      const result = await api.customers.aresLookup(ico);
      if (seq !== lookupSeq.current) return;
      setPreview(result);
    } catch (err) {
      if (seq !== lookupSeq.current) return;
      setPreview(null);
      setError(errorMessage(err, "Could not look the company up. Please try again."));
    } finally {
      if (seq === lookupSeq.current) setLooking(false);
    }
  };

  const handleCreate = async () => {
    if (!preview) return;
    try {
      const res = await createCustomer(preview.ico);
      toast.success(`${res.customer.companyName} added`);
      onCreated(res.customer.id);
    } catch (err) {
      toast.error(errorMessage(err, "Could not create the customer"));
    }
  };

  const handleCancel = () => {
    // Closing now would hide the dialog and then still open the new customer once it is created.
    if (isCreating) return;
    onClose();
  };

  const handleAfterClose = () => {
    setIco("");
    resetLookup();
  };

  const naceCodes = parseNaceCodes(preview?.nace ?? "");
  const naceText =
    naceCodes.length > MAX_NACE_CODES ? `${naceCodes.slice(0, MAX_NACE_CODES).join(", ")}…` : naceCodes.join(", ");

  return (
    <Modal
      open={open}
      onCancel={handleCancel}
      onOk={handleCreate}
      afterClose={handleAfterClose}
      title="Add Customer"
      okText="Create customer"
      okButtonProps={{ disabled: !preview }}
      cancelButtonProps={{ disabled: isCreating }}
      confirmLoading={isCreating}
      width={520}
      destroyOnHidden
    >
      <Form layout="vertical" className="pt-2">
        <Form.Item
          label="Company IČO"
          htmlFor={ICO_INPUT_ID}
          extra="Customers are created from the Czech ARES registry."
          validateStatus={error ? "error" : undefined}
          help={error || undefined}
        >
          <div className="flex gap-2">
            <Input
              id={ICO_INPUT_ID}
              placeholder="e.g. 27082440"
              value={ico}
              inputMode="numeric"
              autoFocus
              disabled={isCreating}
              onChange={handleIcoChange}
              onPressEnter={handleLookup}
            />
            <Button size="small" icon={<SearchOutlined />} onClick={handleLookup} loading={looking} disabled={!ico || isCreating}>
              Look up
            </Button>
          </div>
        </Form.Item>
      </Form>

      {preview && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 mb-2">
          <div className="text-[15px] font-semibold text-slate-800 mb-1">{preview.companyName || "—"}</div>
          <CustomerInfoRow label="IČO">
            <span className="font-mono">{preview.ico}</span>
          </CustomerInfoRow>
          <CustomerInfoRow label="DIČ">{preview.dic}</CustomerInfoRow>
          <CustomerInfoRow label="Legal form">{preview.legalForm && legalFormText(preview.legalForm)}</CustomerInfoRow>
          <CustomerInfoRow label="Registered address">{preview.registeredAddress}</CustomerInfoRow>
          <CustomerInfoRow label="Registry status">{preview.companyStatus}</CustomerInfoRow>
          <CustomerInfoRow label="Registration date">{formatDate(preview.registrationDate)}</CustomerInfoRow>
          <CustomerInfoRow label="NACE codes">{naceText}</CustomerInfoRow>
        </div>
      )}
    </Modal>
  );
}

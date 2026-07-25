"use client";

import { useState } from "react";
import { Modal, Input, Button } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import { useCustomers } from "@/hooks/useCustomers";
import { useToast } from "@/lib/toast";

interface AddCustomerModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (customerId: string) => void;
}

export function AddCustomerModal({ open, onClose, onCreated }: AddCustomerModalProps) {
  const { createCustomer, isCreating } = useCustomers();
  const toast = useToast();
  const [ico, setIco] = useState("");
  const [preview, setPreview] = useState<interfaces.AresResult | null>(null);
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setIco("");
    setPreview(null);
    setError("");
    setLooking(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const lookup = async () => {
    if (!/^\d{8}$/.test(ico)) {
      setError("IČO must be exactly 8 digits");
      return;
    }
    setError("");
    setLooking(true);
    try {
      const result = await api.customers.aresLookup(ico);
      setPreview(result);
    } catch {
      setPreview(null);
      setError("Company not found in the ARES registry");
    } finally {
      setLooking(false);
    }
  };

  const create = async () => {
    try {
      const res = await createCustomer(ico);
      toast.success(`${res.customer.companyName} added`);
      reset();
      onCreated(res.customer.id);
    } catch {
      toast.error("Could not create customer (already exists?)");
    }
  };

  return (
    <Modal open={open} onCancel={close} title="Add Customer" width={520} footer={null} destroyOnHidden>
      <div className="space-y-4 pt-2">
        <div>
          <div className="text-xs text-slate-500 mb-1.5">
            Company IČO (Czech registry) — customers are created from ARES only
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="e.g. 27082440"
              value={ico}
              maxLength={8}
              onChange={(e) => setIco(e.target.value.replace(/\D/g, ""))}
              onPressEnter={lookup}
              className="font-mono"
            />
            <Button icon={<SearchOutlined />} onClick={lookup} loading={looking}>
              Look up
            </Button>
          </div>
          {error && <div className="text-xs text-red-500 mt-1.5">{error}</div>}
        </div>

        {preview && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-1.5 text-sm">
            <div className="text-[15px] font-semibold text-slate-800">{preview.companyName}</div>
            <PreviewRow label="IČO" value={preview.ico} />
            <PreviewRow label="DIČ" value={preview.dic || "—"} />
            <PreviewRow label="Legal form" value={preview.legalForm || "—"} />
            <PreviewRow label="Address" value={preview.registeredAddress || "—"} />
            <PreviewRow label="Status" value={preview.companyStatus || "—"} />
            <PreviewRow label="Registered" value={preview.registrationDate || "—"} />
            <PreviewRow label="NACE" value={preview.nace || "—"} />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={close}>Cancel</Button>
          <Button type="primary" disabled={!preview} loading={isCreating} onClick={create}>
            Create customer
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-slate-400 w-24 shrink-0">{label}</span>
      <span className="text-slate-700">{value}</span>
    </div>
  );
}

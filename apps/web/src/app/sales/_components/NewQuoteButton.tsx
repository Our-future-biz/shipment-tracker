"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal } from "antd";
import { PlusOutlined, FileTextOutlined } from "@ant-design/icons";
import { api } from "@/lib/api";
import { useSalesQuotes } from "@/hooks/useSalesQuotes";
import { useToast } from "@/lib/toast";

// "New Quote" action with a confirmation step: previews the next reference
// (read-only) and only creates it on confirm, so an accidental click never
// burns a reference.
export function NewQuoteButton({ size = "middle", block = false }: { size?: "large" | "middle"; block?: boolean }) {
  const router = useRouter();
  const { createQuote } = useSalesQuotes();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [nextRef, setNextRef] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const openConfirm = async () => {
    setNextRef(null);
    setOpen(true);
    try {
      const { ref } = await api.quotes.quoteNextRef();
      setNextRef(ref);
    } catch {
      /* preview only — the real ref is assigned on confirm */
    }
  };

  const confirm = async () => {
    setCreating(true);
    try {
      const ref = await createQuote({});
      setOpen(false);
      router.push(`/sales/quote/${ref}`);
    } catch {
      toast.error("Failed to create quote");
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Button type="primary" size={size} block={block} icon={<PlusOutlined />} onClick={openConfirm}>
        New Quote
      </Button>

      <Modal open={open} onCancel={() => setOpen(false)} footer={null} title={null} width={560} destroyOnHidden>
        <div>
          <div className="text-lg font-bold text-slate-800">Create new quotation</div>
          <div className="text-sm text-slate-500 mt-0.5">A unique reference will be permanently assigned.</div>
          <div className="border-t border-slate-200 my-4" />
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Quote reference</div>
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-start gap-3">
            <FileTextOutlined className="text-indigo-400 text-xl mt-0.5 shrink-0" />
            <div>
              <div className="font-mono text-lg font-bold text-indigo-700">{nextRef ?? "…"}</div>
              <div className="text-xs text-slate-500 mt-1">This reference is unique and cannot be reused once confirmed.</div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-5">
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="primary" loading={creating} disabled={!nextRef} onClick={confirm}>
              Confirm &amp; open
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

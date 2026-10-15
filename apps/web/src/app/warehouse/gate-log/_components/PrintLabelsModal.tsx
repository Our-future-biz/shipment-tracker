"use client";

import { useState } from "react";
import { Modal, Radio } from "antd";
import { useLogLabelPrints, type GateMovement } from "@/hooks/useGateLog";
import { useToast } from "@/lib/toast";
import { runBulk } from "@/app/warehouse/_components/tabs/shared";
import { MAX_LABELS, downloadLabels, labelCount } from "../_lib/labelPdf";

// Print labels for one or more positions: one label per position, or one per piece (n / N).
// The PDF is built in the browser; each print is then logged on its gate movement (a failed
// log does not undo the PDF, it is only reported).
export function PrintLabelsModal({ open, movements, onClose }: { open: boolean; movements: GateMovement[]; onClose: () => void }) {
  const toast = useToast();
  const { logPrint, refresh: refreshAfterPrint } = useLogLabelPrints();
  const [perPiece, setPerPiece] = useState(false);
  const [busy, setBusy] = useState(false);
  const total = movements.reduce((s, m) => s + labelCount(m, perPiece), 0);
  const tooMany = total > MAX_LABELS;
  // The modal stays mounted between prints; every close starts the next one at one per position.
  const close = () => {
    setPerPiece(false);
    onClose();
  };

  const print = async () => {
    setBusy(true);
    try {
      const copies = await downloadLabels(movements, { perPiece });
      const result = await runBulk(copies, (c) => logPrint(c.id, c.copies));
      await refreshAfterPrint();
      if (result.failed.length) {
        toast.warning(`Labels saved, but the print could not be logged on ${result.failed.length} position${result.failed.length === 1 ? "" : "s"}.`);
      } else {
        toast.success(`${total} label${total === 1 ? "" : "s"} saved`);
      }
      close();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create the labels");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={movements.length === 1 ? "Print labels" : `Print labels for ${movements.length} positions`}
      okText={`Print ${total} label${total === 1 ? "" : "s"}`}
      okButtonProps={{ disabled: tooMany || !movements.length }}
      confirmLoading={busy}
      onOk={print}
      onCancel={close}
      destroyOnHidden
    >
      <Radio.Group value={perPiece} onChange={(e) => setPerPiece(e.target.value)} className="flex flex-col gap-2">
        <Radio value={false}>One label per position</Radio>
        <Radio value={true}>One label per piece (n / N)</Radio>
      </Radio.Group>
      <p className={`text-xs mt-3 mb-0 ${tooMany ? "text-red-600" : "text-slate-500"}`}>
        {tooMany
          ? `${total} labels is more than ${MAX_LABELS} in one print — pick fewer positions or print one per position.`
          : `${total} label${total === 1 ? "" : "s"} in one PDF, one label per page. Each print is logged on the gate movement.`}
      </p>
    </Modal>
  );
}

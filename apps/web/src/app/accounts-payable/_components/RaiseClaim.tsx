"use client";

import { useState } from "react";
import { Dropdown, Tooltip } from "antd";
import { DownOutlined, PlusOutlined } from "@ant-design/icons";
import { ClaimFormModal, type ClaimValues } from "@/app/shipments/[jobNumber]/tabs/ClaimFormModal";
import { apiErrorMessage } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { useRaiseCostClaim } from "@/hooks/useSupplierInvoices";
import { BTN_BAR } from "@/styles/ui";
import { claimJobs, claimStart, raiseClaimState, type ClaimJob, type PayableInvoice } from "../_lib/payables";

// Raise a claim from the drawer (build step 5, D15): the job's own claim on costs dialog, opened on this invoice -
// its supplier, number and currency filled in. A claim belongs to one shipment, so an invoice billing several jobs
// first asks which one it is on. An open claim then holds the invoice's payment here.

export function RaiseClaim({ invoice }: { invoice: PayableInvoice }) {
  const toast = useToast();
  const raise = useRaiseCostClaim();
  const [job, setJob] = useState<ClaimJob | null>(null);
  const state = raiseClaimState(invoice);
  if (!state.shown) return null;

  const jobs = claimJobs(invoice);
  const start = claimStart(invoice);
  const open = (j: ClaimJob) => setJob(j);

  // Rejects when the server refuses it, so the dialog stays open with what was typed.
  const save = async (values: ClaimValues) => {
    const on = job;
    if (!on) return;
    try {
      await raise.mutateAsync({ shipmentId: on.shipmentId, values });
    } catch (e) {
      toast.error(`Could not add the claim: ${apiErrorMessage(e)}`);
      throw e;
    }
    toast.success(`Claim added on ${on.jobNumber}`);
    // only the dialog that was saved closes (not one opened since)
    setJob((j) => (j === on ? null : j));
  };

  const button =
    jobs.length > 1 ? (
      <Dropdown
        trigger={["click"]}
        placement="bottomRight"
        menu={{
          items: [
            {
              type: "group",
              key: "jobs",
              label: "The job the claim is on",
              children: jobs.map((j) => ({ key: j.shipmentId, label: j.jobNumber || "Job", onClick: () => open(j) })),
            },
          ],
        }}
      >
        <button type="button" className={BTN_BAR}>
          <PlusOutlined />
          Raise a claim
          <DownOutlined className="text-[10px]" />
        </button>
      </Dropdown>
    ) : (
      <Tooltip title={state.blocked || undefined}>
        <button type="button" disabled={!!state.blocked} onClick={() => jobs[0] && open(jobs[0])} className={`${BTN_BAR} disabled:cursor-not-allowed disabled:opacity-50`}>
          <PlusOutlined />
          Raise a claim
        </button>
      </Tooltip>
    );

  return (
    <>
      {button}
      {job && (
        <ClaimFormModal
          key={job.shipmentId}
          kind="cost"
          initial={start.values}
          invoiceOptions={[start.option]}
          saving={raise.isPending}
          onClose={() => setJob(null)}
          onSave={save}
        />
      )}
    </>
  );
}

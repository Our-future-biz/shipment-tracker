"use client";

import { useCustomsOfficeApprovals } from "@/hooks/useCustomsOfficeRequests";
import { useDocumentChangeApprovals } from "@/hooks/useDocumentChangeRequests";
import { apiFileUrl } from "@/lib/api";
import { HINT, LINK } from "@/styles/ui";
import { ApprovalsCard } from "./ApprovalsCard";

// What waits for a manager's approval: requests to change a chosen Customs Office, and to replace a
// document customs has approved.
export function CustomsOfficeApprovals() {
  const offices = useCustomsOfficeApprovals();
  const documents = useDocumentChangeApprovals();

  return (
    <div className="flex flex-col gap-4">
      <ApprovalsCard
        title="Approvals · change of Customs Office"
        hint="Once chosen, a Customs Office is changed only with approval: approving puts the new office on the shipment, rejecting needs a reason. The answer goes to whoever asked."
        whatHeader="Customs Office"
        shipmentHref={(r) => `/shipments/${r.shipmentId}?tab=customs`}
        approvals={offices}
        what={(r) => (
          <>
            <div className={HINT}>From: {r.fromOffice}</div>
            <div className="font-semibold text-slate-900">To: {r.toOffice}</div>
          </>
        )}
      />
      <ApprovalsCard
        title="Approvals · change of an approved document"
        hint="Once customs has approved a document, it is replaced only with approval: approving puts the new file in its place, back at pending for customs; rejecting needs a reason and discards the new file. The answer goes to whoever asked."
        whatHeader="Document"
        shipmentHref={(r) => `/customs?open=${r.shipmentId}`}
        approvals={documents}
        what={(r) => (
          <>
            <div className={HINT}>
              {r.documentType ? `${r.documentType} · ` : ""}From:{" "}
              {r.status === "pending" ? (
                <a href={apiFileUrl(r.fileUrl)} target="_blank" rel="noreferrer" className={LINK}>
                  {r.fileName}
                </a>
              ) : (
                r.fileName
              )}
            </div>
            <div className="font-semibold text-slate-900">
              To:{" "}
              {r.newFileUrl ? (
                <a href={apiFileUrl(r.newFileUrl)} target="_blank" rel="noreferrer" className={LINK}>
                  {r.newFileName}
                </a>
              ) : (
                r.newFileName
              )}
            </div>
          </>
        )}
      />
    </div>
  );
}

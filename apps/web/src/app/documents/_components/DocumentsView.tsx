"use client";

import { PageHeader } from "@/components/PageHeader";
import { DocumentReadingWorkflow } from "./DocumentReadingWorkflow";

export const DocumentsView = () => {
  return (
    <div className="bg-slate-50 min-h-full p-6">
      <div className="max-w-[1400px] mx-auto">
        <PageHeader title="Document / Text Reading" />
        <p className="text-sm text-slate-500 -mt-3 mb-5">
          Upload a shipping document or paste text to extract structured data with AI, review it, and write it into
          shipments, invoicing, quotes, or a master job.
        </p>
        <DocumentReadingWorkflow />
      </div>
    </div>
  );
};

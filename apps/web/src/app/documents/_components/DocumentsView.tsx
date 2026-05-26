"use client";

import { Upload } from "antd";
import { UploadOutlined } from "@ant-design/icons";
import { PageHeader } from "@/components/PageHeader";

export const DocumentsView = () => {
  return (
    <div className="bg-slate-50 min-h-full p-6">
      <div className="max-w-[1400px] mx-auto">
      <PageHeader title="Documents" />

      <div className="bg-white rounded-xl border border-slate-200 p-8">
        <p className="text-sm text-slate-500 mb-6 mt-0">
          Upload shipping documents to extract structured data using AI.
        </p>

        <Upload.Dragger
          accept=".pdf"
          multiple={false}
          beforeUpload={() => false}
          className="!rounded-lg !border-2 !border-dashed !border-slate-200 !bg-slate-50"
          style={{ padding: "48px 0" }}
        >
          <p className="ant-upload-drag-icon">
            <UploadOutlined className="!text-[40px] !text-indigo-500" />
          </p>
          <p className="text-sm text-slate-800 font-medium">
            Click or drag PDF to upload
          </p>
          <p className="text-xs text-slate-400">
            Bills of Lading, Manifests, Booking Confirmations, Invoices
          </p>
        </Upload.Dragger>
      </div>
      </div>
    </div>
  );
};

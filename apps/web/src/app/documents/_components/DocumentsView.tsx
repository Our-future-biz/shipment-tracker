"use client";

import { Upload } from "antd";
import { UploadOutlined } from "@ant-design/icons";
import { PageHeader } from "@/components/PageHeader";

export const DocumentsView = () => {
  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      <PageHeader title="Documents" />

      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          border: "1px solid #e2e8f0",
          padding: 32,
        }}
      >
        <p
          style={{
            fontSize: 13,
            color: "#64748b",
            marginBottom: 24,
            margin: "0 0 24px 0",
          }}
        >
          Upload shipping documents to extract structured data using AI.
        </p>

        <Upload.Dragger
          accept=".pdf"
          multiple={false}
          beforeUpload={() => false}
          style={{
            borderRadius: 10,
            border: "2px dashed #e2e8f0",
            background: "#f8fafc",
            padding: "48px 0",
          }}
        >
          <p className="ant-upload-drag-icon">
            <UploadOutlined style={{ fontSize: 40, color: "#6366f1" }} />
          </p>
          <p style={{ fontSize: 14, color: "#1e293b", fontWeight: 500 }}>
            Click or drag PDF to upload
          </p>
          <p style={{ fontSize: 12, color: "#94a3b8" }}>
            Bills of Lading, Manifests, Booking Confirmations, Invoices
          </p>
        </Upload.Dragger>
      </div>
    </div>
  );
};

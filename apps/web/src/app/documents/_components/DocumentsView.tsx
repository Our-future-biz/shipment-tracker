"use client";

import { Typography, Upload } from "antd";
import { UploadOutlined } from "@ant-design/icons";

const { Title, Text } = Typography;

export const DocumentsView = () => {
  return (
    <div className="h-full flex flex-col p-4">
      <div className="mb-4">
        <Title level={5} className="!mb-1">Document / Text Reading</Title>
        <Text type="secondary" className="text-xs">Upload shipping documents to extract structured data using AI.</Text>
      </div>
      <div className="flex-1">
        <Upload.Dragger accept=".pdf" multiple={false} beforeUpload={() => false} className="!h-64">
          <p className="ant-upload-drag-icon"><UploadOutlined style={{ fontSize: 40, color: "#1677ff" }} /></p>
          <p className="ant-upload-text text-sm">Click or drag PDF to upload</p>
          <p className="ant-upload-hint text-xs">Bills of Lading, Manifests, Booking Confirmations, Invoices</p>
        </Upload.Dragger>
      </div>
    </div>
  );
};

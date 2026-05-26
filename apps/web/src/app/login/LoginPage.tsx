"use client";

import { Form, Input, Button, Alert } from "antd";
import { LockOutlined, MailOutlined } from "@ant-design/icons";
import { useAuth } from "@/lib/auth/AuthContext";

export const LoginPage = () => {
  const { login, loginError, isLoggingIn } = useAuth();
  const [form] = Form.useForm();

  const handleSubmit = async (values: { email: string; password: string }) => {
    try {
      await login(values.email.trim(), values.password);
    } catch {
      // error displayed via loginError
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f8fafc",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          background: "#fff",
          borderRadius: 12,
          border: "1px solid #e2e8f0",
          padding: 32,
          boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
        }}
      >
        {/* Logo + Title */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div
            style={{
              width: 44,
              height: 44,
              background: "#6366f1",
              borderRadius: 10,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontWeight: 700,
              fontSize: 16,
              marginBottom: 14,
            }}
          >
            ST
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>
            Shipment Tracker
          </div>
          <div style={{ fontSize: 13, color: "#64748b" }}>Sign in to your account</div>
        </div>

        {loginError && (
          <Alert
            message={loginError}
            type="error"
            showIcon
            style={{ marginBottom: 20, borderRadius: 8 }}
          />
        )}

        <Form form={form} layout="vertical" onFinish={handleSubmit} requiredMark={false}>
          <Form.Item
            name="email"
            label={<span style={{ fontSize: 12, fontWeight: 500, color: "#64748b" }}>Email</span>}
            rules={[{ required: true, message: "Please enter your email" }, { type: "email", message: "Invalid email" }]}
          >
            <Input
              prefix={<MailOutlined style={{ color: "#94a3b8" }} />}
              placeholder="you@company.com"
              autoComplete="email"
              autoFocus
              size="large"
            />
          </Form.Item>

          <Form.Item
            name="password"
            label={<span style={{ fontSize: 12, fontWeight: 500, color: "#64748b" }}>Password</span>}
            rules={[{ required: true, message: "Please enter your password" }]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: "#94a3b8" }} />}
              placeholder="Enter password"
              autoComplete="current-password"
              size="large"
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={isLoggingIn}
              block
              size="large"
              style={{ fontWeight: 500 }}
            >
              Sign In
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: "#94a3b8" }}>
          OurFuture.biz Operations System
        </div>
      </div>
    </div>
  );
};

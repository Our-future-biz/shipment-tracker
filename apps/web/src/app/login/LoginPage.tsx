"use client";

import { Form, Input, Button, Alert } from "antd";
import { LockOutlined, MailOutlined } from "@ant-design/icons";
import { useAuth } from "@/lib/auth/AuthContext";
import { useRouter } from "next/navigation";
import { CARD, HINT, LABEL_TEXT, PAGE_SUBTITLE, PAGE_TITLE } from "@/styles/ui";

export const LoginPage = () => {
  const { login, loginError, isLoggingIn } = useAuth();
  const router = useRouter();
  const [form] = Form.useForm();

  const handleSubmit = async (values: { email: string; password: string }) => {
    try {
      await login(values.email.trim(), values.password);
      // Login succeeded → navigate to dashboard
      router.replace("/dashboard");
    } catch {
      // error displayed via loginError
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className={`w-full max-w-[380px] ${CARD} p-8`}>
        {/* Logo + Title */}
        <div className="text-center mb-7">
          <div className="w-11 h-11 bg-indigo-600 rounded-lg inline-flex items-center justify-center text-white font-bold text-base mb-3.5">
            ST
          </div>
          <h1 className={`${PAGE_TITLE} mb-1`}>
            Shipment Tracker
          </h1>
          <div className={PAGE_SUBTITLE}>Sign in to your account</div>
        </div>

        {loginError && (
          <Alert
            message={loginError}
            type="error"
            showIcon
            className="mb-5"
          />
        )}

        <Form form={form} layout="vertical" onFinish={handleSubmit} requiredMark={false}>
          <Form.Item
            name="email"
            label={<span className={LABEL_TEXT}>Email</span>}
            rules={[{ required: true, message: "Please enter your email" }, { type: "email", message: "Invalid email" }]}
          >
            <Input
              prefix={<MailOutlined className="text-slate-400" />}
              placeholder="you@company.com"
              autoComplete="email"
              autoFocus
              size="large"
            />
          </Form.Item>

          <Form.Item
            name="password"
            label={<span className={LABEL_TEXT}>Password</span>}
            rules={[{ required: true, message: "Please enter your password" }]}
          >
            <Input.Password
              prefix={<LockOutlined className="text-slate-400" />}
              placeholder="Enter password"
              autoComplete="current-password"
              size="large"
            />
          </Form.Item>

          <Form.Item className="!mb-0 !mt-2">
            <Button
              type="primary"
              htmlType="submit"
              loading={isLoggingIn}
              block
              size="large"
            >
              Sign In
            </Button>
          </Form.Item>
        </Form>

        <div className={`text-center mt-5 ${HINT}`}>
          Shipment Operations System
        </div>
      </div>
    </div>
  );
};

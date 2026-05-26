"use client";

import { Form, Input, Button, Alert } from "antd";
import { LockOutlined, MailOutlined } from "@ant-design/icons";
import { useAuth } from "@/lib/auth/AuthContext";
import { useRouter } from "next/navigation";

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
      <div className="w-full max-w-[380px] bg-white rounded-xl border border-slate-200 p-8 shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
        {/* Logo + Title */}
        <div className="text-center mb-7">
          <div className="w-11 h-11 bg-indigo-500 rounded-lg inline-flex items-center justify-center text-white font-bold text-base mb-3.5">
            ST
          </div>
          <div className="text-xl font-bold text-slate-800 mb-1">
            Shipment Tracker
          </div>
          <div className="text-sm text-slate-500">Sign in to your account</div>
        </div>

        {loginError && (
          <Alert
            message={loginError}
            type="error"
            showIcon
            className="mb-5 rounded-lg"
          />
        )}

        <Form form={form} layout="vertical" onFinish={handleSubmit} requiredMark={false}>
          <Form.Item
            name="email"
            label={<span className="text-xs font-medium text-slate-500">Email</span>}
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
            label={<span className="text-xs font-medium text-slate-500">Password</span>}
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
              className="font-medium"
            >
              Sign In
            </Button>
          </Form.Item>
        </Form>

        <div className="text-center mt-5 text-[11px] text-slate-400">
          OurFuture.biz Operations System
        </div>
      </div>
    </div>
  );
};

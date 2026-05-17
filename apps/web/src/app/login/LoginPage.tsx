"use client";

import { Form, Input, Button, Alert, Card, Space, Typography } from "antd";
import { LockOutlined, MailOutlined } from "@ant-design/icons";
import { useAuth } from "@/lib/auth/AuthContext";

const { Title, Text } = Typography;

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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <Card className="w-full max-w-sm">
        <Space direction="vertical" size="large" className="w-full">
          <div className="text-center">
            <Title level={3} className="!mb-1">Shipment Tracker</Title>
            <Text type="secondary">Sign in to your account</Text>
          </div>
          {loginError && <Alert message={loginError} type="error" showIcon />}
          <Form form={form} layout="vertical" onFinish={handleSubmit} requiredMark={false}>
            <Form.Item name="email" label="Email" rules={[{ required: true }, { type: "email" }]}>
              <Input prefix={<MailOutlined />} placeholder="you@ourfuture.biz" autoComplete="email" autoFocus size="large" />
            </Form.Item>
            <Form.Item name="password" label="Password" rules={[{ required: true }]}>
              <Input.Password prefix={<LockOutlined />} placeholder="Enter password" autoComplete="current-password" size="large" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={isLoggingIn} block size="large">Sign In</Button>
            </Form.Item>
          </Form>
          <Text type="secondary" className="text-center block text-xs">OurFuture.biz Operations System</Text>
        </Space>
      </Card>
    </div>
  );
};

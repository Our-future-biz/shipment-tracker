"use client";

import { Row, Col, Card, Statistic, Collapse, Tag, Spin } from "antd";
import {
  ShoppingOutlined,
  ClockCircleOutlined,
  SendOutlined,
  ShoppingCartOutlined,
  CompassOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { useDashboard } from "@/hooks/useDashboard";

interface DashboardProps {
  onShipmentClick?: (id: string) => void;
}

const PERIOD_CONFIG: Record<string, { label: string; color: string }> = {
  OVERDUE: { label: "Overdue", color: "#ef4444" },
  TODAY: { label: "Today", color: "#f97316" },
  THIS_WEEK: { label: "This Week", color: "#3b82f6" },
  NEXT_WEEK: { label: "Next Week", color: "#14b8a6" },
  LATER: { label: "Later", color: "#9ca3af" },
};

export const Dashboard = ({ onShipmentClick }: DashboardProps) => {
  const { data, isLoading } = useDashboard();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spin size="large" />
      </div>
    );
  }

  const kpis = data?.kpis;
  const deadlines = data?.deadlines ?? [];

  const kpiCards = [
    { title: "Total Active", value: kpis?.totalActive ?? 0, icon: <ShoppingOutlined />, color: "#14b8a6" },
    { title: "Waiting Unload", value: kpis?.waitingUnload ?? 0, icon: <ClockCircleOutlined />, color: "#f59e0b" },
    { title: "Sailed Not Ordered", value: kpis?.sailedNotOrdered ?? 0, icon: <SendOutlined />, color: "#f97316" },
    { title: "Sailed Ordered", value: kpis?.sailedOrdered ?? 0, icon: <ShoppingCartOutlined />, color: "#eab308" },
    { title: "Waiting Departure", value: kpis?.waitingDeparture ?? 0, icon: <CompassOutlined />, color: "#3b82f6" },
    { title: "Missing Sailing", value: kpis?.missingSailing ?? 0, icon: <WarningOutlined />, color: "#ef4444" },
  ];

  const collapseItems = deadlines
    .filter((group) => group.items.length > 0)
    .map((group) => {
      const config = PERIOD_CONFIG[group.period] ?? { label: group.period, color: "#9ca3af" };
      return {
        key: group.period,
        label: (
          <span style={{ color: config.color, fontWeight: 600 }}>
            {config.label} ({group.items.length})
          </span>
        ),
        children: (
          <div className="flex flex-col gap-2">
            {group.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-gray-50"
              >
                <span
                  className="font-mono text-sm cursor-pointer hover:underline"
                  style={{ color: "#14b8a6", fontWeight: 600, minWidth: 100 }}
                  onClick={() => onShipmentClick?.(item.id)}
                >
                  {item.jobNumber}
                </span>
                <span className="text-sm text-gray-600 truncate" style={{ minWidth: 160 }}>
                  {item.shipper} → {item.consignee}
                </span>
                <Tag className="shrink-0">{item.status}</Tag>
                <span className="text-xs text-gray-400 shrink-0">{item.field}</span>
                <span className="text-xs text-gray-500 ml-auto shrink-0">{item.date}</span>
              </div>
            ))}
          </div>
        ),
      };
    });

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* KPI Cards */}
      <Row gutter={[16, 16]}>
        {kpiCards.map((kpi) => (
          <Col key={kpi.title} xs={12} sm={8} lg={4}>
            <Card size="small" bordered>
              <Statistic
                title={kpi.title}
                value={kpi.value}
                prefix={<span style={{ color: kpi.color }}>{kpi.icon}</span>}
                valueStyle={{ color: kpi.color }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      {/* Deadlines */}
      {collapseItems.length > 0 && (
        <Card size="small" title="Upcoming Deadlines" bordered>
          <Collapse
            ghost
            defaultActiveKey={["OVERDUE", "TODAY"]}
            items={collapseItems}
          />
        </Card>
      )}
    </div>
  );
};

import type { ThemeConfig } from "antd";

export const lightTheme: ThemeConfig = {
  token: {
    colorPrimary: "#6366f1",
    colorInfo: "#3b82f6",
    colorSuccess: "#22c55e",
    colorWarning: "#f59e0b",
    colorError: "#ef4444",
    colorBgLayout: "#f8fafc",
    colorBgContainer: "#ffffff",
    colorBgElevated: "#ffffff",
    colorBorder: "#e2e8f0",
    colorBorderSecondary: "#f1f5f9",
    colorText: "#1e293b",
    colorTextSecondary: "#64748b",
    colorTextTertiary: "#94a3b8",
    borderRadius: 12,
    borderRadiusLG: 14,
    fontSize: 13,
    fontSizeHeading3: 20,
    fontSizeHeading4: 16,
  },
  components: {
    Button: {
      borderRadius: 12,
      controlHeight: 44,
      controlHeightSM: 32,
      fontWeight: 500,
    },
    Table: {
      headerBg: "#fafbfc",
      headerColor: "#64748b",
      rowHoverBg: "#fafaff",
      borderColor: "#f1f5f9",
      headerSplitColor: "transparent",
      fontSize: 13,
    },
    Modal: {
      borderRadiusLG: 12,
      titleFontSize: 16,
    },
    Input: {
      borderRadius: 12,
      activeBorderColor: "#6366f1",
      hoverBorderColor: "#a5b4fc",
      activeShadow: "0 0 0 3px rgba(99,102,241,0.1)",
    },
    Select: {
      borderRadius: 12,
      activeBorderColor: "#6366f1",
      hoverBorderColor: "#a5b4fc",
    },
    Tag: {
      borderRadiusSM: 12,
    },
    Tabs: {
      inkBarColor: "#6366f1",
      itemActiveColor: "#6366f1",
      itemSelectedColor: "#6366f1",
    },
    Checkbox: {
      colorPrimary: "#6366f1",
      colorPrimaryHover: "#4f46e5",
    },
  },
};

export const darkTheme: ThemeConfig = lightTheme;

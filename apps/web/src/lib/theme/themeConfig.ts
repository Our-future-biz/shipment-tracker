import type { ThemeConfig } from "antd";

export const lightTheme: ThemeConfig = {
  token: {
    colorPrimary: "#0d9488",
    colorInfo: "#0d9488",
    borderRadius: 6,
    fontSize: 13,
    colorBgContainer: "#ffffff",
    colorBgLayout: "#f5f5f5",
    colorBorderSecondary: "#e5e7eb",
    colorText: "#1f2937",
    colorTextSecondary: "#6b7280",
  },
  components: {
    Table: {
      headerBg: "#fafafa",
      headerColor: "#6b7280",
      headerSplitColor: "#f0f0f0",
      rowHoverBg: "#f0fdfa",
      cellPaddingBlockSM: 6,
      cellPaddingInlineSM: 8,
      fontSize: 12,
      colorBgContainer: "#ffffff",
    },
    Modal: {
      titleFontSize: 15,
    },
    Tabs: {
      itemColor: "#6b7280",
      itemActiveColor: "#0d9488",
      itemSelectedColor: "#0d9488",
      inkBarColor: "#0d9488",
    },
    Button: {
      colorPrimary: "#0d9488",
      algorithm: true,
    },
    Input: {
      activeBorderColor: "#0d9488",
      hoverBorderColor: "#14b8a6",
    },
    Select: {
      colorPrimary: "#0d9488",
    },
    Checkbox: {
      colorPrimary: "#0d9488",
    },
  },
};

// Keep darkTheme export for compatibility but just use lightTheme
export const darkTheme: ThemeConfig = lightTheme;

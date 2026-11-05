import type { ThemeConfig } from "antd";

// antd in the app's one look (styles/ui.ts): Inter, the slate text colours, indigo-600 as the
// accent, 8px corners on controls and 12px on cards and dialogs, and buttons and fields 32px tall,
// so an antd Button is the same as a BTN / BTN_PRIMARY drawn with Tailwind beside it.
const FONT = "var(--font-inter), ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
const INDIGO_600 = "#4f46e5";
const INDIGO_700 = "#4338ca";
const INDIGO_800 = "#3730a3";

export const lightTheme: ThemeConfig = {
  token: {
    fontFamily: FONT,
    fontFamilyCode: FONT,
    fontSize: 13,
    fontSizeSM: 12,
    fontSizeLG: 14,
    fontSizeHeading1: 22,
    fontSizeHeading2: 22,
    fontSizeHeading3: 16,
    fontSizeHeading4: 16,
    fontSizeHeading5: 14,
    colorPrimary: INDIGO_600,
    colorLink: INDIGO_600,
    colorLinkHover: INDIGO_700,
    colorLinkActive: INDIGO_800,
    colorInfo: INDIGO_600,
    colorSuccess: "#059669",
    colorWarning: "#d97706",
    colorError: "#dc2626",
    colorBgLayout: "#f8fafc",
    colorBgContainer: "#ffffff",
    colorBgElevated: "#ffffff",
    colorBorder: "#cbd5e1",
    colorBorderSecondary: "#e2e8f0",
    colorSplit: "#f1f5f9",
    colorText: "#0f172a",
    colorTextSecondary: "#475569",
    colorTextTertiary: "#64748b",
    colorTextQuaternary: "#94a3b8",
    colorTextPlaceholder: "#94a3b8",
    borderRadius: 8,
    borderRadiusSM: 6,
    borderRadiusLG: 12,
    controlHeight: 32,
    controlHeightSM: 28,
    controlHeightLG: 40,
  },
  components: {
    Button: {
      fontWeight: 500,
      defaultBorderColor: "#cbd5e1",
      defaultColor: "#334155",
      defaultHoverBg: "#f8fafc",
      defaultHoverBorderColor: "#cbd5e1",
      defaultHoverColor: "#0f172a",
      defaultActiveBg: "#f1f5f9",
      defaultActiveBorderColor: "#94a3b8",
      defaultActiveColor: "#0f172a",
      colorPrimaryHover: INDIGO_700,
      colorPrimaryActive: INDIGO_800,
      primaryShadow: "none",
      defaultShadow: "none",
      dangerShadow: "none",
      contentFontSizeSM: 12,
      paddingInline: 12,
      paddingInlineSM: 10,
    },
    Table: {
      headerBg: "#ffffff",
      headerColor: "#0f172a",
      headerSplitColor: "transparent",
      headerBorderRadius: 0,
      borderColor: "#f1f5f9",
      rowHoverBg: "#f8fafc",
      cellFontSize: 13,
    },
    Modal: {
      titleFontSize: 16,
      titleColor: "#0f172a",
    },
    Drawer: {
      fontSizeLG: 16,
    },
    Input: {
      activeBorderColor: INDIGO_600,
      hoverBorderColor: "#a5b4fc",
      activeShadow: "0 0 0 2px #e0e7ff",
    },
    InputNumber: {
      activeBorderColor: INDIGO_600,
      hoverBorderColor: "#a5b4fc",
      activeShadow: "0 0 0 2px #e0e7ff",
    },
    Select: {
      activeBorderColor: INDIGO_600,
      hoverBorderColor: "#a5b4fc",
      activeOutlineColor: "#e0e7ff",
    },
    DatePicker: {
      activeBorderColor: INDIGO_600,
      hoverBorderColor: "#a5b4fc",
      activeShadow: "0 0 0 2px #e0e7ff",
    },
    Tag: {
      borderRadiusSM: 12,
    },
    Tabs: {
      inkBarColor: INDIGO_600,
      itemActiveColor: INDIGO_600,
      itemSelectedColor: INDIGO_600,
      itemHoverColor: INDIGO_700,
      itemColor: "#64748b",
    },
    Checkbox: {
      colorPrimary: INDIGO_600,
      colorPrimaryHover: INDIGO_700,
    },
  },
};

export const darkTheme: ThemeConfig = lightTheme;

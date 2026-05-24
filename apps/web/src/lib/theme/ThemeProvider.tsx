"use client";

import { ConfigProvider, App } from "antd";
import { lightTheme } from "./themeConfig";
import type { ReactNode } from "react";

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  return (
    <ConfigProvider theme={lightTheme}>
      <App>{children}</App>
    </ConfigProvider>
  );
};

// Keep useTheme export for backwards compatibility
export const useTheme = () => ({ isDark: false, toggle: () => {} });

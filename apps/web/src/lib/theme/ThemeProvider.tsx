"use client";

import "./antdReact19";
import { ConfigProvider, App } from "antd";
import { StyleProvider } from "@ant-design/cssinjs";
import { lightTheme } from "./themeConfig";
import type { ReactNode } from "react";

interface ThemeProviderProps {
  children: ReactNode;
}

// antd's styles go into the CSS layer "antd", which globals.css puts under Tailwind's utilities:
// a Tailwind class on an antd component, or a text colour on a link drawn as a button, then wins
// over antd's own (antd otherwise colours every <a> with its link colour, whatever its classes say).
export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  return (
    <StyleProvider layer>
      <ConfigProvider theme={lightTheme}>
        <App>{children}</App>
      </ConfigProvider>
    </StyleProvider>
  );
};

// Keep useTheme export for backwards compatibility
export const useTheme = () => ({ isDark: false, toggle: () => {} });

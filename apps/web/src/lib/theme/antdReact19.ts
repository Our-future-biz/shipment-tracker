"use client";

import { unstableSetRender } from "antd";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";

// antd v5 draws the pieces it renders outside the page tree (static message / notification /
// Modal calls, the button click wave) with the React 18 render API, which React 19 removed:
// without this they silently draw nothing. The same as @ant-design/v5-patch-for-react-19,
// see https://u.ant.design/v5-for-19. Imported once, by ThemeProvider.
type Container = (Element | DocumentFragment) & { _reactRoot?: Root };

unstableSetRender((node, container) => {
  const target = container as Container;
  target._reactRoot ??= createRoot(target);
  const root = target._reactRoot;
  root.render(node);
  return async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    root.unmount();
  };
});

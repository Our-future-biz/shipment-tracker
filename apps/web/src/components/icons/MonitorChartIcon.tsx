"use client";

import { forwardRef, type ReactElement } from "react";
import { IconBase, type Icon, type IconProps, type IconWeight } from "@phosphor-icons/react";

// A monitor showing a bar chart (the Cockpit), which Phosphor's set doesn't have: drawn on its
// 256 grid in its manner, so it sits with the other menu icons. The outline is stroked 16 wide
// like Phosphor's regular weight; the filled one is a solid monitor with the bars cut out.
const outline = (
  <g fill="none" stroke="currentColor" strokeWidth={16} strokeLinecap="round" strokeLinejoin="round">
    <rect x={32} y={48} width={192} height={136} rx={16} />
    <path d="M128,184v32M88,216h80" />
    <path d="M88,152V128M128,152V104M168,152V80" />
  </g>
);

const filled = (
  <>
    <path
      fillRule="evenodd"
      d="M48,40H208a24,24,0,0,1,24,24V168a24,24,0,0,1-24,24H48a24,24,0,0,1-24-24V64A24,24,0,0,1,48,40ZM88,120a8,8,0,0,1,8,8v24a8,8,0,0,1-16,0V128A8,8,0,0,1,88,120Zm40-24a8,8,0,0,1,8,8v48a8,8,0,0,1-16,0V104A8,8,0,0,1,128,96Zm40-24a8,8,0,0,1,8,8v72a8,8,0,0,1-16,0V80A8,8,0,0,1,168,72Z"
    />
    <path d="M120,192h16v16h32a8,8,0,0,1,0,16H88a8,8,0,0,1,0-16h32Z" />
  </>
);

// Every weight has a drawing (the menu uses regular and fill); the others take the outline.
const weights = new Map<IconWeight, ReactElement>([
  ["thin", outline],
  ["light", outline],
  ["regular", outline],
  ["bold", outline],
  ["duotone", outline],
  ["fill", filled],
]);

export const MonitorChartIcon: Icon = forwardRef<SVGSVGElement, IconProps>((props, ref) => <IconBase ref={ref} {...props} weights={weights} />);
MonitorChartIcon.displayName = "MonitorChartIcon";

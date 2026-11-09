"use client";

import { forwardRef, type ReactElement } from "react";
import { IconBase, type Icon, type IconProps, type IconWeight } from "@phosphor-icons/react";

// A shipping container lifted on a crane's hook (Shipments), which Phosphor's set doesn't have:
// drawn on its 256 grid in its manner, so it sits with the other menu icons. The outline is stroked
// 16 wide like Phosphor's regular weight; the filled one is a solid container with its ribs cut
// out, hanging from the same hook and slings. Five ribs, all as tall and as far apart.

// Where the ribs stand: evenly across the container, 32 apart, centred on it.
const RIB_X = [64, 96, 128, 160, 192];

const STROKE = { fill: "none", stroke: "currentColor", strokeWidth: 16, strokeLinecap: "round", strokeLinejoin: "round" } as const;

// The hook on its cable, and the two slings down to the container's top corners.
const lifting = <path {...STROKE} d="M136,16V44a8,8,0,0,1-16,0M128,56,52,112M128,56l76,56" />;

const outline = (
  <>
    {lifting}
    <g {...STROKE}>
      <rect x={32} y={112} width={192} height={96} rx={8} />
      <path d={RIB_X.map((x) => `M${x},136v48`).join("")} />
    </g>
  </>
);

const filled = (
  <>
    {lifting}
    <path
      fillRule="evenodd"
      d={`M40,104H216a16,16,0,0,1,16,16v80a16,16,0,0,1-16,16H40a16,16,0,0,1-16-16V120A16,16,0,0,1,40,104Z${RIB_X.map(
        (x) => `M${x},128a8,8,0,0,1,8,8v48a8,8,0,0,1-16,0V136A8,8,0,0,1,${x},128Z`,
      ).join("")}`}
    />
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

export const ContainerHookIcon: Icon = forwardRef<SVGSVGElement, IconProps>((props, ref) => <IconBase ref={ref} {...props} weights={weights} />);
ContainerHookIcon.displayName = "ContainerHookIcon";

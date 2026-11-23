import { balanceOf } from "../_lib/balance";
import { hasDoors } from "../_lib/loadStats";
import type { ContainerLoad } from "../_lib/plan";

interface FloorPlanProps {
  load: ContainerLoad;
  /** The Tailwind fill class of a cargo line. */
  fillOf: (lineId: string) => string;
  /** The number a cargo line carries in the cargo table. */
  numberOf: (lineId: string) => number;
}

// The floor of one container seen from above, to scale: the front wall on the left, the doors on
// the right. Every piece standing on the floor carries the number of its cargo line (colour only
// helps), and a stack says how many pieces high it is: "3 ×2". Cargo overhanging a flat rack is
// drawn beyond the frame. The cross marks the middle of the floor, the dot the centre of gravity.
export function FloorPlan({ load, fillOf, numberOf }: FloorPlanProps) {
  const { container, pieces } = load;
  const onFloor = pieces.filter((piece) => piece.y === 0);
  const heightOfStack = (x: number, z: number) => pieces.filter((piece) => piece.x === x && piece.z === z).length;
  const doors = hasDoors(container);

  // The drawing covers the floor and whatever hangs over it, with a margin (wider at the door end, for its label).
  const margin = container.internalL * 0.01;
  const minZ = Math.min(0, ...onFloor.map((p) => p.z)) - margin;
  const maxZ = Math.max(container.internalL, ...onFloor.map((p) => p.z + p.length)) + margin + (doors ? container.internalW * 0.12 : 0);
  const minX = Math.min(0, ...onFloor.map((p) => p.x)) - margin;
  const maxX = Math.max(container.internalW, ...onFloor.map((p) => p.x + p.width)) + margin;

  const balance = balanceOf(pieces, container);
  const mark = container.internalW * 0.06;
  const line = container.internalL * 0.0015;

  return (
    <svg
      viewBox={`${minZ} ${minX} ${maxZ - minZ} ${maxX - minX}`}
      className="block w-full h-auto max-h-[280px]"
      role="img"
      aria-label={`Floor plan of the ${container.name}: ${onFloor.length} places on the floor, ${pieces.length} colli in all${doors ? ", doors on the right" : ""}`}
    >
      <rect x={0} y={0} width={container.internalL} height={container.internalW} strokeWidth={line * 2} className="fill-slate-50 stroke-slate-500" />
      {doors && (
        <>
          {/* The door end: a heavy line and its name, read from below as on a drawing. */}
          <line x1={container.internalL} y1={0} x2={container.internalL} y2={container.internalW} strokeWidth={line * 8} className="stroke-indigo-600" />
          <text
            x={container.internalL + container.internalW * 0.07}
            y={container.internalW / 2}
            fontSize={container.internalW * 0.07}
            textAnchor="middle"
            dominantBaseline="central"
            transform={`rotate(-90 ${container.internalL + container.internalW * 0.07} ${container.internalW / 2})`}
            className="fill-indigo-700 font-bold"
          >
            DOORS
          </text>
        </>
      )}
      {onFloor.map((piece, index) => {
        const high = heightOfStack(piece.x, piece.z);
        const label = `${numberOf(piece.lineId)}${high > 1 ? ` ×${high}` : ""}`;
        return (
          <g key={index}>
            <rect x={piece.z} y={piece.x} width={piece.length} height={piece.width} strokeWidth={line} className={`${fillOf(piece.lineId)} stroke-slate-700`}>
              <title>{`${numberOf(piece.lineId)} · ${piece.name || "Cargo"}${high > 1 ? `, ${high} high` : ""}`}</title>
            </rect>
            <text
              x={piece.z + piece.length / 2}
              y={piece.x + piece.width / 2}
              fontSize={Math.min(piece.width * 0.45, piece.length / (label.length * 0.75), container.internalW * 0.16)}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-slate-900 font-bold pointer-events-none"
            >
              {label}
            </text>
          </g>
        );
      })}
      <path
        d={`M ${container.internalL / 2 - mark} ${container.internalW / 2} h ${mark * 2} M ${container.internalL / 2} ${container.internalW / 2 - mark} v ${mark * 2}`}
        strokeWidth={line * 2}
        className="stroke-slate-900"
      />
      <circle cx={balance.cogZ} cy={balance.cogX} r={mark * 0.45} strokeWidth={line * 2} className={`${balance.ok ? "fill-emerald-600" : "fill-red-600"} stroke-white`} />
    </svg>
  );
}

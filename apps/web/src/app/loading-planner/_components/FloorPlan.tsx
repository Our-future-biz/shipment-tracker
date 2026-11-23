import type { ContainerLoad } from "../_lib/plan";

interface FloorPlanProps {
  load: ContainerLoad;
  /** The Tailwind fill class of a cargo line. */
  fillOf: (lineId: string) => string;
}

// The floor of one container seen from above, to scale: its length runs left to right. Every piece
// standing on the floor is drawn in the colour of its cargo line; a stack shows how many pieces high
// it is. Cargo overhanging a flat rack is drawn beyond the frame. A white cross marks the middle of
// the floor, the dark dot the centre of gravity.
export function FloorPlan({ load, fillOf }: FloorPlanProps) {
  const { container, pieces } = load;
  const onFloor = pieces.filter((piece) => piece.y === 0);
  const heightOfStack = (x: number, z: number) => pieces.filter((piece) => piece.x === x && piece.z === z).length;

  // The drawing covers the floor and whatever hangs over it, with a margin.
  const margin = container.internalL * 0.01;
  const minZ = Math.min(0, ...onFloor.map((p) => p.z)) - margin;
  const maxZ = Math.max(container.internalL, ...onFloor.map((p) => p.z + p.length)) + margin;
  const minX = Math.min(0, ...onFloor.map((p) => p.x)) - margin;
  const maxX = Math.max(container.internalW, ...onFloor.map((p) => p.x + p.width)) + margin;

  const weight = pieces.reduce((total, p) => total + p.weightKg, 0);
  const cogZ = weight > 0 ? pieces.reduce((total, p) => total + (p.z + p.length / 2) * p.weightKg, 0) / weight : container.internalL / 2;
  const cogX = weight > 0 ? pieces.reduce((total, p) => total + (p.x + p.width / 2) * p.weightKg, 0) / weight : container.internalW / 2;
  const mark = container.internalW * 0.06;
  const line = container.internalL * 0.0015;

  return (
    <svg
      viewBox={`${minZ} ${minX} ${maxZ - minZ} ${maxX - minX}`}
      className="block w-full h-auto"
      role="img"
      aria-label={`Floor plan of the ${container.name}: ${onFloor.length} places on the floor`}
    >
      <rect x={0} y={0} width={container.internalL} height={container.internalW} strokeWidth={line * 2} className="fill-slate-50 stroke-slate-400" />
      {onFloor.map((piece, index) => {
        const high = heightOfStack(piece.x, piece.z);
        return (
          <g key={index}>
            <rect x={piece.z} y={piece.x} width={piece.length} height={piece.width} strokeWidth={line} className={`${fillOf(piece.lineId)} stroke-white`}>
              <title>{`${piece.name}${high > 1 ? `, ${high} high` : ""}`}</title>
            </rect>
            {high > 1 && (
              <text
                x={piece.z + piece.length / 2}
                y={piece.x + piece.width / 2}
                fontSize={Math.min(piece.length, piece.width) * 0.45}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-slate-900 font-bold pointer-events-none"
              >
                ×{high}
              </text>
            )}
          </g>
        );
      })}
      <path
        d={`M ${container.internalL / 2 - mark} ${container.internalW / 2} h ${mark * 2} M ${container.internalL / 2} ${container.internalW / 2 - mark} v ${mark * 2}`}
        strokeWidth={line * 2}
        className="stroke-white"
      />
      <circle cx={cogZ} cy={cogX} r={mark * 0.45} strokeWidth={line * 2} className="fill-slate-900 stroke-white" />
    </svg>
  );
}

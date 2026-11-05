// A shipment's Internal Reference: "CZ", the letters of its Freight Mode and Load Type (AIR, FCL,
// LCL, BB, PROJECT, RAIL, ROAD - none while they can't be told) and the company's number, e.g.
// CZFCL00000023. The letters are the server's to set (shipments/lib/jobNumber).
const REFERENCE = /^CZ(?:PROJECT|RAIL|ROAD|AIR|FCL|LCL|BB)?(\d+)$/;

/** Orders references by their number (the order they were made in), whatever their letters; other text after them. */
export function compareJobNumbers(a: string, b: string): number {
  const [x, y] = [REFERENCE.exec(a.trim())?.[1], REFERENCE.exec(b.trim())?.[1]];
  if (x !== undefined && y !== undefined && x !== y) return Number(x) - Number(y);
  if ((x === undefined) !== (y === undefined)) return x === undefined ? 1 : -1;
  return a.localeCompare(b);
}

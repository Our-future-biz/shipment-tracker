// Plain-English formatting shared by the trucking rules and the rate engine (no Encore imports, so
// the pure libraries stay pure).

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-30" → "30 Sep 2026" */
export const formatDay = (ymd: string): string => {
  const [y, m, d] = ymd.split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
};

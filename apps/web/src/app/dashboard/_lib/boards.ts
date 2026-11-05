// The priorities of a notice, each with the tone of its pill (components/Pill.tsx).
export const SEVERITIES = [
  { value: "info", label: "Info", tone: "slate" },
  { value: "warning", label: "Warning", tone: "amber" },
  { value: "critical", label: "Critical", tone: "red" },
] as const;

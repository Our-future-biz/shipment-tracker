import type { NoticeboardViewer } from "@/hooks/useNoticeboard";

export type BoardScope = "company" | "department";

interface Board {
  scope: BoardScope;
  title: string;
  // The reader's own unit on this board (their department name, …); null when unassigned.
  ownTarget: (viewer: NoticeboardViewer) => string | null;
  unassignedText: string;
}

export const BOARDS: Board[] = [
  { scope: "company", title: "Company", ownTarget: () => "", unassignedText: "" },
  {
    scope: "department",
    title: "Department",
    ownTarget: (v) => v.departmentName,
    unassignedText: "You are not assigned to a department yet.",
  },
];

export const SEVERITIES = [
  { value: "info", label: "Info", color: "blue" },
  { value: "warning", label: "Warning", color: "gold" },
  { value: "critical", label: "Critical", color: "red" },
];

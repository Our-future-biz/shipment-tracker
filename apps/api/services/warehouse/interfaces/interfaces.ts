export interface WarehouseTaskItem {
  id: string;
  taskId: string;
  shipmentId: string | null;
  type: string;
  priority: string;
  status: string;
  assignee: string;
  dueDate: string;
  cargo: string;
  weight: string;
  notes: string;
  data: unknown;
  createdAt: string;
}

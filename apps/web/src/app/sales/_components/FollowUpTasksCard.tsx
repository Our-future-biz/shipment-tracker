"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Checkbox, Table, Tag } from "antd";
import { PlusOutlined, DeleteOutlined, EditOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { noteTypeColor } from "@/app/customers/_lib/constants";
import { ConfirmModal } from "@/components/ConfirmModal";
import { DataTableFooter, DEFAULT_PAGE_SIZE } from "@/components/DataTable";
import { EMPTY_CELL } from "@/components/EmptyCell";
import { Pill } from "@/components/Pill";
import { CountChip, PillTabs, SectionCard } from "@/components/SectionCard";
import { useFollowupTasks, type FollowupTask, type TaskAssignee } from "@/hooks/useFollowupTasks";
import { apiErrorMessage, isNotFound } from "@/lib/api";
import type { controllers } from "@/lib/api/client";
import { formatDate } from "@/lib/date";
import { useToast } from "@/lib/toast";
import { businessDay } from "../_lib/salesQuote";
import { CustomerLink } from "./CustomerLink";
import { FollowUpTaskDialog, type TaskFields } from "./FollowUpTaskDialog";
import { QuoteRefLink } from "./QuoteRefLink";

type TaskState = "open" | "done";

const ASSIGNEE_TABS: { key: TaskAssignee; label: string }[] = [
  { key: "me", label: "Mine" },
  { key: "all", label: "Everyone" },
  { key: "none", label: "Unassigned" },
];

const STATE_TABS: { key: TaskState; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "done", label: "Done" },
];

// How an empty list is worded for each choice of whose tasks it shows.
const NO_TASKS_OF: Record<TaskAssignee, string> = { me: "You have no", all: "No", none: "No unassigned" };

// Why the server refused a change of a task, as the end of "Task not saved - …". A task it does
// not find was deleted by a colleague since the list was read.
const taskProblem = (err: unknown) => (isNotFound(err) ? "it no longer exists" : apiErrorMessage(err));

// The link to a customer and the name it goes by: one value in the dialog, two fields of a task.
const CUSTOMER_KEYS: readonly (keyof TaskFields)[] = ["customerId", "customerLabel"];

// What an edit changed of a task. Only that is sent: whatever a colleague changed of the same task
// meanwhile - ticked it off, handed it to somebody - stays as they left it. The customer goes as a
// whole, link and name, when either was changed: a name sent alone would end up above the link a
// colleague has set since, which names another company.
function changesOf(task: FollowupTask, fields: TaskFields): controllers.FollowupTaskUpdateRequest {
  const differs = (key: keyof TaskFields) => fields[key] !== task[key];
  const customerChanged = CUSTOMER_KEYS.some(differs);
  const changed = (Object.keys(fields) as (keyof TaskFields)[]).filter((key) => (CUSTOMER_KEYS.includes(key) ? customerChanged : differs(key)));
  return Object.fromEntries(changed.map((key) => [key, fields[key]]));
}

// The manual follow-up tasks of the company: what somebody has to do - call, write, visit - by
// when, for which customer or quote, and who does it. Everybody sees and may change all of them.
// The open ones are listed completely, the one due soonest first; whether a task is overdue
// follows from its due day, nobody sets it. A list that could not be read is said to be so and
// is never shown as an empty one.
export function FollowUpTasksCard() {
  // Everyone's by default: the tasks carried over from the old shared list belong to nobody yet.
  const [assignee, setAssignee] = useState<TaskAssignee>("all");
  const [state, setState] = useState<TaskState>("open");
  // The open tasks are all here and are cut into pages on screen; the done ones are the server's page.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const { tasks, total, isLoading, isError, reload, createTask, updateTask, deleteTask } = useFollowupTasks({ assignee, state, page, pageSize });
  const toast = useToast();
  // The task the dialog is open for; "new" while one is being added.
  const [editing, setEditing] = useState<FollowupTask | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FollowupTask | null>(null);
  const [deleting, setDeleting] = useState(false);
  // The tasks whose tick is on its way to the server.
  const [ticking, setTicking] = useState<string[]>([]);

  // Tasks leave their list when they are ticked off, opened again or deleted: a page past the end
  // would be an empty table under a list that has rows.
  const lastPage = Math.max(1, Math.ceil((total ?? 0) / pageSize));
  useEffect(() => {
    if (!isLoading && !isError && page > lastPage) setPage(lastPage);
  }, [isLoading, isError, page, lastPage]);
  const shownPage = Math.min(page, lastPage);
  const rows = state === "open" ? tasks.slice((shownPage - 1) * pageSize, shownPage * pageSize) : tasks;

  // The open tasks are all here, so this is the number of the whole list; a done task is never
  // overdue. Not said of a list that could not be read.
  const overdueCount = isError ? 0 : tasks.filter((task) => task.overdue).length;

  // Another list starts from its first page. The pills only hand back one of the keys they were given.
  const showAssignee = (key: TaskAssignee) => {
    setAssignee(key);
    setPage(1);
  };
  const showState = (key: TaskState) => {
    setState(key);
    setPage(1);
  };

  // Resolves with why the server refused, or with null: the dialog shows a refusal.
  const saveTask = async (fields: TaskFields) => {
    try {
      if (editing === "new") {
        await createTask(fields);
        toast.success("Task added");
      } else if (editing) {
        const changes = changesOf(editing, fields);
        // Nothing was changed: there is nothing to ask the server for.
        if (!Object.keys(changes).length) return null;
        await updateTask({ id: editing.id, changes });
        toast.success("Task saved");
      }
      return null;
    } catch (err) {
      return taskProblem(err);
    }
  };

  const setDone = async (task: FollowupTask, done: boolean) => {
    setTicking((ids) => [...ids, task.id]);
    try {
      await updateTask({ id: task.id, changes: { done } });
      toast.success(done ? "Task done" : "Task opened again");
    } catch (err) {
      toast.error(`Task not saved - ${taskProblem(err)}`);
    }
    setTicking((ids) => ids.filter((id) => id !== task.id));
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteTask(deleteTarget.id);
      toast.success("Task deleted");
    } catch (err) {
      toast.error(`Task not deleted - ${taskProblem(err)}`);
    }
    setDeleting(false);
    setDeleteTarget(null);
  };

  const columns: ColumnsType<FollowupTask> = [
    {
      title: "Type",
      dataIndex: "type",
      width: 72,
      // The colours the same words have among a customer's notes.
      render: (v: string) => (
        <Tag color={noteTypeColor(v)} className="!m-0">
          {v}
        </Tag>
      ),
    },
    {
      title: "Customer",
      key: "customer",
      width: 196,
      render: (_: unknown, r) => (
        <>
          {/* Linked to the Customer Database, or only a name somebody typed. A name too long for
              the column is cut; hovering it shows all of it. */}
          <div className="truncate" title={r.customerLabel}>
            <CustomerLink customerId={r.customerId} name={r.customerLabel || (r.customerId ? "Customer" : "")} />
          </div>
          {r.contact && (
            <div className="truncate text-xs text-slate-500" title={r.contact}>
              {r.contact}
            </div>
          )}
        </>
      ),
    },
    {
      title: "Quote",
      dataIndex: "quoteNumber",
      width: 150,
      render: (v: string | null) => (v ? <QuoteRefLink quoteNumber={v} origin={{ from: "followup" }} /> : EMPTY_CELL),
    },
    {
      title: "Due date",
      key: "due",
      width: 172,
      render: (_: unknown, r) =>
        r.dueDate ? (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className={`tabular-nums ${r.overdue ? "font-bold text-red-600" : "text-slate-600"}`}>{formatDate(r.dueDate)}</span>
            {r.overdue && <Pill tone="red">Overdue</Pill>}
          </span>
        ) : (
          EMPTY_CELL
        ),
    },
    {
      title: "Assignee",
      key: "assignee",
      width: 128,
      ellipsis: true,
      // A name is missing for a user who is no longer in the company.
      render: (_: unknown, r) => (r.assigneeUserId ? r.assigneeName || "Unknown user" : <span className="text-slate-500">Unassigned</span>),
    },
    {
      title: "Note",
      dataIndex: "note",
      // A task carried over from the old list keeps a due date nobody could read as a line of its own.
      render: (v: string) => (v ? <div className="whitespace-pre-line text-slate-600 [overflow-wrap:anywhere]">{v}</div> : EMPTY_CELL),
    },
    {
      title: "Done",
      key: "done",
      width: 116,
      render: (_: unknown, r) => {
        const onItsWay = ticking.includes(r.id);
        return (
          <span className="inline-flex items-center gap-2">
            {/* While the tick is on its way the box shows what was asked for. */}
            <Checkbox aria-label="Done" checked={onItsWay ? !r.done : r.done} disabled={onItsWay} onChange={(e) => setDone(r, e.target.checked)} />
            {/* The day it was done, on the company's calendar. */}
            {r.doneAt && <span className="text-xs text-slate-500 tabular-nums">{formatDate(businessDay(new Date(r.doneAt)))}</span>}
          </span>
        );
      },
    },
    {
      title: <span className="sr-only">Actions</span>,
      key: "actions",
      width: 84,
      render: (_: unknown, r) => (
        <div className="flex justify-end gap-1">
          <Button type="text" size="small" aria-label="Edit task" icon={<EditOutlined />} onClick={() => setEditing(r)} />
          <Button type="text" size="small" danger aria-label="Delete task" icon={<DeleteOutlined />} onClick={() => setDeleteTarget(r)} />
        </div>
      ),
    },
  ];

  let emptyText = `${NO_TASKS_OF[assignee]} ${state} tasks`;
  // A list that is still being read is not an empty one, and neither is one that could not be read.
  if (isLoading) emptyText = "Loading tasks…";
  if (isError) emptyText = "Could not load tasks.";

  return (
    <SectionCard
      title="Manual follow-up tasks"
      bodyClassName="p-2"
      extra={
        <>
          {overdueCount > 0 && <span className="text-xs font-semibold text-red-700 whitespace-nowrap">{overdueCount.toLocaleString("en-US")} overdue</span>}
          {/* The number of tasks the list holds in all - not said of a list that could not be read. */}
          {total !== undefined && !isError && <CountChip count={`${total.toLocaleString("en-US")} ${state}`} />}
          {/* Not offered over a list that could not be read: what is already there cannot be seen. */}
          <Button type="primary" size="small" icon={<PlusOutlined />} disabled={isError} onClick={() => setEditing("new")}>
            Add Task
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-3 px-2 pb-3">
        <div role="group" aria-label="Whose tasks">
          <PillTabs tabs={ASSIGNEE_TABS} active={assignee} onChange={showAssignee} />
        </div>
        <span aria-hidden className="w-px h-6 shrink-0 bg-slate-200" />
        <div role="group" aria-label="Open or done">
          <PillTabs tabs={STATE_TABS} active={state} onChange={showState} />
        </div>
      </div>

      {isError && (
        <div className="px-2 pb-3">
          <Alert
            type="error"
            showIcon
            message="Tasks could not be loaded"
            description="What this list shows of them may be missing or out of date - try again."
            action={
              <Button size="small" onClick={() => reload()}>
                Retry
              </Button>
            }
          />
        </div>
      )}

      <Table<FollowupTask>
        size="small"
        // The columns keep their widths and the note takes what is left; below the width the
        // columns need, the table scrolls.
        tableLayout="fixed"
        rowKey="id"
        loading={isLoading}
        dataSource={rows}
        columns={columns}
        scroll={{ x: 1080 }}
        // The bar below pages both lists.
        pagination={false}
        locale={{ emptyText }}
      />

      {/* The pager comes with a list longer than the smallest page: until then all of it is on
          screen. Nothing is counted of a list the server has not answered about. */}
      {total !== undefined && total > DEFAULT_PAGE_SIZE && (
        <DataTableFooter
          className="flex-wrap px-2 pt-3 pb-1"
          page={shownPage}
          pageSize={pageSize}
          total={total}
          onChange={(nextPage, nextPageSize) => {
            setPage(nextPage);
            setPageSize(nextPageSize);
          }}
        />
      )}

      {editing && <FollowUpTaskDialog task={editing === "new" ? null : editing} onSave={saveTask} onClose={() => setEditing(null)} />}

      {deleteTarget && (
        <ConfirmModal
          open
          onClose={() => {
            if (!deleting) setDeleteTarget(null);
          }}
          onConfirm={confirmDelete}
          title="Delete task"
          description={`Delete the follow-up task${deleteTarget.customerLabel ? ` for ${deleteTarget.customerLabel}` : ""}? It disappears for everyone.`}
          confirmLabel="Delete"
          danger
          loading={deleting}
        />
      )}
    </SectionCard>
  );
}

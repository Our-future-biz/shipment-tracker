"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Alert, Button, Dropdown, Form, Input, Select, Tooltip } from "antd";
import type { MenuProps, TableProps } from "antd";
import {
  CloseOutlined,
  DownOutlined,
  DownloadOutlined,
  EyeOutlined,
  FilePdfOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  StarOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { ConfirmModal } from "@/components/ConfirmModal";
import { DataTable } from "@/components/DataTable";
import { PillTabs } from "@/components/SectionCard";
import type { SalesQuoteFilter } from "@/hooks/salesQueryKeys";
import { useDebounced } from "@/hooks/useDebounced";
import { useQuoteFamily } from "@/hooks/useQuoteFamily";
import { useSalesQuoteList } from "@/hooks/useSalesQuoteList";
import { useQuoteShipments } from "@/hooks/useQuoteShipments";
import { QuoteShipmentsContext } from "./QuoteShipmentsCell";
import { useSalesQuotes, type QuoteCall } from "@/hooks/useSalesQuotes";
import { useSalesPref, useCompanyDetails } from "@/hooks/useSalesPrefs";
import { useCurrentExchangeRates, type CurrentExchangeRates } from "@/hooks/useExchangeRates";
import { useUsers } from "@/hooks/useUsers";
import { api, apiErrorMessage } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { asData, exportQuotesCsv, type SalesQuote } from "../_lib/salesQuote";
import type { SettableQuoteStatus } from "../_lib/types";
import type { StoredCompanyDetails } from "../_lib/companyDetails";
import { QUOTE_STATUS_MAP, SETTABLE_QUOTE_STATUSES } from "../_lib/types";
import { printQuote } from "../_lib/printQuote";
import { PRINT_WINDOW_BLOCKED, exportClosesQuote } from "../_lib/exportClose";
import { ExportCloseDialog } from "./ExportCloseDialog";
import { quoteHref } from "../_lib/quoteHref";
import { rememberQuoteListQuery } from "../_lib/quoteListHref";
import {
  BUILTIN_VIEWS,
  EMPTY_FILTERS,
  builtinViewOf,
  filtersToQuery,
  hasFilters,
  listHref,
  readList,
  type Filters,
  type ListState,
  type SavedView,
} from "../_lib/quoteListState";
import { transitionRequest } from "../_lib/statusChange";
import { SALES_PAGES } from "../_lib/tabs";
import { PdfPreviewModal } from "../quote/[ref]/_components/PdfPreviewModal";
import { ExchangeRatesError } from "./ExchangeRatesError";
import { NewQuoteDialog } from "./NewQuoteDialog";
import { QuoteColumnPicker } from "./QuoteColumnPicker";
import { QuoteListFilters } from "./QuoteListFilters";
import { DraggableHeaderCell } from "@/components/DraggableHeaderCell";
import { QuotesLoadError } from "./QuotesLoadError";
import { SalesDialog } from "./SalesDialog";
import { SalesPage } from "./SalesPage";
import { ToolbarButton, toolbarButtonClass } from "./ToolbarButton";
import { DEFAULT_QUOTE_COLUMNS, QUOTE_COLUMNS, ValidityDot, quoteCsvColumns, shownColumns, type SortDirection } from "./quoteListColumns";
import { QuoteChatButton, QuoteChatDrawer, quoteThreadOf, useQuoteChatUnread } from "./QuoteChat";

interface ExportPdfButtonProps {
  quote: SalesQuote;
  onExport: (quote: SalesQuote) => void;
}

// The row's PDF action: as on the quote's page, it closes a quote that has not gone out yet
// (`onExport` asks first). A document that cannot be produced is not; the reason is shown instead.
function ExportPdfButton({ quote, onExport }: ExportPdfButtonProps) {
  return (
    <Button size="small" type="text" icon={<FilePdfOutlined />} title="Export PDF" aria-label={`Export PDF of ${quote.quoteNumber}`} onClick={() => onExport(quote)} />
  );
}

// The quotes a bulk action left as they were, each with the server's reason.
type BulkFailure = { quoteNumber: string; reason: string }[];

// The quotes a bulk change of status is being confirmed for: the ones ticked when the status was
// chosen, each with the status its row showed then.
interface StatusTarget {
  status: SettableQuoteStatus;
  quotes: { quoteNumber: string; status: string }[];
}

const countOf = (quotes: number) => (quotes === 1 ? "1 quote" : `${quotes.toLocaleString("en-US")} quotes`);

// The form the list's two stored preferences have to be used at all. They are the whole
// company's, stored by whatever version of the list wrote them last: a value of another form
// counts as none stored - drawn as a list, it would crash the screen for everybody.
const isColumnSet = (stored: unknown): stored is string[] => Array.isArray(stored) && stored.every((key) => typeof key === "string");
const isSavedViews = (stored: unknown): stored is SavedView[] =>
  Array.isArray(stored) && stored.every((view) => !!view && typeof view === "object" && typeof view.id === "string" && typeof view.label === "string");

// One list for "no saved views": a new one with every render would be a new value each time.
const NO_SAVED_VIEWS: SavedView[] = [];

// A change of the columns is stored once the changes have paused for this long.
const COLUMNS_SAVE_DELAY_MS = 800;

// The columns of the list: the company's stored set and, over it, what was changed here and is
// not stored yet. A change shows at once and is stored when the changes pause, as one set - so
// two quick ticks add up, where each stored on its own from the set the server last confirmed
// would lose the first. Nothing can be changed before the stored set is known.
function useQuoteColumns() {
  const { value: stored, status, reload, setValue } = useSalesPref<string[]>("qh_cols", DEFAULT_QUOTE_COLUMNS, { guard: isColumnSet });
  const toast = useToast();
  const [changed, setChanged] = useState<string[] | null>(null);

  const store = async (keys: string[]) => {
    try {
      await setValue(keys);
    } catch (err) {
      // The list keeps showing the set that was asked for; the next change stores it again.
      toast.error(`Columns not saved - ${apiErrorMessage(err)}`);
      return;
    }
    // Stored: the list follows what is stored again - unless the columns were changed once more meanwhile.
    setChanged((now) => (now === keys ? null : now));
  };

  // The change that waits for its pause to end, and the way to store it as of the latest render.
  const session = useRef({ waiting: null as { keys: string[]; timer: ReturnType<typeof setTimeout> } | null, store });
  useEffect(() => {
    session.current.store = store;
  });

  // Leaving the list while a change still waits: it is stored now, not dropped with its timer.
  useEffect(() => {
    const s = session.current;
    return () => {
      if (!s.waiting) return;
      clearTimeout(s.waiting.timer);
      s.store(s.waiting.keys);
      s.waiting = null;
    };
  }, []);

  const change = (keys: string[]) => {
    if (status !== "ready") return;
    const s = session.current;
    if (s.waiting) clearTimeout(s.waiting.timer);
    setChanged(keys);
    s.waiting = {
      keys,
      timer: setTimeout(() => {
        s.waiting = null;
        s.store(keys);
      }, COLUMNS_SAVE_DELAY_MS),
    };
  };

  const keys = useMemo(() => shownColumns(changed ?? stored), [changed, stored]);
  return { keys, status, reload, change };
}

const statusLabel = (status: string) => QUOTE_STATUS_MAP[status]?.label ?? status;

const VIEW_PILLS = BUILTIN_VIEWS.map((view) => ({ key: view.id, label: view.label }));

const SEARCH_TIPS = (
  <div className="space-y-1.5 text-xs max-w-64">
    <div className="font-semibold">Search tips</div>
    <div>• Partial words work — “shang” finds Shanghai.</div>
    <div>• Accents and capitals do not matter — “skoda” finds Škoda.</div>
    <div>• Combine up to five keywords — “air export fca” matches quotes containing all of them.</div>
    <div className="text-slate-400">
      Searches reference, customer, status, freight mode, direction, origin, destination, commodity, incoterm, sales owner and job number - in all quotes, not
      only the ones on this page.
    </div>
  </div>
);

// The Quotes list: every sales quote of the company, searched, filtered, sorted and paged by the
// server. It renders the page frame itself, because the built-in views beside the title need the
// list's state.
export function QuotesList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { runOnQuotes, isRunningOnQuotes } = useSalesQuotes();
  // Both are the whole company's. Until one is known ("ready") the list works with its fallback -
  // the columns every list starts with, no saved views - and offers nothing that would store it.
  const columnSet = useQuoteColumns();
  const views = useSalesPref<SavedView[]>("saved_views", NO_SAVED_VIEWS, { guard: isSavedViews });
  const savedViews = views.value;
  const exchange = useCurrentExchangeRates();
  const company = useCompanyDetails();
  const { users } = useUsers();
  const toast = useToast();

  const visibleKeys = columnSet.keys;
  const columnsKnown = columnSet.status === "ready";

  const list = useMemo(() => readList(searchParams), [searchParams]);
  const { filters, page, pageSize } = list;
  // The column the list is sorted by, if the address names one the server can sort by.
  const sortedBy = QUOTE_COLUMNS.find((c) => c.sortBy && c.sortBy === list.sort.replace(/^-/, ""));
  const sortDirection: SortDirection = list.sort.startsWith("-") ? "descend" : "ascend";

  // Lets the quote page's back link return to this list with its search, filters, sort and page.
  useEffect(() => {
    rememberQuoteListQuery(searchParams.toString());
  }, [searchParams]);

  const [newOpen, setNewOpen] = useState(false);
  // An address that asks for a new quote (?new=1; the old "Create new quote" page leads here with
  // it) opens the dialog and stops asking at once: reloading the list, or coming back to it from
  // the quote, must not open the dialog again.
  const asksForNew = searchParams.get("new") === "1";
  useEffect(() => {
    if (!asksForNew) return;
    setNewOpen(true);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("new");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [asksForNew, searchParams, pathname, router]);

  // The box shows each keystroke at once; the request waits until typing pauses.
  const [search, setSearch] = useState(list.search);
  // The last ?q= this box wrote. URL updates land after the keystrokes that caused them, so only a
  // change from elsewhere (Back, a link) may overwrite the box — never the echo of an older keystroke.
  const writtenQuery = useRef(list.search);
  useEffect(() => {
    if (list.search === writtenQuery.current) return;
    writtenQuery.current = list.search;
    setSearch(list.search);
  }, [list.search]);
  const debouncedSearch = useDebounced(list.search, 300).trim();
  // The address names a new search at once, the request learns it when typing pauses. Until both
  // name the same text nothing is asked: whatever changed in the same step as the search - the
  // page going back to the first, the filters of a view - would be asked for with the old search.
  const settled = debouncedSearch === list.search.trim();

  const [preview, setPreview] = useState<SalesQuote | null>(null);
  // The quote whose chat is open (a side drawer, as on the Shipments list), and the unread badges.
  const [chatQuote, setChatQuote] = useState<string | null>(null);
  const unreadByThread = useQuoteChatUnread();
  // ?chat=<Sales Reference> (from a notification under the bell) opens that quote's chat, then
  // drops out of the URL so the drawer can be closed and the same link used again.
  const chatParam = searchParams.get("chat");
  useEffect(() => {
    if (!chatParam) return;
    setChatQuote(chatParam);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("chat");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [chatParam, searchParams, pathname, router]);
  // The quote whose Export PDF is being confirmed, since it closes the quote.
  const [exportTarget, setExportTarget] = useState<SalesQuote | null>(null);
  // The row's Export PDF reaches the handler of the current render through this, so the columns
  // need not be rebuilt for it.
  const exportQuoteRef = useRef<(quote: SalesQuote) => void>(() => {});
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  // What the last bulk action could not do; null when it did all of it.
  const [bulkFailed, setBulkFailed] = useState<BulkFailure | null>(null);
  // The Saved views menu is closed from here when its cross opens a confirmation over it.
  const [viewsMenuOpen, setViewsMenuOpen] = useState(false);
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  // A view is on its way to the server, or is being deleted there: its dialog waits for the answer.
  const [savingView, setSavingView] = useState(false);
  // The saved view whose deletion is being confirmed.
  const [viewToDelete, setViewToDelete] = useState<SavedView | null>(null);
  // The "Assign owner" dialog of the bulk actions, and the user chosen in it.
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignee, setAssignee] = useState<string>();
  // The status change that is being confirmed, for the quotes ticked when it was chosen.
  const [statusTarget, setStatusTarget] = useState<StatusTarget | null>(null);

  // Which quotes the list holds, and which part of them is on screen in which order.
  const matching = useMemo<SalesQuoteFilter>(() => ({ ...filtersToQuery(filters), search: debouncedSearch || undefined }), [filters, debouncedSearch]);
  const request = useMemo(
    () => ({
      ...matching,
      sortBy: sortedBy?.sortBy,
      sortDirection: sortedBy ? (sortDirection === "ascend" ? ("asc" as const) : ("desc" as const)) : undefined,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
    [matching, sortedBy, sortDirection, page, pageSize],
  );
  const { quotes, total, isLoading: isReading, isError, reload } = useSalesQuoteList(request, { enabled: settled });
  // How many shipments each quote on the page has, asked for the page at once - only while the
  // Shipment(s) column is shown.
  const pageReferences = useMemo(() => quotes.map((q) => q.quoteNumber), [quotes]);
  const { byReference: shipmentsByQuote } = useQuoteShipments(visibleKeys.includes("shipment") ? pageReferences : []);
  // The rows on screen are not yet the ones the address names: they are being read, or the search
  // is still being typed.
  const isLoading = !settled || isReading;
  // The variants of the quote being previewed, for the preview's tabs.
  const variants = useQuoteFamily(preview?.quoteNumber ?? null);

  // Shows the list in another state. Another search, filter, sort or page size starts again from
  // the first page; only paging itself names a page.
  const show = (patch: Partial<ListState>) => {
    if (patch.search !== undefined) {
      setSearch(patch.search);
      writtenQuery.current = patch.search;
    }
    router.replace(listHref(pathname, searchParams, { ...list, search, page: 1, ...patch }), { scroll: false });
  };
  const setFilters = (patch: Partial<Filters>) => show({ filters: { ...filters, ...patch } });

  // A page past the end - quotes left the filter or were deleted, or the address is an old one -
  // would be an empty table under a list that has rows: the last page there is is shown instead.
  const lastPage = Math.max(1, Math.ceil((total ?? 0) / pageSize));
  useEffect(() => {
    if (isLoading || isError || page <= lastPage) return;
    router.replace(listHref(pathname, searchParams, { ...list, page: lastPage }), { scroll: false });
  }, [isLoading, isError, page, lastPage, list, pathname, searchParams, router]);

  // Ticks belong to the rows on screen. Another page, filter, search or sort shows other rows, and
  // a bulk action must never reach a quote nobody is looking at any more.
  const view = JSON.stringify(request);
  useEffect(() => {
    setSelectedKeys([]);
  }, [view]);
  // What is acted on is what is ticked AND on screen - also when a ticked quote left the list
  // because a colleague changed it meanwhile.
  const selected = useMemo(() => quotes.filter((q) => selectedKeys.includes(q.quoteNumber)), [quotes, selectedKeys]);

  // Sorting is the server's, over all quotes: the header only shows the arrows and reports the click.
  const handleTableChange: NonNullable<TableProps<SalesQuote>["onChange"]> = (_pagination, _filters, sorter) => {
    const active = Array.isArray(sorter) ? sorter[0] : sorter;
    const column = QUOTE_COLUMNS.find((c) => c.key === active?.columnKey);
    show({ sort: column?.sortBy && active?.order ? `${active.order === "descend" ? "-" : ""}${column.sortBy}` : "" });
  };

  const columns: ColumnsType<SalesQuote> = useMemo(() => {
    const cols = visibleKeys.flatMap((key): ColumnsType<SalesQuote> => {
      const c = QUOTE_COLUMNS.find((column) => column.key === key);
      if (!c) return [];
      return [
        {
          // A heading that can be sorted by has the arrows at its right end; as much room at its
          // left keeps the words in the middle of the column, over the values. The words stay on
          // one line: a column too narrow for that widens.
          title: c.sortBy ? <span className="pl-4 whitespace-nowrap">{c.header ?? c.title}</span> : (c.header ?? c.title),
          key: c.key,
          width: c.width,
          // Every value sits in the middle of its column, under a heading that does the same.
          align: "center",
          ...(c.sortBy
            ? {
                sorter: true,
                sortOrder: sortedBy?.key === c.key ? sortDirection : null,
                sortDirections: c.firstSort === "descend" ? (["descend", "ascend"] satisfies SortDirection[]) : (["ascend", "descend"] satisfies SortDirection[]),
              }
            : {}),
          // A heading can be dragged once the stored columns are known: only a cell with an id is draggable.
          onHeaderCell: () => (columnsKnown ? { id: c.key } : {}) as React.HTMLAttributes<HTMLTableCellElement>,
          render: (_: unknown, record: SalesQuote) => c.render(record, exchange),
        },
      ];
    });
    // Validity at a glance, before everything else; not one of the columns that can be hidden or moved.
    cols.unshift({
      title: <span role="img" aria-label="Validity" title="Validity" className="inline-block w-2.5 h-2.5 rounded-full bg-slate-300" />,
      key: "validityDot",
      width: 36,
      align: "center",
      render: (_: unknown, record: SalesQuote) => <ValidityDot quote={record} />,
    });
    // What is done with one quote without opening it. Opening is the reference and the row itself;
    // deleting is a bulk action, so that no row carries a bin next to its everyday buttons.
    cols.push({
      title: <span className="sr-only">Actions</span>,
      key: "action",
      width: 112,
      fixed: "right",
      render: (_: unknown, record: SalesQuote) => (
        <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
          {/* The quote's chat; a revision opens its original's thread. */}
          <QuoteChatButton quoteNumber={record.quoteNumber} unread={unreadByThread.get(quoteThreadOf(record.quoteNumber)) ?? 0} onOpen={() => setChatQuote(record.quoteNumber)} />
          <Button
            size="small"
            type="text"
            icon={<EyeOutlined />}
            title="Preview PDF"
            aria-label={`Preview PDF of ${record.quoteNumber}`}
            onClick={() => setPreview(record)}
          />
          <ExportPdfButton quote={record} onExport={(quote) => exportQuoteRef.current(quote)} />
        </div>
      ),
    });
    return cols;
  }, [visibleKeys, columnsKnown, sortedBy, sortDirection, exchange, company, unreadByThread]);

  // CSV respects the visible columns and their order.
  const csvColumns = () => quoteCsvColumns(visibleKeys, exchange);

  // Drag-to-reorder columns (same interaction as the shipments table).
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const oldIndex = visibleKeys.indexOf(String(active.id));
    const newIndex = visibleKeys.indexOf(String(over.id));
    if (oldIndex !== -1 && newIndex !== -1) columnSet.change(arrayMove(visibleKeys, oldIndex, newIndex));
  };

  // What a bulk action leaves behind. The quotes it could not change are listed with the
  // server's reasons and stay ticked, so the action can be repeated on exactly those.
  const reportFailed = (failed: BulkFailure) => {
    setBulkFailed(failed.length ? failed : null);
    setSelectedKeys(failed.map((f) => f.quoteNumber));
  };

  // A bulk action on quotes. Each quote is changed by the server, through the endpoint its own
  // page uses, so the same rules hold here. The result is reported as it is: how many quotes were
  // really changed, how many already were what the action makes them, and which the server
  // refused and why.
  const runAndReport = async (quoteNumbers: string[], call: QuoteCall, label: string) => {
    const { changed, unchanged, failed } = await runOnQuotes({ quoteNumbers, call });
    if (changed) {
      toast.success(`${label} ${countOf(changed)}${unchanged ? `, ${unchanged} already had it` : ""}`);
    } else if (unchanged) {
      // Nothing written is an answer too: without one the action would look as if it did not run.
      toast.info(`${countOf(unchanged)} already had it - nothing changed`);
    }
    reportFailed(failed);
  };
  // The owner is one of the company's users, chosen in the dialog. Whether the signed-in user may
  // reassign a quote is the server's call, quote by quote.
  const bulkAssignOwner = async () => {
    if (!assignee) return;
    setAssignOpen(false);
    await runAndReport(
      selected.map((q) => q.quoteNumber),
      (quoteNumber) => api.quotes.salesQuoteOwner(quoteNumber, { ownerUserId: assignee }),
      "Assigned the owner of",
    );
  };
  // Changes the status of the quotes the confirmation named - the ones ticked when the status was
  // chosen, whatever the list shows by now. The same request as on the quote page, so a quote
  // changed here gets its sent or decision date and a history line too, and a move its status
  // does not allow is refused. Each quote is changed from the status its row showed then -
  // Expired for a lapsed quote, as the server counts it - so one a colleague has moved meanwhile
  // is refused ("the quote is now Draft") rather than moved on from a status nobody here saw.
  const bulkStatus = async () => {
    if (!statusTarget) return;
    const { status, quotes: confirmed } = statusTarget;
    const request = transitionRequest({ status });
    const shown = new Map(confirmed.map((q) => [q.quoteNumber, q.status]));
    await runAndReport(
      confirmed.map((q) => q.quoteNumber),
      (quoteNumber) => api.quotes.salesQuoteTransition(quoteNumber, { ...request, expectedStatus: shown.get(quoteNumber) }),
      `Set ${statusLabel(status)} on`,
    );
    setStatusTarget(null);
  };
  const isBulkRunning = isRunningOnQuotes;

  // Export PDF: a quote that went out is printed as it is; one that has not is closed first -
  // marked as sent (Quoted) through the same request as on its page, after the user confirms.
  const printNow = (quote: SalesQuote, target?: Window | null) => {
    const blocked = printQuote(quote.quoteNumber, quote.data, exchange, company, target);
    if (blocked) toast.error(`${quote.quoteNumber}: ${blocked}`);
  };
  const exportQuote = (quote: SalesQuote) => {
    if (exportClosesQuote(quote.storedStatus)) setExportTarget(quote);
    else printNow(quote);
  };
  exportQuoteRef.current = exportQuote;
  // The print window is opened on the click itself - after the server's answer the browser would
  // take it for a pop-up - and gets the quote as the server stored it when it was sent. A window
  // that does not open closes nothing: the user allows pop-ups and tries again.
  const exportAndClose = async (validityDays?: number) => {
    if (!exportTarget) return;
    const quote = exportTarget;
    const target = window.open("", "_blank");
    if (!target) {
      toast.error(PRINT_WINDOW_BLOCKED);
      return;
    }
    setExportTarget(null);
    const answers: SalesQuote["data"][] = [];
    const { failed } = await runOnQuotes({
      quoteNumbers: [quote.quoteNumber],
      call: async (quoteNumber) => {
        const answer = await api.quotes.salesQuoteTransition(quoteNumber, { ...transitionRequest({ status: "quoted", validityDays }), expectedStatus: quote.status });
        answers.push(asData(answer.quote.data));
        return answer;
      },
    });
    const stored = answers[0];
    const refused = failed[0]?.reason;
    if (refused !== undefined || stored === undefined) {
      target.close();
      toast.error(`${quote.quoteNumber}: ${refused ?? "not closed"}`);
      return;
    }
    toast.success(`${quote.quoteNumber} closed and marked as sent`);
    printNow({ ...quote, data: stored }, target);
  };

  const bulkExport = () => exportQuotesCsv(selected, csvColumns());

  // A built-in view is its filters and nothing else: text left in the search box would narrow it
  // to something its name does not say.
  const applyBuiltin = (id: string) => {
    const v = BUILTIN_VIEWS.find((b) => b.id === id);
    if (v) show({ filters: v.apply(), search: "" });
  };
  // Only a view's name is known to be there (isSavedViews): what it filters by may be from
  // another version of the list, so its statuses are taken only as the list they should be. The
  // rest is checked where every address is (readList).
  const applySaved = (id: string) => {
    const v = savedViews.find((s) => s.id === id);
    if (!v) return;
    const statuses = Array.isArray(v.filters?.statuses) ? v.filters.statuses.filter((status) => typeof status === "string") : [];
    show({ filters: { ...EMPTY_FILTERS, ...v.filters, statuses }, search: typeof v.search === "string" ? v.search : "" });
  };
  const openSaveView = () => {
    setNewViewName("");
    setSaveViewOpen(true);
  };
  // The views are everybody's list: the new one is added to the list as it is stored now, not to
  // the copy this page read when it opened, which may lack what colleagues saved since. "View
  // saved" is said once the server has it.
  const saveCurrentView = async () => {
    const label = newViewName.trim();
    // Enter in the name field comes here as well, also while a first press is still being answered.
    if (!label || savingView) return;
    const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    const view: SavedView = { id, label, search, filters };
    setSavingView(true);
    try {
      await views.update((stored) => [...stored, view]);
      setSaveViewOpen(false);
      toast.success("View saved");
    } catch (err) {
      toast.error(`Not saved - ${apiErrorMessage(err)}`);
    }
    setSavingView(false);
  };
  // Deletes the view the confirmation named, for everybody - out of the list as it is stored now.
  const deleteSavedView = async () => {
    if (!viewToDelete || savingView) return;
    const { id } = viewToDelete;
    setSavingView(true);
    try {
      await views.update((stored) => stored.filter((view) => view.id !== id));
      toast.success("View deleted");
    } catch (err) {
      toast.error(`Not deleted - ${apiErrorMessage(err)}`);
    }
    setSavingView(false);
    setViewToDelete(null);
  };

  let emptyText = hasFilters(filters) || debouncedSearch ? "No quotes match the search and filters." : "No quotes yet - create the first one with New Quote.";
  // A list that is still being read is not an empty one, and neither is one that could not be read.
  if (isLoading) emptyText = "Loading quotes…";
  if (isError) emptyText = "Could not load quotes.";

  // Named as Sales names a user everywhere (apps/api/services/quotes/services/userNames.ts).
  const userOptions = users.map((u) => ({ value: u.id, label: u.displayName || u.email }));

  // The views the company saved, each with the cross that deletes it, and the way to save the
  // list as it is now. The built-in views are the pills beside the title. While the saved views
  // are not known - still being read, or the read failed - the menu says so instead of "none
  // yet", and saving is off: a view saved then could not be added to the ones that are stored.
  const viewsKnown = views.status === "ready";
  let viewRows: NonNullable<MenuProps["items"]> = [{ key: "none", disabled: true, label: "No saved views yet" }];
  if (views.status === "loading") viewRows = [{ key: "none", disabled: true, label: "Loading saved views…" }];
  if (views.status === "error") {
    viewRows = [
      { key: "none", disabled: true, label: "Saved views could not be loaded" },
      { key: "retry", icon: <ReloadOutlined />, label: "Retry" },
    ];
  }
  if (viewsKnown && savedViews.length) {
    viewRows = savedViews.map((v) => ({
      key: `view:${v.id}`,
      label: (
        <span className="flex items-center justify-between gap-3 min-w-40">
          <span className="truncate max-w-56">{v.label}</span>
          <button
            type="button"
            aria-label={`Delete saved view ${v.label}`}
            title="Delete this view"
            onClick={(e) => {
              // A click on the cross asks whether to delete the view; it must not apply it as well.
              e.stopPropagation();
              setViewsMenuOpen(false);
              setViewToDelete(v);
            }}
            className="shrink-0 flex items-center justify-center w-5 h-5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 bg-transparent border-none cursor-pointer"
          >
            <CloseOutlined className="text-[10px]" />
          </button>
        </span>
      ),
    }));
  }
  const savedViewItems: MenuProps["items"] = [
    ...viewRows,
    { type: "divider" as const },
    { key: "save", icon: <PlusOutlined />, label: "Save view…", disabled: !viewsKnown },
  ];
  const onViewsMenu = (key: string) => {
    if (key === "save") openSaveView();
    else if (key === "retry") views.reload();
    else applySaved(key.slice("view:".length));
  };

  const bulkItems: MenuProps["items"] = [
    {
      key: "owner",
      label: "Assign owner…",
      onClick: () => {
        setAssignee(undefined);
        setAssignOpen(true);
      },
    },
    { type: "divider" as const },
    // Expired is not offered: a quote expires by its validity date, nobody sets it. Nor is Revised:
    // a revision is a new quote, made from the quote's own page. A status is asked about before it
    // is set - one click would change every ticked quote, and Won for good.
    ...SETTABLE_QUOTE_STATUSES.filter((key) => key !== "revised").map((key) => ({
      key: `st:${key}`,
      label: `Set status: ${statusLabel(key)}`,
      onClick: () => setStatusTarget({ status: key, quotes: selected.map((q) => ({ quoteNumber: q.quoteNumber, status: q.status })) }),
    })),
  ];

  const failedStillSelected = !!bulkFailed && bulkFailed.every((f) => selected.some((q) => q.quoteNumber === f.quoteNumber));
  const ticked = selected.length;

  return (
    <SalesPage
      title={SALES_PAGES.quotes.label}
      extra={
        <div role="group" aria-label="Built-in views">
          <PillTabs tabs={VIEW_PILLS} active={builtinViewOf(filters) ?? ""} onChange={applyBuiltin} />
        </div>
      }
    >
      {/* Toolbar: actions on the left, finding things on the right - search, saved views, the filters behind one button, the columns. */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <ToolbarButton variant="primary" icon={<PlusOutlined />} onClick={() => setNewOpen(true)}>
            New Quote
          </ToolbarButton>
        </div>
        <div className="flex flex-wrap items-center gap-3 ml-auto">
          {/* antd gives the input width: 100% outside Tailwind's cascade layers, where a plain
              w-60 cannot override it — hence the important flag. */}
          <Tooltip title={SEARCH_TIPS} trigger="focus" placement="bottomLeft" color="white" classNames={{ body: "!text-slate-700" }}>
            <Input
              placeholder="Search quotes…"
              aria-label="Search quotes"
              prefix={<SearchOutlined className="text-slate-400" />}
              value={search}
              onChange={(e: ChangeEvent<HTMLInputElement>) => show({ search: e.target.value })}
              allowClear
              className="!w-60"
            />
          </Tooltip>
          <div className="w-px h-6 bg-slate-200 shrink-0" />
          <Dropdown
            trigger={["click"]}
            open={viewsMenuOpen}
            onOpenChange={setViewsMenuOpen}
            menu={{ items: savedViewItems, onClick: ({ key }) => onViewsMenu(key) }}
          >
            <button type="button" className={toolbarButtonClass()}>
              <StarOutlined />
              Saved views
              <DownOutlined className="text-[10px] !text-slate-500" />
            </button>
          </Dropdown>
          <QuoteListFilters filters={filters} onChange={setFilters} onClear={() => show({ filters: EMPTY_FILTERS })} userOptions={userOptions} />
          <QuoteColumnPicker visible={visibleKeys} onChange={columnSet.change} status={columnSet.status} onRetry={() => columnSet.reload()} />
        </div>
      </div>

      {/* The selection bar is there only while rows are ticked: what can be done with several
          quotes at once - their owner, their status, a CSV of just those. A quote is deleted on
          its own page, never from the list. */}
      {ticked > 0 && (
        <div role="region" aria-label="Bulk actions" className="flex flex-wrap items-center gap-2 rounded-2xl border px-4 py-2.5 bg-indigo-50 border-indigo-200">
          <span className="text-sm font-medium mr-1 tabular-nums text-indigo-700">{ticked} selected</span>
          {/* Closed while a bulk action runs: a second one would race the first for the same quotes. */}
          <Dropdown trigger={["click"]} disabled={isBulkRunning} menu={{ items: bulkItems }}>
            <Button size="small" loading={isBulkRunning} icon={<DownOutlined />} iconPosition="end">
              Actions
            </Button>
          </Dropdown>
          <Button size="small" icon={<DownloadOutlined />} onClick={bulkExport}>
            Export CSV
          </Button>
          <Button size="small" type="text" onClick={() => setSelectedKeys([])}>
            Clear
          </Button>
        </div>
      )}

      {/* Stays until dismissed or the next bulk action - a toast would be gone before the list is read.
          One line per reason, so thirty quotes that failed for the same reason are one sentence. */}
      {bulkFailed && (
        <Alert
          type="error"
          showIcon
          closable
          onClose={() => setBulkFailed(null)}
          message={`${countOf(bulkFailed.length)} ${bulkFailed.length === 1 ? "was" : "were"} not changed${
            failedStillSelected ? ` and ${bulkFailed.length === 1 ? "is" : "are"} still selected` : ""
          }`}
          description={[...new Set(bulkFailed.map((f) => f.reason))].map((reason) => (
            <div key={reason}>
              <span className="font-mono text-xs">
                {bulkFailed.filter((f) => f.reason === reason).map((f) => f.quoteNumber).join(", ")}
              </span>{" "}
              - {reason}
            </div>
          ))}
        />
      )}

      <ExchangeRatesError exchange={exchange} />
      {isError && <QuotesLoadError onRetry={() => reload()} />}

      <QuoteShipmentsContext.Provider value={shipmentsByQuote}>
        <div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={visibleKeys} strategy={horizontalListSortingStrategy}>
              <DataTable<SalesQuote>
                dataSource={quotes}
                columns={columns}
                rowKey="quoteNumber"
                loading={isLoading || exchange.isLoading}
                scroll={{ x: "max-content" }}
                components={{ header: { cell: DraggableHeaderCell } }}
                // The rows are the server's page; the total is the number of quotes the search and filters find.
                server={{ total, page, pageSize, onChange: (nextPage, nextPageSize) => show({ page: nextPage, pageSize: nextPageSize }) }}
                onChange={handleTableChange}
                locale={{ emptyText }}
                rowSelection={{ selectedRowKeys: selectedKeys, onChange: setSelectedKeys, columnWidth: 40 }}
                onRow={(record) => ({
                  onClick: () => router.push(quoteHref(record.quoteNumber)),
                  className: "cursor-pointer",
                })}
              />
            </SortableContext>
          </DndContext>
        </div>
      </QuoteShipmentsContext.Provider>

      <NewQuoteDialog open={newOpen} onClose={() => setNewOpen(false)} />

      <SalesDialog
        open={saveViewOpen}
        onClose={() => setSaveViewOpen(false)}
        busy={savingView}
        title="Save current view"
        footer={
          <>
            <Button disabled={savingView} onClick={() => setSaveViewOpen(false)}>
              Cancel
            </Button>
            <Button type="primary" disabled={!newViewName.trim()} loading={savingView} onClick={saveCurrentView}>
              Save
            </Button>
          </>
        }
      >
        <Form layout="vertical" disabled={savingView}>
          <Form.Item label="View name" extra="Keeps the search and the filters as they are now, for everybody in the company." className="!mb-0">
            <Input
              aria-label="View name"
              value={newViewName}
              onChange={(e) => setNewViewName(e.target.value)}
              onPressEnter={saveCurrentView}
              placeholder="e.g. Hot leads"
            />
          </Form.Item>
        </Form>
      </SalesDialog>

      <SalesDialog
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title={`Assign owner of ${countOf(ticked)}`}
        footer={
          <>
            <Button onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button type="primary" disabled={!assignee} onClick={bulkAssignOwner}>
              Assign
            </Button>
          </>
        }
      >
        <Form layout="vertical">
          <Form.Item label="Sales owner" className="!mb-0">
            <Select
              showSearch
              className="w-full"
              placeholder="Select a user"
              aria-label="Sales owner"
              optionFilterProp="label"
              value={assignee}
              onChange={setAssignee}
              options={userOptions}
            />
          </Form.Item>
        </Form>
      </SalesDialog>

      {/* A saved view is everybody's: its cross asks before it is gone for all of them. */}
      {viewToDelete && (
        <ConfirmModal
          open
          onClose={() => {
            if (!savingView) setViewToDelete(null);
          }}
          onConfirm={deleteSavedView}
          title="Delete saved view"
          description={`Delete the saved view ${viewToDelete.label} for everybody in the company?`}
          confirmLabel="Delete"
          danger
          loading={savingView}
        />
      )}

      {/* Asked once for all of them, as for Delete. It waits for the server while the quotes are changed. */}
      {statusTarget && (
        <ConfirmModal
          open
          onClose={() => {
            if (!isRunningOnQuotes) setStatusTarget(null);
          }}
          onConfirm={bulkStatus}
          title={`Set ${statusLabel(statusTarget.status)} on ${countOf(statusTarget.quotes.length)}?`}
          description={`${statusTarget.status === "won" ? "Won cannot be changed afterwards. " : ""}A quote whose status does not allow the change stays as it is, and is listed with the reason.`}
          confirmLabel={`Set ${statusLabel(statusTarget.status)}`}
          danger={statusTarget.status === "won"}
          loading={isRunningOnQuotes}
        />
      )}

      {exportTarget && (
        <ExportCloseDialog
          quoteNumber={exportTarget.quoteNumber}
          validUntil={exportTarget.validUntil}
          validityDays={exportTarget.data.validityDays}
          onConfirm={exportAndClose}
          onClose={() => setExportTarget(null)}
        />
      )}
      {preview && (
        <PdfPreviewModal
          open
          quoteNumber={preview.quoteNumber}
          data={preview.data}
          family={variants.family}
          familyError={variants.isError ? { onRetry: () => variants.reload() } : undefined}
          onExport={() => {
            const quote = preview;
            setPreview(null);
            exportQuote(quote);
          }}
          onClose={() => setPreview(null)}
        />
      )}
      <QuoteChatDrawer quoteNumber={chatQuote} onClose={() => setChatQuote(null)} />
    </SalesPage>
  );
}

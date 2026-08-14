import {
  Activity,
  Bell,
  Briefcase,
  Building2,
  ChartColumn,
  Clock,
  Files,
  Gift,
  LayoutDashboard,
  LogOut,
  Menu,
  RotateCcw,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useDomainData } from "@/hooks/useDomainData";
import { screenFromPathname } from "@/core/routing/currentScreen";
import { securePath } from "@/services/secureRoutes";
import type { AppScreen } from "@/types/domain";
import { todayISO } from "@/utils/format";
import { compareText } from "@/utils/sort";
import logo from "@/assets/images/logo-empresas.png";
import "./layout.css";

const navItems: {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  screen: AppScreen;
  end?: boolean;
}[] = [
    { to: "/app", label: "Painel", icon: LayoutDashboard, screen: "dashboard", end: true },
    { to: "/app/companies", label: "Empresas", icon: Building2, screen: "companies" },
    { to: "/app/records", label: "Registros", icon: Files, screen: "records" },
    { to: "/app/employees", label: "Funcionários", icon: Users, screen: "employees" },
    { to: "/app/benefits", label: "Benefícios", icon: Gift, screen: "benefits" },
    { to: "/app/timekeeping", label: "Controle de ponto", icon: Clock, screen: "timekeeping" },
    { to: "/app/hr-control", label: "Controle RH", icon: ChartColumn, screen: "hrControl" },
    { to: "/app/talent-bank", label: "Banco de talentos", icon: Briefcase, screen: "talentBank" },
    { to: "/app/notifications", label: "Notificações", icon: Bell, screen: "notifications" },
    { to: "/app/monitoring", label: "Monitoramento", icon: Activity, screen: "monitoring" },
    { to: "/app/permissions", label: "Permissões do sistema", icon: ShieldCheck, screen: "permissions" },
  ];

const sortableTableSelector = "table.data-table, table.talent-table, table.schedule-table";
const ignoredSortableHeaderLabels = new Set(["acoes"]);

function normalizeSortableLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function readHeaderLabel(header: HTMLTableCellElement) {
  return (header.textContent || header.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
}

function isPinnedSelectOption(option: HTMLOptionElement) {
  return option.value === "" || option.disabled || option.hidden || option.dataset.keepFirst === "true";
}

function optionLabel(option: HTMLOptionElement) {
  return (option.textContent || option.label || option.value).trim();
}

function sortNativeSelectOptions(select: HTMLSelectElement) {
  const options = Array.from(select.options);
  if (options.length < 2 || select.querySelector("optgroup")) return;

  const currentValue = select.value;
  const selectedValues = new Set(Array.from(select.selectedOptions).map((option) => option.value));
  const pinnedOptions = options.filter(isPinnedSelectOption);
  const sortedOptions = options
    .map((option, index) => ({ option, index }))
    .filter(({ option }) => !isPinnedSelectOption(option))
    .sort((left, right) => compareText(optionLabel(left.option), optionLabel(right.option)) || left.index - right.index)
    .map(({ option }) => option);
  const orderedOptions = [...pinnedOptions, ...sortedOptions];

  if (orderedOptions.every((option, index) => option === options[index])) return;

  const fragment = document.createDocumentFragment();
  orderedOptions.forEach((option) => fragment.appendChild(option));
  select.appendChild(fragment);

  if (select.multiple) {
    Array.from(select.options).forEach((option) => {
      option.selected = selectedValues.has(option.value);
    });
    return;
  }

  select.value = currentValue;
}

function alphabetizeNativeSelects(root: ParentNode) {
  root.querySelectorAll<HTMLSelectElement>("select").forEach(sortNativeSelectOptions);
}

function markSortableTableHeaders(root: ParentNode) {
  root.querySelectorAll<HTMLTableElement>(sortableTableSelector).forEach((table) => {
    if (table.classList.contains("timekeeping-table")) return;

    const headers = Array.from(table.tHead?.querySelectorAll<HTMLTableCellElement>("th") || []);
    headers.forEach((header) => {
      const label = readHeaderLabel(header);
      const normalizedLabel = normalizeSortableLabel(label);

      if (!label || ignoredSortableHeaderLabels.has(normalizedLabel)) {
        header.removeAttribute("data-global-sortable");
        header.removeAttribute("aria-sort");
        header.removeAttribute("role");
        return;
      }

      header.dataset.globalSortable = "true";
      if (!header.hasAttribute("aria-sort")) header.setAttribute("aria-sort", "none");
      if (!header.hasAttribute("role")) header.setAttribute("role", "button");
      if (!header.hasAttribute("tabindex")) header.tabIndex = 0;
      if (!header.hasAttribute("title")) header.title = `Ordenar ${label}`;
    });
  });
}

function cellSortValue(cell: HTMLTableCellElement) {
  const select = cell.querySelector<HTMLSelectElement>("select");
  if (select) return select.selectedOptions[0]?.textContent || select.value;

  const input = cell.querySelector<HTMLInputElement>("input");
  if (input) return input.type === "checkbox" ? (input.checked ? "Sim" : "Nao") : input.value;

  const textarea = cell.querySelector<HTMLTextAreaElement>("textarea");
  if (textarea) return textarea.value;

  return cell.innerText.replace(/\s+/g, " ").trim();
}

function sortTableByHeader(header: HTMLTableCellElement) {
  const table = header.closest<HTMLTableElement>(sortableTableSelector);
  const head = table?.tHead;
  if (!table || !head || table.classList.contains("timekeeping-table")) return;

  const headers = Array.from(head.querySelectorAll<HTMLTableCellElement>("th"));
  const columnIndex = headers.indexOf(header);
  if (columnIndex < 0) return;

  const nextDirection = header.getAttribute("aria-sort") === "ascending" ? "desc" : "asc";
  const directionMultiplier = nextDirection === "asc" ? 1 : -1;

  headers.forEach((item) => {
    item.setAttribute("aria-sort", "none");
    delete item.dataset.sortDirection;
  });

  header.setAttribute("aria-sort", nextDirection === "asc" ? "ascending" : "descending");
  header.dataset.sortDirection = nextDirection;

  Array.from(table.tBodies).forEach((tbody) => {
    const rows = Array.from(tbody.rows);
    const sortableRows = rows
      .map((row, index) => ({ row, index, cell: row.cells[columnIndex] as HTMLTableCellElement | undefined }))
      .filter((item): item is { row: HTMLTableRowElement; index: number; cell: HTMLTableCellElement } => (
        item.row.cells.length > 1 && Boolean(item.cell) && item.cell?.colSpan === 1
      ));
    const sortableRowSet = new Set(sortableRows.map(({ row }) => row));
    const staticRows = rows.filter((row) => !sortableRowSet.has(row));

    sortableRows.sort((left, right) => {
      const result = compareText(cellSortValue(left.cell), cellSortValue(right.cell)) * directionMultiplier;
      return result || left.index - right.index;
    });

    const fragment = document.createDocumentFragment();
    sortableRows.forEach(({ row }) => fragment.appendChild(row));
    staticRows.forEach((row) => fragment.appendChild(row));
    tbody.appendChild(fragment);
  });
}

function shouldIgnoreTableSortTarget(target: HTMLElement) {
  return Boolean(target.closest("button, a, input, textarea, select, label"));
}

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, can } = useAuth();
  const { documentAlerts, undoState, runUndo, dismissUndo } = useDomainData();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const today = todayISO();
  const activeAlerts = documentAlerts.filter((alert) => alert.status !== "completed" && (alert.notifyDate || alert.dueDate) <= today).length;
  const visibleNavItems = useMemo(() => navItems.filter((item) => can(item.screen, "view")), [can]);
  const currentScreen = useMemo(() => screenFromPathname(location.pathname), [location.pathname]);
  const isWideWorkspace = currentScreen
    ? ["records", "employees", "permissions", "talentBank", "benefits", "timekeeping", "hrControl"].includes(currentScreen)
    : ["records", "employees", "permissions", "talent-bank", "benefits"].some((path) => location.pathname.includes(path));

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (event.ctrlKey && event.altKey && !event.shiftKey) {
        event.preventDefault();
        setSidebarCollapsed((current) => !current);
        setMenuOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);

  useEffect(() => {
    function handleTableRowDoubleClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const table = target.closest("table.data-table, table.talent-table, table.schedule-table");
      const row = target.closest("tbody tr");
      if (!table || !row) return;

      const interactiveTarget = target.closest("button, a, input, textarea, select, label");
      if (interactiveTarget) return;

      const section = row.parentElement;
      if (!section) return;

      const isSelected = row.classList.contains("is-selected-row");
      Array.from(section.children).forEach((child) => {
        if (child instanceof HTMLTableRowElement) child.classList.remove("is-selected-row");
      });

      if (!isSelected) row.classList.add("is-selected-row");
    }

    window.addEventListener("dblclick", handleTableRowDoubleClick);
    return () => window.removeEventListener("dblclick", handleTableRowDoubleClick);
  }, []);

  useEffect(() => {
    function prepareSortableUi() {
      alphabetizeNativeSelects(document);
      markSortableTableHeaders(document);
    }

    function handleSortableHeaderClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof HTMLElement) || shouldIgnoreTableSortTarget(target)) return;

      const header = target.closest<HTMLTableCellElement>("th[data-global-sortable='true']");
      if (!header) return;

      event.preventDefault();
      sortTableByHeader(header);
    }

    function handleSortableHeaderKeydown(event: KeyboardEvent) {
      if (event.key !== "Enter" && event.key !== " ") return;

      const target = event.target;
      if (!(target instanceof HTMLElement) || shouldIgnoreTableSortTarget(target)) return;

      const header = target.closest<HTMLTableCellElement>("th[data-global-sortable='true']");
      if (!header) return;

      event.preventDefault();
      sortTableByHeader(header);
    }

    prepareSortableUi();
    window.addEventListener("click", handleSortableHeaderClick);
    window.addEventListener("keydown", handleSortableHeaderKeydown);

    return () => {
      window.removeEventListener("click", handleSortableHeaderClick);
      window.removeEventListener("keydown", handleSortableHeaderKeydown);
    };
  }, [location.pathname]);

  function handleLogout() {
    logout();
    navigate("/", { replace: true });
  }

  return (
    <div className={`app-shell${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <aside className={`app-sidebar ${menuOpen ? "is-open" : ""}`}>
        <div className="brand-block">
          <img src={logo} alt="Macro Ambiental" />
          <button
            className="icon-button sidebar-close"
            type="button"
            onClick={() => {
              setSidebarCollapsed(true);
              setMenuOpen(false);
            }}
            aria-label="Fechar menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Navegação principal">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isNotification = item.screen === "notifications";

            return (
              <NavLink
                key={item.to}
                to={securePath(item.screen)}
                end={item.end}
                className={({ isActive }) => (isActive ? "is-active" : undefined)}
                onClick={() => setMenuOpen(false)}
              >
                <Icon size={17} />
                <span>{item.label}</span>
                {isNotification && activeAlerts > 0 ? <span className="nav-count">{activeAlerts > 9 ? "9+" : activeAlerts}</span> : null}
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="brand-status"><span /><strong>{user?.position || user?.role || "Perfil"}</strong></div>
          <button className="logout-button" type="button" onClick={handleLogout}><LogOut size={17} />Sair</button>
        </div>
      </aside>

      <div className="app-content">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            type="button"
            onClick={() => {
              setSidebarCollapsed(false);
              setMenuOpen(true);
            }}
            aria-label="Abrir menu"
          >
            <Menu size={18} />
          </button>
          {user ? (
            <div className="topbar-actions">
              <div className="user-chip">
                <div>{user.initials}</div>
                <span><strong>{user.name}</strong><small>{user.position ? `${user.role} · ${user.position}` : user.role}</small></span>
              </div>
            </div>
          ) : null}
        </header>
        <main className={`workspace ${isWideWorkspace ? "is-wide" : ""}${currentScreen === "timekeeping" ? " is-fullwidth" : ""}`}>
          <Outlet />
        </main>
        {undoState ? (
          <div className="undo-toast" role="status">
            <span>{undoState.message}</span>
            <button type="button" onClick={() => void runUndo()}>
              <RotateCcw size={15} /> Desfazer alteracao
            </button>
            <button type="button" onClick={dismissUndo}>Fechar</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

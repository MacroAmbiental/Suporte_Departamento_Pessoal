import ModalPortal from "@/modules/shared/ModalPortal";
import {
  Bell,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  FileText,
  Pencil,
  RotateCcw,
  Timer,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { memo, useEffect, useMemo, useState, type ReactNode } from "react";
import { useDomainData } from "@/hooks/useDomainData";
import { openEmployeeDocumentFile, uploadEmployeeDocumentFile } from "@/services/documentStorage";
import { documentKindFromFileName, formatDocumentFileSize } from "@/modules/records/utils/recordsDocuments";
import type { AlertPriority, DocumentAlert, EmployeeDocument } from "@/types/domain";
import { badgeClass, formatDate, getAlertStatus, labelStatus, todayISO } from "@/utils/format";

type AlertSection = "active" | "renewed" | "completed";
type DueWindowFilter = "all" | "overdue" | "one-day" | "three-days";
type RealizedValue = "" | "yes" | "no";

type NotificationColumnFilters = {
  document: string;
  employee: string;
  notifyDate: string;
  priority: "" | AlertPriority;
  status: "" | "pending" | "renewed" | "recurring" | "completed";
  realized: RealizedValue;
  observations: string;
  actions: "" | "with-file" | "without-file" | "pending-completion";
};

const pageSize = 10;

const initialColumnFilters: NotificationColumnFilters = {
  document: "",
  employee: "",
  notifyDate: "",
  priority: "",
  status: "",
  realized: "",
  observations: "",
  actions: "",
};

const ObservationEditor = memo(function ObservationEditor({
  alertId,
  documentName,
  initialValue,
  onSave,
}: {
  alertId: string;
  documentName: string;
  initialValue: string;
  onSave: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [alertId, initialValue]);

  return (
    <textarea
      aria-label={`Observações de ${documentName}`}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => void onSave(value)}
      placeholder="Adicionar observação..."
      rows={2}
    />
  );
});

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function addMonthsToISODate(isoDate: string, monthsToAdd: number) {
  if (!isoDate) return "";

  const [yearValue, monthValue, dayValue] = isoDate.split("-").map(Number);
  if (!yearValue || !monthValue || !dayValue) return "";

  const startMonthIndex = monthValue - 1;
  const targetMonthIndexTotal = startMonthIndex + monthsToAdd;
  const targetYear = yearValue + Math.floor(targetMonthIndexTotal / 12);
  const targetMonthIndex = ((targetMonthIndexTotal % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(targetYear, targetMonthIndex + 1, 0).getDate();
  const targetDay = Math.min(dayValue, lastDayOfTargetMonth);

  return `${targetYear}-${String(targetMonthIndex + 1).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}

function getNextDueDate(dueDate: string, recurrence: string) {
  const normalized = normalizeText(recurrence || "Unica");

  if (!dueDate || normalized === "unica") return "";
  if (normalized.includes("mensal")) return addMonthsToISODate(dueDate, 1);
  if (normalized.includes("trimestral")) return addMonthsToISODate(dueDate, 3);
  if (normalized.includes("semestral")) return addMonthsToISODate(dueDate, 6);
  if (normalized.includes("anual")) return addMonthsToISODate(dueDate, 12);
  if (normalized.includes("bienal")) return addMonthsToISODate(dueDate, 24);

  return "";
}

function isRecurring(recurrence?: string) {
  return Boolean(recurrence && normalizeText(recurrence) !== "unica");
}

function subtractDaysFromISODate(isoDate: string, daysToSubtract: number) {
  if (!isoDate) return "";

  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;

  date.setDate(date.getDate() - Math.max(0, daysToSubtract));

  return date.toISOString().slice(0, 10);
}

function addDaysToISODate(isoDate: string, daysToAdd: number) {
  if (!isoDate) return "";

  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;

  date.setDate(date.getDate() + daysToAdd);

  return date.toISOString().slice(0, 10);
}

function getAlertAdvanceDays(alert: { advanceDays?: number | string; notifyBeforeDays?: number | string }) {
  const value = alert.advanceDays ?? alert.notifyBeforeDays ?? 0;
  const numericValue = Number(value);

  return Number.isFinite(numericValue) ? Math.max(0, numericValue) : 0;
}

function getNotifyDate(dueDate: string, advanceDays: number) {
  return subtractDaysFromISODate(dueDate, advanceDays);
}

function getStoredNotifyDate(alert: { dueDate: string; notifyDate?: string; advanceDays?: number | string; notifyBeforeDays?: number | string }) {
  return alert.notifyDate || getNotifyDate(alert.dueDate, getAlertAdvanceDays(alert));
}

function sortByNotifyDate<T extends { dueDate: string; notifyDate?: string; advanceDays?: number | string; notifyBeforeDays?: number | string }>(items: T[]) {
  return [...items].sort((a, b) => getStoredNotifyDate(a).localeCompare(getStoredNotifyDate(b)));
}

function sortByUpdatedDate<T extends { updatedAt?: string; createdAt?: string }>(items: T[]) {
  return [...items].sort((a, b) =>
    String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")),
  );
}

function matchesDueWindow(alert: DocumentAlert, filter: DueWindowFilter, today: string) {
  if (filter === "all") return true;
  if (!alert.dueDate) return false;

  if (filter === "overdue") return alert.dueDate < today;

  const endDate = addDaysToISODate(today, filter === "one-day" ? 1 : 3);
  return alert.dueDate >= today && alert.dueDate <= endDate;
}

function completedAtFromRealizedDate(realizedDate: string, today: string) {
  if (!realizedDate) return new Date().toISOString();
  if (realizedDate === today) return new Date().toISOString();
  return `${realizedDate}T12:00:00.000Z`;
}

export default function Notifications() {
  const data = useDomainData();
  const [dueWindowFilter, setDueWindowFilter] = useState<DueWindowFilter>("all");
  const [tablePages, setTablePages] = useState<Record<AlertSection, number>>({
    active: 1,
    renewed: 1,
    completed: 1,
  });
  const [activeSection, setActiveSection] = useState<AlertSection>("active");
  const [columnFilters, setColumnFilters] = useState<Record<AlertSection, NotificationColumnFilters>>({
    active: { ...initialColumnFilters },
    renewed: { ...initialColumnFilters },
    completed: { ...initialColumnFilters },
  });
  const [completionDraft, setCompletionDraft] = useState<{
    alertId: string;
    realizedDate: string;
    replaceDocument: boolean;
    file?: File;
    fileName: string;
  } | null>(null);
  const [completionSaving, setCompletionSaving] = useState(false);
  const [completionDropActive, setCompletionDropActive] = useState(false);
  const today = todayISO();

  function alertEmployee(alert: DocumentAlert) {
    return data.employees.find((item) => item.id === alert.employeeId);
  }

  function alertDocument(alert: DocumentAlert) {
    return data.employeeDocuments.find((item) => item.id === alert.documentId);
  }

  function alertCompany(alert: DocumentAlert) {
    return data.companies.find((item) => item.id === alert.companyId);
  }

  function getEmployeeName(alert: DocumentAlert) {
    return alertEmployee(alert)?.name || alert.employeeName || "Funcionario removido";
  }

  function getDocumentName(alert: DocumentAlert) {
    return alertDocument(alert)?.name || alert.documentName || "-";
  }

  function getCompanyName(alert: DocumentAlert) {
    return alertCompany(alert)?.name || alert.companyName || "-";
  }

  const openAlerts = useMemo(
    () => data.documentAlerts.filter((alert) => {
      const document = data.employeeDocuments.find((item) => item.id === alert.documentId);
      const employee = data.employees.find((item) => item.id === alert.employeeId);
      return alert.status !== "completed" && employee?.status !== "terminated" && Boolean(document) && document?.active !== false;
    }),
    [data.documentAlerts, data.employeeDocuments, data.employees],
  );

  const filteredOpenAlerts = useMemo(() => openAlerts, [openAlerts]);

  const dueWindowCards = useMemo(
    () => [
      {
        key: "overdue" as DueWindowFilter,
        label: "Ja venceram",
        value: filteredOpenAlerts.filter((alert) => matchesDueWindow(alert, "overdue", today)).length,
        tone: "blue",
        icon: <CalendarDays size={26} />,
      },
      {
        key: "one-day" as DueWindowFilter,
        label: "Vencem em 1 dia",
        value: filteredOpenAlerts.filter((alert) => matchesDueWindow(alert, "one-day", today)).length,
        tone: "green",
        icon: <Timer size={26} />,
      },
      {
        key: "three-days" as DueWindowFilter,
        label: "Vencem em 3 dias",
        value: filteredOpenAlerts.filter((alert) => matchesDueWindow(alert, "three-days", today)).length,
        tone: "orange",
        icon: <CalendarClock size={26} />,
      },
    ],
    [filteredOpenAlerts, today],
  );

  const nextAlerts = useMemo(
    () => sortByNotifyDate(
      filteredOpenAlerts
        .filter((alert) => getStoredNotifyDate(alert) <= today)
        .filter((alert) => matchesDueWindow(alert, dueWindowFilter, today)),
    ),
    [dueWindowFilter, filteredOpenAlerts, today],
  );

  const programmedAlerts = useMemo(
    () => sortByNotifyDate(
      filteredOpenAlerts
        .filter((alert) => getStoredNotifyDate(alert) > today)
        .filter((alert) => matchesDueWindow(alert, dueWindowFilter, today)),
    ),
    [dueWindowFilter, filteredOpenAlerts, today],
  );

  const completedAlerts = useMemo(
    () => sortByUpdatedDate(
      data.documentAlerts
        .filter((alert) => alert.status === "completed")
        .filter((alert) => matchesDueWindow(alert, dueWindowFilter, today)),
    ),
    [data.documentAlerts, dueWindowFilter, today],
  );

  function resetTablePages() {
    setTablePages({ active: 1, renewed: 1, completed: 1 });
  }

  function updateSectionColumnFilter<K extends keyof NotificationColumnFilters>(section: AlertSection, key: K, value: NotificationColumnFilters[K]) {
    setColumnFilters((current) => ({
      ...current,
      [section]: {
        ...current[section],
        [key]: value,
      },
    }));
    setTablePages((current) => ({ ...current, [section]: 1 }));
  }

  function toggleDueWindowFilter(filter: DueWindowFilter) {
    setDueWindowFilter((current) => current === filter ? "all" : filter);
    resetTablePages();
  }

  function openCompletionModal(alertId: string) {
    setCompletionDropActive(false);
    setCompletionDraft({
      alertId,
      realizedDate: today,
      replaceDocument: false,
      fileName: "",
    });
  }

  async function saveObservation(alert: DocumentAlert, value: string) {
    const description = value.trim();
    if (description === (alert.description || "")) return;

    try {
      await data.upsertDocumentAlert({ ...alert, description, updatedAt: new Date().toISOString() });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível salvar a observação.");
    }
  }

  function statusBucket(alert: DocumentAlert, type: AlertSection) {
    if (type === "completed") return "completed" as const;
    if (alert.renewedFromAlertId || alert.previousDueDate) return "renewed" as const;
    if (isRecurring(alert.recurrence)) return "recurring" as const;
    return "pending" as const;
  }

  function realizedValue(alert: DocumentAlert, type: AlertSection): RealizedValue {
    if (alert.realized === "yes" || alert.realized === "no") return alert.realized;
    return type === "completed" ? "yes" : "";
  }

  async function setAlertRealized(alert: DocumentAlert, type: AlertSection, value: Exclude<RealizedValue, "">) {
    if (realizedValue(alert, type) === value) return;

    try {
      await data.upsertDocumentAlert({
        ...alert,
        realized: value,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível atualizar o campo Realizado.");
    }
  }

  function matchesColumnFilters(alert: DocumentAlert, type: AlertSection, filtersForSection: NotificationColumnFilters) {
    const document = alertDocument(alert);
    const docName = getDocumentName(alert);
    const employeeName = getEmployeeName(alert);
    const notifyDate = type === "completed" ? alert.dueDate : getStoredNotifyDate(alert);
    const observations = alert.description || "";
    const realized = realizedValue(alert, type);

    if (filtersForSection.document && !normalizeText(docName).includes(normalizeText(filtersForSection.document))) return false;
    if (filtersForSection.employee && !normalizeText(employeeName).includes(normalizeText(filtersForSection.employee))) return false;
    if (filtersForSection.notifyDate && notifyDate !== filtersForSection.notifyDate) return false;
    if (filtersForSection.priority && alert.priority !== filtersForSection.priority) return false;
    if (filtersForSection.status && statusBucket(alert, type) !== filtersForSection.status) return false;
    if (filtersForSection.realized && realized !== filtersForSection.realized) return false;
    if (filtersForSection.observations && !normalizeText(observations).includes(normalizeText(filtersForSection.observations))) return false;

    if (filtersForSection.actions === "with-file" && !document?.fileUrl) return false;
    if (filtersForSection.actions === "without-file" && document?.fileUrl) return false;
    if (filtersForSection.actions === "pending-completion" && type === "completed") return false;

    return true;
  }

  function closeCompletionModal() {
    if (completionSaving) return;
    setCompletionDraft(null);
    setCompletionDropActive(false);
  }

  function updateCompletionFile(file?: File) {
    setCompletionDraft((current) => current
      ? {
          ...current,
          file,
          fileName: file?.name || "",
        }
      : current);
  }

  async function completeAndRenewAlert() {
    if (!completionDraft || completionSaving) return;

    const alert = data.documentAlerts.find((item) => item.id === completionDraft.alertId);
    if (!alert) {
      setCompletionDraft(null);
      return;
    }

    if (!completionDraft.realizedDate) {
      window.alert("Informe a data de realizado.");
      return;
    }

    const document = data.employeeDocuments.find((item) => item.id === alert.documentId);
    if (completionDraft.replaceDocument && !completionDraft.file) {
      window.alert("Selecione o novo documento antes de concluir.");
      return;
    }

    const employee = data.employees.find((item) => item.id === alert.employeeId);
    const company = data.companies.find((item) => item.id === alert.companyId);
    const nextDueDate = getNextDueDate(completionDraft.realizedDate, alert.recurrence);
    const advanceDays = getAlertAdvanceDays(alert);
    const now = new Date().toISOString();
    const completedAt = completedAtFromRealizedDate(completionDraft.realizedDate, today);

    try {
      setCompletionSaving(true);

      const attachmentPatch: Partial<EmployeeDocument> = completionDraft.file && document
        ? {
            fileUrl: await uploadEmployeeDocumentFile(document.employeeId, completionDraft.file),
            kind: documentKindFromFileName(completionDraft.file.name),
            size: formatDocumentFileSize(completionDraft.file),
            attachmentDate: completionDraft.realizedDate,
          }
        : {};

      const completedAlert: DocumentAlert = {
        ...alert,
        employeeName: employee?.name || alert.employeeName || "",
        documentName: document?.name || alert.documentName || "",
        companyName: company?.name || alert.companyName || "",
        realized: "yes",
        status: "completed",
        completedAt,
        updatedAt: now,
      };

      await data.upsertDocumentAlert(completedAlert);

      if (document) {
        await data.upsertEmployeeDocument({
          ...document,
          realizedDate: completionDraft.realizedDate,
          expirationDate: nextDueDate || document.expirationDate || alert.dueDate,
          ...attachmentPatch,
          updatedAt: now,
        });

        await data.upsertDocumentAlert(completedAlert);
      }

      if (nextDueDate) {
        const { id: _removedId, ...alertWithoutId } = alert as typeof alert & { id?: string };
        const notifyDate = getNotifyDate(nextDueDate, advanceDays);

        await data.upsertDocumentAlert({
          ...alertWithoutId,
          title: alert.title,
          dueDate: nextDueDate,
          advanceDays,
          notifyBeforeDays: advanceDays,
          notifyDate,
          status: getAlertStatus(notifyDate),
          renewedFromAlertId: alert.id,
          previousDueDate: alert.dueDate,
          realized: undefined,
          employeeName: employee?.name || alert.employeeName || "",
          documentName: document?.name || alert.documentName || "",
          companyName: company?.name || alert.companyName || "",
          completedAt: "",
          createdAt: now,
          updatedAt: now,
        });
      }

      setCompletionDraft(null);
      resetTablePages();
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : "Nao foi possivel concluir o alerta.");
    } finally {
      setCompletionSaving(false);
    }
  }

  function renderRows(alerts: DocumentAlert[], type: AlertSection) {
    if (!alerts.length) {
      return (
        <tr>
          <td colSpan={8}>
            {type === "completed"
              ? "Nenhum alerta concluido nesse filtro."
              : type === "renewed"
                ? "Nenhuma renovacao ou alerta futuro programado."
                : "Nenhum alerta entrou na janela de notificacao."}
          </td>
        </tr>
      );
    }

    return alerts.map((alert) => {
      const document = alertDocument(alert);
      const nextDueDate = getNextDueDate(alert.dueDate, alert.recurrence);
      const advanceDays = getAlertAdvanceDays(alert);
      const notifyDate = getStoredNotifyDate(alert);
      const renewedFromAlertId = alert.renewedFromAlertId;
      const previousDueDate = alert.previousDueDate;

      return (
        <tr key={alert.id} className="notification-alert-row">
          <td className="notification-document-cell">
            <div className="notification-cell-content">
              <span className="notification-row-icon"><FileText size={25} /></span>
              <span><strong>{getDocumentName(alert)}</strong><small>{alert.title}</small></span>
            </div>
          </td>

          <td className="notification-employee-cell">
            <div className="notification-cell-content">
              <UserRound size={19} />
              <span><strong>{getEmployeeName(alert)}</strong><small>{getCompanyName(alert)}</small></span>
            </div>
          </td>

          <td className="notification-date-cell">
            <div className="notification-cell-content">
              <CalendarDays size={19} />
              <span>
                <small>{type === "completed" ? "Venceu em" : "Vence em"}</small>
                <strong>{formatDate(type === "completed" ? alert.dueDate : notifyDate)}</strong>
                {type !== "completed" ? <small>Vencimento: {formatDate(alert.dueDate)}</small> : null}
                {type !== "completed" && isRecurring(alert.recurrence) && nextDueDate ? <small>Renova: {formatDate(getNotifyDate(nextDueDate, advanceDays))}</small> : null}
              </span>
            </div>
          </td>

          <td className="notification-priority-cell">
            <span className={`badge ${badgeClass(alert.priority)}`}>
              {labelStatus(alert.priority)}
            </span>
          </td>

          <td className="notification-status-cell">
            {type === "completed" ? (
              <span className="badge badge-success">
                <CheckCircle2 size={14} /> Concluido
              </span>
            ) : renewedFromAlertId || previousDueDate ? (
              <span className="badge badge-info">
                <RotateCcw size={14} /> Renovado
              </span>
            ) : isRecurring(alert.recurrence) ? (
              <span className="badge badge-warning">
                <CalendarClock size={14} /> {alert.recurrence}
              </span>
            ) : (
              <span className={`badge ${badgeClass(alert.status)}`}>
                {labelStatus(alert.status)}
              </span>
            )}
          </td>

          <td className="notification-realized-cell">
            <div className="notification-realized-options" role="group" aria-label={`Realizado de ${getDocumentName(alert)}`}>
              <button
                type="button"
                className={`notification-realized-option${realizedValue(alert, type) === "yes" ? " is-active" : ""}`}
                onClick={() => void setAlertRealized(alert, type, "yes")}
              >
                Sim
              </button>
              <button
                type="button"
                className={`notification-realized-option${realizedValue(alert, type) === "no" ? " is-active" : ""}`}
                onClick={() => void setAlertRealized(alert, type, "no")}
              >
                Não
              </button>
            </div>
          </td>

          <td className="notification-observations-cell">
            <span>Observações <Pencil size={13} /></span>
            <ObservationEditor
              alertId={alert.id}
              documentName={getDocumentName(alert)}
              initialValue={alert.description || ""}
              onSave={(value) => saveObservation(alert, value)}
            />
          </td>

          <td className="action-row notification-actions-cell">
            <div className="notification-actions-inline">
              {document?.fileUrl ? (
                <button
                  className="table-action"
                  type="button"
                  onClick={() => openEmployeeDocumentFile(document.fileUrl, document.name).catch((error) => {
                    window.alert(error instanceof Error ? error.message : "Nao foi possivel abrir o documento.");
                  })}
                >
                  <Eye size={15} /> Ver
                </button>
              ) : null}

              {type !== "completed" ? (
                <button className="btn btn-soft" type="button" onClick={() => openCompletionModal(alert.id)}>
                  <Check size={15} /> Concluir
                </button>
              ) : null}
            </div>
          </td>
        </tr>
      );
    });
  }

  function AlertTableSection({
    alerts,
    title,
    icon,
    type,
  }: {
    alerts: DocumentAlert[];
    title: string;
    icon: ReactNode;
    type: AlertSection;
  }) {
    const sectionFilters = columnFilters[type];
    const filteredAlerts = alerts.filter((alert) => matchesColumnFilters(alert, type, sectionFilters));
    const totalPages = Math.max(1, Math.ceil(filteredAlerts.length / pageSize));
    const currentPage = Math.min(tablePages[type], totalPages);
    const firstItem = (currentPage - 1) * pageSize;
    const visibleAlerts = filteredAlerts.slice(firstItem, firstItem + pageSize);
    const fromItem = filteredAlerts.length ? firstItem + 1 : 0;
    const toItem = filteredAlerts.length ? Math.min(firstItem + visibleAlerts.length, filteredAlerts.length) : 0;

    function goToPage(nextPage: number) {
      setTablePages((current) => ({ ...current, [type]: Math.min(Math.max(1, nextPage), totalPages) }));
    }

    return (
      <article className="panel alert-table-section" style={{ marginTop: 16 }}>
        <div className="panel-header alert-section-static-header">
          <span className="alert-section-title-wrap">
            <span className="panel-title">
              {icon} {title}
            </span>
            <span className="panel-subtitle">{alerts.length} alerta(s) neste filtro.</span>
          </span>
        </div>

        <div className="alert-table-wrap">
          <div className="table-panel">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Documento</th>
                  <th>Funcionário</th>
                  <th>{type === "completed" ? "Vencimento" : "Notifica em"}</th>
                  <th>Prioridade</th>
                  <th>Status</th>
                  <th>Realizado</th>
                  <th>Observações</th>
                  <th>Acoes</th>
                </tr>

                <tr className="notification-filter-row">
                  <th>
                    <input
                      type="text"
                      value={sectionFilters.document}
                      onChange={(event) => updateSectionColumnFilter(type, "document", event.target.value)}
                      placeholder="Filtrar"
                      aria-label="Filtrar documento"
                    />
                  </th>
                  <th>
                    <input
                      type="text"
                      value={sectionFilters.employee}
                      onChange={(event) => updateSectionColumnFilter(type, "employee", event.target.value)}
                      placeholder="Filtrar"
                      aria-label="Filtrar funcionário"
                    />
                  </th>
                  <th>
                    <input
                      type="date"
                      value={sectionFilters.notifyDate}
                      onChange={(event) => updateSectionColumnFilter(type, "notifyDate", event.target.value)}
                      aria-label="Filtrar data"
                    />
                  </th>
                  <th>
                    <select
                      value={sectionFilters.priority}
                      onChange={(event) => updateSectionColumnFilter(type, "priority", event.target.value as NotificationColumnFilters["priority"])}
                      aria-label="Filtrar prioridade"
                    >
                      <option value="">Todas</option>
                      <option value="high">Alta</option>
                      <option value="medium">Média</option>
                      <option value="low">Baixa</option>
                    </select>
                  </th>
                  <th>
                    <select
                      value={sectionFilters.status}
                      onChange={(event) => updateSectionColumnFilter(type, "status", event.target.value as NotificationColumnFilters["status"])}
                      aria-label="Filtrar status"
                    >
                      <option value="">Todos</option>
                      <option value="pending">Pendente</option>
                      <option value="renewed">Renovado</option>
                      <option value="recurring">Recorrente</option>
                      <option value="completed">Concluído</option>
                    </select>
                  </th>
                  <th>
                    <select
                      value={sectionFilters.realized}
                      onChange={(event) => updateSectionColumnFilter(type, "realized", event.target.value as RealizedValue)}
                      aria-label="Filtrar realizado"
                    >
                      <option value="">Todos</option>
                      <option value="yes">Sim</option>
                      <option value="no">Não</option>
                    </select>
                  </th>
                  <th>
                    <input
                      type="text"
                      value={sectionFilters.observations}
                      onChange={(event) => updateSectionColumnFilter(type, "observations", event.target.value)}
                      placeholder="Filtrar"
                      aria-label="Filtrar observações"
                    />
                  </th>
                  <th>
                    <select
                      value={sectionFilters.actions}
                      onChange={(event) => updateSectionColumnFilter(type, "actions", event.target.value as NotificationColumnFilters["actions"])}
                      aria-label="Filtrar ações"
                    >
                      <option value="">Todas</option>
                      <option value="with-file">Com Ver</option>
                      <option value="without-file">Sem Ver</option>
                      <option value="pending-completion">Com Concluir</option>
                    </select>
                  </th>
                </tr>
              </thead>
              <tbody>{renderRows(visibleAlerts, type)}</tbody>
            </table>
          </div>

          <div className="alert-table-pagination">
            <span>
              Mostrando {fromItem}-{toItem} de {filteredAlerts.length}
            </span>
            <div className="alert-table-page-controls">
              <button className="alert-table-page-button" type="button" disabled={currentPage <= 1} onClick={() => goToPage(1)} aria-label="Primeira página" title="Primeira página">
                <ChevronsLeft size={16} />
              </button>
              <button className="alert-table-page-button" type="button" disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)} aria-label="Página anterior" title="Página anterior">
                <ChevronLeft size={16} />
              </button>
              <span className="alert-table-page-indicator">Pagina {currentPage} de {totalPages}</span>
              <button className="alert-table-page-button" type="button" disabled={currentPage >= totalPages} onClick={() => goToPage(currentPage + 1)} aria-label="Próxima página" title="Próxima página">
                <ChevronRight size={16} />
              </button>
              <button className="alert-table-page-button" type="button" disabled={currentPage >= totalPages} onClick={() => goToPage(totalPages)} aria-label="Última página" title="Última página">
                <ChevronsRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </article>
    );
  }

  const sectionTabs = [
    { key: "active" as AlertSection, title: "Proximos alertas", icon: <Bell size={16} />, count: nextAlerts.length },
    { key: "renewed" as AlertSection, title: "Renovacoes futuras", icon: <RotateCcw size={16} />, count: programmedAlerts.length },
    { key: "completed" as AlertSection, title: "Arquivos concluidos", icon: <CheckCircle2 size={16} />, count: completedAlerts.length },
  ];

  const completionAlert = completionDraft ? data.documentAlerts.find((item) => item.id === completionDraft.alertId) : undefined;
  const completionDocument = completionAlert ? alertDocument(completionAlert) : undefined;

  return (
    <section className="page notifications-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Notificacoes</h1>
          <p className="page-subtitle">
            Proximos alertas aparecem somente quando entram na janela configurada em Alertar antes. Sem antecedencia, aparecem no dia do vencimento.
          </p>
        </div>
      </div>

      <div className="notification-due-filter-grid">
        {dueWindowCards.map((card) => (
          <button
            className={`notification-due-filter-card is-${card.tone} ${dueWindowFilter === card.key ? "is-active" : ""}`}
            key={card.key}
            type="button"
            onClick={() => toggleDueWindowFilter(card.key)}
          >
            <span className="notification-due-card-icon">{card.icon}</span>
            <span className="notification-due-card-content"><small>{card.label}</small><strong>{card.value}</strong></span>
          </button>
        ))}
      </div>

      <div className="notification-sections-tabs" role="tablist" aria-label="Seções de notificações">
        {sectionTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeSection === tab.key}
            className={`notification-section-tab${activeSection === tab.key ? " is-active" : ""}`}
            onClick={() => setActiveSection(tab.key)}
          >
            {tab.icon}
            <span>{tab.title}</span>
            <strong>{tab.count}</strong>
          </button>
        ))}
      </div>

      {activeSection === "active" && <AlertTableSection alerts={nextAlerts} type="active" title="Proximos alertas" icon={<Bell size={18} />} />}
      {activeSection === "renewed" && <AlertTableSection alerts={programmedAlerts} type="renewed" title="Renovacoes futuras" icon={<RotateCcw size={18} />} />}
      {activeSection === "completed" && <AlertTableSection alerts={completedAlerts} type="completed" title="Arquivos concluidos" icon={<CheckCircle2 size={18} />} />}

      {completionDraft ? (
        <ModalPortal className="modal-backdrop">
          <div className="modal-panel alert-completion-modal" role="dialog" aria-modal="true" aria-labelledby="alert-completion-title">
            <div className="modal-header">
              <div>
                <h2 id="alert-completion-title">Concluir documento</h2>
                <p className="panel-subtitle">Deseja substituir o documento atual antes de concluir?</p>
              </div>
              <button className="icon-button" type="button" onClick={closeCompletionModal} aria-label="Fechar">
                <X size={18} />
              </button>
            </div>

            <div className="alert-completion-summary">
              <strong>{completionAlert?.title || "Alerta"}</strong>
              <span>{completionDocument?.name || completionAlert?.documentName || "Documento"}</span>
              <small>{completionAlert ? getEmployeeName(completionAlert) : "-"}</small>
            </div>

            <label className="field">
              Data de realizado
              <input
                type="date"
                value={completionDraft.realizedDate}
                onChange={(event) => setCompletionDraft((current) => current ? { ...current, realizedDate: event.target.value } : current)}
              />
            </label>

            <div className="alert-completion-replace">
              <span className="alert-completion-question">Deseja substituir o documento?</span>
              <div className="alert-completion-options" role="group" aria-label="Substituir documento">
                <button
                  className={`btn ${!completionDraft.replaceDocument ? "btn-primary" : "btn-secondary"}`}
                  type="button"
                  onClick={() => setCompletionDraft((current) => current ? { ...current, replaceDocument: false, file: undefined, fileName: "" } : current)}
                >
                  Não, manter atual
                </button>
                <button
                  className={`btn ${completionDraft.replaceDocument ? "btn-primary" : "btn-secondary"}`}
                  type="button"
                  onClick={() => setCompletionDraft((current) => current ? { ...current, replaceDocument: true } : current)}
                >
                  Sim, substituir
                </button>
              </div>

              {completionDraft.replaceDocument ? (
                <label
                  className={`document-file-field alert-completion-file${completionDropActive ? " is-drag-over" : ""}`}
                  onDragEnter={(event) => { event.preventDefault(); setCompletionDropActive(true); }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={(event) => { event.preventDefault(); setCompletionDropActive(false); }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setCompletionDropActive(false);
                    updateCompletionFile(event.dataTransfer.files?.[0]);
                  }}
                >
                  <input
                    type="file"
                    onChange={(event) => updateCompletionFile(event.target.files?.[0])}
                  />
                  <span>
                    <Upload size={16} />
                    {completionDraft.fileName || "Arraste o documento aqui ou clique para selecionar"}
                  </span>
                </label>
              ) : null}
            </div>

            <div className="form-actions">
              <button className="btn btn-secondary" type="button" disabled={completionSaving} onClick={closeCompletionModal}>
                Cancelar
              </button>
              <button className="btn btn-primary" type="button" disabled={completionSaving} onClick={completeAndRenewAlert}>
                <Check size={16} /> {completionSaving ? "Concluindo..." : "Concluir"}
              </button>
            </div>
          </div>
        </ModalPortal>
      ) : null}
    </section>
  );
}

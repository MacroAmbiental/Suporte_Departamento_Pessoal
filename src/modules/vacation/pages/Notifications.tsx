import {
  Bell,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Filter,
  RotateCcw,
  Search,
  Upload,
  X,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useDomainData } from "@/hooks/useDomainData";
import ClearFiltersButton from "../../../common/components/ClearFiltersButton";
import MultiSelect from "../../../common/components/MultiSelect";
import { openEmployeeDocumentFile, uploadEmployeeDocumentFile } from "@/services/documentStorage";
import { documentKindFromFileName, formatDocumentFileSize } from "@/modules/records/utils/recordsDocuments";
import type { AlertPriority, DocumentAlert, EmployeeDocument } from "@/types/domain";
import { badgeClass, formatDate, getAlertStatus, labelStatus, todayISO } from "@/utils/format";

type AlertSection = "active" | "renewed" | "completed";
type DueWindowFilter = "all" | "overdue" | "one-day" | "three-days";

const pageSize = 10;

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
  const initialNotificationsFilters = { companyIds: [] as string[], employeeIds: [] as string[], documentName: "", priorities: [] as AlertPriority[] };
  const [filters, setFilters] = useState(initialNotificationsFilters);
  const [dueWindowFilter, setDueWindowFilter] = useState<DueWindowFilter>("all");
  const [tablePages, setTablePages] = useState<Record<AlertSection, number>>({
    active: 1,
    renewed: 1,
    completed: 1,
  });
  const [sectionOpen, setSectionOpen] = useState<Record<AlertSection, boolean>>({
    active: false,
    renewed: false,
    completed: false,
  });
  const [completionDraft, setCompletionDraft] = useState<{
    alertId: string;
    realizedDate: string;
    replaceDocument: boolean;
    file?: File;
    fileName: string;
  } | null>(null);
  const [completionSaving, setCompletionSaving] = useState(false);
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

  function matchesFilters(alert: DocumentAlert) {
    const employee = alertEmployee(alert);
    const document = alertDocument(alert);
    const documentName = document?.name || alert.documentName || alert.title;
    const documentSearch = normalizeText(filters.documentName);

    return (!filters.companyIds.length || filters.companyIds.includes(alert.companyId))
      && (!filters.employeeIds.length || filters.employeeIds.includes(alert.employeeId))
      && (!filters.priorities.length || filters.priorities.includes(alert.priority))
      && (!documentSearch || normalizeText(documentName).includes(documentSearch));
  }

  const openAlerts = useMemo(
    () => data.documentAlerts.filter((alert) => {
      const document = data.employeeDocuments.find((item) => item.id === alert.documentId);
      return alert.status !== "completed" && Boolean(document) && document?.active !== false;
    }),
    [data.documentAlerts, data.employeeDocuments],
  );

  const filteredOpenAlerts = useMemo(
    () => openAlerts.filter(matchesFilters),
    [filters, openAlerts],
  );

  const dueWindowCards = useMemo(
    () => [
      {
        key: "overdue" as DueWindowFilter,
        label: "Ja venceram",
        value: filteredOpenAlerts.filter((alert) => matchesDueWindow(alert, "overdue", today)).length,
        tone: "black",
      },
      {
        key: "one-day" as DueWindowFilter,
        label: "Vencem em 1 dia",
        value: filteredOpenAlerts.filter((alert) => matchesDueWindow(alert, "one-day", today)).length,
        tone: "red",
      },
      {
        key: "three-days" as DueWindowFilter,
        label: "Vencem em 3 dias",
        value: filteredOpenAlerts.filter((alert) => matchesDueWindow(alert, "three-days", today)).length,
        tone: "orange",
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
        .filter(matchesFilters)
        .filter((alert) => matchesDueWindow(alert, dueWindowFilter, today)),
    ),
    [data.documentAlerts, dueWindowFilter, filters, today],
  );
  const hasActiveFilters = Boolean(
    filters.companyIds.length
    || filters.employeeIds.length
    || filters.documentName
    || filters.priorities.length
    || dueWindowFilter !== "all",
  );

  const filterEmployees = useMemo(
    () => data.employees.filter((employee) => !filters.companyIds.length || filters.companyIds.includes(employee.companyId)),
    [data.employees, filters.companyIds],
  );

  function resetTablePages() {
    setTablePages({ active: 1, renewed: 1, completed: 1 });
  }

  function toggleDueWindowFilter(filter: DueWindowFilter) {
    setDueWindowFilter((current) => current === filter ? "all" : filter);
    resetTablePages();
  }

  function openCompletionModal(alertId: string) {
    setCompletionDraft({
      alertId,
      realizedDate: today,
      replaceDocument: false,
      fileName: "",
    });
  }

  function closeCompletionModal() {
    if (completionSaving) return;
    setCompletionDraft(null);
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
          <td colSpan={9}>
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
      const completedAt = alert.completedAt;

      return (
        <tr key={alert.id}>
          <td className="strong-cell">
            {alert.title}
            <br />
            <span className="muted">{alert.description || "-"}</span>
          </td>

          <td>{getCompanyName(alert)}</td>

          <td>{getEmployeeName(alert)}</td>

          <td>{getDocumentName(alert)}</td>

          <td>
            {type === "completed" ? formatDate(alert.dueDate) : formatDate(notifyDate)}

            {type !== "completed" ? (
              <>
                <br />
                <span className="muted">
                  Vence em: {formatDate(alert.dueDate)}
                  {advanceDays > 0 ? ` - ${advanceDays} dia(s) antes` : " - alerta no vencimento"}
                </span>
              </>
            ) : null}

            {type !== "completed" && isRecurring(alert.recurrence) && nextDueDate ? (
              <>
                <br />
                <span className="muted">Ao concluir, renova para: {formatDate(getNotifyDate(nextDueDate, advanceDays))}</span>
              </>
            ) : null}
          </td>

          <td>
            {completedAt ? formatDate(completedAt.slice(0, 10)) : "-"}
          </td>

          <td>
            <span className={`badge ${badgeClass(alert.priority)}`}>
              {labelStatus(alert.priority)}
            </span>
          </td>

          <td>
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

          <td className="action-row">
            {document?.fileUrl ? (
              <button
                className="table-action"
                type="button"
                onClick={() => openEmployeeDocumentFile(document.fileUrl, document.name).catch((error) => {
                  window.alert(error instanceof Error ? error.message : "Nao foi possivel abrir o documento.");
                })}
              >
                <ExternalLink size={15} /> Ver
              </button>
            ) : null}

            {type !== "completed" ? (
              <button className="btn btn-soft" type="button" onClick={() => openCompletionModal(alert.id)}>
                <Check size={15} /> Concluir
              </button>
            ) : null}
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
    const totalPages = Math.max(1, Math.ceil(alerts.length / pageSize));
    const currentPage = Math.min(tablePages[type], totalPages);
    const firstItem = (currentPage - 1) * pageSize;
    const visibleAlerts = alerts.slice(firstItem, firstItem + pageSize);
    const sectionBodyId = `${type}-alert-table`;
    const isSectionOpen = sectionOpen[type];
    const fromItem = alerts.length ? firstItem + 1 : 0;
    const toItem = alerts.length ? Math.min(firstItem + visibleAlerts.length, alerts.length) : 0;

    function goToPage(nextPage: number) {
      setTablePages((current) => ({ ...current, [type]: Math.min(Math.max(1, nextPage), totalPages) }));
    }

    return (
      <article className="panel alert-table-section" style={{ marginTop: 16 }}>
        <button
          aria-controls={sectionBodyId}
          aria-expanded={isSectionOpen}
          className="panel-header alert-section-toggle"
          type="button"
          onClick={() => setSectionOpen((current) => ({ ...current, [type]: !current[type] }))}
        >
          <span className="alert-section-title-wrap">
            <span className="panel-title">
              {icon} {title}
            </span>
            <span className="panel-subtitle">{alerts.length} alerta(s) neste filtro.</span>
          </span>
          <span className="alert-section-caret" aria-hidden="true">
            {isSectionOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </span>
        </button>

        {isSectionOpen ? (
          <div className="alert-table-wrap" id={sectionBodyId}>
            <div className="table-panel">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Alerta</th>
                    <th>Empresa</th>
                    <th>Funcionario</th>
                    <th>Documento</th>
                    <th>{type === "completed" ? "Vencimento" : "Notifica em"}</th>
                    <th>Data de realizado</th>
                    <th>Prioridade</th>
                    <th>Status</th>
                    <th>Acoes</th>
                  </tr>
                </thead>
                <tbody>{renderRows(visibleAlerts, type)}</tbody>
              </table>
            </div>

            <div className="alert-table-pagination">
              <span>
                Mostrando {fromItem}-{toItem} de {alerts.length}
              </span>
              <div>
                <button className="btn btn-secondary" type="button" disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)}>
                  Anterior
                </button>
                <span className="module-pill">Pagina {currentPage} de {totalPages}</span>
                <button className="btn btn-secondary" type="button" disabled={currentPage >= totalPages} onClick={() => goToPage(currentPage + 1)}>
                  Proxima
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </article>
    );
  }

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
            <strong>{card.value}</strong>
            <span>{card.label}</span>
            <small>{dueWindowFilter === card.key ? "Filtro aplicado" : "Clique para filtrar"}</small>
          </button>
        ))}
      </div>

      <div className="filters-panel alert-filters">
        <Filter size={18} />
        <MultiSelect
          label="Empresas"
          placeholder="Empresas"
          value={filters.companyIds}
          onChange={(companyIds) => setFilters({ ...filters, companyIds, employeeIds: [] })}
          options={data.companies.map((company) => ({ value: company.id, label: company.name }))}
        />
        <MultiSelect
          label="Funcionários"
          placeholder="Funcionários"
          value={filters.employeeIds}
          onChange={(employeeIds) => setFilters({ ...filters, employeeIds })}
          options={filterEmployees.map((employee) => ({ value: employee.id, label: employee.name }))}
        />
        <label className="alert-search-field">
          <Search size={16} />
          <input
            value={filters.documentName}
            onChange={(event) => setFilters({ ...filters, documentName: event.target.value })}
            placeholder="Nome do documento"
          />
        </label>
        <MultiSelect
          label="Prioridade"
          placeholder="Prioridade"
          value={filters.priorities}
          onChange={(priorities) => setFilters({ ...filters, priorities: priorities as AlertPriority[] })}
          options={[
            { value: "high", label: "Alta" },
            { value: "medium", label: "Média" },
            { value: "low", label: "Baixa" },
          ]}
        />
        <ClearFiltersButton active={hasActiveFilters} onClear={() => {
          setFilters(initialNotificationsFilters);
          setDueWindowFilter("all");
          resetTablePages();
        }} />
      </div>

      <AlertTableSection alerts={nextAlerts} type="active" title="Proximos alertas" icon={<Bell size={18} />} />
      <AlertTableSection alerts={programmedAlerts} type="renewed" title="Renovacoes futuras" icon={<RotateCcw size={18} />} />
      <AlertTableSection alerts={completedAlerts} type="completed" title="Arquivos concluidos" icon={<CheckCircle2 size={18} />} />

      {completionDraft ? (
        <div className="modal-backdrop">
          <div className="modal-panel alert-completion-modal" role="dialog" aria-modal="true" aria-labelledby="alert-completion-title">
            <div className="modal-header">
              <div>
                <h2 id="alert-completion-title">Concluir documento</h2>
                <p className="panel-subtitle">Confirme a data realizada e escolha se deseja substituir o anexo atual.</p>
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
              <label className="alert-completion-check">
                <input
                  type="checkbox"
                  checked={completionDraft.replaceDocument}
                  onChange={(event) => setCompletionDraft((current) => current
                    ? {
                        ...current,
                        replaceDocument: event.target.checked,
                        file: event.target.checked ? current.file : undefined,
                        fileName: event.target.checked ? current.fileName : "",
                      }
                    : current)}
                />
                <span>Atualizar e anexar um novo documento</span>
              </label>

              {completionDraft.replaceDocument ? (
                <label className="document-file-field alert-completion-file">
                  <input
                    type="file"
                    onChange={(event) => updateCompletionFile(event.target.files?.[0])}
                  />
                  <span>
                    <Upload size={16} />
                    {completionDraft.fileName || "Selecionar novo documento"}
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
        </div>
      ) : null}
    </section>
  );
}

import { ChevronDown, ChevronRight, Folder } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { employeeProcessModalityLabel } from "@/modules/employees/experience";
import { useRecordsContext } from "@/modules/records/context/RecordsContext";
import { todayISO } from "@/utils/format";

export default function CompanyFolderSidebar() {
  const {
    effectiveEmployeeId,
    folderGroups,
    setSelectedEmployeeId,
  } = useRecordsContext();

  const [openCompanyIds, setOpenCompanyIds] = useState<string[]>([]);
  const selectedCompanyId = useMemo(() => (
    folderGroups.find((group) => group.employees.some((item) => item.employee.id === effectiveEmployeeId))?.id
  ), [effectiveEmployeeId, folderGroups]);

  useEffect(() => {
    const companyId = selectedCompanyId || folderGroups[0]?.id;
    if (!companyId) return;

    setOpenCompanyIds((current) => (current.includes(companyId) ? current : [...current, companyId]));
  }, [folderGroups, selectedCompanyId]);

  function toggleCompany(companyId: string) {
    setOpenCompanyIds((current) => (
      current.includes(companyId)
        ? current.filter((id) => id !== companyId)
        : [...current, companyId]
    ));
  }

  return (
    <aside className="panel folders-panel">
      <h2 className="panel-title">Pastas dos funcionários</h2>
      <div className="employee-folder-tree">
        {folderGroups.map((group) => {
          const isOpen = openCompanyIds.includes(group.id);

          return (
            <div className="company-folder-group" key={group.id}>
              <button
                className={`company-folder-button ${isOpen ? "is-open" : ""}`.trim()}
                type="button"
                onClick={() => toggleCompany(group.id)}
                aria-expanded={isOpen}
              >
                {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span className="company-folder-info">
                  <strong>{group.companyName}</strong>
                  <small>{group.employeeCount} funcionários</small>
                </span>
                <span className="folder-counter-stack">
                  <strong className="company-folder-count" title="Total de documentos">{group.documentCount}</strong>
                  {group.missingAlertCount ? (
                    <strong className="folder-missing-alert-count" title="Documentos sem alerta">{group.missingAlertCount} sem alerta</strong>
                  ) : null}
                </span>
              </button>

              {isOpen ? (
                <div className="company-folder-employees">
                  {group.employees.map(({ employee, departmentName, documentCount, missingAlertCount }) => {
                    const hasScheduledDismissal = Boolean(
                      employee.registrationData?.terminationMode
                      || employee.registrationData?.noticeStartDate
                      || employee.registrationData?.noticeScheduledAt
                      || employee.registrationData?.noticeEndDate
                      || employee.registrationData?.noticeDate
                      || employee.registrationData?.scheduledDeactivationDate
                      || employee.registrationData?.deactivationEffectiveDate
                      || employee.registrationData?.deactivationScheduledAt,
                    );
                    const isDismissed = employee.status === "terminated" || (hasScheduledDismissal && !employee.registrationData?.dismissalApprovedAt && !employee.registrationData?.dismissalCancelledAt);
                    const isArchivedDismissal = Boolean(employee.registrationData?.dismissalApprovedAt);
                    const processModalityLabel = employeeProcessModalityLabel(employee, todayISO());
                    const modalityBadgeClass = processModalityLabel === "Aviso prévio"
                      || processModalityLabel === "Aviso prévio indenizado"
                      || processModalityLabel === "Aviso prévio do empregado"
                      ? "is-warning"
                      : processModalityLabel === "Contrato de experiência"
                        ? "is-info"
                        : processModalityLabel === "Desativação rápida"
                          ? "is-danger"
                          : "";

                    return (
                      <div className="employee-folder-card" key={employee.id}>
                        <button
                          className={[
                            effectiveEmployeeId === employee.id ? "is-selected" : "",
                            isDismissed ? "is-dismissed" : "",
                          ].filter(Boolean).join(" ") || undefined}
                          type="button"
                          onClick={() => setSelectedEmployeeId(employee.id)}
                        >
                          <Folder size={16} />
                          <span className="employee-folder-info">
                            <strong>{employee.name}</strong>
                            <small>{departmentName}</small>
                            {processModalityLabel ? <span className={`employee-folder-modality-badge ${modalityBadgeClass}`.trim()}>{processModalityLabel}</span> : null}
                          </span>
                          <span className="folder-counter-stack is-employee">
                            <strong className="employee-doc-count" title="Total de documentos">{documentCount}</strong>
                            {!isDismissed && !isArchivedDismissal && missingAlertCount ? (
                              <strong className="folder-missing-alert-count" title="Documentos sem alerta">{missingAlertCount} sem alerta</strong>
                            ) : null}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
        {!folderGroups.length ? <p className="empty-folder-message">Nenhuma pasta encontrada.</p> : null}
      </div>
    </aside>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useDomainData } from "@/hooks/useDomainData";
import { buildDomainDeletionImpact } from "@/common/utils/deletionImpact";
import useCreateShortcut from "@/hooks/useCreateShortcut";
import { useCompanyFolderGroups } from "@/modules/records/hooks/useCompanyFolderGroups";
import { useDocumentDrafts } from "@/modules/records/hooks/useDocumentDrafts";
import { useRecordsFilters } from "@/modules/records/hooks/useRecordsFilters";
import { useRecordsPermissions } from "@/modules/records/hooks/useRecordsPermissions";
import { useSelectedEmployeeDocuments } from "@/modules/records/hooks/useSelectedEmployeeDocuments";
import type { ConfirmActionState } from "@/modules/records/types";
import {
  buildEmployeeFolderPath,
  documentKindFromFileName,
  employeeStandardDocumentRole,
  formatDocumentFileSize,
  normalizeStandardDocumentRoleKey,
  nextDueDateFromRecurrence,
  parseStandardDocumentNames,
  roleStandardDocumentNames,
  subtractDaysFromISODate,
} from "@/modules/records/utils/recordsDocuments";
import { openEmployeeDocumentFile, uploadEmployeeDocumentFile } from "@/services/documentStorage";
import type { AlertPriority, DocumentAlert, Employee, EmployeeDocument, NotifyChannel } from "@/types/domain";
import { getAlertStatus } from "@/utils/format";
import type {
  AlertEditorForm,
  DocumentDraft,
  StandardDocumentRoleOption,
  StandardDocumentsScopeType,
} from "@/modules/records/types";

export function useRecordsModel() {
  const data = useDomainData();
  const permissions = useRecordsPermissions();
  const recordsFilters = useRecordsFilters({
    employees: data.employees,
    companies: data.companies,
    companyGroups: data.companyGroups,
    companyGroupCompanies: data.companyGroupCompanies,
    departments: data.departments,
    sectors: data.sectors,
    subsectors: data.subsectors,
  });
  const {
    documents,
    resetDocuments,
    updateDocument,
    addDocument,
    handleFile,
  } = useDocumentDrafts({ createAlerts: permissions.canCreateAlerts });
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [draftEmployeeId, setDraftEmployeeId] = useState("");
  const [alertEditorOpen, setAlertEditorOpen] = useState(false);
  const [alertForm, setAlertForm] = useState<AlertEditorForm>({});
  const [confirmState, setConfirmState] = useState<ConfirmActionState | null>(null);
  const [standardDocsModalOpen, setStandardDocsModalOpen] = useState(false);
  const [standardDocsScopeType, setStandardDocsScopeType] = useState<StandardDocumentsScopeType>("group");
  const [standardDocsGroupId, setStandardDocsGroupId] = useState("");
  const [standardDocsCompanyId, setStandardDocsCompanyId] = useState("");
  const [standardDocsRoleKey, setStandardDocsRoleKey] = useState("");
  const [standardDocsText, setStandardDocsText] = useState("");
  const [savingStandardDocs, setSavingStandardDocs] = useState(false);

  const companyById = useMemo(() => new Map(data.companies.map((company) => [company.id, company])), [data.companies]);
  const departmentById = useMemo(() => new Map(data.departments.map((department) => [department.id, department])), [data.departments]);
  const sectorById = useMemo(() => new Map(data.sectors.map((sector) => [sector.id, sector])), [data.sectors]);
  const subsectorById = useMemo(() => new Map(data.subsectors.map((subsector) => [subsector.id, subsector])), [data.subsectors]);
  const teamById = useMemo(() => new Map(data.teams.map((team) => [team.id, team])), [data.teams]);
  const standardDocsGroupOptions = useMemo(() => recordsFilters.groupOptions, [recordsFilters.groupOptions]);
  const standardDocsCompanyOptions = useMemo(() => (
    data.companies
      .map((company) => ({ value: company.id, label: company.name }))
      .sort((left, right) => left.label.localeCompare(right.label, "pt-BR", { sensitivity: "base", numeric: true }))
  ), [data.companies]);
  const defaultStandardDocsGroupId = useMemo(() => {
    const macroGroup = standardDocsGroupOptions.find((group) => {
      const normalized = group.label
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      return normalized.includes("grupo macro") || normalized.includes("macro");
    });
    return macroGroup?.value || standardDocsGroupOptions[0]?.value || "";
  }, [standardDocsGroupOptions]);
  const companyIdsByGroupId = useMemo(() => (
    data.companyGroupCompanies.reduce<Map<string, string[]>>((acc, relation) => {
      const ids = acc.get(relation.groupId) || [];
      ids.push(relation.companyId);
      acc.set(relation.groupId, ids);
      return acc;
    }, new Map())
  ), [data.companyGroupCompanies]);
  const standardDocsScopeCompanyIds = useMemo(() => {
    if (standardDocsScopeType === "group") {
      return standardDocsGroupId ? Array.from(new Set(companyIdsByGroupId.get(standardDocsGroupId) || [])) : [];
    }

    return standardDocsCompanyId ? [standardDocsCompanyId] : [];
  }, [companyIdsByGroupId, standardDocsCompanyId, standardDocsGroupId, standardDocsScopeType]);
  const standardDocsRoles = useMemo<StandardDocumentRoleOption[]>(() => {
    const scopeCompanyIds = new Set(standardDocsScopeCompanyIds);
    if (!scopeCompanyIds.size) return [];

    const rolesByKey = data.employees.reduce<Map<string, {
      key: string;
      label: string;
      employeeCount: number;
      companyIds: Set<string>;
    }>>((acc, employee) => {
      if (!scopeCompanyIds.has(employee.companyId)) return acc;

      const label = employeeStandardDocumentRole(employee);
      const key = normalizeStandardDocumentRoleKey(label);
      const current = acc.get(key) || {
        key,
        label,
        employeeCount: 0,
        companyIds: new Set<string>(),
      };
      current.employeeCount += 1;
      current.companyIds.add(employee.companyId);
      acc.set(key, current);
      return acc;
    }, new Map());

    return Array.from(rolesByKey.values())
      .map((role) => {
        const companyIds = Array.from(role.companyIds);
        const configuredCompanyIds = companyIds.filter((companyId) => (
          roleStandardDocumentNames(companyById.get(companyId), role.label).length > 0
        ));
        const documentNames = companyIds
          .map((companyId) => roleStandardDocumentNames(companyById.get(companyId), role.label))
          .find((names) => names.length > 0) || [];

        return {
          key: role.key,
          label: role.label,
          employeeCount: role.employeeCount,
          companyCount: companyIds.length,
          companyIds,
          documentNames,
          documentCount: documentNames.length,
          missingCompanyCount: Math.max(0, companyIds.length - configuredCompanyIds.length),
          isConfigured: companyIds.length > 0 && configuredCompanyIds.length === companyIds.length,
        };
      })
      .sort((left, right) => {
        if (left.isConfigured !== right.isConfigured) return left.isConfigured ? 1 : -1;
        return left.label.localeCompare(right.label, "pt-BR", { sensitivity: "base", numeric: true });
      });
  }, [companyById, data.employees, standardDocsScopeCompanyIds]);

  const folderGroups = useCompanyFolderGroups({
    employees: recordsFilters.filteredEmployees,
    companies: data.companies,
    departments: data.departments,
    employeeDocuments: data.employeeDocuments,
    documentAlerts: data.documentAlerts,
  });

  const {
    effectiveEmployeeId,
    selectedEmployee,
    selectedDocuments,
    activeAlertCount,
  } = useSelectedEmployeeDocuments({
    employees: data.employees,
    employeeDocuments: data.employeeDocuments,
    documentAlerts: data.documentAlerts,
    filteredEmployees: recordsFilters.filteredEmployees,
    selectedEmployeeId,
  });

  function parseDismissalSelection(employee?: Employee) {
    if (!employee?.registrationData?.dismissalSelectedDocumentIds) return [] as string[];

    try {
      const parsed = JSON.parse(employee.registrationData.dismissalSelectedDocumentIds) as string[];
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return [] as string[];
    }
  }

  function parseDismissalAlertSnapshot(employee?: Employee) {
    if (!employee?.registrationData?.dismissalAlertSnapshot) return [] as DocumentAlert[];

    try {
      const parsed = JSON.parse(employee.registrationData.dismissalAlertSnapshot) as DocumentAlert[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [] as DocumentAlert[];
    }
  }

  const dismissalSelectedDocumentIds = useMemo(() => parseDismissalSelection(selectedEmployee), [selectedEmployee]);

  function employeeCompany(employee?: Employee) {
    return employee ? companyById.get(employee.companyId) : undefined;
  }

  function employeeDepartment(employee?: Employee) {
    return employee ? departmentById.get(employee.departmentId) : undefined;
  }

  function employeeSector(employee?: Employee) {
    return employee ? sectorById.get(employee.sectorId) : undefined;
  }

  function employeeSubsector(employee?: Employee) {
    return employee?.subsectorId ? subsectorById.get(employee.subsectorId) : undefined;
  }

  function employeeTeam(employee?: Employee) {
    return employee?.teamId ? teamById.get(employee.teamId) : undefined;
  }

  function resolveDocumentDraftDates(documentDraft: DocumentDraft) {
    const realizedDate = documentDraft.realizedDate || "";
    const expirationDate = documentDraft.expirationDate || nextDueDateFromRecurrence(realizedDate, documentDraft.alertRecurrence);

    return { realizedDate, expirationDate };
  }

  function applyDocumentDateRules(documentDraft: DocumentDraft, patch: Partial<DocumentDraft>) {
    const next = { ...documentDraft, ...patch };
    let expirationDateSource = next.expirationDateSource || "manual";

    if (Object.prototype.hasOwnProperty.call(patch, "expirationDate")) {
      expirationDateSource = patch.expirationDate ? "manual" : "auto";
    }

    if (expirationDateSource === "auto" || (!next.expirationDate && next.realizedDate)) {
      const autoDueDate = nextDueDateFromRecurrence(next.realizedDate || "", next.alertRecurrence);
      next.expirationDate = autoDueDate;
      expirationDateSource = autoDueDate ? "auto" : "manual";
    }

    next.expirationDateSource = expirationDateSource;
    return next;
  }

  function updateDocumentWithDateRules(documentId: string, patch: Partial<DocumentDraft>) {
    const current = documents.find((documentDraft) => documentDraft.id === documentId);
    updateDocument(documentId, current ? applyDocumentDateRules(current, patch) : patch);
  }

  function openWizard(employeeId = selectedEmployee?.id || "") {
    if (!permissions.canCreateDocuments) return;

    setDraftEmployeeId(employeeId);
    resetDocuments();
    setWizardStep(1);
    setWizardOpen(true);
  }

  function textForStandardDocsRole(roleKey: string, roles = standardDocsRoles) {
    return roles.find((role) => role.key === roleKey)?.documentNames.join("\n") || "";
  }

  useEffect(() => {
    if (!standardDocsModalOpen) return;
    if (standardDocsRoleKey && standardDocsRoles.some((role) => role.key === standardDocsRoleKey)) return;

    const firstRole = standardDocsRoles[0];
    setStandardDocsRoleKey(firstRole?.key || "");
    setStandardDocsText(firstRole?.documentNames.join("\n") || "");
  }, [standardDocsModalOpen, standardDocsRoleKey, standardDocsRoles]);

  function openStandardDocsModal(companyId = recordsFilters.filters.companyIds[0] || selectedEmployee?.companyId || data.companies[0]?.id || "") {
    if (!permissions.canManageStandardDocuments) return;

    const groupId = recordsFilters.filters.groupIds[0] || defaultStandardDocsGroupId;
    if (groupId) {
      setStandardDocsScopeType("group");
      setStandardDocsGroupId(groupId);
    } else {
      setStandardDocsScopeType("company");
    }
    setStandardDocsCompanyId(companyId);
    setStandardDocsRoleKey("");
    setStandardDocsText("");
    setStandardDocsModalOpen(true);
  }

  function updateStandardDocsScope(scopeType: StandardDocumentsScopeType, scopeId: string) {
    setStandardDocsScopeType(scopeType);
    if (scopeType === "group") {
      setStandardDocsGroupId(scopeId);
    } else {
      setStandardDocsCompanyId(scopeId);
    }
    setStandardDocsRoleKey("");
    setStandardDocsText("");
  }

  function updateStandardDocsRole(roleKey: string) {
    setStandardDocsRoleKey(roleKey);
    setStandardDocsText(textForStandardDocsRole(roleKey));
  }

  async function saveStandardDocs() {
    const selectedRole = standardDocsRoles.find((role) => role.key === standardDocsRoleKey);
    if (!selectedRole || savingStandardDocs || !permissions.canManageStandardDocuments) return;

    const nextNames = parseStandardDocumentNames(standardDocsText);
    if (!nextNames.length) {
      window.alert("Informe ao menos um documento padrão.");
      return;
    }

    const companiesToUpdate = selectedRole.companyIds
      .map((companyId) => data.companies.find((company) => company.id === companyId))
      .filter((company): company is NonNullable<typeof company> => Boolean(company));

    if (!companiesToUpdate.length) {
      window.alert("Nenhuma empresa encontrada para esta fun\u00e7\u00e3o.");
      return;
    }

    setSavingStandardDocs(true);
    try {
      const now = new Date().toISOString();
      await Promise.all(companiesToUpdate.map((company) => data.upsertCompany({
        ...company,
        standardDocumentNamesByRole: {
          ...(company.standardDocumentNamesByRole || {}),
          [selectedRole.key]: nextNames,
        },
        updatedAt: now,
      })));
      setStandardDocsModalOpen(false);
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : "Não foi possível salvar os documentos padrões.");
    } finally {
      setSavingStandardDocs(false);
    }
  }

  async function saveDocuments() {
    if (!permissions.canCreateDocuments) return;

    const employee = data.employees.find((item) => item.id === draftEmployeeId);
    if (!employee) return;

    const now = new Date().toISOString();
    const company = employeeCompany(employee);
    const department = employeeDepartment(employee);
    const sector = employeeSector(employee);
    const subsector = employeeSubsector(employee);
    const folderPath = buildEmployeeFolderPath([company?.name, department?.name, sector?.name, subsector?.name, employee.name]);

    try {
      for (const documentDraft of documents.filter((item) => item.name.trim())) {
        const fileUrl = documentDraft.file
          ? await uploadEmployeeDocumentFile(employee.id, documentDraft.file)
          : documentDraft.fileUrl;
        const { realizedDate, expirationDate } = resolveDocumentDraftDates(documentDraft);
        const savedDocument = await data.upsertEmployeeDocument({
          companyId: employee.companyId,
          groupId: employee.groupId || "",
          departmentId: employee.departmentId,
          sectorId: employee.sectorId,
          subsectorId: employee.subsectorId,
          employeeId: employee.id,
          name: documentDraft.name,
          kind: documentDraft.kind,
          folderPath,
          fileUrl,
          size: documentDraft.size || "-",
          realizedDate,
          expirationDate,
          active: true,
          createdAt: documentDraft.attachmentDate || now,
          attachmentDate: documentDraft.attachmentDate,
          updatedAt: now,
        });

        if (permissions.canCreateAlerts && documentDraft.createAlert && expirationDate) {
          const advanceDays = Number(documentDraft.alertAdvanceDays || 0);
          const notifyDate = subtractDaysFromISODate(expirationDate, advanceDays);
          await data.upsertDocumentAlert({
            documentId: savedDocument.id,
            employeeId: employee.id,
            companyId: employee.companyId,
            title: documentDraft.alertTitle || `Alerta - ${documentDraft.name}`,
            dueDate: expirationDate,
            advanceDays,
            notifyBeforeDays: advanceDays,
            notifyDate,
            priority: documentDraft.alertPriority,
            status: getAlertStatus(notifyDate),
            recurrence: documentDraft.alertRecurrence,
            notifyBy: documentDraft.notifyBy,
            description: documentDraft.alertDescription,
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      setSelectedEmployeeId(employee.id);
      setWizardOpen(false);
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : "Não foi possível salvar o documento no banco de dados.");
    }
  }

  function toggleDocument(documentId: string) {
    if (!permissions.canEditDocuments) return;

    const document = data.employeeDocuments.find((item) => item.id === documentId);
    if (!document) return;

    setConfirmState({
      title: `${document.active === false ? "Ativar" : "Desativar"} documento`,
      description: `Deseja alterar a situação de ${document.name}?`,
      confirmLabel: document.active === false ? "Ativar" : "Desativar",
      onConfirm: async () => {
        await data.upsertEmployeeDocument({ ...document, active: document.active === false, updatedAt: new Date().toISOString() });
      },
    });
  }

  function toggleDismissalDocumentSelection(documentId: string) {
    if (!selectedEmployee) return;

    const nextIds = dismissalSelectedDocumentIds.includes(documentId)
      ? dismissalSelectedDocumentIds.filter((id) => id !== documentId)
      : [...dismissalSelectedDocumentIds, documentId];

    void data.upsertEmployee({
      ...selectedEmployee,
      registrationData: {
        ...(selectedEmployee.registrationData || {}),
        dismissalSelectedDocumentIds: JSON.stringify(nextIds),
      },
      updatedAt: new Date().toISOString(),
    });
  }

  function confirmDismissalHomologation() {
    if (!selectedEmployee) return;

    const employee = selectedEmployee;
    const selectedDocumentIds = parseDismissalSelection(employee);
    const snapshot = data.documentAlerts.filter((alert) => alert.employeeId === employee.id && alert.status !== "completed");
    const now = new Date().toISOString();

    setConfirmState({
      title: "Homologar demissão",
      description: selectedDocumentIds.length
        ? `Deseja homologar a demissão de ${employee.name} e salvar ${selectedDocumentIds.length} documento(s) selecionado(s) neste processo?`
        : `Deseja homologar a demissão de ${employee.name} sem documentos marcados?`,
      confirmLabel: "Homologar",
      onConfirm: async () => {
        await data.upsertEmployee({
          ...employee,
          status: "terminated",
          registrationData: {
            ...(employee.registrationData || {}),
            dismissalSelectedDocumentIds: JSON.stringify(selectedDocumentIds),
            dismissalAlertSnapshot: JSON.stringify(snapshot),
            dismissalApprovedAt: now,
          },
          updatedAt: now,
        });

        await Promise.all(snapshot.map((alert) => data.upsertDocumentAlert({
          ...alert,
          status: "completed",
          completedAt: now,
          description: alert.description || "Demissão homologada; alerta removido do fluxo ativo.",
          updatedAt: now,
        })));
      },
    });
  }

  function confirmDismissalCancellation() {
    if (!selectedEmployee) return;

    const employee = selectedEmployee;
    const now = new Date().toISOString();
    const snapshot = parseDismissalAlertSnapshot(employee);

    setConfirmState({
      title: "Cancelar demissão",
      description: `Deseja cancelar a demissão de ${employee.name} e restaurar os alertas desta pasta?`,
      confirmLabel: "Cancelar",
      onConfirm: async () => {
        await data.upsertEmployee({
          ...employee,
          status: "active",
          registrationData: {
            ...(employee.registrationData || {}),
            dismissalSelectedDocumentIds: "[]",
            dismissalAlertSnapshot: "",
            dismissalApprovedAt: "",
          },
          updatedAt: now,
        });

        await Promise.all(snapshot.map((alert) => data.upsertDocumentAlert({
          ...alert,
          status: alert.status === "completed" ? "active" : alert.status,
          completedAt: "",
          updatedAt: now,
        })));
      },
    });
  }

  function deleteDocument(documentId: string) {
    if (!permissions.canDeleteDocuments) return;

    const document = data.employeeDocuments.find((item) => item.id === documentId);
    if (!document) return;

    setConfirmState({
      title: "Excluir documento",
      description: `Deseja excluir ${document.name}?`,
      confirmLabel: "Excluir",
      impact: buildDomainDeletionImpact(data, "employeeDocuments", document.id, document.name),
      onConfirm: async () => {
        const now = new Date().toISOString();
        const activeAlerts = data.documentAlerts.filter((alert) => alert.documentId === document.id && alert.status !== "completed");

        if (activeAlerts.length && !permissions.canEditAlerts) {
          window.alert("Seu usuário precisa de permissão para editar notificações antes de excluir documentos com alertas ativos.");
          return;
        }

        await Promise.all(activeAlerts.map((alert) => data.upsertDocumentAlert({
          ...alert,
          status: "completed",
          completedAt: now,
          description: alert.description || "Documento excluído; alerta preservado no histórico.",
          updatedAt: now,
        })));
        await data.removeItem("employeeDocuments", document.id);
      },
    });
  }

  async function updateDocumentAttachment(documentId: string, file: File) {
    if (!permissions.canEditDocuments) return;

    const document = data.employeeDocuments.find((item) => item.id === documentId);
    if (!document) return;

    try {
      const fileUrl = await uploadEmployeeDocumentFile(document.employeeId, file);
      await data.upsertEmployeeDocument({
        ...document,
        fileUrl,
        kind: documentKindFromFileName(file.name),
        size: formatDocumentFileSize(file),
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : "Não foi possível anexar o documento.");
    }
  }

  function openAlertEditor(documentId: string) {
    const document = data.employeeDocuments.find((item) => item.id === documentId);
    if (!document) return;

    const existingAlert = data.documentAlerts.find((item) => item.documentId === document.id && item.status !== "completed");
    if (existingAlert && !permissions.canEditAlerts) return;
    if (!existingAlert && !permissions.canCreateAlerts) return;

    const recurrence = existingAlert?.recurrence || "Anual";
    const realizedDate = document.realizedDate || existingAlert?.completedAt || "";
    const manualDueDate = existingAlert?.dueDate || document.expirationDate || "";
    const autoDueDate = manualDueDate ? "" : nextDueDateFromRecurrence(realizedDate, recurrence);

    setAlertForm(existingAlert ? {
      ...existingAlert,
      attachmentFileName: document.fileUrl ? document.name : "",
      attachmentFileSize: document.size || "",
      attachmentFileUrl: document.fileUrl || "",
      realizedDate,
      dueDateSource: "manual",
    } : {
      documentId: document.id,
      employeeId: document.employeeId,
      companyId: document.companyId,
      title: `Alerta - ${document.name}`,
      dueDate: manualDueDate || autoDueDate,
      dueDateSource: manualDueDate ? "manual" : autoDueDate ? "auto" : "manual",
      realizedDate,
      priority: "medium",
      status: "active",
      recurrence,
      notifyBy: ["system"],
      advanceDays: "30",
      description: "",
      attachmentFileName: document.fileUrl ? document.name : "",
      attachmentFileSize: document.size || "",
      attachmentFileUrl: document.fileUrl || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setAlertEditorOpen(true);
  }

  async function saveAlertEditor() {
    const document = data.employeeDocuments.find((item) => item.id === alertForm.documentId);
    if (!document) return;
    const targetDocument = document;

    const isEditingAlert = Boolean(alertForm.id);
    if (isEditingAlert && !permissions.canEditAlerts) return;
    if (!isEditingAlert && !permissions.canCreateAlerts) return;

    const realizedDate = alertForm.realizedDate || "";
    const dueDate = alertForm.dueDate || nextDueDateFromRecurrence(realizedDate, alertForm.recurrence || "Anual") || "";
    const advanceDays = Number(alertForm.advanceDays || alertForm.notifyBeforeDays || 0);
    const notifyDate = dueDate ? subtractDaysFromISODate(dueDate, advanceDays) : "";
    const now = new Date().toISOString();
    const prevAlert = data.documentAlerts.find((item) => item.id === alertForm.id || (item.documentId === alertForm.documentId && item.status !== "completed"));

    async function persistDocumentChanges(nextDueDate: string, nextRealizedDate: string, updatedAt: string) {
      const attachmentFile = alertForm.attachmentFile;
      const hasAttachmentChange = Boolean(attachmentFile);
      const hasDateChanges = targetDocument.expirationDate !== nextDueDate || (targetDocument.realizedDate || "") !== nextRealizedDate;

      if (!hasAttachmentChange && !hasDateChanges) return true;

      if (!permissions.canEditDocuments) {
        window.alert("Seu usuario precisa de permissao para editar registros antes de alterar o documento.");
        return false;
      }

      const attachmentPatch: Partial<EmployeeDocument> = attachmentFile
        ? {
            fileUrl: await uploadEmployeeDocumentFile(targetDocument.employeeId, attachmentFile),
            kind: documentKindFromFileName(attachmentFile.name),
            size: formatDocumentFileSize(attachmentFile),
          }
        : {};

      await data.upsertEmployeeDocument({
        ...targetDocument,
        realizedDate: nextRealizedDate,
        expirationDate: nextDueDate,
        ...attachmentPatch,
        updatedAt,
      });

      return true;
    }

    // If alert was previously completed and the user removed the completed date, confirm reopening
    const wasPreviouslyCompleted = Boolean(prevAlert && prevAlert.status === "completed");
    const isNowOpen = !alertForm.completedAt;
    if (wasPreviouslyCompleted && isNowOpen) {
      setConfirmState({
        title: "Reabrir alerta",
        description: "Remover a data de realizado reabrirá o alerta. Deseja continuar?",
        confirmLabel: "Reabrir",
        onConfirm: async () => {
          try {
            const advanceDaysInner = Number(alertForm.advanceDays || alertForm.notifyBeforeDays || 0);
            const dueDateInner = alertForm.dueDate || nextDueDateFromRecurrence(alertForm.realizedDate || "", alertForm.recurrence || "Anual") || "";
            const notifyDateInner = subtractDaysFromISODate(dueDateInner, advanceDaysInner);
            const nowInner = new Date().toISOString();

            const documentSaved = await persistDocumentChanges(dueDateInner, alertForm.realizedDate || "", nowInner);
            if (!documentSaved) return;

            await data.upsertDocumentAlert({
              id: alertForm.id,
              documentId: document.id,
              employeeId: document.employeeId,
              companyId: document.companyId,
              title: alertForm.title || `Alerta - ${document.name}`,
              dueDate: dueDateInner,
              advanceDays: advanceDaysInner,
              notifyBeforeDays: advanceDaysInner,
              notifyDate: notifyDateInner,
              priority: (alertForm.priority || "medium") as AlertPriority,
              status: getAlertStatus(notifyDateInner, alertForm.status || "active"),
              completedAt: "",
              recurrence: alertForm.recurrence || "Anual",
              notifyBy: (alertForm.notifyBy || ["system"]) as NotifyChannel[],
              description: alertForm.description || "",
              createdAt: alertForm.createdAt || nowInner,
              updatedAt: nowInner,
            });
            setAlertEditorOpen(false);
          } catch (error) {
            console.error(error);
            window.alert(error instanceof Error ? error.message : "Não foi possível salvar o alerta.");
          }
        },
      });
      return;
    }

    try {
      const documentSaved = await persistDocumentChanges(dueDate, realizedDate, now);
      if (!documentSaved) return;

      await data.upsertDocumentAlert({
        id: alertForm.id,
        documentId: document.id,
        employeeId: document.employeeId,
        companyId: document.companyId,
        title: alertForm.title || `Alerta - ${document.name}`,
        dueDate,
        advanceDays,
        notifyBeforeDays: advanceDays,
        notifyDate,
        priority: (alertForm.priority || "medium") as AlertPriority,
        status: getAlertStatus(notifyDate, alertForm.status === "completed" ? "active" : alertForm.status || "active"),
        completedAt: alertForm.completedAt || "",
        recurrence: alertForm.recurrence || "Anual",
        notifyBy: (alertForm.notifyBy || ["system"]) as NotifyChannel[],
        description: alertForm.description || "",
        createdAt: alertForm.createdAt || now,
        updatedAt: now,
      });
      setAlertEditorOpen(false);
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : "Não foi possível salvar o alerta.");
    }
  }

  async function confirmAction() {
    const action = confirmState;
    setConfirmState(null);
    if (!action) return;

    try {
      await action.onConfirm();
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : "Não foi possível concluir a ação.");
    }
  }

  function openDocument(document: EmployeeDocument) {
    openEmployeeDocumentFile(document.fileUrl, document.name).catch((error) => {
      window.alert(error instanceof Error ? error.message : "Não foi possível abrir o documento.");
    });
  }

  useCreateShortcut(() => {
    openWizard();
  }, permissions.canCreateDocuments);

  return {
    data,
    permissions,
    recordsFilters,
    documents,
    folderGroups,
    effectiveEmployeeId,
    selectedEmployee,
    selectedDocuments,
    activeAlertCount,
    dismissalSelectedDocumentIds,
    wizardOpen,
    wizardStep,
    draftEmployeeId,
    alertEditorOpen,
    alertForm,
    confirmState,
    standardDocsModalOpen,
    standardDocsScopeType,
    standardDocsGroupId,
    standardDocsCompanyId,
    standardDocsRoleKey,
    standardDocsGroupOptions,
    standardDocsCompanyOptions,
    standardDocsRoles,
    standardDocsText,
    savingStandardDocs,
    employeeCompany,
    employeeSector,
    employeeTeam,
    openWizard,
    openStandardDocsModal,
    updateStandardDocsScope,
    updateStandardDocsRole,
    saveStandardDocs,
    saveDocuments,
    setSelectedEmployeeId,
    setWizardOpen,
    setWizardStep,
    setDraftEmployeeId,
    updateDocument,
    addDocument,
    handleFile,
    setAlertEditorOpen,
    setAlertForm,
    setConfirmState,
    setStandardDocsModalOpen,
    setStandardDocsText,
    toggleDocument,
    toggleDismissalDocumentSelection,
    confirmDismissalHomologation,
    confirmDismissalCancellation,
    deleteDocument,
    updateDocumentAttachment,
    openAlertEditor,
    saveAlertEditor,
    confirmAction,
    openDocument,
  };
}

export type RecordsModel = ReturnType<typeof useRecordsModel>;

import type { DeleteImpact } from "@/common/components/DeleteImpactModal";
import type { AlertPriority, DocumentAlert, DocumentKind, Employee, NotifyChannel } from "@/types/domain";

export type DueDateSource = "manual" | "auto";

export interface DocumentDraft {
  id: string;
  file?: File;
  name: string;
  kind: DocumentKind;
  fileUrl: string;
  size: string;
  realizedDate?: string;
  attachmentDate?: string;
  expirationDateSource?: DueDateSource;
  expirationDate: string;
  createAlert: boolean;
  alertTitle: string;
  alertPriority: AlertPriority;
  alertRecurrence: string;
  alertAdvanceDays: string;
  alertDescription: string;
  notifyBy: NotifyChannel[];
}

export type AlertEditorForm = Partial<DocumentAlert> & {
  attachmentFile?: File;
  attachmentFileName?: string;
  attachmentFileSize?: string;
  attachmentFileUrl?: string;
  realizedDate?: string;
  dueDateSource?: DueDateSource;
};

export interface RecordsFiltersState {
  groupIds: string[];
  companyIds: string[];
  departmentIds: string[];
  sectorIds: string[];
  subsectorIds: string[];
  employeeIds: string[];
  cpfValues: string[];
  search: string;
}

export type StandardDocumentsScopeType = "group" | "company";

export interface StandardDocumentRoleOption {
  key: string;
  label: string;
  employeeCount: number;
  companyCount: number;
  companyIds: string[];
  documentNames: string[];
  documentCount: number;
  missingCompanyCount: number;
  isConfigured: boolean;
}

export interface EmployeeFolderItem {
  employee: Employee;
  companyName: string;
  departmentName: string;
  documentCount: number;
  missingAlertCount: number;
  documentsWithoutAlert: Array<{ id: string; name: string }>;
}

export interface CompanyFolderGroup {
  id: string;
  companyName: string;
  employeeCount: number;
  documentCount: number;
  missingAlertCount: number;
  employees: EmployeeFolderItem[];
}

export interface RecordsPermissions {
  canViewRecords: boolean;
  canCreateDocuments: boolean;
  canEditDocuments: boolean;
  canDeleteDocuments: boolean;
  canCreateAlerts: boolean;
  canEditAlerts: boolean;
  canManageStandardDocuments: boolean;
}

export interface ConfirmActionState {
  title: string;
  description: string;
  confirmLabel: string;
  impact?: DeleteImpact;
  onConfirm: () => Promise<void>;
}

export type AlertStatus = "active" | "overdue" | "pending" | "completed";
export type AlertPriority = "high" | "medium" | "low";
export type NotifyChannel = "system" | "email" | "whatsapp";
export type DocumentKind = "folder" | "pdf" | "xlsx" | "image" | "file";
export type EmployeeStatus = "active" | "leave" | "terminated";
export type DraftStatus = "draft" | "in_review" | "completed";
export type AttendanceStatus =
  | "present"
  | "absent"
  | "justified"
  | "leave"
  | "medical_certificate"
  | "absence_pending"
  | "absence_confirmed"
  | "vacation"
  | "day_off";
export type BenefitType = "transport" | "meal" | "food" | "health" | "dental" | "custom";
export type AppScreen =
  | "dashboard"
  | "companies"
  | "records"
  | "employees"
  | "benefits"
  | "timekeeping"
  | "hrControl"
  | "talentBank"
  | "notifications"
  | "monitoring"
  | "permissions";
export type PermissionAction = "view" | "create" | "edit" | "delete" | "manage";

export type AuditAction = "create" | "edit" | "delete" | "deactivate" | "bulk";

export interface AuditLog {
  id: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  entityLabel: string;
  description: string;
  changedFields: string[];
  actorUserId: string;
  actorUsername: string;
  actorName: string;
  createdAt: string;
  metadata: Record<string, string | number | boolean>;
}

export interface TimekeepingDayTable {
  id: string;
  date: string;
  companyIds: string[];
  employeeCount: number;
  recordCount: number;
  absenceCount: number;
  savedByUserId: string;
  savedByUsername: string;
  savedByName: string;
  savedAt: string;
  updatedAt: string;
  version: number;
}

export interface TimekeepingPresence {
  id: string;
  date: string;
  userId: string;
  username: string;
  userName: string;
  startedAt: string;
  heartbeatAt: string;
  expiresAt: string;
}


export type AccessKeyPurpose = "admin" | "document" | "system" | "custom";

export interface AccessKey {
  id: string;
  name: string;
  keyHash: string;
  purpose: AccessKeyPurpose;
  active: boolean;
  createdByUserId?: string;
  createdAt: string;
  updatedAt: string;
  usedAt?: string;
}

export interface EmployeeDocumentFile {
  id: string;
  employeeId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  chunkCount: number;
  storageProvider: "firestore";
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeDocumentFileChunk {
  id: string;
  fileId: string;
  index: number;
  content: string;
}

export interface User {
  id: string;
  username: string;
  name: string;
  role: string;
  position?: string;
  initials: string;
  employeeId?: string;
  isAdmin: boolean;
  permissions: SystemPermission[];
}

export interface SystemUser {
  id: string;
  username: string;
  name: string;
  role: string;
  position?: string;
  initials: string;
  employeeId?: string;
  passwordHash?: string;
  password?: string;
  permissionProfileId?: string;
  active: boolean;
  isAdmin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SystemPermission {
  id: string;
  userId: string;
  screen: AppScreen;
  actions: PermissionAction[];
  updatedAt: string;
}

export type PermissionProfileTargetType =
  | "employee"
  | "group"
  | "company"
  | "department"
  | "sector"
  | "subsector"
  | "position"
  | "role";

export interface PermissionProfileTarget {
  type: PermissionProfileTargetType;
  value: string;
}

export interface PermissionProfile {
  id: string;
  name: string;
  description: string;
  permissions: Partial<Record<AppScreen, PermissionAction[]>>;
  targets: PermissionProfileTarget[];
  active: boolean;
  createdByUserId?: string;
  updatedByUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Company {
  id: string;
  name: string;
  legalName: string;
  document: string;
  location: string;
  active: boolean;
  standardDocumentNames?: string[];
  standardDocumentNamesByRole?: Record<string, string[]>;
  createdAt: string;
  updatedAt?: string;
}

export interface Department {
  id: string;
  companyId: string;
  groupId?: string;
  companyName?: string;
  name: string;
  managerName: string;
  managerEmployeeId?: string;
  description: string;
  active?: boolean;
  createdAt: string;
}

export interface LeadershipAssignment {
  employeeId: string;
  employeeName: string;
  role: string;
}

export interface Sector {
  id: string;
  companyId: string;
  groupId?: string;
  departmentId: string;
  name: string;
  coordinatorName?: string;
  coordinatorEmployeeId?: string;
  leaderName: string;
  leaderEmployeeId?: string;
  costCenter: string;
  leadershipAssignments?: LeadershipAssignment[];
  active?: boolean;
  createdAt: string;
}

export interface Subsector {
  id: string;
  companyId: string;
  groupId?: string;
  departmentId: string;
  sectorId: string;
  name: string;
  leaderName: string;
  leaderEmployeeId?: string;
  leadershipAssignments?: LeadershipAssignment[];
  active?: boolean;
  createdAt: string;
}


export interface Team {
  id: string;
  companyId: string;
  groupId?: string;
  name: string;
  description?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type OrganizationalNodeType = "empresa" | "departamento" | "setor" | "subsetor" | "equipe";
export type EmployeeAssignmentRole = "admin" | "gerente" | "coordenador" | "lider" | "colaborador";

export interface OrganizationalNode {
  id: string;
  companyId: string;
  nome: string;
  tipo: OrganizationalNodeType;
  parentId?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeAssignment {
  id: string;
  companyId: string;
  employeeId: string;
  nodeId: string;
  role: EmployeeAssignmentRole;
  nodeType?: OrganizationalNodeType;
  createdAt: string;
  updatedAt: string;
}

export type CompanyGroupUnitType = "department" | "sector" | "subsector" | "team";
export type CompanyGroupDivergenceMode = "keep_existing" | "use_reference" | "copy_from_source";

export interface CompanyGroup {
  id: string;
  name: string;
  active: boolean;
  autoSyncStructure?: boolean;
  divergenceMode?: CompanyGroupDivergenceMode;
  divergenceSourceCompanyId?: string;
  divergenceTypes?: CompanyGroupUnitType[];
  createdAt: string;
  updatedAt: string;
}

export interface CompanyGroupCompany {
  id: string;
  groupId: string;
  companyId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyGroupUnit {
  id: string;
  groupId: string;
  name: string;
  type: CompanyGroupUnitType;
  parentUnitId?: string;
  coordinatorEmployeeId?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyGroupUnitLink {
  id: string;
  groupId: string;
  groupUnitId: string;
  companyId: string;
  sourceId: string;
  sourceType: CompanyGroupUnitType;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyGroupEmployeeAssignment {
  id: string;
  groupId: string;
  employeeId: string;
  departmentUnitId?: string;
  sectorUnitId?: string;
  subsectorUnitId?: string;
  teamUnitId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyGroupLeadershipAssignment {
  id: string;
  groupId: string;
  employeeId: string;
  unitId: string;
  role: EmployeeAssignmentRole;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyGroupGraphPayload {
  group: Omit<CompanyGroup, "id"> & { id?: string };
  companyIds: string[];
  units: Array<{
    unit: Omit<CompanyGroupUnit, "id" | "groupId"> & { id?: string };
    links: Array<Omit<CompanyGroupUnitLink, "id" | "groupId" | "groupUnitId"> & { id?: string }>;
  }>;
  employeeAssignments: Array<Omit<CompanyGroupEmployeeAssignment, "id" | "groupId"> & { id?: string }>;
  leadershipAssignments: Array<Omit<CompanyGroupLeadershipAssignment, "id" | "groupId"> & { id?: string }>;
}

export type DraftEntity =
  | "company"
  | "department"
  | "sector"
  | "subsector"
  | "employee"
  | "benefit"
  | "timeRecord"
  | "talentCandidate"
  | "permission"
  | "document"
  | "custom";

export interface AppDraft {
  id: string;
  entity: DraftEntity;
  title: string;
  payload: Record<string, unknown>;
  createdByUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export type TimekeepingColumnType = "text" | "number" | "time" | "select" | "system" | "formula";

export interface TimekeepingColumn {
  id: string;
  companyId?: string;
  label: string;
  key: string;
  type: TimekeepingColumnType;
  systemField?: string;
  formula?: string;
  options?: string[];
  optionColors?: Record<string, string>;
  linkedModule?: string;
  relatedField?: string;
  width?: number;
  wrap?: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomModule {
  id: string;
  companyId: string;
  name: string;
  description: string;
  targetScreen: "companies" | "employees" | "records" | "benefits" | "timekeeping" | "talentBank";
  columns: string[];
  active: boolean;
  createdAt: string;
}

export interface BenefitContract {
  id: string;
  companyId: string;
  folderId?: string;
  name: string;
  providerName: string;
  type: BenefitType;
  websiteUrl: string;
  startDate: string;
  endDate: string;
  active: boolean;
  customFields: Record<string, string>;
  createdAt: string;
}

export interface BenefitPlan {
  id: string;
  companyId: string;
  contractId: string;
  name: string;
  type: BenefitType;
  monthlyValue: number;
  discountPerAbsence: number;
  rules: string;
  active?: boolean;
  customFields: Record<string, string>;
  createdAt: string;
}

export interface EmployeeBenefit {
  id: string;
  employeeId: string;
  companyId: string;
  contractId: string;
  planId: string;
  active: boolean;
  cardNumber: string;
  balance: number;
  monthlyCredit: number;
  absenceCount: number;
  reimbursement: number;
  discount: number;
  customFields: Record<string, string>;
  updatedAt: string;
}

export interface EmployeeComplement {
  email: string;
  emergencyContact: string;
  transportVoucher: boolean;
  mealVoucher: boolean;
  foodVoucher: boolean;
  healthPlan: boolean;
  dentalPlan: boolean;
  customBenefits: Record<string, boolean | string | number>;
  notes: string;
}

export interface WorkScheduleDay {
  day: string;
  enabled: boolean;
  start: string;
  breakStart: string;
  breakEnd: string;
  end: string;
}

export type EmployeeRegistrationData = Record<string, string>;

export interface Employee {
  id: string;
  companyId: string;
  groupId?: string;
  departmentId: string;
  sectorId: string;
  subsectorId?: string;
  teamId?: string;
  isTeamLead?: boolean;
  registration: string;
  name: string;
  cpf: string;
  phone: string;
  role: string;
  position?: string;
  workSchedule?: string;
  workScheduleDays?: WorkScheduleDay[];
  weeklyHours?: number;
  salary?: number;
  admissionDate: string;
  status: EmployeeStatus;
  complement: EmployeeComplement;
  registrationData?: EmployeeRegistrationData;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeePromotion {
  id: string;
  employeeId: string;
  effectiveDate: string;
  previousRole: string;
  newRole: string;
  previousPosition: string;
  newPosition: string;
  previousSalary: number;
  newSalary: number;
  previousWeeklyHours: number;
  newWeeklyHours: number;
  notes: string;
  createdAt: string;
}

export interface EmployeeDraft {
  id: string;
  employeeId?: string;
  companyId: string;
  groupId?: string;
  departmentId: string;
  sectorId: string;
  subsectorId?: string;
  step: number;
  status: DraftStatus;
  payload: Partial<Employee>;
  updatedAt: string;
}

export interface EmployeeDocument {
  id: string;
  companyId: string;
  groupId?: string;
  departmentId: string;
  sectorId: string;
  subsectorId?: string;
  employeeId: string;
  name: string;
  kind: DocumentKind;
  folderPath: string;
  fileUrl: string;
  size: string;
  realizedDate?: string;
  attachmentDate?: string;
  expirationDate: string;
  active?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BenefitFolder {
  id: string;
  companyId: string;
  parentId?: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export type BenefitCustomFieldType = "text" | "number" | "currency" | "percent" | "formula";

export interface BenefitCustomField {
  id: string;
  companyId: string;
  folderId?: string;
  benefitContractId?: string;
  label: string;
  key: string;
  type: BenefitCustomFieldType;
  formula: string;
  createdAt: string;
}

export interface DocumentAlert {
  id: string;
  documentId: string;
  employeeId: string;
  companyId: string;
  employeeName?: string;
  documentName?: string;
  companyName?: string;
  title: string;
  dueDate: string;
  advanceDays?: number | string;
  notifyBeforeDays?: number | string;
  notifyDate?: string;
  priority: AlertPriority;
  status: AlertStatus;
  recurrence: string;
  notifyBy: NotifyChannel[];
  description: string;
  completedAt?: string;
  renewedFromAlertId?: string;
  previousDueDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TimeRecord {
  id: string;
  companyId: string;
  groupId?: string;
  companyName?: string;
  employeeId: string;
  employeeName?: string;
  date: string;
  status: AttendanceStatus;
  source: "seculum" | "manual";
  functionName?: string;
  departmentId?: string;
  departmentName?: string;
  sectorId?: string;
  sectorName?: string;
  subsectorId?: string;
  subsectorName?: string;
  realTeamId?: string;
  realTeamName?: string;
  dayTeamId?: string;
  dayTeamName?: string;
  usefulHours?: number;
  baseHours?: number;
  intervalHours?: number;
  overtimePercent?: number;
  overtimeHours?: number;
  overtimeAmount?: number;
  cid?: string;
  customFields?: Record<string, string>;
  checkIn?: string;
  checkOut?: string;
  absenceCount: number;
  notes: string;
  updatedAt: string;
}

export interface TalentCandidate {
  id: string;
  receivedAt: string;
  fullName: string;
  cpf: string;
  phone: string;
  city: string;
  desiredRole: string;
  area: string;
  referral: string;
  firstCall: string;
  secondCall: string;
  interviewed: string;
  approved: string;
  dpAnalysis?: string;
  technicalInterview?: string;
  need?: string;
  hired?: string;
  status: string;
  notes: string;
  employeeDraftId?: string;
  createdAt: string;
}

export interface TalentColumnOption {
  id: string;
  columnKey: keyof TalentCandidate;
  value: string;
  replacedValue?: string;
  color: string;
  active?: boolean;
  createdAt: string;
}

export interface DomainSnapshot {
  systemUsers: SystemUser[];
  systemPermissions: SystemPermission[];
  permissionProfiles: PermissionProfile[];
  accessKeys: AccessKey[];
  companies: Company[];
  departments: Department[];
  sectors: Sector[];
  subsectors: Subsector[];
  teams: Team[];
  organizational_nodes: OrganizationalNode[];
  employee_assignments: EmployeeAssignment[];
  companyGroups: CompanyGroup[];
  companyGroupCompanies: CompanyGroupCompany[];
  companyGroupUnits: CompanyGroupUnit[];
  companyGroupUnitLinks: CompanyGroupUnitLink[];
  companyGroupEmployeeAssignments: CompanyGroupEmployeeAssignment[];
  companyGroupLeadershipAssignments: CompanyGroupLeadershipAssignment[];
  customModules: CustomModule[];
  benefitContracts: BenefitContract[];
  benefitPlans: BenefitPlan[];
  benefitFolders: BenefitFolder[];
  benefitCustomFields: BenefitCustomField[];
  employeeBenefits: EmployeeBenefit[];
  employees: Employee[];
  employeePromotions: EmployeePromotion[];
  employeeDrafts: EmployeeDraft[];
  appDrafts: AppDraft[];
  employeeDocuments: EmployeeDocument[];
  documentAlerts: DocumentAlert[];
  timeRecords: TimeRecord[];
  timekeepingColumns: TimekeepingColumn[];
  talentCandidates: TalentCandidate[];
  talentColumnOptions: TalentColumnOption[];
}

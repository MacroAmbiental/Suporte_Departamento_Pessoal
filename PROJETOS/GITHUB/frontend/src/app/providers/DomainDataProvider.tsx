import { createContext, startTransition, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { where } from "firebase/firestore";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  collectionScreenMap,
  hashPassword,
  isSystemTiUser,
  initialsFromName,
  normalizeUsername,
  permissionId,
  systemScreens,
} from "@/services/accessControl";
import {
  collectionNames,
  commitEntityBatch,
  deleteEntity,
  loadCollection,
  loadDocumentsByIds,
  loadDomainSnapshot,
  saveEntity,
  subscribeDomainCollections,
  type EntityBatchMutation,
} from "@/services/domainRepository";
import { collectionsForScreen, realtimeCollectionsForScreen } from "@/core/firestore/collectionScopes";
import { changeAction, changedFieldNames, entityDisplayName, writeAuditLog } from "@/modules/monitoring/data/auditLogRepository";
import { deleteTimeRecordTree, saveTimeRecordsTree, timeRecordDocumentId } from "@/modules/timekeeping/data/timeRecordsRepository";
import { screenFromPathname } from "@/core/routing/currentScreen";
import type {
  AccessKey,
  AppScreen,
  BenefitCustomField,
  BenefitContract,
  BenefitFolder,
  BenefitPlan,
  Company,
  CompanyGroup,
  CompanyGroupCompany,
  CompanyGroupEmployeeAssignment,
  CompanyGroupGraphPayload,
  CompanyGroupLeadershipAssignment,
  CompanyGroupUnit,
  CompanyGroupUnitLink,
  CustomModule,
  Department,
  DocumentAlert,
  DomainSnapshot,
  Employee,
  EmployeeAssignment,
  EmployeeAssignmentRole,
  EmployeeBenefit,
  EmployeeDocument,
  EmployeeDraft,
  AppDraft,
  EmployeePromotion,
  OrganizationalNode,
  PermissionAction,
  PermissionProfile,
  Sector,
  Subsector,
  Team,
  SystemPermission,
  SystemUser,
  TalentCandidate,
  TalentColumnOption,
  TimeRecord,
  TimekeepingColumn,
} from "@/types/domain";
import { createId, getAlertStatus } from "@/utils/format";

type CollectionName = keyof DomainSnapshot;
type Entity = { id: string };
type UpsertPayload<T extends Entity> = Omit<T, "id"> & { id?: string };
type PermissionMatrix = Partial<Record<AppScreen, PermissionAction[]>>;
type UndoState = { message: string; run: () => Promise<void> };
type AccessKeyConfirmationOptions = {
  title?: string;
  description?: string;
  confirmLabel?: string;
};
type AccessKeyRequest = Required<AccessKeyConfirmationOptions> & {
  resolve: (allowed: boolean) => void;
};
type DeleteOptions = {
  skipAccessKey?: boolean;
};

interface SystemUserPayload {
  id?: string;
  username: string;
  name: string;
  role: string;
  position?: string;
  employeeId?: string;
  password?: string;
  passwordHash?: string;
  permissionProfileId?: string;
  active: boolean;
  isAdmin: boolean;
}

interface DomainDataContextValue extends DomainSnapshot {
  loading: boolean;
  ensureCollectionsLoaded: (names: CollectionName[]) => Promise<DomainSnapshot>;
  undoState: UndoState | null;
  runUndo: () => Promise<void>;
  dismissUndo: () => void;
  confirmAccessKey: (options?: AccessKeyConfirmationOptions) => Promise<boolean>;
  upsertCompany: (payload: UpsertPayload<Company>) => Promise<Company>;
  upsertDepartment: (payload: UpsertPayload<Department>) => Promise<Department>;
  upsertSector: (payload: UpsertPayload<Sector>) => Promise<Sector>;
  upsertSubsector: (payload: UpsertPayload<Subsector>) => Promise<Subsector>;
  upsertTeam: (payload: UpsertPayload<Team>) => Promise<Team>;
  upsertOrganizationalNode: (payload: UpsertPayload<OrganizationalNode>) => Promise<OrganizationalNode>;
  upsertEmployeeAssignment: (payload: UpsertPayload<EmployeeAssignment>) => Promise<EmployeeAssignment>;
  saveCompanyGroupGraph: (payload: CompanyGroupGraphPayload) => Promise<CompanyGroup>;
  deleteCompanyGroupGraph: (groupId: string, options?: DeleteOptions) => Promise<boolean>;
  upsertCompanyGroupEmployeeAssignment: (payload: UpsertPayload<CompanyGroupEmployeeAssignment>) => Promise<CompanyGroupEmployeeAssignment>;
  upsertCompanyGroupLeadershipAssignment: (payload: UpsertPayload<CompanyGroupLeadershipAssignment>) => Promise<CompanyGroupLeadershipAssignment>;
  deleteCompanyGroupLeadershipAssignment: (id: string) => Promise<boolean>;
  upsertCustomModule: (payload: UpsertPayload<CustomModule>) => Promise<CustomModule>;
  upsertBenefitContract: (payload: UpsertPayload<BenefitContract>) => Promise<BenefitContract>;
  upsertBenefitPlan: (payload: UpsertPayload<BenefitPlan>) => Promise<BenefitPlan>;
  upsertBenefitFolder: (payload: UpsertPayload<BenefitFolder>) => Promise<BenefitFolder>;
  upsertBenefitCustomField: (payload: UpsertPayload<BenefitCustomField>) => Promise<BenefitCustomField>;
  upsertEmployeeBenefit: (payload: UpsertPayload<EmployeeBenefit>) => Promise<EmployeeBenefit>;
  upsertEmployee: (payload: UpsertPayload<Employee>) => Promise<Employee>;
  upsertEmployeePromotion: (payload: UpsertPayload<EmployeePromotion>) => Promise<EmployeePromotion>;
  upsertEmployeeDraft: (payload: UpsertPayload<EmployeeDraft>) => Promise<EmployeeDraft>;
  upsertAppDraft: (payload: UpsertPayload<AppDraft>) => Promise<AppDraft>;
  upsertEmployeeDocument: (payload: UpsertPayload<EmployeeDocument>) => Promise<EmployeeDocument>;
  upsertDocumentAlert: (payload: UpsertPayload<DocumentAlert>) => Promise<DocumentAlert>;
  upsertTimeRecord: (payload: UpsertPayload<TimeRecord>) => Promise<TimeRecord>;
  upsertTimeRecords: (records: TimeRecord[]) => Promise<TimeRecord[]>;
  saveTimekeepingDayRecords: (records: TimeRecord[], obsoleteRecordIds?: string[]) => Promise<TimeRecord[]>;
  upsertTimekeepingColumn: (payload: UpsertPayload<TimekeepingColumn>) => Promise<TimekeepingColumn>;
  upsertTalentCandidate: (payload: UpsertPayload<TalentCandidate>) => Promise<TalentCandidate>;
  upsertSystemUser: (payload: SystemUserPayload) => Promise<SystemUser>;
  upsertSystemPermission: (payload: UpsertPayload<SystemPermission>) => Promise<SystemPermission>;
  upsertPermissionProfile: (payload: UpsertPayload<PermissionProfile>) => Promise<PermissionProfile>;
  upsertAccessKey: (payload: UpsertPayload<AccessKey>) => Promise<AccessKey>;
  deleteAccessKey: (id: string) => Promise<boolean>;
  replaceUserPermissions: (userId: string, matrix: PermissionMatrix) => Promise<SystemPermission[]>;
  applyPermissionProfileToUser: (userId: string, profileId: string) => Promise<SystemPermission[]>;
  completeAlert: (id: string) => Promise<void>;
  upsertTalentColumnOption: (payload: UpsertPayload<TalentColumnOption>) => Promise<TalentColumnOption>;
  deleteEmployee: (id: string) => Promise<boolean>;
  deleteCompany: (id: string) => Promise<boolean>;
  deleteDepartment: (id: string) => Promise<boolean>;
  deleteSector: (id: string) => Promise<boolean>;
  deleteSubsector: (id: string) => Promise<boolean>;
  deleteTeam: (id: string) => Promise<boolean>;
  deleteOrganizationalNode: (id: string) => Promise<boolean>;
  deleteEmployeeAssignment: (id: string) => Promise<boolean>;
  deleteTimekeepingColumn: (id: string) => Promise<boolean>;
  deleteBenefitContract: (id: string) => Promise<boolean>;
  deleteBenefitPlan: (id: string) => Promise<boolean>;
  deleteCustomModule: (id: string) => Promise<boolean>;
  clearDomainData: () => Promise<boolean>;
  removeItem: (collection: CollectionName, id: string, options?: DeleteOptions) => Promise<boolean>;
}

const emptySnapshot: DomainSnapshot = {
  systemUsers: [],
  systemPermissions: [],
  permissionProfiles: [],
  accessKeys: [],
  companies: [],
  departments: [],
  sectors: [],
  subsectors: [],
  teams: [],
  organizational_nodes: [],
  employee_assignments: [],
  companyGroups: [],
  companyGroupCompanies: [],
  companyGroupUnits: [],
  companyGroupUnitLinks: [],
  companyGroupEmployeeAssignments: [],
  companyGroupLeadershipAssignments: [],
  customModules: [],
  benefitContracts: [],
  benefitPlans: [],
  benefitFolders: [],
  benefitCustomFields: [],
  employeeBenefits: [],
  employees: [],
  employeePromotions: [],
  employeeDrafts: [],
  appDrafts: [],
  employeeDocuments: [],
  documentAlerts: [],
  timeRecords: [],
  timekeepingColumns: [],
  talentCandidates: [],
  talentColumnOptions: [],
};

const protectedDeleteCollections = new Set<CollectionName>([
  "companies",
  "departments",
  "sectors",
  "subsectors",
  "teams",
  "organizational_nodes",
  "employee_assignments",
  "companyGroups",
  "companyGroupCompanies",
  "companyGroupUnits",
  "companyGroupUnitLinks",
  "companyGroupEmployeeAssignments",
  "companyGroupLeadershipAssignments",
  "customModules",
  "employees",
  "benefitContracts",
  "benefitPlans",
  "benefitFolders",
  "benefitCustomFields",
  "employeeBenefits",
  "systemUsers",
  "systemPermissions",
  "permissionProfiles",
  "accessKeys",
]);

const employeeCascadeCollectionNames: CollectionName[] = [
  "systemUsers",
  "systemPermissions",
  "employeePromotions",
  "employeeDrafts",
  "employeeDocuments",
  "documentAlerts",
  "timeRecords",
  "employeeBenefits",
  "companyGroupEmployeeAssignments",
  "companyGroupLeadershipAssignments",
];

const structureCascadeCollectionNames: CollectionName[] = Array.from(new Set([
  "employees",
  "sectors",
  "subsectors",
  ...employeeCascadeCollectionNames,
]));

const FILTER_QUERY_CHUNK_SIZE = 30;
const retainedAcrossScreens = new Set<CollectionName>([
  "accessKeys",
  "companies",
  "companyGroups",
  "companyGroupCompanies",
  "companyGroupUnits",
  "companyGroupUnitLinks",
  "companyGroupEmployeeAssignments",
  "customModules",
  "departments",
  "permissionProfiles",
  "sectors",
  "subsectors",
  "teams",
  "timekeepingColumns",
]);

function uniqueEntities<T extends Entity>(items: T[]): T[] {
  const byId = new Map<string, T>();
  items.forEach((item) => byId.set(item.id, item));
  return Array.from(byId.values());
}

function snapshotFromPatch(patch: Partial<DomainSnapshot>): DomainSnapshot {
  return { ...emptySnapshot, ...patch } as DomainSnapshot;
}

async function loadByFieldIn<T extends Entity>(
  collectionName: CollectionName,
  fieldName: string,
  values: string[],
): Promise<T[]> {
  const uniqueValues = Array.from(new Set(values.filter(Boolean)));
  if (!uniqueValues.length) return [];

  const results: T[] = [];
  for (let offset = 0; offset < uniqueValues.length; offset += FILTER_QUERY_CHUNK_SIZE) {
    const chunk = uniqueValues.slice(offset, offset + FILTER_QUERY_CHUNK_SIZE);
    const constraints = chunk.length === 1
      ? [where(fieldName, "==", chunk[0])]
      : [where(fieldName, "in", chunk)];
    results.push(...await loadCollection<T>(collectionName, constraints));
  }

  return uniqueEntities(results);
}

async function loadEmployeeDeletionSnapshot(employeeIds: string[]): Promise<DomainSnapshot> {
  const ids = Array.from(new Set(employeeIds.filter(Boolean)));
  if (!ids.length) return emptySnapshot;

  const [
    employees,
    systemUsers,
    employeePromotions,
    employeeDrafts,
    employeeDocuments,
    employeeBenefits,
    companyGroupEmployeeAssignments,
    companyGroupLeadershipAssignments,
  ] = await Promise.all([
    loadDocumentsByIds<Employee>("employees", ids),
    loadByFieldIn<SystemUser>("systemUsers", "employeeId", ids),
    loadByFieldIn<EmployeePromotion>("employeePromotions", "employeeId", ids),
    loadByFieldIn<EmployeeDraft>("employeeDrafts", "employeeId", ids),
    loadByFieldIn<EmployeeDocument>("employeeDocuments", "employeeId", ids),
    loadByFieldIn<EmployeeBenefit>("employeeBenefits", "employeeId", ids),
    loadByFieldIn<CompanyGroupEmployeeAssignment>("companyGroupEmployeeAssignments", "employeeId", ids),
    loadByFieldIn<CompanyGroupLeadershipAssignment>("companyGroupLeadershipAssignments", "employeeId", ids),
  ]);

  const userIds = systemUsers.map((item) => item.id);
  const documentIds = employeeDocuments.map((item) => item.id);
  const [systemPermissions, alertsByEmployee, alertsByDocument] = await Promise.all([
    loadByFieldIn<SystemPermission>("systemPermissions", "userId", userIds),
    loadByFieldIn<DocumentAlert>("documentAlerts", "employeeId", ids),
    loadByFieldIn<DocumentAlert>("documentAlerts", "documentId", documentIds),
  ]);

  return snapshotFromPatch({
    employees,
    systemUsers,
    systemPermissions,
    employeePromotions,
    employeeDrafts,
    employeeDocuments,
    documentAlerts: uniqueEntities([...alertsByEmployee, ...alertsByDocument])
      .filter((item) => item.status !== "completed"),
    employeeBenefits,
    companyGroupEmployeeAssignments,
    companyGroupLeadershipAssignments,
  });
}

async function loadCompanyDeletionSnapshot(companyId: string): Promise<DomainSnapshot> {
  if (!companyId) return emptySnapshot;

  const [
    companies,
    departments,
    sectors,
    subsectors,
    employees,
    teams,
    organizationalNodes,
    employeeAssignments,
    companyGroupRelations,
    benefitContracts,
    benefitPlansByCompany,
    benefitFolders,
    benefitCustomFields,
    customModules,
    documentAlertsByCompany,
    employeeBenefitsByCompany,
    timekeepingColumns,
    companyGroupUnitLinksByCompany,
  ] = await Promise.all([
    loadDocumentsByIds<Company>("companies", [companyId]),
    loadByFieldIn<Department>("departments", "companyId", [companyId]),
    loadByFieldIn<Sector>("sectors", "companyId", [companyId]),
    loadByFieldIn<Subsector>("subsectors", "companyId", [companyId]),
    loadByFieldIn<Employee>("employees", "companyId", [companyId]),
    loadByFieldIn<Team>("teams", "companyId", [companyId]),
    loadByFieldIn<OrganizationalNode>("organizational_nodes", "companyId", [companyId]),
    loadByFieldIn<EmployeeAssignment>("employee_assignments", "companyId", [companyId]),
    loadByFieldIn<CompanyGroupCompany>("companyGroupCompanies", "companyId", [companyId]),
    loadByFieldIn<BenefitContract>("benefitContracts", "companyId", [companyId]),
    loadByFieldIn<BenefitPlan>("benefitPlans", "companyId", [companyId]),
    loadByFieldIn<BenefitFolder>("benefitFolders", "companyId", [companyId]),
    loadByFieldIn<BenefitCustomField>("benefitCustomFields", "companyId", [companyId]),
    loadByFieldIn<CustomModule>("customModules", "companyId", [companyId]),
    loadByFieldIn<DocumentAlert>("documentAlerts", "companyId", [companyId]),
    loadByFieldIn<EmployeeBenefit>("employeeBenefits", "companyId", [companyId]),
    loadByFieldIn<TimekeepingColumn>("timekeepingColumns", "companyId", [companyId]),
    loadByFieldIn<CompanyGroupUnitLink>("companyGroupUnitLinks", "companyId", [companyId]),
  ]);

  const employeeCascade = await loadEmployeeDeletionSnapshot(employees.map((item) => item.id));
  const contractIds = benefitContracts.map((item) => item.id);
  const groupIds = companyGroupRelations.map((item) => item.groupId);
  const [benefitPlansByContract, allRelationsForGroups] = await Promise.all([
    loadByFieldIn<BenefitPlan>("benefitPlans", "contractId", contractIds),
    loadByFieldIn<CompanyGroupCompany>("companyGroupCompanies", "groupId", groupIds),
  ]);

  const groupIdsToDelete = Array.from(new Set(groupIds))
    .filter((groupId) => allRelationsForGroups.filter((item) => item.groupId === groupId).length <= 1);

  const [
    companyGroups,
    companyGroupUnits,
    companyGroupUnitLinksByGroup,
    groupEmployeeAssignments,
    groupLeadershipAssignments,
  ] = await Promise.all([
    loadDocumentsByIds<CompanyGroup>("companyGroups", groupIdsToDelete),
    loadByFieldIn<CompanyGroupUnit>("companyGroupUnits", "groupId", groupIdsToDelete),
    loadByFieldIn<CompanyGroupUnitLink>("companyGroupUnitLinks", "groupId", groupIdsToDelete),
    loadByFieldIn<CompanyGroupEmployeeAssignment>("companyGroupEmployeeAssignments", "groupId", groupIdsToDelete),
    loadByFieldIn<CompanyGroupLeadershipAssignment>("companyGroupLeadershipAssignments", "groupId", groupIdsToDelete),
  ]);

  return snapshotFromPatch({
    companies,
    departments,
    sectors,
    subsectors,
    employees: uniqueEntities([...employees, ...employeeCascade.employees]),
    teams,
    organizational_nodes: organizationalNodes,
    employee_assignments: employeeAssignments,
    companyGroups,
    companyGroupCompanies: uniqueEntities([...companyGroupRelations, ...allRelationsForGroups]),
    companyGroupUnits,
    companyGroupUnitLinks: uniqueEntities([...companyGroupUnitLinksByCompany, ...companyGroupUnitLinksByGroup]),
    companyGroupEmployeeAssignments: uniqueEntities([
      ...employeeCascade.companyGroupEmployeeAssignments,
      ...groupEmployeeAssignments,
    ]),
    companyGroupLeadershipAssignments: uniqueEntities([
      ...employeeCascade.companyGroupLeadershipAssignments,
      ...groupLeadershipAssignments,
    ]),
    systemUsers: employeeCascade.systemUsers,
    systemPermissions: employeeCascade.systemPermissions,
    employeePromotions: employeeCascade.employeePromotions,
    employeeDrafts: employeeCascade.employeeDrafts,
    employeeDocuments: employeeCascade.employeeDocuments,
    documentAlerts: uniqueEntities([...employeeCascade.documentAlerts, ...documentAlertsByCompany])
      .filter((item) => item.status !== "completed"),
    benefitContracts,
    benefitPlans: uniqueEntities([...benefitPlansByCompany, ...benefitPlansByContract]),
    benefitFolders,
    benefitCustomFields,
    customModules,
    employeeBenefits: uniqueEntities([...employeeCascade.employeeBenefits, ...employeeBenefitsByCompany]),
    timekeepingColumns,
  });
}

function subtractDaysFromISODate(isoDate: string, daysToSubtract: number) {
  if (!isoDate) return "";

  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;

  date.setDate(date.getDate() - Math.max(0, daysToSubtract));

  return date.toISOString().slice(0, 10);
}

function getAlertAdvanceDays(alert: { advanceDays?: number | string; notifyBeforeDays?: number | string }) {
  const value = alert.advanceDays ?? alert.notifyBeforeDays ?? 0;
  const numericValue = Number(value);

  return Number.isFinite(numericValue) ? Math.max(0, numericValue) : 0;
}

function getAlertNotifyDate(dueDate: string, alert: { advanceDays?: number | string; notifyBeforeDays?: number | string }) {
  return subtractDaysFromISODate(dueDate, getAlertAdvanceDays(alert));
}

function normalizeEmployeeCpf(value?: string) {
  return String(value || "").replace(/\D/g, "").trim();
}

export const DomainDataContext = createContext<DomainDataContextValue | undefined>(undefined);

export function DomainDataProvider({ children }: { children: ReactNode }) {
  const { can, user } = useAuth();
  const location = useLocation();
  const currentScreen = useMemo(() => screenFromPathname(location.pathname), [location.pathname]);
  const activeCollections = useMemo(() => collectionsForScreen(currentScreen), [currentScreen]);
  const realtimeCollections = useMemo(() => realtimeCollectionsForScreen(currentScreen), [currentScreen]);
  const oneTimeCollections = useMemo(
    () => activeCollections.filter((name) => !realtimeCollections.includes(name)),
    [activeCollections, realtimeCollections],
  );
  const activeCollectionsKey = useMemo(() => activeCollections.join("|"), [activeCollections]);
  const realtimeCollectionsKey = useMemo(() => realtimeCollections.join("|"), [realtimeCollections]);
  const [data, setData] = useState<DomainSnapshot>(emptySnapshot);
  const [loading, setLoading] = useState(Boolean(user));
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const [accessKeyRequest, setAccessKeyRequest] = useState<AccessKeyRequest | null>(null);
  const [accessKeyInput, setAccessKeyInput] = useState("");
  const [accessKeyError, setAccessKeyError] = useState("");
  const [accessKeyBusy, setAccessKeyBusy] = useState(false);
  const undoTimerRef = useRef<number | undefined>(undefined);
  const isUndoingRef = useRef(false);
  const dataRef = useRef<DomainSnapshot>(data);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    if (!user?.id) return;

    const keepCollections = new Set<CollectionName>([
      ...retainedAcrossScreens,
      ...activeCollections,
    ]);

    setData((current) => {
      const next = { ...current } as DomainSnapshot;
      let changed = false;

      collectionNames.forEach((name) => {
        if (keepCollections.has(name) || !(current[name] as Entity[]).length) return;
        (next as unknown as Record<string, Entity[]>)[name] = [];
        changed = true;
      });

      if (!changed) return current;
      dataRef.current = next;
      return next;
    });
  }, [activeCollectionsKey, activeCollections, user?.id]);

  const ensureCollectionsLoaded = useCallback(async (names: CollectionName[]) => {
    const uniqueNames = Array.from(new Set(names));
    if (!uniqueNames.length) return dataRef.current;

    const loaded = await loadDomainSnapshot(uniqueNames);
    const patch = uniqueNames.reduce<Partial<DomainSnapshot>>((result, name) => {
      (result as unknown as Record<string, Entity[]>)[name] = [...(loaded[name] as Entity[])];
      return result;
    }, {});

    const merged = { ...dataRef.current, ...patch } as DomainSnapshot;
    dataRef.current = merged;
    setData(merged);
    return merged;
  }, []);

  useEffect(() => {
    if (!user?.id) {
      dataRef.current = emptySnapshot;
      setData(emptySnapshot);
      setLoading(false);
      return undefined;
    }

    let alive = true;
    setLoading(true);

    // Carregamento único e cacheado para coleções da tela. Isso evita abrir
    // listeners para centenas de documentos que quase nunca mudam.
    void loadDomainSnapshot(oneTimeCollections)
      .then((snapshot) => {
        if (!alive) return;
        const patch = oneTimeCollections.reduce<Partial<DomainSnapshot>>((result, name) => {
          (result as unknown as Record<string, Entity[]>)[name] = [...(snapshot[name] as Entity[])];
          return result;
        }, {});
        startTransition(() => {
          setData((current) => {
            const next = { ...current, ...patch } as DomainSnapshot;
            dataRef.current = next;
            return next;
          });
        });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    const unsubscribe = subscribeDomainCollections(
      realtimeCollections,
      (patch) => {
        if (!alive) return;
        startTransition(() => {
          setData((current) => {
            const next = { ...current, ...patch } as DomainSnapshot;
            dataRef.current = next;
            return next;
          });
        });
      },
      undefined,
      () => undefined,
    );

    return () => {
      alive = false;
      unsubscribe();
    };
  }, [activeCollectionsKey, oneTimeCollections, realtimeCollections, realtimeCollectionsKey, user?.id]);

  const dismissUndo = useCallback(() => {
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    setUndoState(null);
  }, []);

  const registerUndo = useCallback((message: string, run: () => Promise<void>) => {
    if (isUndoingRef.current) return;
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);

    setUndoState({ message, run });
    undoTimerRef.current = window.setTimeout(() => setUndoState(null), 8000);
  }, []);

  const runUndo = useCallback(async () => {
    if (!undoState) return;
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);

    isUndoingRef.current = true;
    try {
      await undoState.run();
      setUndoState(null);
    } finally {
      isUndoingRef.current = false;
    }
  }, [undoState]);

  const confirmAccessKey = useCallback(async (options: AccessKeyConfirmationOptions = {}) => {
    if (accessKeyRequest) return false;

    const snapshot = dataRef.current.accessKeys.length
      ? dataRef.current
      : await ensureCollectionsLoaded(["accessKeys"]);
    const activeAccessKeys = snapshot.accessKeys.filter((key) => key.active !== false);

    if (!activeAccessKeys.length) {
      window.alert("Nenhuma chave de acesso ativa foi encontrada na coleção accessKeys.");
      return false;
    }

    return new Promise<boolean>((resolve) => {
      setAccessKeyRequest({
        title: options.title || "Chave de acesso obrigatória",
        description: options.description || "Informe uma chave de acesso ativa cadastrada na coleção accessKeys para continuar.",
        confirmLabel: options.confirmLabel || "Validar chave",
        resolve,
      });
      setAccessKeyInput("");
      setAccessKeyError("");
      setAccessKeyBusy(false);
    });
  }, [accessKeyRequest, ensureCollectionsLoaded]);

  const cancelAccessKeyRequest = useCallback(() => {
    const request = accessKeyRequest;
    setAccessKeyRequest(null);
    setAccessKeyInput("");
    setAccessKeyError("");
    setAccessKeyBusy(false);
    request?.resolve(false);
  }, [accessKeyRequest]);

  const submitAccessKey = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    if (!accessKeyRequest || accessKeyBusy) return;

    const accessKey = accessKeyInput.trim();
    if (!accessKey) {
      setAccessKeyError("Informe a chave de acesso.");
      return;
    }

    setAccessKeyBusy(true);
    try {
      const keyHash = await hashPassword(accessKey);
      const match = dataRef.current.accessKeys.find((key) => key.active !== false && key.keyHash === keyHash);

      if (!match) {
        setAccessKeyError("Chave de acesso inválida ou inativa.");
        return;
      }

      accessKeyRequest.resolve(true);
      setAccessKeyRequest(null);
      setAccessKeyInput("");
      setAccessKeyError("");
    } finally {
      setAccessKeyBusy(false);
    }
  }, [accessKeyBusy, accessKeyInput, accessKeyRequest]);

  const confirmProtectedDelete = useCallback(async (collectionNames: CollectionName[]) => {
    if (!collectionNames.some((collectionName) => protectedDeleteCollections.has(collectionName))) return true;

    return confirmAccessKey({
      title: "Chave de acesso para exclusão",
      description: "Para excluir empresas, funcionários, benefícios ou permissões, informe uma chave ativa cadastrada na coleção accessKeys.",
      confirmLabel: "Autorizar exclusão",
    });
  }, [confirmAccessKey]);

  const assertPermission = useCallback((collection: CollectionName, action: PermissionAction) => {
    const screen = collectionScreenMap[collection] ?? "dashboard";

    if (!can(screen, action)) {
      throw new Error("Usuário sem permissão para executar esta ação.");
    }
  }, [can]);

  const restoreItem = useCallback(async <T extends Entity>(collectionName: CollectionName, item: T) => {
    const previous = (dataRef.current[collectionName] as unknown as T[]).find((entry) => entry.id === item.id);
    setData((current) => {
      const list = current[collectionName] as unknown as T[];
      const next = list.some((entry) => entry.id === item.id)
        ? list.map((entry) => (entry.id === item.id ? item : entry))
        : [item, ...list];
      const snapshot = { ...current, [collectionName]: next } as DomainSnapshot;
      dataRef.current = snapshot;
      return snapshot;
    });
    await saveEntity(collectionName, item);
    void writeAuditLog({
      actor: user,
      action: previous ? "edit" : "create",
      entityType: collectionName,
      entityId: item.id,
      entityLabel: entityDisplayName(item as Record<string, unknown>),
      description: `Registro restaurado em ${collectionName}.`,
      changedFields: changedFieldNames(previous as Record<string, unknown> | undefined, item as Record<string, unknown>),
    }).catch(() => undefined);
  }, [user]);

  const removeLocalAndRemoteItem = useCallback(async (collectionName: CollectionName, id: string) => {
    const previous = (dataRef.current[collectionName] as Entity[]).find((entry) => entry.id === id);
    setData((current) => {
      const snapshot = {
        ...current,
        [collectionName]: (current[collectionName] as Entity[]).filter((entry) => entry.id !== id),
      } as DomainSnapshot;
      dataRef.current = snapshot;
      return snapshot;
    });
    await deleteEntity(collectionName, id);
    void writeAuditLog({
      actor: user,
      action: "delete",
      entityType: collectionName,
      entityId: id,
      entityLabel: entityDisplayName(previous as Record<string, unknown> | undefined, id),
      description: `Registro excluído de ${collectionName}.`,
    }).catch(() => undefined);
  }, [user]);

  const updateCollection = useCallback(async <T extends Entity>(collectionName: CollectionName, item: T) => {
    const previous = (dataRef.current[collectionName] as unknown as T[]).find((entry) => entry.id === item.id);
    setData((current) => {
      const list = current[collectionName] as unknown as T[];
      const next = list.some((entry) => entry.id === item.id)
        ? list.map((entry) => (entry.id === item.id ? item : entry))
        : [item, ...list];
      const snapshot = { ...current, [collectionName]: next } as DomainSnapshot;
      dataRef.current = snapshot;
      return snapshot;
    });
    await saveEntity(collectionName, item);
    const action = changeAction(previous as Record<string, unknown> | undefined, item as Record<string, unknown>);
    void writeAuditLog({
      actor: user,
      action,
      entityType: collectionName,
      entityId: item.id,
      entityLabel: entityDisplayName(item as Record<string, unknown>, item.id),
      description: `${action === "create" ? "Registro criado" : action === "deactivate" ? "Registro desativado" : "Registro editado"} em ${collectionName}.`,
      changedFields: changedFieldNames(previous as Record<string, unknown> | undefined, item as Record<string, unknown>),
    }).catch(() => undefined);
    return item;
  }, [user]);

  const upsert = useCallback(async <T extends Entity>(
    collectionName: CollectionName,
    prefix: string,
    payload: UpsertPayload<T>,
  ) => {
    assertPermission(collectionName, payload.id ? "edit" : "create");
    const id = payload.id || createId(prefix);
    const item = { ...payload, id } as T;
    const previous = (data[collectionName] as unknown as T[]).find((entry) => entry.id === id);
    const saved = await updateCollection<T>(collectionName, item);

    registerUndo(previous ? "Alteracao editada." : "Registro criado.", async () => {
      if (previous) {
        await restoreItem(collectionName, previous);
        return;
      }

      await removeLocalAndRemoteItem(collectionName, id);
    });

    return saved;
  }, [assertPermission, data, registerUndo, removeLocalAndRemoteItem, restoreItem, updateCollection]);

  const enrichTimeRecordEmployeeName = useCallback((record: UpsertPayload<TimeRecord>): UpsertPayload<TimeRecord> => {
    const employee = dataRef.current.employees.find((item) => item.id === record.employeeId);
    const employeeName = record.employeeName?.trim()
      || employee?.name?.trim()
      || "";

    const companyId = record.companyId || employee?.companyId || "";
    const company = dataRef.current.companies.find((item) => item.id === companyId);
    const companyName = record.companyName?.trim()
      || company?.name?.trim()
      || "";

    const departmentId = record.departmentId || employee?.departmentId || "";
    const department = dataRef.current.departments.find((item) => item.id === departmentId);
    const departmentName = record.departmentName?.trim()
      || department?.name?.trim()
      || "";

    const sectorId = record.sectorId || employee?.sectorId || "";
    const sector = dataRef.current.sectors.find((item) => item.id === sectorId);
    const sectorName = record.sectorName?.trim()
      || sector?.name?.trim()
      || "";

    const subsectorId = record.subsectorId || employee?.subsectorId || "";
    const subsector = dataRef.current.subsectors.find((item) => item.id === subsectorId);
    const subsectorName = record.subsectorName?.trim()
      || subsector?.name?.trim()
      || "";

    const functionName = record.functionName?.trim()
      || employee?.role?.trim()
      || employee?.position?.trim()
      || "";

    const realTeamId = record.realTeamId || employee?.teamId || "";
    const dayTeamId = record.dayTeamId || realTeamId || "";
    const teamById = new Map(dataRef.current.teams.map((team) => [team.id, team.name?.trim() || ""]));
    const realTeamName = record.realTeamName?.trim()
      || teamById.get(realTeamId)
      || "";
    const dayTeamName = record.dayTeamName?.trim()
      || teamById.get(dayTeamId)
      || "";

    return {
      ...record,
      employeeName,
      companyId,
      companyName,
      functionName,
      departmentId,
      departmentName,
      sectorId,
      sectorName,
      subsectorId,
      subsectorName,
      realTeamId,
      realTeamName,
      dayTeamId,
      dayTeamName,
    };
  }, []);

  const upsertTimeRecordWithEmployeeName = useCallback(async (payload: UpsertPayload<TimeRecord>) => {
    assertPermission("timeRecords", payload.id ? "edit" : "create");
    const enriched = enrichTimeRecordEmployeeName(payload);
    const item = {
      ...enriched,
      id: payload.id || timeRecordDocumentId(payload.date, payload.employeeId),
      updatedAt: payload.updatedAt || new Date().toISOString(),
    } as TimeRecord;
    const previous = dataRef.current.timeRecords.find((record) => (
      record.id === item.id
      || (record.employeeId === item.employeeId && record.date === item.date)
    ));

    setData((current) => {
      const nextRecords = current.timeRecords
        .filter((record) => !(
          record.id === item.id
          || (record.employeeId === item.employeeId && record.date === item.date)
        ))
        .concat(item);
      const next = { ...current, timeRecords: nextRecords };
      dataRef.current = next;
      return next;
    });

    await saveTimeRecordsTree([item]);

    const action = changeAction(
      previous as unknown as Record<string, unknown> | undefined,
      item as unknown as Record<string, unknown>,
    );
    void writeAuditLog({
      actor: user,
      action,
      entityType: "timeRecords",
      entityId: item.id,
      entityLabel: item.employeeName || item.employeeId,
      description: `${action === "create" ? "Ponto criado" : "Ponto editado"} em ${item.date}.`,
      changedFields: changedFieldNames(
        previous as unknown as Record<string, unknown> | undefined,
        item as unknown as Record<string, unknown>,
      ),
      metadata: { date: item.date, employeeId: item.employeeId },
    }).catch(() => undefined);

    registerUndo(previous ? "Alteração de ponto editada." : "Registro de ponto criado.", async () => {
      if (previous) {
        await saveTimeRecordsTree([previous]);
        return;
      }
      await deleteTimeRecordTree(item);
    });

    return item;
  }, [assertPermission, enrichTimeRecordEmployeeName, registerUndo, user]);

  const upsertTimeRecordsBatch = useCallback(async (records: TimeRecord[]) => {
    if (!records.length) return [];
    if (records.some((record) => !record.id)) assertPermission("timeRecords", "create");
    if (records.some((record) => Boolean(record.id))) assertPermission("timeRecords", "edit");

    const savedRecords = records.map((record) => ({
      ...enrichTimeRecordEmployeeName(record),
      id: record.id || timeRecordDocumentId(record.date, record.employeeId),
      updatedAt: record.updatedAt || new Date().toISOString(),
    } as TimeRecord));
    const savedKeys = new Set(savedRecords.map((record) => `${record.employeeId}:${record.date}`));

    setData((current) => {
      const nextRecords = current.timeRecords
        .filter((record) => !savedKeys.has(`${record.employeeId}:${record.date}`))
        .concat(savedRecords);
      const next = { ...current, timeRecords: nextRecords };
      dataRef.current = next;
      return next;
    });

    await saveTimeRecordsTree(savedRecords);

    void writeAuditLog({
      actor: user,
      action: "bulk",
      entityType: "timeRecords",
      entityLabel: savedRecords[0]?.date || "Ponto",
      description: `${savedRecords.length} registro(s) de ponto salvo(s) em lote.`,
      metadata: { count: savedRecords.length, date: savedRecords[0]?.date || "" },
    }).catch(() => undefined);

    return savedRecords;
  }, [assertPermission, enrichTimeRecordEmployeeName, user]);

  const saveTimekeepingDayRecords = useCallback(async (records: TimeRecord[], obsoleteRecordIds: string[] = []) => {
    if (!records.length && !obsoleteRecordIds.length) return [];
    if (records.some((record) => !record.id)) assertPermission("timeRecords", "create");
    if (records.length || obsoleteRecordIds.length) assertPermission("timeRecords", "edit");

    const savedRecords = records.map((record) => ({
      ...enrichTimeRecordEmployeeName(record),
      id: record.id,
      updatedAt: record.updatedAt || new Date().toISOString(),
    } as TimeRecord));
    const savedKeys = new Set(savedRecords.map((record) => `${record.employeeId}:${record.date}`));
    const obsoleteIds = new Set(obsoleteRecordIds.filter(Boolean));

    setData((current) => {
      const nextRecords = current.timeRecords
        .filter((record) => !savedKeys.has(`${record.employeeId}:${record.date}`) && !obsoleteIds.has(record.id))
        .concat(savedRecords);
      const next = { ...current, timeRecords: nextRecords };
      dataRef.current = next;
      return next;
    });

    // A tabela diária grava o manifesto do dia logo em seguida por meio de
    // saveTimekeepingDayTable. Evita escrever duas vezes o mesmo documento-pai.
    await saveTimeRecordsTree(savedRecords, Array.from(obsoleteIds), {
      writeDayManifest: false,
    });

    void writeAuditLog({
      actor: user,
      action: "bulk",
      entityType: "timekeepingDayTable",
      entityLabel: savedRecords[0]?.date || "Tabela de ponto",
      description: `Tabela diária salva: ${savedRecords.length} registro(s) alterado(s) e ${obsoleteIds.size} duplicado(s) legados removido(s).`,
      metadata: { changedCount: savedRecords.length, removedDuplicates: obsoleteIds.size, date: savedRecords[0]?.date || "" },
    }).catch(() => undefined);

    return savedRecords;
  }, [assertPermission, enrichTimeRecordEmployeeName, user]);

  const removeItem = useCallback(async (collectionName: CollectionName, id: string, options: DeleteOptions = {}) => {
    assertPermission(collectionName, "delete");
    if (!options.skipAccessKey) {
      const canDelete = await confirmProtectedDelete([collectionName]);
      if (!canDelete) return false;
    }

    const previous = (data[collectionName] as Entity[]).find((entry) => entry.id === id);
    await removeLocalAndRemoteItem(collectionName, id);

    if (previous) {
      registerUndo("Registro excluido.", async () => {
        await restoreItem(collectionName, previous);
      });
    }
    return true;
  }, [assertPermission, confirmProtectedDelete, data, registerUndo, removeLocalAndRemoteItem, restoreItem]);

  const completeAlert = useCallback(async (id: string) => {
    assertPermission("documentAlerts", "edit");
    const alert = data.documentAlerts.find((entry) => entry.id === id);
    if (!alert) return;
    await updateCollection<DocumentAlert>("documentAlerts", {
      ...alert,
      status: "completed",
      updatedAt: new Date().toISOString(),
    });
    registerUndo("Alerta concluido.", async () => {
      await restoreItem("documentAlerts", alert);
    });
  }, [assertPermission, data.documentAlerts, registerUndo, restoreItem, updateCollection]);

  const upsertSystemUser = useCallback(async (payload: SystemUserPayload) => {
    assertPermission("systemUsers", "manage");
    const now = new Date().toISOString();
    const existing = payload.id ? data.systemUsers.find((item) => item.id === payload.id) : undefined;
    const employee = payload.employeeId ? data.employees.find((item) => item.id === payload.employeeId) : undefined;
    const username = normalizeUsername(payload.username);

    if (username.length !== 7) {
      throw new Error("O username deve ter exatamente 7 letras maiúsculas.");
    }

    const duplicate = data.systemUsers.find((item) => item.id !== payload.id && normalizeUsername(item.username) === username);
    if (duplicate) {
      throw new Error("Já existe um usuário cadastrado com esse login.");
    }

    const name = employee?.name || payload.name.trim() || username;
    const role = employee?.role || payload.role.trim() || "Usuário";
    const position = employee?.position || payload.position;
    const passwordHash = payload.password
      ? await hashPassword(payload.password)
      : payload.passwordHash || existing?.passwordHash || (existing?.password ? await hashPassword(existing.password) : undefined);
    const plainPassword = payload.employeeId ? payload.password || existing?.password || "" : existing?.password || "";
    const permissionProfileId = payload.permissionProfileId ?? existing?.permissionProfileId;

    if (!passwordHash) {
      throw new Error("Informe uma senha para o usuário do sistema.");
    }

    const systemUser: SystemUser = {
      id: payload.id || createId("user"),
      username,
      name,
      role,
      ...(position ? { position } : {}),
      initials: initialsFromName(name, username),
      ...(payload.employeeId ? { employeeId: payload.employeeId } : {}),
      passwordHash,
      ...(plainPassword ? { password: plainPassword } : {}),
      ...(permissionProfileId ? { permissionProfileId } : {}),
      active: payload.active,
      isAdmin: payload.isAdmin,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    const saved = await updateCollection<SystemUser>("systemUsers", systemUser);
    registerUndo(existing ? "Usuario editado." : "Usuario criado.", async () => {
      if (existing) {
        await restoreItem("systemUsers", existing);
        return;
      }

      await removeLocalAndRemoteItem("systemUsers", systemUser.id);
    });

    return saved;
  }, [assertPermission, data.employees, data.systemUsers, registerUndo, removeLocalAndRemoteItem, restoreItem, updateCollection]);

  const replaceUserPermissions = useCallback(async (userId: string, matrix: PermissionMatrix) => {
    assertPermission("systemPermissions", "manage");
    const updatedAt = new Date().toISOString();
    const previousPermissions = data.systemPermissions.filter((permission) => permission.userId === userId);
    const permissions = systemScreens.map((screen) => ({
      id: permissionId(userId, screen.key),
      userId,
      screen: screen.key,
      actions: Array.from(new Set(matrix[screen.key] || [])),
      updatedAt,
    }));

    setData((current) => ({
      ...current,
      systemPermissions: [
        ...current.systemPermissions.filter((permission) => permission.userId !== userId),
        ...permissions,
      ],
    }));
    await commitEntityBatch(permissions.map((permission) => ({
      type: "set" as const,
      collection: "systemPermissions" as const,
      item: permission,
    })));

    const targetUser = data.systemUsers.find((systemUser) => systemUser.id === userId);
    void writeAuditLog({
      actor: user,
      action: "edit",
      entityType: "systemPermissions",
      entityId: userId,
      entityLabel: targetUser?.username || targetUser?.name || userId,
      description: `Permissões atualizadas para ${targetUser?.username || targetUser?.name || userId}.`,
      metadata: { screenCount: permissions.length },
    }).catch(() => undefined);

    registerUndo("Permissoes atualizadas.", async () => {
      setData((current) => ({
        ...current,
        systemPermissions: [
          ...current.systemPermissions.filter((permission) => permission.userId !== userId),
          ...previousPermissions,
        ],
      }));

      await commitEntityBatch([
        ...permissions.map((permission) => ({
          type: "delete" as const,
          collection: "systemPermissions" as const,
          id: permission.id,
        })),
        ...previousPermissions.map((permission) => ({
          type: "set" as const,
          collection: "systemPermissions" as const,
          item: permission,
        })),
      ]);
    });
    return permissions;
  }, [assertPermission, data.systemPermissions, data.systemUsers, registerUndo, user]);

  const applyPermissionProfileToUser = useCallback(async (userId: string, profileId: string) => {
    const profile = data.permissionProfiles.find((item) => item.id === profileId);
    if (!profile) return [];

    return replaceUserPermissions(userId, profile.permissions);
  }, [data.permissionProfiles, replaceUserPermissions]);

  const deleteMany = useCallback(async (itemsByCollection: Partial<Record<CollectionName, string[]>>, options: DeleteOptions = {}) => {
    const normalized = Object.entries(itemsByCollection)
      .map(([collectionName, ids]) => ({ collectionName: collectionName as CollectionName, ids: Array.from(new Set(ids || [])) }))
      .filter((entry) => entry.ids.length > 0);

    normalized.forEach(({ collectionName }) => assertPermission(collectionName, "delete"));
    if (!options.skipAccessKey) {
      const canDelete = await confirmProtectedDelete(normalized.map((entry) => entry.collectionName));
      if (!canDelete) return false;
    }

    const currentSnapshot = dataRef.current;
    const deletedItems = normalized.flatMap(({ collectionName, ids }) => {
      const idSet = new Set(ids);
      return (currentSnapshot[collectionName] as Entity[])
        .filter((entry) => idSet.has(entry.id))
        .map((item) => ({ collectionName, item }));
    });

    setData((current) => {
      const next = { ...current };
      normalized.forEach(({ collectionName, ids }) => {
        const idSet = new Set(ids);
        next[collectionName] = (current[collectionName] as Entity[]).filter((entry) => !idSet.has(entry.id)) as never;
      });
      dataRef.current = next;
      return next;
    });

    await commitEntityBatch(normalized.flatMap(({ collectionName, ids }) => (
      ids.map((id) => ({ type: "delete" as const, collection: collectionName, id }))
    )));

    if (deletedItems.length) {
      const collectionSummary = normalized
        .map(({ collectionName, ids }) => `${collectionName}: ${ids.length}`)
        .join(", ");
      void writeAuditLog({
        actor: user,
        action: "bulk",
        entityType: "bulkDelete",
        entityLabel: `${deletedItems.length} registro(s)`,
        description: `Exclusão em lote concluída (${collectionSummary}).`,
        metadata: { count: deletedItems.length, collectionCount: normalized.length },
      }).catch(() => undefined);

      registerUndo(`${deletedItems.length} registro(s) excluido(s).`, async () => {
        setData((current) => {
          const next = { ...current };

          deletedItems.forEach(({ collectionName, item }) => {
            const list = next[collectionName] as Entity[];
            next[collectionName] = (
              list.some((entry) => entry.id === item.id)
                ? list.map((entry) => (entry.id === item.id ? item : entry))
                : [item, ...list]
            ) as never;
          });

          dataRef.current = next;
          return next;
        });

        await commitEntityBatch(deletedItems.map(({ collectionName, item }) => ({
          type: "set" as const,
          collection: collectionName,
          item,
        })));
      });
    }
    return true;
  }, [assertPermission, confirmProtectedDelete, registerUndo, user]);

  const mergeDeletionSnapshot = useCallback((snapshot: DomainSnapshot) => {
    const current = dataRef.current;
    const next = { ...current } as DomainSnapshot;
    let changed = false;

    collectionNames.forEach((collectionName) => {
      const incoming = snapshot[collectionName] as Entity[];
      if (!incoming.length) return;

      const merged = new Map((current[collectionName] as Entity[]).map((item) => [item.id, item]));
      incoming.forEach((item) => merged.set(item.id, item));
      (next as unknown as Record<string, Entity[]>)[collectionName] = Array.from(merged.values());
      changed = true;
    });

    if (!changed) return;
    dataRef.current = next;
    setData(next);
  }, []);

  const collectEmployeeLinkedIds = useCallback((employeeIds: string[], snapshot: DomainSnapshot = dataRef.current) => {
    const employeeSet = new Set(employeeIds);
    const userIds = snapshot.systemUsers.filter((user) => user.employeeId && employeeSet.has(user.employeeId)).map((user) => user.id);
    const userSet = new Set(userIds);
    const documentIds = snapshot.employeeDocuments
      .filter((document) => employeeSet.has(document.employeeId))
      .map((document) => document.id);
    const documentSet = new Set(documentIds);

    return {
      employeePromotions: snapshot.employeePromotions.filter((item) => employeeSet.has(item.employeeId)).map((item) => item.id),
      employeeDrafts: snapshot.employeeDrafts.filter((item) => item.employeeId && employeeSet.has(item.employeeId)).map((item) => item.id),
      employeeDocuments: documentIds,
      documentAlerts: snapshot.documentAlerts
        .filter((item) => item.status !== "completed" && (employeeSet.has(item.employeeId) || documentSet.has(item.documentId)))
        .map((item) => item.id),
      employeeBenefits: snapshot.employeeBenefits.filter((item) => employeeSet.has(item.employeeId)).map((item) => item.id),
      companyGroupEmployeeAssignments: snapshot.companyGroupEmployeeAssignments.filter((item) => employeeSet.has(item.employeeId)).map((item) => item.id),
      companyGroupLeadershipAssignments: snapshot.companyGroupLeadershipAssignments.filter((item) => employeeSet.has(item.employeeId)).map((item) => item.id),
      systemUsers: userIds,
      systemPermissions: snapshot.systemPermissions.filter((item) => userSet.has(item.userId)).map((item) => item.id),
    };
  }, []);

  const deleteEmployee = useCallback(async (employeeId: string) => {
    const snapshot = await loadEmployeeDeletionSnapshot([employeeId]);
    mergeDeletionSnapshot(snapshot);
    return deleteMany({
      ...collectEmployeeLinkedIds([employeeId], snapshot),
      employees: [employeeId],
    });
  }, [collectEmployeeLinkedIds, deleteMany, mergeDeletionSnapshot]);

  const deleteCompany = useCallback(async (companyId: string) => {
    const snapshot = await loadCompanyDeletionSnapshot(companyId);
    mergeDeletionSnapshot(snapshot);
    const departmentIds = snapshot.departments.filter((item) => item.companyId === companyId).map((item) => item.id);
    const sectorIds = snapshot.sectors.filter((item) => item.companyId === companyId).map((item) => item.id);
    const subsectorIds = snapshot.subsectors.filter((item) => item.companyId === companyId).map((item) => item.id);
    const employeeIds = snapshot.employees.filter((item) => item.companyId === companyId).map((item) => item.id);
    const teamIds = snapshot.teams.filter((item) => item.companyId === companyId).map((item) => item.id);
    const contractIds = snapshot.benefitContracts.filter((item) => item.companyId === companyId).map((item) => item.id);
    const companyGroupRelations = snapshot.companyGroupCompanies.filter((item) => item.companyId === companyId);
    const groupIdsToDelete = companyGroupRelations
      .map((relation) => relation.groupId)
      .filter((groupId) => snapshot.companyGroupCompanies.filter((item) => item.groupId === groupId).length <= 1);
    const groupIdsToDeleteSet = new Set(groupIdsToDelete);

    return deleteMany({
      ...collectEmployeeLinkedIds(employeeIds, snapshot),
      companies: [companyId],
      departments: departmentIds,
      sectors: sectorIds,
      subsectors: subsectorIds,
      employees: employeeIds,
      teams: teamIds,
      organizational_nodes: snapshot.organizational_nodes.filter((item) => item.companyId === companyId).map((item) => item.id),
      employee_assignments: snapshot.employee_assignments.filter((item) => item.companyId === companyId).map((item) => item.id),
      companyGroups: groupIdsToDelete,
      companyGroupCompanies: snapshot.companyGroupCompanies
        .filter((item) => item.companyId === companyId || groupIdsToDeleteSet.has(item.groupId))
        .map((item) => item.id),
      companyGroupUnits: snapshot.companyGroupUnits.filter((item) => groupIdsToDeleteSet.has(item.groupId)).map((item) => item.id),
      companyGroupUnitLinks: snapshot.companyGroupUnitLinks
        .filter((item) => item.companyId === companyId || groupIdsToDeleteSet.has(item.groupId))
        .map((item) => item.id),
      companyGroupEmployeeAssignments: snapshot.companyGroupEmployeeAssignments
        .filter((item) => groupIdsToDeleteSet.has(item.groupId) || employeeIds.includes(item.employeeId))
        .map((item) => item.id),
      companyGroupLeadershipAssignments: snapshot.companyGroupLeadershipAssignments
        .filter((item) => groupIdsToDeleteSet.has(item.groupId) || employeeIds.includes(item.employeeId))
        .map((item) => item.id),
      benefitContracts: contractIds,
      benefitPlans: snapshot.benefitPlans.filter((item) => item.companyId === companyId || contractIds.includes(item.contractId)).map((item) => item.id),
      benefitFolders: snapshot.benefitFolders.filter((item) => item.companyId === companyId).map((item) => item.id),
      benefitCustomFields: snapshot.benefitCustomFields.filter((item) => item.companyId === companyId).map((item) => item.id),
      customModules: snapshot.customModules.filter((item) => item.companyId === companyId).map((item) => item.id),
      documentAlerts: snapshot.documentAlerts.filter((item) => item.companyId === companyId && item.status !== "completed").map((item) => item.id),
      timekeepingColumns: snapshot.timekeepingColumns.filter((item) => item.companyId === companyId).map((item) => item.id),
      employeeBenefits: snapshot.employeeBenefits.filter((item) => item.companyId === companyId).map((item) => item.id),
    });
  }, [collectEmployeeLinkedIds, deleteMany, mergeDeletionSnapshot]);

  const deleteDepartment = useCallback(async (departmentId: string) => {
    const snapshot = await ensureCollectionsLoaded(structureCascadeCollectionNames);
    const sectorIds = snapshot.sectors.filter((item) => item.departmentId === departmentId).map((item) => item.id);
    const subsectorIds = snapshot.subsectors.filter((item) => item.departmentId === departmentId).map((item) => item.id);
    const employeeIds = snapshot.employees.filter((item) => item.departmentId === departmentId).map((item) => item.id);

    return deleteMany({
      ...collectEmployeeLinkedIds(employeeIds, snapshot),
      departments: [departmentId],
      sectors: sectorIds,
      subsectors: subsectorIds,
      employees: employeeIds,
    });
  }, [collectEmployeeLinkedIds, deleteMany, ensureCollectionsLoaded]);

  const deleteSector = useCallback(async (sectorId: string) => {
    const snapshot = await ensureCollectionsLoaded(structureCascadeCollectionNames);
    const subsectorIds = snapshot.subsectors.filter((item) => item.sectorId === sectorId).map((item) => item.id);
    const employeeIds = snapshot.employees.filter((item) => item.sectorId === sectorId).map((item) => item.id);

    return deleteMany({
      ...collectEmployeeLinkedIds(employeeIds, snapshot),
      sectors: [sectorId],
      subsectors: subsectorIds,
      employees: employeeIds,
    });
  }, [collectEmployeeLinkedIds, deleteMany, ensureCollectionsLoaded]);

  const deleteSubsector = useCallback(async (subsectorId: string) => {
    const snapshot = await ensureCollectionsLoaded(structureCascadeCollectionNames);
    const employeeIds = snapshot.employees.filter((item) => item.subsectorId === subsectorId).map((item) => item.id);

    return deleteMany({
      ...collectEmployeeLinkedIds(employeeIds, snapshot),
      subsectors: [subsectorId],
      employees: employeeIds,
    });
  }, [collectEmployeeLinkedIds, deleteMany, ensureCollectionsLoaded]);


  const deleteTeam = useCallback(async (id: string) => {
    const canDelete = await confirmAccessKey({
      title: "Chave de acesso para exclusão",
      description: "Esta exclusão altera vínculos antes de remover a equipe. Informe uma chave ativa cadastrada na coleção accessKeys.",
      confirmLabel: "Autorizar exclusão",
    });
    if (!canDelete) return false;

    // A tela de empresas já mantém funcionários e equipes no snapshot local.
    // Não consulta novamente toda a coleção apenas para excluir uma equipe.
    const snapshot = dataRef.current;
    const team = snapshot.teams.find((item) => item.id === id);
    if (!team) return true;

    const now = new Date().toISOString();
    const linkedEmployees = snapshot.employees.filter((item) => item.teamId === id);
    const updatedEmployees = linkedEmployees.map((employee) => ({
      ...employee,
      teamId: "",
      isTeamLead: false,
      updatedAt: now,
    }));

    if (updatedEmployees.length) {
      await commitEntityBatch(updatedEmployees.map((employee) => ({
        type: "set" as const,
        collection: "employees" as const,
        item: employee,
      })));
      setData((current) => {
        const updates = new Map(updatedEmployees.map((employee) => [employee.id, employee]));
        const next = {
          ...current,
          employees: current.employees.map((employee) => updates.get(employee.id) || employee),
        };
        dataRef.current = next;
        return next;
      });
    }

    return deleteMany({ teams: [id] }, { skipAccessKey: true });
  }, [confirmAccessKey, deleteMany]);

  const descendantNodeIds = useCallback((nodeId: string) => {
    const ids = new Set<string>([nodeId]);
    let changed = true;

    while (changed) {
      changed = false;
      data.organizational_nodes.forEach((node) => {
        if (node.parentId && ids.has(node.parentId) && !ids.has(node.id)) {
          ids.add(node.id);
          changed = true;
        }
      });
    }

    return Array.from(ids);
  }, [data.organizational_nodes]);

  const upsertEmployeeAssignmentValidated = useCallback(async (payload: UpsertPayload<EmployeeAssignment>) => {
    const node = data.organizational_nodes.find((item) => item.id === payload.nodeId);
    const employee = data.employees.find((item) => item.id === payload.employeeId);

    if (!node) throw new Error("Selecione um item da arvore organizacional.");
    if (!employee) throw new Error("Selecione um funcionario valido.");

    const existingAssignments = data.employee_assignments.filter((assignment) => assignment.id !== payload.id);

    if (payload.role === "coordenador" && node.tipo === "setor") {
      const existingCoordinator = existingAssignments.find((assignment) => (
        assignment.nodeId === node.id && assignment.role === "coordenador"
      ));

      if (existingCoordinator) {
        throw new Error("Este setor ja possui coordenador. Remova ou edite o vinculo atual antes de salvar outro.");
      }
    }

    if (payload.role === "lider" && node.tipo === "setor") {
      const alreadyLeadsAnotherSector = existingAssignments.some((assignment) => {
        if (assignment.employeeId !== payload.employeeId || assignment.role !== "lider" || assignment.nodeId === node.id) return false;
        const assignedNode = data.organizational_nodes.find((item) => item.id === assignment.nodeId);
        return assignedNode?.tipo === "setor";
      });

      if (alreadyLeadsAnotherSector) {
        throw new Error("Um lider nao pode liderar varios setores. Ele pode liderar varios subsetores.");
      }
    }

    return upsert<EmployeeAssignment>("employee_assignments", "assignment", {
      ...payload,
      companyId: node.companyId,
      nodeType: node.tipo,
    });
  }, [data.employee_assignments, data.employees, data.organizational_nodes, upsert]);

  const groupResponsibleRole = useCallback((type: CompanyGroupUnit["type"]): EmployeeAssignmentRole => {
    if (type === "department") return "gerente";
    if (type === "sector") return "coordenador";
    return "lider";
  }, []);

  const saveCompanyGroupGraph = useCallback(async (payload: CompanyGroupGraphPayload) => {
    const isEditing = Boolean(payload.group.id);
    assertPermission("companyGroups", isEditing ? "edit" : "create");

    const now = new Date().toISOString();
    const groupId = payload.group.id || createId("company-group");
    const existingGroup = data.companyGroups.find((item) => item.id === groupId);
    const companyIds = Array.from(new Set(payload.companyIds.filter(Boolean)));
    if (!payload.group.name.trim()) throw new Error("Informe o nome do grupo.");
    if (!companyIds.length) throw new Error("Selecione pelo menos uma empresa para o grupo.");

    const group: CompanyGroup = {
      ...payload.group,
      id: groupId,
      name: payload.group.name.trim(),
      active: payload.group.active !== false,
      divergenceTypes: Array.from(new Set(payload.group.divergenceTypes || [])),
      createdAt: existingGroup?.createdAt || payload.group.createdAt || now,
      updatedAt: now,
    };

    const unitIdMap = new Map<string, string>();
    const targetUnitIdByIndex = new Map<number, string>();
    const canonicalByKey = new Map<string, CompanyGroupUnit>();

    payload.units.forEach(({ unit }, index) => {
      const rawId = unit.id || createId("company-group-unit");
      const normalizedName = unit.name
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
      if (!normalizedName) return;

      const key = `${unit.type}:${normalizedName}`;
      const current = canonicalByKey.get(key);
      if (current) {
        unitIdMap.set(rawId, current.id);
        if (unit.id) unitIdMap.set(unit.id, current.id);
        targetUnitIdByIndex.set(index, current.id);
        canonicalByKey.set(key, {
          ...current,
          parentUnitId: current.parentUnitId || unit.parentUnitId || "",
          coordinatorEmployeeId: current.coordinatorEmployeeId || unit.coordinatorEmployeeId || "",
          updatedAt: now,
        });
        return;
      }

      const nextUnit: CompanyGroupUnit = {
        ...unit,
        id: rawId,
        groupId,
        name: unit.name.trim(),
        parentUnitId: unit.parentUnitId || "",
        coordinatorEmployeeId: unit.coordinatorEmployeeId || "",
        active: unit.active !== false,
        createdAt: unit.createdAt || now,
        updatedAt: now,
      };
      canonicalByKey.set(key, nextUnit);
      unitIdMap.set(rawId, rawId);
      if (unit.id) unitIdMap.set(unit.id, rawId);
      targetUnitIdByIndex.set(index, rawId);
    });

    const canonicalUnits = [...canonicalByKey.values()];
    const validUnitIds = new Set(canonicalUnits.map((unit) => unit.id));
    const remapUnitId = (unitId?: string) => {
      if (!unitId) return "";
      const mapped = unitIdMap.get(unitId) || unitId;
      return validUnitIds.has(mapped) ? mapped : "";
    };
    let normalizedUnits = canonicalUnits.map((unit) => ({
      ...unit,
      parentUnitId: remapUnitId(unit.parentUnitId),
    }));

    const unitLinks: CompanyGroupUnitLink[] = [];
    payload.units.forEach(({ unit, links }, index) => {
      const targetUnitId = targetUnitIdByIndex.get(index);
      if (!targetUnitId || !validUnitIds.has(targetUnitId)) return;
      links.forEach((link) => {
        if (!companyIds.includes(link.companyId) || !link.sourceId) return;
        const id = link.id || `${targetUnitId}-${link.companyId}-${link.sourceId}`;
        if (unitLinks.some((item) => item.groupUnitId === targetUnitId && item.companyId === link.companyId && item.sourceId === link.sourceId)) return;
        unitLinks.push({
          ...link,
          id,
          groupId,
          groupUnitId: targetUnitId,
          sourceType: link.sourceType || normalizedUnits.find((item) => item.id === targetUnitId)?.type || unit.type,
          createdAt: link.createdAt || now,
          updatedAt: now,
        });
      });
    });

    const validEmployeeIds = new Set(
      data.employees.filter((employee) => companyIds.includes(employee.companyId)).map((employee) => employee.id),
    );

    const employeeAssignments: CompanyGroupEmployeeAssignment[] = payload.employeeAssignments
      .filter((assignment) => validEmployeeIds.has(assignment.employeeId))
      .map((assignment) => ({
        ...assignment,
        id: assignment.id || `${groupId}-${assignment.employeeId}`,
        groupId,
        departmentUnitId: remapUnitId(assignment.departmentUnitId),
        sectorUnitId: remapUnitId(assignment.sectorUnitId),
        subsectorUnitId: remapUnitId(assignment.subsectorUnitId),
        teamUnitId: remapUnitId(assignment.teamUnitId),
        createdAt: assignment.createdAt || now,
        updatedAt: now,
      }));

    const rootUnitId = "__group_root__";
    let leadershipAssignments: CompanyGroupLeadershipAssignment[] = payload.leadershipAssignments
      .filter((assignment) => validEmployeeIds.has(assignment.employeeId))
      .map((assignment) => ({
        ...assignment,
        unitId: assignment.unitId === rootUnitId ? rootUnitId : remapUnitId(assignment.unitId),
      }))
      .filter((assignment) => assignment.unitId === rootUnitId || validUnitIds.has(assignment.unitId))
      .map((assignment) => ({
        ...assignment,
        id: assignment.id || createId("company-group-leadership"),
        groupId,
        createdAt: assignment.createdAt || now,
        updatedAt: now,
      }));

    // A unidade e a tabela de vínculos representam a mesma relação.
    // Se o responsável foi definido na unificação, ele atualiza o vínculo.
    // Se o vínculo já existe, ele preenche automaticamente o responsável da unidade.
    normalizedUnits = normalizedUnits.map((unit) => {
      const responsibleRole = groupResponsibleRole(unit.type);
      const relatedAssignment = leadershipAssignments.find((assignment) => (
        assignment.unitId === unit.id && assignment.role === responsibleRole
      ));
      const responsibleEmployeeId = unit.coordinatorEmployeeId || relatedAssignment?.employeeId || "";
      return {
        ...unit,
        coordinatorEmployeeId: validEmployeeIds.has(responsibleEmployeeId) ? responsibleEmployeeId : "",
      };
    });

    normalizedUnits.forEach((unit) => {
      const responsibleRole = groupResponsibleRole(unit.type);
      leadershipAssignments = leadershipAssignments.filter((assignment) => (
        assignment.unitId !== unit.id || assignment.role !== responsibleRole
      ));
      if (!unit.coordinatorEmployeeId) return;
      const previous = data.companyGroupLeadershipAssignments.find((assignment) => (
        assignment.groupId === groupId
        && assignment.unitId === unit.id
        && assignment.role === responsibleRole
        && assignment.employeeId === unit.coordinatorEmployeeId
      ));
      leadershipAssignments.push({
        id: `group-unit-responsible-${unit.id}-${responsibleRole}`,
        groupId,
        employeeId: unit.coordinatorEmployeeId,
        unitId: unit.id,
        role: responsibleRole,
        createdAt: previous?.createdAt || now,
        updatedAt: now,
      });
    });

    const uniqueLeadership = new Map<string, CompanyGroupLeadershipAssignment>();
    leadershipAssignments.forEach((assignment) => {
      const key = `${assignment.employeeId}:${assignment.role}:${assignment.unitId}`;
      if (!uniqueLeadership.has(key)) uniqueLeadership.set(key, assignment);
    });
    leadershipAssignments = [...uniqueLeadership.values()];

    const groupCompanies: CompanyGroupCompany[] = companyIds.map((companyId) => ({
      id: `${groupId}-${companyId}`,
      groupId,
      companyId,
      createdAt: data.companyGroupCompanies.find((item) => item.groupId === groupId && item.companyId === companyId)?.createdAt || now,
      updatedAt: now,
    }));

    const previousByCollection = {
      companyGroups: data.companyGroups.filter((item) => item.id === groupId),
      companyGroupCompanies: data.companyGroupCompanies.filter((item) => item.groupId === groupId),
      companyGroupUnits: data.companyGroupUnits.filter((item) => item.groupId === groupId),
      companyGroupUnitLinks: data.companyGroupUnitLinks.filter((item) => item.groupId === groupId),
      companyGroupEmployeeAssignments: data.companyGroupEmployeeAssignments.filter((item) => item.groupId === groupId),
      companyGroupLeadershipAssignments: data.companyGroupLeadershipAssignments.filter((item) => item.groupId === groupId),
    };

    const nextByCollection = {
      companyGroups: [group],
      companyGroupCompanies: groupCompanies,
      companyGroupUnits: normalizedUnits,
      companyGroupUnitLinks: unitLinks,
      companyGroupEmployeeAssignments: employeeAssignments,
      companyGroupLeadershipAssignments: leadershipAssignments,
    };

    const mutations: EntityBatchMutation[] = [];
    (Object.keys(nextByCollection) as Array<keyof typeof nextByCollection>).forEach((collectionName) => {
      const nextItems = nextByCollection[collectionName];
      const nextIds = new Set(nextItems.map((item) => item.id));
      previousByCollection[collectionName].forEach((item) => {
        if (!nextIds.has(item.id)) mutations.push({ type: "delete", collection: collectionName, id: item.id });
      });
      nextItems.forEach((item) => mutations.push({ type: "set", collection: collectionName, item }));
    });

    const previousSnapshot = data;
    setData((current) => ({
      ...current,
      companyGroups: [...current.companyGroups.filter((item) => item.id !== groupId), group],
      companyGroupCompanies: [...current.companyGroupCompanies.filter((item) => item.groupId !== groupId), ...groupCompanies],
      companyGroupUnits: [...current.companyGroupUnits.filter((item) => item.groupId !== groupId), ...normalizedUnits],
      companyGroupUnitLinks: [...current.companyGroupUnitLinks.filter((item) => item.groupId !== groupId), ...unitLinks],
      companyGroupEmployeeAssignments: [...current.companyGroupEmployeeAssignments.filter((item) => item.groupId !== groupId), ...employeeAssignments],
      companyGroupLeadershipAssignments: [...current.companyGroupLeadershipAssignments.filter((item) => item.groupId !== groupId), ...leadershipAssignments],
    }));

    try {
      await commitEntityBatch(mutations);
    } catch (error) {
      setData(previousSnapshot);
      throw error;
    }

    void writeAuditLog({
      actor: user,
      action: existingGroup ? "edit" : "create",
      entityType: "companyGroups",
      entityId: group.id,
      entityLabel: group.name,
      description: existingGroup ? "Grupo empresarial atualizado." : "Grupo empresarial criado.",
      changedFields: changedFieldNames(
        existingGroup as unknown as Record<string, unknown> | undefined,
        group as unknown as Record<string, unknown>,
      ),
      metadata: {
        companyCount: groupCompanies.length,
        unitCount: normalizedUnits.length,
        employeeCount: employeeAssignments.length,
      },
    }).catch(() => undefined);

    registerUndo(existingGroup ? "Grupo empresarial atualizado." : "Grupo empresarial criado.", async () => {
      if (existingGroup) return;
      const deleteMutations: EntityBatchMutation[] = mutations
        .filter((mutation) => mutation.type === "set")
        .map((mutation) => ({ type: "delete", collection: mutation.collection, id: mutation.item.id }));
      await commitEntityBatch(deleteMutations);
    });

    return group;
  }, [assertPermission, data, groupResponsibleRole, registerUndo, user]);

  const deleteCompanyGroupGraph = useCallback(async (groupId: string, options: DeleteOptions = {}) => {
    assertPermission("companyGroups", "delete");
    const canDelete = options.skipAccessKey ? true : await confirmProtectedDelete([
      "companyGroups",
      "companyGroupCompanies",
      "companyGroupUnits",
      "companyGroupUnitLinks",
      "companyGroupEmployeeAssignments",
      "companyGroupLeadershipAssignments",
    ]);
    if (!canDelete) return false;

    const collections: Array<keyof Pick<DomainSnapshot,
      "companyGroups" |
      "companyGroupCompanies" |
      "companyGroupUnits" |
      "companyGroupUnitLinks" |
      "companyGroupEmployeeAssignments" |
      "companyGroupLeadershipAssignments"
    >> = [
      "companyGroups",
      "companyGroupCompanies",
      "companyGroupUnits",
      "companyGroupUnitLinks",
      "companyGroupEmployeeAssignments",
      "companyGroupLeadershipAssignments",
    ];

    const mutations: EntityBatchMutation[] = [];
    collections.forEach((collectionName) => {
      const items = (data[collectionName] as Array<{ id: string; groupId?: string }>).filter((item) => (
        collectionName === "companyGroups" ? item.id === groupId : item.groupId === groupId
      ));
      items.forEach((item) => mutations.push({ type: "delete", collection: collectionName, id: item.id }));
    });

    setData((current) => ({
      ...current,
      companyGroups: current.companyGroups.filter((item) => item.id !== groupId),
      companyGroupCompanies: current.companyGroupCompanies.filter((item) => item.groupId !== groupId),
      companyGroupUnits: current.companyGroupUnits.filter((item) => item.groupId !== groupId),
      companyGroupUnitLinks: current.companyGroupUnitLinks.filter((item) => item.groupId !== groupId),
      companyGroupEmployeeAssignments: current.companyGroupEmployeeAssignments.filter((item) => item.groupId !== groupId),
      companyGroupLeadershipAssignments: current.companyGroupLeadershipAssignments.filter((item) => item.groupId !== groupId),
    }));
    await commitEntityBatch(mutations);
    const deletedGroup = data.companyGroups.find((item) => item.id === groupId);
    void writeAuditLog({
      actor: user,
      action: "delete",
      entityType: "companyGroups",
      entityId: groupId,
      entityLabel: deletedGroup?.name || groupId,
      description: `Grupo empresarial excluído com ${mutations.length} registro(s) relacionado(s).`,
      metadata: { count: mutations.length },
    }).catch(() => undefined);
    return true;
  }, [assertPermission, confirmProtectedDelete, data, user]);

  const buildCompanyGroupGraphPayload = useCallback((groupId: string): CompanyGroupGraphPayload => {
    const group = data.companyGroups.find((item) => item.id === groupId);
    if (!group) throw new Error("Grupo não encontrado.");
    const companyIds = data.companyGroupCompanies.filter((item) => item.groupId === groupId).map((item) => item.companyId);
    const units = data.companyGroupUnits.filter((item) => item.groupId === groupId).map((unit) => ({
      unit: { ...unit },
      links: data.companyGroupUnitLinks.filter((link) => link.groupId === groupId && link.groupUnitId === unit.id).map((link) => ({ ...link })),
    }));
    return {
      group: { ...group },
      companyIds,
      units,
      employeeAssignments: data.companyGroupEmployeeAssignments.filter((item) => item.groupId === groupId).map((item) => ({ ...item })),
      leadershipAssignments: data.companyGroupLeadershipAssignments.filter((item) => item.groupId === groupId).map((item) => ({ ...item })),
    };
  }, [data]);

  const upsertCompanyGroupEmployeeAssignment = useCallback(async (payload: UpsertPayload<CompanyGroupEmployeeAssignment>) => {
    const snapshot = dataRef.current;
    const group = snapshot.companyGroups.find((item) => item.id === payload.groupId);
    const employee = snapshot.employees.find((item) => item.id === payload.employeeId);
    if (!group) throw new Error("Grupo não encontrado.");
    if (!employee) throw new Error("Funcionário não encontrado.");

    const allowed = can("companies", "edit")
      || can("companies", "create")
      || can("employees", "edit")
      || can("employees", "create");
    if (!allowed) throw new Error("Usuário sem permissão para alterar o vínculo do funcionário no grupo.");

    const existing = payload.id
      ? snapshot.companyGroupEmployeeAssignments.find((item) => item.id === payload.id)
      : snapshot.companyGroupEmployeeAssignments.find((item) => (
        item.groupId === payload.groupId && item.employeeId === payload.employeeId
      ));
    const id = payload.id || existing?.id || `${payload.groupId}-${payload.employeeId}`;
    const item = { ...payload, id } as CompanyGroupEmployeeAssignment;
    const saved = await updateCollection<CompanyGroupEmployeeAssignment>("companyGroupEmployeeAssignments", item);

    registerUndo(existing ? "Vínculo do funcionário no grupo editado." : "Vínculo do funcionário no grupo criado.", async () => {
      if (existing) {
        await restoreItem("companyGroupEmployeeAssignments", existing);
        return;
      }

      await removeLocalAndRemoteItem("companyGroupEmployeeAssignments", id);
    });

    return saved;
  }, [can, registerUndo, removeLocalAndRemoteItem, restoreItem, updateCollection]);

  const upsertCompanyGroupLeadershipAssignment = useCallback(async (payload: UpsertPayload<CompanyGroupLeadershipAssignment>) => {
    const graph = buildCompanyGroupGraphPayload(payload.groupId);
    const groupId = payload.groupId;
    const now = new Date().toISOString();
    const assignmentId = payload.id || createId("company-group-leadership");
    const existingAssignment = graph.leadershipAssignments.find((item) => item.id === assignmentId);
    const targetUnit = graph.units.find(({ unit }) => unit.id === payload.unitId)?.unit;
    const employee = data.employees.find((item) => item.id === payload.employeeId);
    if (!employee) throw new Error("Funcionário não encontrado.");

    let leadershipAssignments = graph.leadershipAssignments.filter((item) => item.id !== assignmentId);
    const nextAssignment: CompanyGroupLeadershipAssignment = {
      ...payload,
      id: assignmentId,
      groupId,
      createdAt: existingAssignment?.createdAt || payload.createdAt || now,
      updatedAt: now,
    };

    if (targetUnit && payload.role === groupResponsibleRole(targetUnit.type)) {
      leadershipAssignments = leadershipAssignments.filter((item) => !(
        item.unitId === targetUnit.id && item.role === payload.role
      ));
      graph.units = graph.units.map(({ unit, links }) => ({
        unit: unit.id === targetUnit.id ? { ...unit, coordinatorEmployeeId: payload.employeeId, updatedAt: now } : unit,
        links,
      }));
    }

    if (existingAssignment) {
      const oldUnit = graph.units.find(({ unit }) => unit.id === existingAssignment.unitId)?.unit;
      const oldWasResponsible = Boolean(
        oldUnit
        && oldUnit.coordinatorEmployeeId === existingAssignment.employeeId
        && existingAssignment.role === groupResponsibleRole(oldUnit.type),
      );
      const keepsSameResponsibility = Boolean(
        oldUnit
        && payload.unitId === existingAssignment.unitId
        && payload.role === existingAssignment.role
        && payload.employeeId === existingAssignment.employeeId,
      );

      if (oldUnit && oldWasResponsible && !keepsSameResponsibility) {
        graph.units = graph.units.map(({ unit, links }) => ({
          unit: unit.id === oldUnit.id && unit.coordinatorEmployeeId === existingAssignment.employeeId
            ? { ...unit, coordinatorEmployeeId: "", updatedAt: now }
            : unit,
          links,
        }));
      }
    }

    leadershipAssignments.push(nextAssignment);
    await saveCompanyGroupGraph({ ...graph, leadershipAssignments });
    return nextAssignment;
  }, [buildCompanyGroupGraphPayload, data.employees, groupResponsibleRole, saveCompanyGroupGraph]);

  const deleteCompanyGroupLeadershipAssignment = useCallback(async (id: string) => {
    const assignment = data.companyGroupLeadershipAssignments.find((item) => item.id === id);
    if (!assignment) return false;
    const graph = buildCompanyGroupGraphPayload(assignment.groupId);
    const targetUnit = graph.units.find(({ unit }) => unit.id === assignment.unitId)?.unit;
    if (targetUnit && targetUnit.coordinatorEmployeeId === assignment.employeeId && assignment.role === groupResponsibleRole(targetUnit.type)) {
      graph.units = graph.units.map(({ unit, links }) => ({
        unit: unit.id === targetUnit.id ? { ...unit, coordinatorEmployeeId: "", updatedAt: new Date().toISOString() } : unit,
        links,
      }));
    }
    await saveCompanyGroupGraph({
      ...graph,
      leadershipAssignments: graph.leadershipAssignments.filter((item) => item.id !== id),
    });
    return true;
  }, [buildCompanyGroupGraphPayload, data.companyGroupLeadershipAssignments, groupResponsibleRole, saveCompanyGroupGraph]);

  const upsertEmployeeValidated = useCallback(async (payload: UpsertPayload<Employee>) => {
    const normalizedCpf = normalizeEmployeeCpf(payload.cpf);

    if (normalizedCpf) {
      const duplicate = data.employees.find((employee) => (
        employee.id !== payload.id
        && normalizeEmployeeCpf(employee.cpf) === normalizedCpf
      ));

      if (duplicate) {
        throw new Error(`CPF ja cadastrado para ${duplicate.name || "funcionario existente"}.`);
      }
    }

    return upsert<Employee>("employees", "employee", payload);
  }, [data.employees, upsert]);

  const deleteOrganizationalNode = useCallback(async (id: string) => {
    const nodeIds = descendantNodeIds(id);
    return deleteMany({
      organizational_nodes: nodeIds,
      employee_assignments: data.employee_assignments
        .filter((assignment) => nodeIds.includes(assignment.nodeId))
        .map((assignment) => assignment.id),
    });
  }, [data.employee_assignments, deleteMany, descendantNodeIds]);

  const deleteEmployeeAssignment = useCallback(async (id: string) => {
    return deleteMany({ employee_assignments: [id] });
  }, [deleteMany]);

  const deleteTimekeepingColumn = useCallback(async (id: string) => {
    return deleteMany({ timekeepingColumns: [id] });
  }, [deleteMany]);

  const deleteBenefitContract = useCallback(async (id: string) => {
    return deleteMany({
      benefitContracts: [id],
      benefitPlans: data.benefitPlans.filter((item) => item.contractId === id).map((item) => item.id),
      employeeBenefits: data.employeeBenefits.filter((item) => item.contractId === id).map((item) => item.id),
      benefitCustomFields: data.benefitCustomFields.filter((item) => item.benefitContractId === id).map((item) => item.id),
    });
  }, [data.benefitCustomFields, data.benefitPlans, data.employeeBenefits, deleteMany]);

  const deleteBenefitPlan = useCallback(async (id: string) => {
    return deleteMany({
      benefitPlans: [id],
      employeeBenefits: data.employeeBenefits.filter((item) => item.planId === id).map((item) => item.id),
    });
  }, [data.employeeBenefits, deleteMany]);

  const deleteCustomModule = useCallback(async (id: string) => {
    return deleteMany({ customModules: [id] });
  }, [deleteMany]);

  const clearDomainData = useCallback(async () => {
    if (!isSystemTiUser(user)) {
      throw new Error("Somente o Setor TI pode usar a limpeza completa do banco.");
    }

    const snapshot = await ensureCollectionsLoaded(collectionNames);
    const protectedAdminUserIds = new Set(
      snapshot.systemUsers.filter((item) => isSystemTiUser(item)).map((item) => item.id),
    );
    const isProtectedItem = (collectionName: CollectionName, item: Entity) => {
      // Proteção genérica por banco: nenhum nome, usuário ou senha fica fixo no código.
      // O que define Administrador/TI é systemUsers.isAdmin=true e accessKeys.purpose="admin".
      if (collectionName === "systemUsers") return isSystemTiUser(item as SystemUser);
      if (collectionName === "systemPermissions") return protectedAdminUserIds.has((item as SystemPermission).userId);
      if (collectionName === "accessKeys") return (item as AccessKey).purpose === "admin";

      return false;
    };

    return deleteMany(
      Object.fromEntries(
        collectionNames.map((collectionName) => [
          collectionName,
          (snapshot[collectionName] as Entity[])
            .filter((item) => !isProtectedItem(collectionName, item))
            .map((item) => item.id),
        ]),
      ) as Partial<Record<CollectionName, string[]>>,
    );
  }, [deleteMany, ensureCollectionsLoaded, user]);

  const upsertEmployeeDocumentWithAlertSync = useCallback(async (payload: UpsertPayload<EmployeeDocument>) => {
    const previous = payload.id ? data.employeeDocuments.find((item) => item.id === payload.id) : undefined;
    const saved = await upsert<EmployeeDocument>("employeeDocuments", "document", payload);

    if (previous && previous.expirationDate !== saved.expirationDate) {
      const now = new Date().toISOString();
      const activeAlerts = data.documentAlerts.filter(
        (alert) => alert.documentId === saved.id && alert.status !== "completed",
      );

      await Promise.all(activeAlerts.map((alert) => {
        const advanceDays = getAlertAdvanceDays(alert);
        const notifyDate = getAlertNotifyDate(saved.expirationDate, alert);

        return updateCollection<DocumentAlert>("documentAlerts", {
          ...alert,
          dueDate: saved.expirationDate,
          advanceDays,
          notifyBeforeDays: advanceDays,
          notifyDate,
          status: getAlertStatus(notifyDate),
          updatedAt: now,
        });
      }));
    }

    return saved;
  }, [data.documentAlerts, data.employeeDocuments, updateCollection, upsert]);

  const upsertDocumentAlertWithSnapshot = useCallback((payload: UpsertPayload<DocumentAlert>) => {
    const employee = data.employees.find((item) => item.id === payload.employeeId);
    const document = data.employeeDocuments.find((item) => item.id === payload.documentId);
    const company = data.companies.find((item) => item.id === payload.companyId);

    return upsert<DocumentAlert>("documentAlerts", "alert", {
      ...payload,
      employeeName: payload.employeeName || employee?.name || "",
      documentName: payload.documentName || document?.name || "",
      companyName: payload.companyName || company?.name || "",
    });
  }, [data.companies, data.employeeDocuments, data.employees, upsert]);

  const value = useMemo<DomainDataContextValue>(() => ({
    ...data,
    loading,
    ensureCollectionsLoaded,
    undoState,
    runUndo,
    dismissUndo,
    confirmAccessKey,
    upsertCompany: (payload) => upsert<Company>("companies", "company", payload),
    upsertDepartment: (payload) => upsert<Department>("departments", "department", payload),
    upsertSector: (payload) => upsert<Sector>("sectors", "sector", payload),
    upsertSubsector: (payload) => upsert<Subsector>("subsectors", "subsector", payload),
    upsertTeam: (payload) => upsert<Team>("teams", "team", payload),
    upsertOrganizationalNode: (payload) => upsert<OrganizationalNode>("organizational_nodes", "node", payload),
    upsertEmployeeAssignment: upsertEmployeeAssignmentValidated,
    saveCompanyGroupGraph,
    deleteCompanyGroupGraph,
    upsertCompanyGroupEmployeeAssignment,
    upsertCompanyGroupLeadershipAssignment,
    deleteCompanyGroupLeadershipAssignment,
    upsertCustomModule: (payload) => upsert<CustomModule>("customModules", "module", payload),
    upsertBenefitContract: (payload) => upsert<BenefitContract>("benefitContracts", "contract", payload),
    upsertBenefitPlan: (payload) => upsert<BenefitPlan>("benefitPlans", "plan", payload),
    upsertBenefitFolder: (payload) => upsert<BenefitFolder>("benefitFolders", "benefit-folder", payload),
    upsertBenefitCustomField: (payload) => upsert<BenefitCustomField>("benefitCustomFields", "benefit-field", payload),
    upsertEmployeeBenefit: (payload) => upsert<EmployeeBenefit>("employeeBenefits", "employee-benefit", payload),
    upsertEmployee: upsertEmployeeValidated,
    upsertEmployeePromotion: (payload) => upsert<EmployeePromotion>("employeePromotions", "promotion", payload),
    upsertEmployeeDraft: (payload) => upsert<EmployeeDraft>("employeeDrafts", "draft", payload),
    upsertAppDraft: (payload) => upsert<AppDraft>("appDrafts", "draft", payload),
    upsertEmployeeDocument: upsertEmployeeDocumentWithAlertSync,
    upsertDocumentAlert: upsertDocumentAlertWithSnapshot,
    upsertTimeRecord: upsertTimeRecordWithEmployeeName,
    upsertTimeRecords: upsertTimeRecordsBatch,
    saveTimekeepingDayRecords,
    upsertTimekeepingColumn: (payload) => upsert<TimekeepingColumn>("timekeepingColumns", "time-column", payload),
    upsertTalentCandidate: (payload) => upsert<TalentCandidate>("talentCandidates", "candidate", payload),
    upsertSystemUser,
    upsertSystemPermission: (payload) => upsert<SystemPermission>("systemPermissions", "permission", payload),
    upsertPermissionProfile: (payload) => upsert<PermissionProfile>("permissionProfiles", "permission-profile", payload),
    upsertAccessKey: (payload) => upsert<AccessKey>("accessKeys", "access-key", payload),
    deleteAccessKey: (id) => removeItem("accessKeys", id),
    replaceUserPermissions,
    applyPermissionProfileToUser,
    completeAlert,
    upsertTalentColumnOption: (payload) => upsert<TalentColumnOption>("talentColumnOptions", "talent-option", payload),
    deleteEmployee,
    deleteCompany,
    deleteDepartment,
    deleteSector,
    deleteSubsector,
    deleteTeam,
    deleteOrganizationalNode,
    deleteEmployeeAssignment,
    deleteTimekeepingColumn,
    deleteBenefitContract,
    deleteBenefitPlan,
    deleteCustomModule,
    clearDomainData,
    removeItem,
  }), [applyPermissionProfileToUser, ensureCollectionsLoaded, clearDomainData, completeAlert, confirmAccessKey, data, deleteBenefitContract, deleteBenefitPlan, deleteEmployee, deleteCompany, deleteCompanyGroupGraph, deleteCompanyGroupLeadershipAssignment, deleteCustomModule, deleteDepartment, deleteEmployeeAssignment, deleteOrganizationalNode, deleteSector, deleteSubsector, deleteTeam, deleteTimekeepingColumn, dismissUndo, loading, removeItem, replaceUserPermissions, runUndo, saveCompanyGroupGraph, undoState, upsert, upsertCompanyGroupEmployeeAssignment, upsertCompanyGroupLeadershipAssignment, upsertDocumentAlertWithSnapshot, upsertEmployeeAssignmentValidated, upsertEmployeeDocumentWithAlertSync, upsertEmployeeValidated, upsertSystemUser, upsertTimeRecordWithEmployeeName, upsertTimeRecordsBatch, saveTimekeepingDayRecords]);

  return (
    <DomainDataContext.Provider value={value}>
      {children}
      {accessKeyRequest ? (
        <div className="modal-backdrop" role="presentation">
          <form className="confirm-modal" role="dialog" aria-modal="true" onSubmit={submitAccessKey}>
            <h2>{accessKeyRequest.title}</h2>
            <p>{accessKeyRequest.description}</p>
            <label className="field">
              Chave de acesso
              <input
                autoFocus
                type="password"
                value={accessKeyInput}
                onChange={(event) => {
                  setAccessKeyInput(event.target.value);
                  setAccessKeyError("");
                }}
                disabled={accessKeyBusy}
              />
            </label>
            {accessKeyError ? <span className="login-error">{accessKeyError}</span> : null}
            <div className="form-actions">
              <button className="btn btn-ghost" type="button" disabled={accessKeyBusy} onClick={cancelAccessKeyRequest}>Cancelar</button>
              <button className="btn btn-danger" type="submit" disabled={accessKeyBusy}>
                {accessKeyBusy ? "Validando..." : accessKeyRequest.confirmLabel}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </DomainDataContext.Provider>
  );
}

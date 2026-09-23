import ModalPortal from "@/modules/shared/ModalPortal";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useAuth } from "@/hooks/useAuth";
import useCreateShortcut from "@/hooks/useCreateShortcut";
import { useDomainData } from "@/hooks/useDomainData";
import DeleteImpactModal, { type DeleteImpact } from "@/common/components/DeleteImpactModal";
import { buildDomainDeletionImpact } from "@/common/utils/deletionImpact";
import {
  companyGroupForCompany as resolveCompanyGroupForCompany,
  primaryCompanyGroup,
  structureItemsForGroup,
  structureScopePayload,
} from "@/common/utils/groupStructure";
import { isSystemTiUser } from "@/services/accessControl";
import type {
  BenefitType,
  CustomModule,
  Department,
  EmployeeAssignment,
  EmployeeAssignmentRole,
  OrganizationalNode,
  OrganizationalNodeType,
  Sector,
  Subsector,
  Team,
} from "@/types/domain";
import { labelStatus, todayISO } from "@/utils/format";
import "./companies.css";

import {
  AlertTriangle,
  Building2,
  ChevronLeft,
  ChevronRight,
  Check,
  Edit2,
  Eye,
  GitBranch,
  Plus,
  Power,
  Trash2,
  Users,
  X,
} from "lucide-react";
import parseExcelFile from "@/utils/xlsxImport";

const benefitTypes: BenefitType[] = ["transport", "meal", "food", "health", "dental", "custom"];
const SCREEN_WRITE_EFFECTS_ENABLED = import.meta.env.VITE_ENABLE_SCREEN_WRITE_EFFECTS === "true";

type TabKey = "companies" | "groups" | "departments" | "sectors" | "teams" | "benefits" | "modules" | "structure";

type EntityKind =
  | "company"
  | "department"
  | "sector"
  | "subsector"
  | "team"
  | "contract"
  | "module";

type EditingKind = EntityKind | null;

type GroupUnitType = "department" | "sector" | "subsector" | "team";

type GroupUnitLink = {
  companyId: string;
  sourceId: string;
};

type GroupLeadershipAssignment = {
  id: string;
  employeeId: string;
  unitId: string;
  role: EmployeeAssignmentRole;
};

type CompanyGroupUnit = {
  id: string;
  name: string;
  type: GroupUnitType;
  parentUnitId?: string;
  links: GroupUnitLink[];
  coordinatorEmployeeId: string;
};

type GroupDivergenceMode = "keep_existing" | "use_reference" | "copy_from_source";

type GroupEmployeeAssignment = {
  employeeId: string;
  departmentUnitId: string;
  sectorUnitId: string;
  subsectorUnitId: string;
  teamUnitId: string;
};

type CompanyGroup = {
  id: string;
  name: string;
  companyIds: string[];
  units: CompanyGroupUnit[];
  active: boolean;
  autoSyncStructure?: boolean;
  divergenceMode?: GroupDivergenceMode;
  divergenceSourceCompanyId?: string;
  divergenceTypes?: GroupUnitType[];
  employeeAssignments: GroupEmployeeAssignment[];
  leadershipAssignments?: GroupLeadershipAssignment[];
  createdAt?: string;
  updatedAt?: string;
};


const groupUnitTypeLabels: Record<GroupUnitType, string> = {
  department: "Departamento",
  sector: "Setor",
  subsector: "Subsetor",
  team: "Equipe",
};

type GroupWizardStep = 1 | 2 | 3;

type GroupSimilarity = {
  overall: number;
  department: number;
  sector: number;
  subsector: number;
  team: number;
};

function normalizeStructureName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function jaccardSimilarity(first: Set<string>, second: Set<string>) {
  const union = new Set([...first, ...second]);
  if (union.size === 0) return null;
  let intersection = 0;
  first.forEach((item) => {
    if (second.has(item)) intersection += 1;
  });
  return Math.round((intersection / union.size) * 100);
}

type WizardStep = 0 | 1 | 2 | 3 | 4 | 5;

type WizardSubsectorDraft = {
  id: string;
  existingSubsectorId: string;
  name: string;
  leaderName: string;
  leaderEmployeeId: string;
};

type WizardDepartmentDraft = {
  id: string;
  name: string;
  managerName: string;
  managerEmployeeId: string;
  description: string;
  existingDepartmentId: string;
};

type WizardSectorDraft = {
  id: string;
  departmentId: string;
  existingSectorId: string;
  name: string;
  coordinatorName: string;
  coordinatorEmployeeId: string;
  leaderName: string;
  leaderEmployeeId: string;
  costCenter: string;
  subsectors: WizardSubsectorDraft[];
};

type WizardTeamDraft = {
  id: string;
  existingTeamId: string;
  name: string;
  description: string;
};

type WizardLeadershipDraft = {
  id: string;
  employeeId: string;
  role: string;
  targetType: "department" | "sector" | "subsector";
  targetId: string;
};

type StructureView = "tree" | "assignments";

type NodeForm = {
  id: string;
  nome: string;
  tipo: OrganizationalNodeType;
  parentId: string;
};

type AssignmentForm = {
  id: string;
  employeeId: string;
  nodeId: string;
  role: EmployeeAssignmentRole;
};

const assignmentRoles: { value: EmployeeAssignmentRole; label: string }[] = [
  { value: "admin", label: "Administrador" },
  { value: "gerente", label: "Gerente" },
  { value: "coordenador", label: "Coordenador" },
  { value: "lider", label: "Lider" },
  { value: "colaborador", label: "Colaborador" },
];

const nodeTypeLabels: Record<OrganizationalNodeType, string> = {
  empresa: "Empresa",
  departamento: "Departamento",
  setor: "Setor",
  subsetor: "Subsetor",
  equipe: "Equipe",
};

const rootParentValue = "__company_root__";

function emptyNodeForm(): NodeForm {
  return {
    id: "",
    nome: "",
    tipo: "departamento",
    parentId: rootParentValue,
  };
}

function emptyAssignmentForm(): AssignmentForm {
  return {
    id: "",
    employeeId: "",
    nodeId: rootParentValue,
    role: "colaborador",
  };
}

type GroupNodeForm = {
  id: string;
  nome: string;
  tipo: GroupUnitType;
  parentId: string;
};

function emptyGroupNodeForm(): GroupNodeForm {
  return {
    id: "",
    nome: "",
    tipo: "department",
    parentId: rootParentValue,
  };
}

const emptyWizardDepartment = (): WizardDepartmentDraft => ({
  id: crypto.randomUUID(),
  name: "",
  managerName: "",
  managerEmployeeId: "",
  description: "",
  existingDepartmentId: "",
});

const emptyWizardSector = (): WizardSectorDraft => ({
  id: crypto.randomUUID(),
  departmentId: "",
  existingSectorId: "",
  name: "",
  coordinatorName: "",
  coordinatorEmployeeId: "",
  leaderName: "",
  leaderEmployeeId: "",
  costCenter: "",
  subsectors: [],
});

const emptyWizardTeam = (): WizardTeamDraft => ({
  id: crypto.randomUUID(),
  existingTeamId: "",
  name: "",
  description: "",
});

export default function Companies() {
  const data = useDomainData();
  const { user } = useAuth();
  const canUseTiTools = isSystemTiUser(user);
  const actions = data as any;

  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("companies");
  const [editingKind, setEditingKind] = useState<EditingKind>(null);
  const [editingId, setEditingId] = useState("");
  const [companyManagerOpen, setCompanyManagerOpen] = useState(false);
  const [managerCompanyId, setManagerCompanyId] = useState("");
  const [managerGroupId, setManagerGroupId] = useState("");
  const [createCompanyThenOpenStructure, setCreateCompanyThenOpenStructure] = useState(false);
  const [structureView, setStructureView] = useState<StructureView>("tree");
  const [nodeForm, setNodeForm] = useState<NodeForm>(emptyNodeForm());
  const [assignmentForm, setAssignmentForm] = useState<AssignmentForm>(emptyAssignmentForm());
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>(0);
  const [wizardCompanyId, setWizardCompanyId] = useState("");
  const [wizardCompanyForm, setWizardCompanyForm] = useState({ name: "", legalName: "", document: "", location: "" });
  const [wizardDepartments, setWizardDepartments] = useState<WizardDepartmentDraft[]>([emptyWizardDepartment()]);
  const [wizardSectors, setWizardSectors] = useState<WizardSectorDraft[]>([emptyWizardSector()]);
  const [wizardTeams, setWizardTeams] = useState<WizardTeamDraft[]>([emptyWizardTeam()]);
  const [wizardLeaderships, setWizardLeaderships] = useState<WizardLeadershipDraft[]>([]);
  const [structureCompanyId, setStructureCompanyId] = useState("");
  const [importing, setImporting] = useState(false);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [previewFileName, setPreviewFileName] = useState<string>("");
  const [previewMapping, setPreviewMapping] = useState<{ department?: string; sector?: string; subsector?: string }>({});
  const [importSummary, setImportSummary] = useState<{ created: number; skipped: number } | null>(null);
  const [importReport, setImportReport] = useState<Array<{ index: number; row: Record<string, string>; status: string; message?: string }>>([]);
  const [conflictState, setConflictState] = useState<{ title: string; description: string } | null>(null);
  const [deleteRequest, setDeleteRequest] = useState<{
    title: string;
    impact: DeleteImpact;
    confirmLabel?: string;
    secondaryLabel?: string;
    onSecondary?: () => Promise<boolean | void> | boolean | void;
    onConfirm: () => Promise<boolean | void> | boolean | void;
  } | null>(null);
  const [deleteRequestBusy, setDeleteRequestBusy] = useState(false);
  const [groupWizardOpen, setGroupWizardOpen] = useState(false);
  const [groupWizardStep, setGroupWizardStep] = useState<GroupWizardStep>(1);
  const [groupStructureFilter, setGroupStructureFilter] = useState<GroupUnitType | "all">("all");
  const [groupDetailId, setGroupDetailId] = useState("");
  const [groupDetailTab, setGroupDetailTab] = useState<"structure" | "employees">("structure");
  const [groupStructureView, setGroupStructureView] = useState<StructureView>("tree");
  const [groupNodeForm, setGroupNodeForm] = useState<GroupNodeForm>(emptyGroupNodeForm());
  const [groupAssignmentForm, setGroupAssignmentForm] = useState<AssignmentForm>(emptyAssignmentForm());
  const [groupWizardDraft, setGroupWizardDraft] = useState<CompanyGroup>({
    id: "",
    name: "",
    companyIds: [],
    units: [],
    active: true,
    divergenceMode: "keep_existing",
    divergenceSourceCompanyId: "",
    divergenceTypes: [],
    employeeAssignments: [],
    leadershipAssignments: [],
  });
  const groupDatabaseSyncRef = useRef(false);
  const legacyGroupMigrationRef = useRef(false);
  const groupMutationQueueRef = useRef<Promise<void>>(Promise.resolve());

  const companyGroups = useMemo<CompanyGroup[]>(() => data.companyGroups.map((group) => {
    const companyIds = data.companyGroupCompanies
      .filter((item) => item.groupId === group.id)
      .map((item) => item.companyId);
    const leadershipAssignments = data.companyGroupLeadershipAssignments
      .filter((item) => item.groupId === group.id)
      .map((item) => ({
        id: item.id,
        employeeId: item.employeeId,
        unitId: item.unitId,
        role: item.role,
      }));
    const units = data.companyGroupUnits
      .filter((item) => item.groupId === group.id)
      .map((unit) => {
        const responsibleRole: EmployeeAssignmentRole = unit.type === "department"
          ? "gerente"
          : unit.type === "sector"
            ? "coordenador"
            : "lider";
        const linkedResponsible = leadershipAssignments.find((assignment) => (
          assignment.unitId === unit.id && assignment.role === responsibleRole
        ));
        return {
          id: unit.id,
          name: unit.name,
          type: unit.type as GroupUnitType,
          parentUnitId: unit.parentUnitId || "",
          coordinatorEmployeeId: unit.coordinatorEmployeeId || linkedResponsible?.employeeId || "",
          links: data.companyGroupUnitLinks
            .filter((link) => link.groupId === group.id && link.groupUnitId === unit.id)
            .map((link) => ({ companyId: link.companyId, sourceId: link.sourceId })),
        };
      });
    const employeeAssignments = data.companyGroupEmployeeAssignments
      .filter((item) => item.groupId === group.id)
      .map((item) => ({
        employeeId: item.employeeId,
        departmentUnitId: item.departmentUnitId || "",
        sectorUnitId: item.sectorUnitId || "",
        subsectorUnitId: item.subsectorUnitId || "",
        teamUnitId: item.teamUnitId || "",
      }));

    return {
      id: group.id,
      name: group.name,
      companyIds,
      units,
      active: group.active !== false,
      autoSyncStructure: group.autoSyncStructure,
      divergenceMode: group.divergenceMode as GroupDivergenceMode | undefined,
      divergenceSourceCompanyId: group.divergenceSourceCompanyId || "",
      divergenceTypes: (group.divergenceTypes || []) as GroupUnitType[],
      employeeAssignments,
      leadershipAssignments,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    };
  }), [
    data.companyGroups,
    data.companyGroupCompanies,
    data.companyGroupUnits,
    data.companyGroupUnitLinks,
    data.companyGroupEmployeeAssignments,
    data.companyGroupLeadershipAssignments,
  ]);


  const selectedCompany = data.companies.find((company) => company.id === selectedCompanyId);
  const companyId = selectedCompany?.id ?? "";
  const isEditing = editingId !== "";
  const primaryStructureGroup = useMemo(
    () => primaryCompanyGroup(data.companyGroups, data.companyGroupCompanies),
    [data.companyGroups, data.companyGroupCompanies],
  );
  const activeStructureGroup = useMemo(() => (
    resolveCompanyGroupForCompany(companyId, data.companyGroups, data.companyGroupCompanies)
      || primaryStructureGroup
  ), [companyId, data.companyGroupCompanies, data.companyGroups, primaryStructureGroup]);
  const activeStructureScope = useMemo(
    () => structureScopePayload(activeStructureGroup, data.companyGroupCompanies, data.companies),
    [activeStructureGroup, data.companyGroupCompanies, data.companies],
  );

  const [companyForm, setCompanyForm] = useState({
    name: "",
    legalName: "",
    document: "",
    location: "",
  });

  const [departmentForm, setDepartmentForm] = useState({
    name: "",
    managerName: "",
    managerEmployeeId: "",
    description: "",
  });

  const [sectorForm, setSectorForm] = useState({
    departmentId: "",
    name: "",
    coordinatorName: "",
    coordinatorEmployeeId: "",
    leaderName: "",
    leaderEmployeeId: "",
    costCenter: "",
  });

  const [subsectorForm, setSubsectorForm] = useState({
    sectorId: "",
    name: "",
    leaderName: "",
    leaderEmployeeId: "",
  });

  const [contractForm, setContractForm] = useState({
    name: "",
    providerName: "",
    type: "transport" as BenefitType,
    websiteUrl: "",
    startDate: todayISO(),
    endDate: "",
    fieldKey: "",
    fieldValue: "",
  });

  const [moduleForm, setModuleForm] = useState({
    name: "",
    description: "",
    targetScreen: "benefits" as CustomModule["targetScreen"],
    columns: "",
  });

  const [teamForm, setTeamForm] = useState({ name: "", description: "" });

  const companyDepartments = structureItemsForGroup(data.departments, activeStructureGroup, data.companyGroupCompanies, data.companies);
  const companySectors = structureItemsForGroup(data.sectors, activeStructureGroup, data.companyGroupCompanies, data.companies);
  const companySubsectors = structureItemsForGroup(data.subsectors, activeStructureGroup, data.companyGroupCompanies, data.companies);
  const companyContracts = data.benefitContracts.filter((item) => item.companyId === companyId);
  const companyModules = data.customModules.filter((item) => item.companyId === companyId);
  const companyTeams = structureItemsForGroup(data.teams, activeStructureGroup, data.companyGroupCompanies, data.companies);
  const wizardStructureGroup = resolveCompanyGroupForCompany(wizardCompanyId || selectedCompanyId, data.companyGroups, data.companyGroupCompanies)
    || primaryStructureGroup;
  const wizardGroupCompanyIds = new Set(data.companyGroupCompanies.filter((item) => item.groupId === wizardStructureGroup?.id).map((item) => item.companyId));
  const wizardCompanyEmployees = data.employees.filter((employee) => (
    wizardGroupCompanyIds.size ? wizardGroupCompanyIds.has(employee.companyId) : employee.companyId === wizardCompanyId
  ));
  const activeGroupCompanyIds = new Set(data.companyGroupCompanies.filter((item) => item.groupId === activeStructureGroup?.id).map((item) => item.companyId));
  const selectedCompanyEmployees = data.employees.filter((employee) => (
    activeGroupCompanyIds.size ? activeGroupCompanyIds.has(employee.companyId) : employee.companyId === companyId
  ));
  const companyOrganizationNodes = data.organizational_nodes
    .filter((node) => node.companyId === companyId && node.active !== false)
    .sort((a, b) => a.nome.localeCompare(b.nome));
  const companyRootNode = companyOrganizationNodes.find((node) => node.tipo === "empresa" && !node.parentId);
  const companyAssignments = data.employee_assignments
    .filter((assignment) => assignment.companyId === companyId)
    .sort((a, b) => {
      const employeeA = data.employees.find((employee) => employee.id === a.employeeId)?.name || "";
      const employeeB = data.employees.find((employee) => employee.id === b.employeeId)?.name || "";
      return employeeA.localeCompare(employeeB);
    });

  useCreateShortcut(() => {
    if (activeTab === "companies") {
      openCreate("company");
      return;
    }

    if (!companyId) return;

    if (activeTab === "departments") {
      openCreate("department");
      return;
    }

    if (activeTab === "sectors") {
      openCreate("sector");
      return;
    }

    if (activeTab === "teams") {
      openCreate("team");
      return;
    }

    if (activeTab === "benefits") {
      openCreate("contract");
      return;
    }

    if (activeTab === "modules") {
      openCreate("module");
    }
  });

  function employeeName(employeeId: string) {
    return data.employees.find((employee) => employee.id === employeeId)?.name || "";
  }

  function structureGroupForCompany(companyIdValue: string) {
    return resolveCompanyGroupForCompany(companyIdValue, data.companyGroups, data.companyGroupCompanies)
      || primaryStructureGroup;
  }

  function departmentsForStructureCompany(companyIdValue: string) {
    return structureItemsForGroup(data.departments, structureGroupForCompany(companyIdValue), data.companyGroupCompanies, data.companies);
  }

  function sectorsForStructureCompany(companyIdValue: string) {
    return structureItemsForGroup(data.sectors, structureGroupForCompany(companyIdValue), data.companyGroupCompanies, data.companies);
  }

  function subsectorsForStructureCompany(companyIdValue: string) {
    return structureItemsForGroup(data.subsectors, structureGroupForCompany(companyIdValue), data.companyGroupCompanies, data.companies);
  }

  function teamsForStructureCompany(companyIdValue: string) {
    return structureItemsForGroup(data.teams, structureGroupForCompany(companyIdValue), data.companyGroupCompanies, data.companies);
  }

  function companyIdsForStructureCompany(companyIdValue: string) {
    const group = structureGroupForCompany(companyIdValue);
    const companyIds = group
      ? data.companyGroupCompanies.filter((item) => item.groupId === group.id).map((item) => item.companyId)
      : [];
    return companyIds.length ? companyIds : companyIdValue ? [companyIdValue] : [];
  }

  function employeesForStructureCompany(companyIdValue: string) {
    const companyIds = new Set(companyIdsForStructureCompany(companyIdValue));
    return data.employees.filter((employee) => companyIds.has(employee.companyId));
  }

  const EmployeeSelect = ({ value, onChange, disabled = false }: { value: string; onChange: (value: string) => void; disabled?: boolean }) => (
    <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      <option value="">Definir depois</option>
      {selectedCompanyEmployees.map((employee) => (
        <option key={employee.id} value={employee.id}>{employee.name}</option>
      ))}
    </select>
  );

  const WizardEmployeeSelect = ({ value, onChange, disabled = false }: { value: string; onChange: (value: string) => void; disabled?: boolean }) => (
    <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      <option value="">Definir depois</option>
      {wizardCompanyEmployees.map((employee) => (
        <option key={employee.id} value={employee.id}>{employee.name}</option>
      ))}
    </select>
  );

  function groupIdForCompany(companyIdValue: string) {
    return `group-company-${companyIdValue}`;
  }

  function groupUnitId(type: GroupUnitType, sourceId: string) {
    return `group-unit-${type}-${sourceId}`;
  }

  function isDefaultCompanyGroup(group: CompanyGroup) {
    return group.autoSyncStructure === true && group.companyIds.length === 1 && group.id === groupIdForCompany(group.companyIds[0]);
  }

  function companyGroupForCompany(companyIdValue: string, groups = companyGroups) {
    return groups.find((group) => group.companyIds.includes(companyIdValue));
  }

  function groupUnitsFromCompany(companyIdValue: string): CompanyGroupUnit[] {
    const departments = departmentsForStructureCompany(companyIdValue);
    const sectors = sectorsForStructureCompany(companyIdValue);
    const subsectors = subsectorsForStructureCompany(companyIdValue);
    const teams = teamsForStructureCompany(companyIdValue);

    return [
      ...departments.map((department) => ({
        id: groupUnitId("department", department.id),
        name: department.name,
        type: "department" as GroupUnitType,
        parentUnitId: "",
        links: [{ companyId: companyIdValue, sourceId: department.id }],
        coordinatorEmployeeId: department.managerEmployeeId || "",
      })),
      ...sectors.map((sector) => ({
        id: groupUnitId("sector", sector.id),
        name: sector.name,
        type: "sector" as GroupUnitType,
        parentUnitId: sector.departmentId ? groupUnitId("department", sector.departmentId) : "",
        links: [{ companyId: companyIdValue, sourceId: sector.id }],
        coordinatorEmployeeId: sector.coordinatorEmployeeId || sector.leaderEmployeeId || "",
      })),
      ...subsectors.map((subsector) => ({
        id: groupUnitId("subsector", subsector.id),
        name: subsector.name,
        type: "subsector" as GroupUnitType,
        parentUnitId: subsector.sectorId ? groupUnitId("sector", subsector.sectorId) : "",
        links: [{ companyId: companyIdValue, sourceId: subsector.id }],
        coordinatorEmployeeId: subsector.leaderEmployeeId || "",
      })),
      ...teams.map((team) => ({
        id: groupUnitId("team", team.id),
        name: team.name,
        type: "team" as GroupUnitType,
        parentUnitId: (team as any).subsectorId ? groupUnitId("subsector", (team as any).subsectorId) : ((team as any).sectorId ? groupUnitId("sector", (team as any).sectorId) : ""),
        links: [{ companyId: companyIdValue, sourceId: team.id }],
        coordinatorEmployeeId: "",
      })),
    ];
  }

  function usesReferenceDivergence(group: Pick<CompanyGroup, "divergenceMode">) {
    return group.divergenceMode === "use_reference" || group.divergenceMode === "copy_from_source";
  }

  function isReferenceGroupUnit(unit: Pick<CompanyGroupUnit, "id">) {
    return unit.id.startsWith("reference-");
  }

  function effectiveGroupUnits(group: CompanyGroup) {
    const explicitUnits = (group.units || []).map((unit) => ({
      ...unit,
      parentUnitId: unit.parentUnitId || "",
      links: Array.isArray(unit.links) ? unit.links : [],
      coordinatorEmployeeId: unit.coordinatorEmployeeId || "",
    }));

    if (group.autoSyncStructure && group.companyIds.length === 1) {
      return mergeGroupUnits([...explicitUnits, ...groupUnitsFromCompany(group.companyIds[0])]);
    }

    if (usesReferenceDivergence(group)) {
      return mergeGroupUnits([...explicitUnits, ...buildReferenceVirtualUnits(group)]);
    }

    return explicitUnits;
  }

  function groupUnitResponsibleLabel(type: GroupUnitType) {
    if (type === "sector") return "Coordenador do setor no grupo";
    if (type === "department") return "Responsável do departamento no grupo";
    if (type === "subsector") return "Líder do subsetor no grupo";
    return "Responsável da equipe no grupo";
  }

  function groupLeadershipRoleForUnit(type: GroupUnitType): EmployeeAssignmentRole {
    if (type === "department") return "gerente";
    if (type === "sector") return "coordenador";
    return "lider";
  }

  function synchronizeUnitCoordinatorAssignments(
    units: CompanyGroupUnit[],
    assignments: GroupLeadershipAssignment[],
  ) {
    const validUnitIds = new Set(units.map((unit) => unit.id));
    let synchronized = assignments.filter((assignment) => (
      assignment.unitId === rootParentValue || validUnitIds.has(assignment.unitId)
    ));

    units.forEach((unit) => {
      const role = groupLeadershipRoleForUnit(unit.type);
      if (!unit.coordinatorEmployeeId) {
        synchronized = synchronized.filter((assignment) => !(
          assignment.unitId === unit.id
          && assignment.role === role
          && assignment.id.startsWith("group-unit-responsible-")
        ));
        return;
      }

      synchronized = synchronized.filter((assignment) => !(
        assignment.unitId === unit.id
        && assignment.role === role
        && assignment.employeeId !== unit.coordinatorEmployeeId
      ));

      const existing = synchronized.find((assignment) => (
        assignment.unitId === unit.id
        && assignment.role === role
        && assignment.employeeId === unit.coordinatorEmployeeId
      ));

      if (!existing) {
        synchronized.push({
          id: `group-unit-responsible-${unit.id}-${role}`,
          employeeId: unit.coordinatorEmployeeId,
          unitId: unit.id,
          role,
        });
      }
    });

    const uniqueAssignments = new Map<string, GroupLeadershipAssignment>();
    synchronized.forEach((assignment) => {
      const key = `${assignment.employeeId}:${assignment.role}:${assignment.unitId}`;
      if (!uniqueAssignments.has(key)) uniqueAssignments.set(key, assignment);
    });
    return [...uniqueAssignments.values()];
  }

  function inferEmployeeGroupUnitId(group: CompanyGroup, employee: any, type: GroupUnitType) {
    const sourceId = employeeSourceId(employee, type);
    if (!sourceId) return "";
    return effectiveGroupUnits(group).find((unit) => unit.type === type && unit.links.some((link) => (
      link.companyId === employee.companyId && link.sourceId === sourceId
    )))?.id || "";
  }

  function buildGroupEmployeeAssignments(group: CompanyGroup) {
    const units = effectiveGroupUnits(group);
    const unitsByType = (type: GroupUnitType) => new Set(units.filter((unit) => unit.type === type).map((unit) => unit.id));
    const unitSets = {
      department: unitsByType("department"),
      sector: unitsByType("sector"),
      subsector: unitsByType("subsector"),
      team: unitsByType("team"),
    };
    const previousAssignments = new Map((group.employeeAssignments || []).map((assignment) => [assignment.employeeId, assignment]));

    return data.employees
      .filter((employee) => group.companyIds.includes(employee.companyId))
      .map((employee) => {
        const previous = previousAssignments.get(employee.id);
        const keepOrInfer = (type: GroupUnitType, previousUnitId?: string) => {
          const set = type === "department"
            ? unitSets.department
            : type === "sector"
              ? unitSets.sector
              : type === "subsector"
                ? unitSets.subsector
                : unitSets.team;
          return previousUnitId && set.has(previousUnitId)
            ? previousUnitId
            : inferEmployeeGroupUnitId(group, employee, type);
        };

        return {
          employeeId: employee.id,
          departmentUnitId: keepOrInfer("department", previous?.departmentUnitId),
          sectorUnitId: keepOrInfer("sector", previous?.sectorUnitId),
          subsectorUnitId: keepOrInfer("subsector", previous?.subsectorUnitId),
          teamUnitId: keepOrInfer("team", previous?.teamUnitId),
        };
      });
  }

  function deduplicateGroupStructure(group: CompanyGroup): CompanyGroup {
    const mergedByName = new Map<string, CompanyGroupUnit>();
    const unitIdMap = new Map<string, string>();

    (group.units || []).forEach((unit) => {
      const normalizedName = normalizeStructureName(unit.name || "");
      const key = normalizedName ? `${unit.type}:${normalizedName}` : `${unit.type}:id:${unit.id}`;
      const current = mergedByName.get(key);

      if (!current) {
        const copy = {
          ...unit,
          parentUnitId: unit.parentUnitId || "",
          links: Array.isArray(unit.links) ? unit.links.map((link) => ({ ...link })) : [],
          coordinatorEmployeeId: unit.coordinatorEmployeeId || "",
        };
        mergedByName.set(key, copy);
        unitIdMap.set(unit.id, copy.id);
        return;
      }

      unitIdMap.set(unit.id, current.id);
      const links = [...current.links];
      (Array.isArray(unit.links) ? unit.links : []).forEach((link) => {
        if (!links.some((item) => item.companyId === link.companyId && item.sourceId === link.sourceId)) {
          links.push({ ...link });
        }
      });

      mergedByName.set(key, {
        ...current,
        links,
        parentUnitId: current.parentUnitId || unit.parentUnitId || "",
        coordinatorEmployeeId: current.coordinatorEmployeeId || unit.coordinatorEmployeeId || "",
      });
    });

    const units = [...mergedByName.values()].map((unit) => ({
      ...unit,
      parentUnitId: unit.parentUnitId ? (unitIdMap.get(unit.parentUnitId) || unit.parentUnitId) : "",
    }));
    const validUnitIds = new Set(units.map((unit) => unit.id));
    const assignmentByEmployee = new Map<string, GroupEmployeeAssignment>();
    const remapUnitId = (unitId: string) => {
      if (!unitId) return "";
      const mapped = unitIdMap.get(unitId) || unitId;
      return validUnitIds.has(mapped) ? mapped : "";
    };

    (group.employeeAssignments || []).forEach((assignment) => {
      const current = assignmentByEmployee.get(assignment.employeeId);
      const normalizedAssignment: GroupEmployeeAssignment = {
        employeeId: assignment.employeeId,
        departmentUnitId: remapUnitId(assignment.departmentUnitId),
        sectorUnitId: remapUnitId(assignment.sectorUnitId),
        subsectorUnitId: remapUnitId(assignment.subsectorUnitId),
        teamUnitId: remapUnitId(assignment.teamUnitId),
      };

      assignmentByEmployee.set(assignment.employeeId, current ? {
        employeeId: assignment.employeeId,
        departmentUnitId: current.departmentUnitId || normalizedAssignment.departmentUnitId,
        sectorUnitId: current.sectorUnitId || normalizedAssignment.sectorUnitId,
        subsectorUnitId: current.subsectorUnitId || normalizedAssignment.subsectorUnitId,
        teamUnitId: current.teamUnitId || normalizedAssignment.teamUnitId,
      } : normalizedAssignment);
    });

    const leadershipByKey = new Map<string, GroupLeadershipAssignment>();
    (group.leadershipAssignments || []).forEach((assignment) => {
      const mappedUnitId = assignment.unitId === rootParentValue
        ? rootParentValue
        : remapUnitId(assignment.unitId);
      if (!mappedUnitId) return;
      const key = `${assignment.employeeId}:${assignment.role}:${mappedUnitId}`;
      if (!leadershipByKey.has(key)) {
        leadershipByKey.set(key, { ...assignment, unitId: mappedUnitId });
      }
    });

    return {
      ...group,
      units,
      employeeAssignments: [...assignmentByEmployee.values()],
      leadershipAssignments: synchronizeUnitCoordinatorAssignments(
        units,
        [...leadershipByKey.values()],
      ),
    };
  }

  function normalizeCompanyGroups(groups: CompanyGroup[]) {
    const validCompanyIds = new Set(data.companies.map((company) => company.id));
    const groupedCompanyIds = new Set<string>();
    const prioritizedGroups = [...groups]
      .map((group) => ({
        ...group,
        companyIds: Array.isArray(group.companyIds) ? group.companyIds : [],
        units: Array.isArray(group.units) ? group.units : [],
        employeeAssignments: Array.isArray(group.employeeAssignments) ? group.employeeAssignments : [],
        leadershipAssignments: Array.isArray(group.leadershipAssignments) ? group.leadershipAssignments : [],
        divergenceMode: group.divergenceMode === "copy_from_source" ? "use_reference" : (group.divergenceMode || "keep_existing"),
        divergenceTypes: Array.isArray(group.divergenceTypes) ? group.divergenceTypes : [],
      }))
      .sort((first, second) => Number(isDefaultCompanyGroup(first)) - Number(isDefaultCompanyGroup(second)));

    const normalizedGroups = prioritizedGroups.reduce<CompanyGroup[]>((acc, group) => {
      const companyIds = group.companyIds.filter((id) => validCompanyIds.has(id) && !groupedCompanyIds.has(id));
      if (!companyIds.length) return acc;

      companyIds.forEach((id) => groupedCompanyIds.add(id));
      const companyIdSet = new Set(companyIds);
      const sourceUnits = group.autoSyncStructure && companyIds.length === 1
        ? mergeGroupUnits([...group.units, ...groupUnitsFromCompany(companyIds[0])])
        : group.units;
      const cleanGroup: CompanyGroup = {
        ...group,
        companyIds,
        units: sourceUnits
          .map((unit) => ({
            ...unit,
            parentUnitId: unit.parentUnitId || "",
            links: (Array.isArray(unit.links) ? unit.links : []).filter((link) => companyIdSet.has(link.companyId)),
            coordinatorEmployeeId: unit.coordinatorEmployeeId || "",
          }))
          .filter((unit) => unit.links.length > 0 || !isReferenceGroupUnit(unit)),
      };

      const deduplicatedGroup = deduplicateGroupStructure(cleanGroup);
      acc.push({
        ...deduplicatedGroup,
        employeeAssignments: buildGroupEmployeeAssignments(deduplicatedGroup),
        leadershipAssignments: deduplicatedGroup.leadershipAssignments || [],
      });
      return acc;
    }, []);

    return normalizedGroups;
  }

  function groupPersistenceFingerprint(group: CompanyGroup) {
    return JSON.stringify({
      id: group.id,
      name: group.name,
      companyIds: [...group.companyIds].sort(),
      units: group.units
        .map((unit) => ({
          id: unit.id,
          name: unit.name,
          type: unit.type,
          parentUnitId: unit.parentUnitId || "",
          coordinatorEmployeeId: unit.coordinatorEmployeeId || "",
          links: unit.links
            .map((link) => ({ companyId: link.companyId, sourceId: link.sourceId }))
            .sort((first, second) => `${first.companyId}:${first.sourceId}`.localeCompare(`${second.companyId}:${second.sourceId}`)),
        }))
        .sort((first, second) => first.id.localeCompare(second.id)),
      active: group.active !== false,
      autoSyncStructure: group.autoSyncStructure === true,
      divergenceMode: group.divergenceMode || "keep_existing",
      divergenceSourceCompanyId: group.divergenceSourceCompanyId || "",
      divergenceTypes: [...(group.divergenceTypes || [])].sort(),
      employeeAssignments: group.employeeAssignments
        .map((assignment) => ({ ...assignment }))
        .sort((first, second) => first.employeeId.localeCompare(second.employeeId)),
      leadershipAssignments: (group.leadershipAssignments || [])
        .map((assignment) => ({
          id: assignment.id,
          employeeId: assignment.employeeId,
          unitId: assignment.unitId,
          role: assignment.role,
        }))
        .sort((first, second) => first.id.localeCompare(second.id)),
    });
  }

  async function persistCompanyGroup(group: CompanyGroup) {
    const now = new Date().toISOString();
    const normalizedGroup = deduplicateGroupStructure({
      ...group,
      units: effectiveGroupUnits(group),
      employeeAssignments: buildGroupEmployeeAssignments(group),
    });
    const existingGroup = data.companyGroups.find((item) => item.id === normalizedGroup.id);

    await data.saveCompanyGroupGraph({
      group: {
        id: normalizedGroup.id || undefined,
        name: normalizedGroup.name,
        active: normalizedGroup.active !== false,
        autoSyncStructure: normalizedGroup.autoSyncStructure,
        divergenceMode: normalizedGroup.divergenceMode,
        divergenceSourceCompanyId: normalizedGroup.divergenceSourceCompanyId || "",
        divergenceTypes: normalizedGroup.divergenceTypes || [],
        createdAt: existingGroup?.createdAt || normalizedGroup.createdAt || now,
        updatedAt: now,
      },
      companyIds: normalizedGroup.companyIds,
      units: normalizedGroup.units.map((unit) => {
        const existingUnit = data.companyGroupUnits.find((item) => item.id === unit.id);
        return {
          unit: {
            id: unit.id || undefined,
            name: unit.name,
            type: unit.type,
            parentUnitId: unit.parentUnitId || "",
            coordinatorEmployeeId: unit.coordinatorEmployeeId || "",
            active: true,
            createdAt: existingUnit?.createdAt || now,
            updatedAt: now,
          },
          links: unit.links.map((link) => {
            const existingLink = data.companyGroupUnitLinks.find((item) => (
              item.groupUnitId === unit.id && item.companyId === link.companyId && item.sourceId === link.sourceId
            ));
            return {
              id: existingLink?.id,
              companyId: link.companyId,
              sourceId: link.sourceId,
              sourceType: unit.type,
              createdAt: existingLink?.createdAt || now,
              updatedAt: now,
            };
          }),
        };
      }),
      employeeAssignments: normalizedGroup.employeeAssignments.map((assignment) => {
        const existing = data.companyGroupEmployeeAssignments.find((item) => (
          item.groupId === normalizedGroup.id && item.employeeId === assignment.employeeId
        ));
        return {
          id: existing?.id,
          employeeId: assignment.employeeId,
          departmentUnitId: assignment.departmentUnitId || "",
          sectorUnitId: assignment.sectorUnitId || "",
          subsectorUnitId: assignment.subsectorUnitId || "",
          teamUnitId: assignment.teamUnitId || "",
          createdAt: existing?.createdAt || now,
          updatedAt: now,
        };
      }),
      leadershipAssignments: (normalizedGroup.leadershipAssignments || []).map((assignment) => {
        const existing = data.companyGroupLeadershipAssignments.find((item) => item.id === assignment.id);
        return {
          id: assignment.id || undefined,
          employeeId: assignment.employeeId,
          unitId: assignment.unitId,
          role: assignment.role,
          createdAt: existing?.createdAt || now,
          updatedAt: now,
        };
      }),
    });
  }

  async function persistNormalizedGroups(nextGroups: CompanyGroup[], skipDeleteAccessKey = true) {
    const currentById = new Map(companyGroups.map((group) => [group.id, group]));
    const nextById = new Map(nextGroups.map((group) => [group.id, group]));

    // Primeiro salva os grupos novos/alterados e só depois remove os antigos.
    // Assim uma falha de rede não deixa empresas temporariamente sem grupo.
    for (const next of nextGroups) {
      const current = currentById.get(next.id);
      if (!current || groupPersistenceFingerprint(current) !== groupPersistenceFingerprint(next)) {
        await persistCompanyGroup(next);
      }
    }

    for (const current of companyGroups) {
      if (!nextById.has(current.id)) {
        await data.deleteCompanyGroupGraph(current.id, { skipAccessKey: skipDeleteAccessKey });
      }
    }
  }

  function queueGroupPersistence(task: () => Promise<void>) {
    groupMutationQueueRef.current = groupMutationQueueRef.current
      .catch(() => undefined)
      .then(task)
      .catch((error) => {
        alert(error instanceof Error ? error.message : "Não foi possível salvar o grupo no banco de dados.");
      });
  }

  function setNormalizedCompanyGroups(updater: (current: CompanyGroup[]) => CompanyGroup[]) {
    const next = normalizeCompanyGroups(updater(companyGroups));
    queueGroupPersistence(() => persistNormalizedGroups(next));
  }

  useEffect(() => {
    const collectionsByTab: Record<TabKey, Array<keyof typeof data>> = {
      companies: [],
      groups: [
        "departments", "sectors", "subsectors", "teams",
        "companyGroupUnits", "companyGroupUnitLinks",
        "companyGroupEmployeeAssignments", "companyGroupLeadershipAssignments",
      ],
      departments: ["departments", "employees"],
      sectors: ["departments", "sectors", "subsectors", "employees"],
      teams: ["teams", "employees"],
      benefits: ["benefitContracts"],
      modules: ["customModules"],
      structure: ["organizational_nodes", "employee_assignments", "employees"],
    };

    const names = collectionsByTab[activeTab] || [];
    if (names.length) {
      void data.ensureCollectionsLoaded(names as any);
    }
  }, [activeTab, data.ensureCollectionsLoaded]);

  useEffect(() => {
    if (!SCREEN_WRITE_EFFECTS_ENABLED) return;
    if (data.loading || legacyGroupMigrationRef.current) return;

    const legacyStorageKey = "companies.company-groups.v1";
    const legacyValue = window.localStorage.getItem(legacyStorageKey);
    if (!legacyValue) return;

    if (data.companyGroups.length > 0) {
      window.localStorage.removeItem(legacyStorageKey);
      return;
    }

    legacyGroupMigrationRef.current = true;
    try {
      const parsed = JSON.parse(legacyValue) as CompanyGroup[];
      if (!Array.isArray(parsed) || !parsed.length) {
        window.localStorage.removeItem(legacyStorageKey);
        legacyGroupMigrationRef.current = false;
        return;
      }

      const migrated = normalizeCompanyGroups(parsed.map((group) => ({
        ...group,
        companyIds: Array.isArray(group.companyIds) ? group.companyIds : [],
        units: Array.isArray(group.units) ? group.units : [],
        employeeAssignments: Array.isArray(group.employeeAssignments) ? group.employeeAssignments : [],
        leadershipAssignments: Array.isArray(group.leadershipAssignments) ? group.leadershipAssignments : [],
      })));

      void persistNormalizedGroups(migrated)
        .then(() => window.localStorage.removeItem(legacyStorageKey))
        .catch((error) => console.error("Não foi possível migrar os grupos antigos para o Firestore.", error))
        .finally(() => {
          legacyGroupMigrationRef.current = false;
        });
    } catch (error) {
      legacyGroupMigrationRef.current = false;
      console.error("O cadastro antigo de grupos está inválido e não pôde ser migrado.", error);
    }
  }, [data.loading, data.companyGroups.length]);

  useEffect(() => {
    if (!SCREEN_WRITE_EFFECTS_ENABLED) return;
    if (data.loading || groupDatabaseSyncRef.current || legacyGroupMigrationRef.current) return;
    const normalized = normalizeCompanyGroups(companyGroups);
    const currentFingerprint = companyGroups.map(groupPersistenceFingerprint).sort().join("|");
    const normalizedFingerprint = normalized.map(groupPersistenceFingerprint).sort().join("|");
    if (currentFingerprint === normalizedFingerprint) return;

    groupDatabaseSyncRef.current = true;
    void persistNormalizedGroups(normalized)
      .catch((error) => console.error("Não foi possível sincronizar grupos empresariais.", error))
      .finally(() => {
        groupDatabaseSyncRef.current = false;
      });
  }, [
    data.loading,
    data.companies,
    data.departments,
    data.sectors,
    data.subsectors,
    data.teams,
    data.employees,
    companyGroups,
  ]);

  const summary = useMemo(
    () =>
      data.companies.map((company) => {
        const group = resolveCompanyGroupForCompany(company.id, data.companyGroups, data.companyGroupCompanies)
          || primaryStructureGroup;
        return {
          company,
          departments: structureItemsForGroup(data.departments, group, data.companyGroupCompanies, data.companies).length,
          sectors: structureItemsForGroup(data.sectors, group, data.companyGroupCompanies, data.companies).length,
          employees: data.employees.filter((item) => item.companyId === company.id).length,
        };
      }),
    [data.companies, data.companyGroupCompanies, data.companyGroups, data.departments, data.employees, data.sectors, primaryStructureGroup],
  );

  function resetCompanyForm() {
    setCompanyForm({ name: "", legalName: "", document: "", location: "" });
  }

  function resetDepartmentForm() {
    setDepartmentForm({ name: "", managerName: "", managerEmployeeId: "", description: "" });
  }

  function resetSectorForm() {
    setSectorForm({ departmentId: "", name: "", coordinatorName: "", coordinatorEmployeeId: "", leaderName: "", leaderEmployeeId: "", costCenter: "" });
  }

  function resetSubsectorForm() {
    setSubsectorForm({ sectorId: "", name: "", leaderName: "", leaderEmployeeId: "" });
  }

  function resetContractForm() {
    setContractForm({
      name: "",
      providerName: "",
      type: "transport",
      websiteUrl: "",
      startDate: todayISO(),
      endDate: "",
      fieldKey: "",
      fieldValue: "",
    });
  }

  function resetModuleForm() {
    setModuleForm({ name: "", description: "", targetScreen: "benefits", columns: "" });
  }

  function resetTeamForm() {
    setTeamForm({ name: "", description: "" });
  }

  function resetAllForms() {
    resetCompanyForm();
    resetDepartmentForm();
    resetSectorForm();
    resetSubsectorForm();
    resetContractForm();
    resetModuleForm();
    resetTeamForm();
  }

  function closeForm() {
    setEditingKind(null);
    setEditingId("");
    setCreateCompanyThenOpenStructure(false);
    resetAllForms();
  }

  function openCreate(kind: EntityKind) {
    resetAllForms();
    setEditingKind(kind);
    setEditingId("");
    setCreateCompanyThenOpenStructure(false);

    if (kind === "company") setActiveTab("companies");
    if (kind === "department") setActiveTab("departments");
    if (kind === "sector" || kind === "subsector") setActiveTab("sectors");
    if (kind === "team") setActiveTab("teams");
    if (kind === "contract") setActiveTab("benefits");
    if (kind === "module") setActiveTab("modules");
  }

  function startEditCompany(company: any) {
    setEditingKind("company");
    setEditingId(company.id);
    setCompanyForm({
      name: company.name ?? "",
      legalName: company.legalName ?? "",
      document: company.document ?? "",
      location: company.location ?? "",
    });
    setActiveTab("companies");
  }

  function startEditDepartment(item: any) {
    setEditingKind("department");
    setEditingId(item.id);
    setDepartmentForm({
      name: item.name ?? "",
      managerName: item.managerName ?? "",
      managerEmployeeId: item.managerEmployeeId ?? "",
      description: item.description ?? "",
    });
    setActiveTab("departments");
  }

  function startEditSector(item: any) {
    setEditingKind("sector");
    setEditingId(item.id);
    setSectorForm({
      departmentId: item.departmentId ?? "",
      name: item.name ?? "",
      coordinatorName: item.coordinatorName ?? "",
      coordinatorEmployeeId: item.coordinatorEmployeeId ?? "",
      leaderName: item.leaderName ?? "",
      leaderEmployeeId: item.leaderEmployeeId ?? "",
      costCenter: item.costCenter ?? "",
    });
    setActiveTab("sectors");
  }

  function startEditSubsector(item: any) {
    setEditingKind("subsector");
    setEditingId(item.id);
    setSubsectorForm({
      sectorId: item.sectorId ?? "",
      name: item.name ?? "",
      leaderName: item.leaderName ?? "",
      leaderEmployeeId: item.leaderEmployeeId ?? "",
    });
    setActiveTab("sectors");
  }


  function startEditTeam(item: Team) {
    setEditingKind("team");
    setEditingId(item.id);
    setTeamForm({ name: item.name ?? "", description: item.description ?? "" });
    setActiveTab("teams");
  }

  function startEditContract(item: any) {
    const customKey = item.customFields ? Object.keys(item.customFields)[0] ?? "" : "";

    setEditingKind("contract");
    setEditingId(item.id);
    setContractForm({
      name: item.name ?? "",
      providerName: item.providerName ?? "",
      type: item.type ?? "transport",
      websiteUrl: item.websiteUrl ?? "",
      startDate: item.startDate ?? todayISO(),
      endDate: item.endDate ?? "",
      fieldKey: customKey,
      fieldValue: customKey ? item.customFields[customKey] ?? "" : "",
    });
    setActiveTab("benefits");
  }

  function startEditModule(item: any) {
    setEditingKind("module");
    setEditingId(item.id);
    setModuleForm({
      name: item.name ?? "",
      description: item.description ?? "",
      targetScreen: item.targetScreen ?? "benefits",
      columns: Array.isArray(item.columns) ? item.columns.join(", ") : "",
    });
    setActiveTab("modules");
  }

  function chooseTargetId(title: string, options: Array<{ id: string; label: string }>, allowEmptyLabel = "") {
    const emptyOption = allowEmptyLabel ? "0. " + allowEmptyLabel + "\n" : "";
    const optionText = options.map((option, index) => `${index + 1}. ${option.label}`).join("\n");
    const answer = window.prompt(`${title}\n${emptyOption}${optionText}\n\nDigite o numero da opcao.`, allowEmptyLabel ? "0" : "1");

    if (answer === null) return null;
    if (allowEmptyLabel && answer.trim() === "0") return "";

    const index = Number(answer) - 1;
    return options[index]?.id ?? null;
  }

  function deleteImpact(methodName: string, id: string) {
    if (methodName === "deleteCompany") {
      return [
        `${data.employees.filter((employee) => employee.companyId === id).length} funcionario(s)`,
        "estrutura do grupo preservada",
      ];
    }

    if (methodName === "deleteDepartment") {
      return [
        `${data.employees.filter((employee) => employee.departmentId === id).length} funcionario(s)`,
        `${data.sectors.filter((item) => item.departmentId === id).length} setor(es)`,
        `${data.subsectors.filter((item) => item.departmentId === id).length} subsetor(es)`,
      ];
    }

    if (methodName === "deleteSector") {
      return [
        `${data.employees.filter((employee) => employee.sectorId === id).length} funcionario(s)`,
        `${data.subsectors.filter((item) => item.sectorId === id).length} subsetor(es)`,
      ];
    }

    if (methodName === "deleteSubsector") {
      return [`${data.employees.filter((employee) => employee.subsectorId === id).length} funcionario(s)`];
    }

    if (methodName === "deleteTeam") {
      return [`${data.employees.filter((employee) => employee.teamId === id).length} funcionario(s)`];
    }

    return [];
  }

  function confirmRelocatedDeleteAccess() {
    return data.confirmAccessKey({
      title: "Chave de acesso para exclusão",
      description: "Informe uma chave ativa cadastrada na coleção accessKeys antes de realocar vínculos e excluir este registro.",
      confirmLabel: "Autorizar exclusão",
    });
  }

  async function relocateBeforeDelete(methodName: string, id: string) {
    const now = new Date().toISOString();

    if (methodName === "deleteCompany") {
      const targetCompanyId = chooseTargetId(
        "Selecione a empresa para receber funcionarios.",
        data.companies.filter((company) => company.id !== id).map((company) => ({ id: company.id, label: company.name })),
      );
      if (targetCompanyId === null) return false;
      if (!targetCompanyId) {
        alert("Cadastre outra empresa antes de realocar.");
        return false;
      }

      if (!(await confirmRelocatedDeleteAccess())) return false;

      const targetGroup = structureGroupForCompany(targetCompanyId);
      const targetScope = structureScopePayload(targetGroup, data.companyGroupCompanies, data.companies);
      await Promise.all([
        ...data.employees
          .filter((item) => item.companyId === id)
          .map((item) => data.upsertEmployee({ ...item, companyId: targetCompanyId, groupId: targetScope.groupId, updatedAt: now })),
      ]);
      return data.removeItem("companies", id, { skipAccessKey: true });
    }

    if (methodName === "deleteDepartment") {
      const department = data.departments.find((item) => item.id === id);
      const targetDepartmentId = chooseTargetId(
        "Selecione o departamento para receber setores e funcionarios.",
        companyDepartments
          .filter((item) => item.id !== id && (!department || item.id !== department.id))
          .map((item) => ({ id: item.id, label: item.name })),
      );
      if (!targetDepartmentId) return false;

      if (!(await confirmRelocatedDeleteAccess())) return false;

      await Promise.all([
        ...data.sectors.filter((item) => item.departmentId === id).map((item) => data.upsertSector({ ...item, departmentId: targetDepartmentId } as any)),
        ...data.subsectors.filter((item) => item.departmentId === id).map((item) => data.upsertSubsector({ ...item, departmentId: targetDepartmentId } as any)),
        ...data.employees.filter((item) => item.departmentId === id).map((item) => data.upsertEmployee({ ...item, departmentId: targetDepartmentId, updatedAt: now })),
      ]);
      return data.removeItem("departments", id, { skipAccessKey: true });
    }

    if (methodName === "deleteSector") {
      const sector = data.sectors.find((item) => item.id === id);
      const targetSectorId = chooseTargetId(
        "Selecione o setor para receber funcionarios e subsetores.",
        companySectors
          .filter((item) => item.id !== id && (!sector || item.id !== sector.id))
          .map((item) => ({ id: item.id, label: item.name })),
      );
      if (!targetSectorId) return false;
      const targetSector = data.sectors.find((item) => item.id === targetSectorId);
      if (!targetSector) return false;

      if (!(await confirmRelocatedDeleteAccess())) return false;

      await Promise.all([
        ...data.subsectors.filter((item) => item.sectorId === id).map((item) => data.upsertSubsector({ ...item, sectorId: targetSector.id, departmentId: targetSector.departmentId } as any)),
        ...data.employees.filter((item) => item.sectorId === id).map((item) => data.upsertEmployee({ ...item, departmentId: targetSector.departmentId, sectorId: targetSector.id, updatedAt: now })),
      ]);
      return data.removeItem("sectors", id, { skipAccessKey: true });
    }

    if (methodName === "deleteSubsector") {
      const subsector = data.subsectors.find((item) => item.id === id);
      const targetSubsectorId = chooseTargetId(
        "Selecione o subsetor para receber funcionarios.",
        data.subsectors
          .filter((item) => item.id !== id && item.sectorId === subsector?.sectorId)
          .map((item) => ({ id: item.id, label: item.name })),
        "Deixar funcionarios sem subsetor",
      );
      if (targetSubsectorId === null) return false;

      if (!(await confirmRelocatedDeleteAccess())) return false;

      await Promise.all(
        data.employees
          .filter((item) => item.subsectorId === id)
          .map((item) => data.upsertEmployee({ ...item, subsectorId: targetSubsectorId || "", updatedAt: now })),
      );
      return data.removeItem("subsectors", id, { skipAccessKey: true });
    }

    if (methodName === "deleteTeam") {
      const team = data.teams.find((item) => item.id === id);
      const targetTeamId = chooseTargetId(
        "Selecione a equipe para receber funcionarios.",
        companyTeams
          .filter((item) => item.id !== id && (!team || item.id !== team.id))
          .map((item) => ({ id: item.id, label: item.name })),
        "Deixar funcionarios sem equipe",
      );
      if (targetTeamId === null) return false;

      if (!(await confirmRelocatedDeleteAccess())) return false;

      await Promise.all(
        data.employees
          .filter((item) => item.teamId === id)
          .map((item) => data.upsertEmployee({ ...item, teamId: targetTeamId || "", isTeamLead: false, updatedAt: now })),
      );
      return data.removeItem("teams", id, { skipAccessKey: true });
    }

    return false;
  }

  async function executeDeleteRequest() {
    const request = deleteRequest;
    if (!request || deleteRequestBusy) return;
    setDeleteRequestBusy(true);
    try {
      const result = await request.onConfirm();
      if (result === false) return;
      setDeleteRequest(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Não foi possível concluir a exclusão.");
    } finally {
      setDeleteRequestBusy(false);
    }
  }

  async function executeDeleteSecondary() {
    const request = deleteRequest;
    if (!request?.onSecondary || deleteRequestBusy) return;
    setDeleteRequestBusy(true);
    try {
      const result = await request.onSecondary();
      if (result === false) return;
      setDeleteRequest(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Não foi possível realocar os vínculos.");
    } finally {
      setDeleteRequestBusy(false);
    }
  }

  function tryDelete(methodName: string, id: string) {
    const configs: Record<string, { collection: keyof typeof data; label: string; entityLabel: string }> = {
      deleteCompany: {
        collection: "companies",
        label: "empresa",
        entityLabel: data.companies.find((item) => item.id === id)?.name || "Empresa selecionada",
      },
      deleteDepartment: {
        collection: "departments",
        label: "departamento",
        entityLabel: data.departments.find((item) => item.id === id)?.name || "Departamento selecionado",
      },
      deleteSector: {
        collection: "sectors",
        label: "setor",
        entityLabel: data.sectors.find((item) => item.id === id)?.name || "Setor selecionado",
      },
      deleteSubsector: {
        collection: "subsectors",
        label: "subsetor",
        entityLabel: data.subsectors.find((item) => item.id === id)?.name || "Subsetor selecionado",
      },
      deleteTeam: {
        collection: "teams",
        label: "equipe",
        entityLabel: data.teams.find((item) => item.id === id)?.name || "Equipe selecionada",
      },
      deleteBenefitContract: {
        collection: "benefitContracts",
        label: "benefício",
        entityLabel: data.benefitContracts.find((item) => item.id === id)?.name || "Benefício selecionado",
      },
      deleteCustomModule: {
        collection: "customModules",
        label: "módulo",
        entityLabel: data.customModules.find((item) => item.id === id)?.name || "Módulo selecionado",
      },
    };

    const config = configs[methodName];
    if (!config || typeof actions[methodName] !== "function") {
      alert(`A função ${methodName} não existe no useDomainData. Crie essa função no hook para a exclusão funcionar.`);
      return;
    }

    const impact = buildDomainDeletionImpact(data, config.collection as any, id, config.entityLabel);
    const canRelocate = ["deleteCompany", "deleteDepartment", "deleteSector", "deleteSubsector", "deleteTeam"].includes(methodName)
      && (impact.links || []).some((item) => item.count > 0);

    setDeleteRequest({
      title: `Excluir ${config.label}`,
      impact,
      confirmLabel: "Excluir mesmo assim",
      secondaryLabel: canRelocate ? "Realocar vínculos" : undefined,
      onSecondary: canRelocate
        ? async () => {
            const relocated = await relocateBeforeDelete(methodName, id);
            if (relocated) closeForm();
            return relocated;
          }
        : undefined,
      onConfirm: async () => {
        const deleted = await actions[methodName](id);
        if (!deleted) {
          throw new Error("A exclusão não foi concluída. Verifique a chave de acesso e a permissão do seu usuário.");
        }

        if (id === selectedCompanyId) {
          setSelectedCompanyId("");
          setActiveTab("companies");
        }
        closeForm();
        return true;
      },
    });
  }

  async function toggleActive(item: any, upsertMethod: string) {
    if (typeof actions[upsertMethod] !== "function") return;
    await actions[upsertMethod]({ ...item, active: item.active === false });
  }

  function normalizeDocumentNumber(value: string) {
    return String(value || "").replace(/\D/g, "").trim();
  }

  function showConflict(title: string, description: string) {
    setConflictState({ title, description });
  }

  async function submitCompany(event: FormEvent) {
    event.preventDefault();

    const normalizedCnpj = normalizeDocumentNumber(companyForm.document);
    if (normalizedCnpj) {
      const duplicate = data.companies.find((item) => item.id !== editingId && normalizeDocumentNumber(item.document) === normalizedCnpj);
      if (duplicate) {
        showConflict(
          "CNPJ duplicado",
          `O CNPJ informado já está cadastrado para a empresa "${duplicate.name}".`,
        );
        return;
      }
    }

    const existing = data.companies.find((item) => item.id === editingId) as any;
    const shouldOpenStructure = createCompanyThenOpenStructure && !editingId;
    const saved = await data.upsertCompany({
      ...(existing || {}),
      id: editingId || undefined,
      ...companyForm,
      active: existing?.active ?? true,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    });
    const existingRoot = data.organizational_nodes.find((node) => node.companyId === saved.id && node.tipo === "empresa" && !node.parentId);
    const now = new Date().toISOString();

    await data.upsertOrganizationalNode({
      id: existingRoot?.id || `node-company-${saved.id}`,
      companyId: saved.id,
      nome: saved.name,
      tipo: "empresa",
      parentId: "",
      active: existingRoot?.active ?? true,
      createdAt: existingRoot?.createdAt || now,
      updatedAt: now,
    });

    setSelectedCompanyId(saved.id);
    closeForm();
    if (shouldOpenStructure) {
      setStructureView("tree");
      setActiveTab("structure");
    }
  }

  async function submitDepartment(event: FormEvent) {
    event.preventDefault();
    if (!activeStructureScope.companyId && !companyId) return;

    const existing = data.departments.find((item) => item.id === editingId) as any;
    await data.upsertDepartment({
      id: editingId || undefined,
      companyId: activeStructureScope.companyId || companyId,
      groupId: activeStructureScope.groupId,
      ...departmentForm,
      managerName: departmentForm.managerEmployeeId ? employeeName(departmentForm.managerEmployeeId) : departmentForm.managerName,
      active: existing?.active ?? true,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    });

    closeForm();
  }

  async function submitSector(event: FormEvent) {
    event.preventDefault();
    if ((!activeStructureScope.companyId && !companyId) || !sectorForm.departmentId) return;

    const existing = data.sectors.find((item) => item.id === editingId) as any;
    await data.upsertSector({
      id: editingId || undefined,
      companyId: activeStructureScope.companyId || companyId,
      groupId: activeStructureScope.groupId,
      ...sectorForm,
      coordinatorName: sectorForm.coordinatorEmployeeId ? employeeName(sectorForm.coordinatorEmployeeId) : sectorForm.coordinatorName,
      leaderName: sectorForm.leaderEmployeeId ? employeeName(sectorForm.leaderEmployeeId) : sectorForm.leaderName,
      active: existing?.active ?? true,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    });

    closeForm();
  }

  async function submitSubsector(event: FormEvent) {
    event.preventDefault();

    const sector = data.sectors.find((item) => item.id === subsectorForm.sectorId);
    if ((!activeStructureScope.companyId && !companyId) || !sector) return;

    const existing = data.subsectors.find((item) => item.id === editingId) as any;
    await data.upsertSubsector({
      id: editingId || undefined,
      companyId: activeStructureScope.companyId || companyId,
      groupId: activeStructureScope.groupId,
      departmentId: sector.departmentId,
      ...subsectorForm,
      leaderName: subsectorForm.leaderEmployeeId ? employeeName(subsectorForm.leaderEmployeeId) : subsectorForm.leaderName,
      active: existing?.active ?? true,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    });

    closeForm();
  }


  async function submitTeam(event: FormEvent) {
    event.preventDefault();
    if ((!activeStructureScope.companyId && !companyId) || !teamForm.name.trim()) return;

    const normalizedTeamName = normalizeStructureName(teamForm.name);
    const duplicateTeam = companyTeams.find((item) => (
      item.id !== editingId
      && normalizeStructureName(item.name) === normalizedTeamName
    ));
    if (duplicateTeam) {
      showConflict(
        "Equipe duplicada",
        `Já existe uma equipe chamada ${duplicateTeam.name} nesta empresa. Edite a equipe existente em vez de criar outra.`,
      );
      return;
    }

    const existing = data.teams.find((item) => item.id === editingId);
    await data.upsertTeam({
      id: editingId || undefined,
      companyId: activeStructureScope.companyId || companyId,
      groupId: activeStructureScope.groupId,
      name: teamForm.name.trim(),
      description: teamForm.description.trim(),
      active: existing?.active ?? true,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    closeForm();
  }

  async function submitContract(event: FormEvent) {
    event.preventDefault();
    if (!companyId) return;

    const existing = data.benefitContracts.find((item) => item.id === editingId) as any;
    await data.upsertBenefitContract({
      id: editingId || undefined,
      companyId,
      name: contractForm.name,
      providerName: contractForm.providerName,
      type: contractForm.type,
      websiteUrl: contractForm.websiteUrl,
      startDate: contractForm.startDate,
      endDate: contractForm.endDate,
      active: existing?.active ?? true,
      customFields: contractForm.fieldKey ? { [contractForm.fieldKey]: contractForm.fieldValue } : {},
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    });

    closeForm();
  }

  function nodeLabel(nodeId: string) {
    if (nodeId === rootParentValue) return selectedCompany?.name || "Empresa";
    const node = companyOrganizationNodes.find((item) => item.id === nodeId);
    return node ? `${node.nome} (${nodeTypeLabels[node.tipo]})` : "-";
  }

  function nodePath(nodeId: string) {
    if (nodeId === rootParentValue) return selectedCompany?.name || "Empresa";
    const chain: string[] = [];
    let current = companyOrganizationNodes.find((node) => node.id === nodeId);
    const guard = new Set<string>();

    while (current && !guard.has(current.id)) {
      guard.add(current.id);
      chain.unshift(current.nome);
      current = current.parentId ? companyOrganizationNodes.find((node) => node.id === current?.parentId) : undefined;
    }

    if (selectedCompany?.name) chain.unshift(selectedCompany.name);
    return chain.join(" / ") || "-";
  }

  function nodeChildren(parentId: string) {
    return companyOrganizationNodes.filter((node) => {
      if (parentId === rootParentValue) return node.tipo !== "empresa" && (!node.parentId || node.parentId === companyRootNode?.id);
      return node.parentId === parentId;
    });
  }

  function descendantNodeIds(nodeId: string) {
    const ids = new Set<string>([nodeId]);
    let changed = true;

    while (changed) {
      changed = false;
      companyOrganizationNodes.forEach((node) => {
        if (node.parentId && ids.has(node.parentId) && !ids.has(node.id)) {
          ids.add(node.id);
          changed = true;
        }
      });
    }

    return Array.from(ids);
  }

  function parentOptions() {
    const blockedIds = nodeForm.id ? descendantNodeIds(nodeForm.id) : [];
    return companyOrganizationNodes.filter((node) => node.tipo !== "empresa" && !blockedIds.includes(node.id));
  }

  async function ensureCompanyRootNode() {
    if (!selectedCompany) throw new Error("Selecione uma empresa.");
    if (companyRootNode) return companyRootNode;

    const now = new Date().toISOString();
    return data.upsertOrganizationalNode({
      id: `node-company-${selectedCompany.id}`,
      companyId: selectedCompany.id,
      nome: selectedCompany.name,
      tipo: "empresa",
      parentId: "",
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  function editNode(node: OrganizationalNode) {
    setStructureView("tree");
    setNodeForm({
      id: node.id,
      nome: node.nome,
      tipo: node.tipo,
      parentId: node.parentId || rootParentValue,
    });
  }

  function resetNodeForm() {
    setNodeForm(emptyNodeForm());
  }

  async function submitOrganizationNode(event: FormEvent) {
    event.preventDefault();
    if (!selectedCompany || !nodeForm.nome.trim()) return;

    try {
      const rootNode = await ensureCompanyRootNode();
      const parentId = nodeForm.parentId === rootParentValue ? rootNode.id : nodeForm.parentId;
      const existing = nodeForm.id ? companyOrganizationNodes.find((node) => node.id === nodeForm.id) : undefined;

      if (nodeForm.id && parentId === nodeForm.id) {
        alert("Um item nao pode ser pai dele mesmo.");
        return;
      }

      await data.upsertOrganizationalNode({
        id: nodeForm.id || undefined,
        companyId: selectedCompany.id,
        nome: nodeForm.nome.trim(),
        tipo: nodeForm.tipo,
        parentId,
        active: existing?.active ?? true,
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      resetNodeForm();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Nao foi possivel salvar a estrutura.");
    }
  }

  function deleteOrganizationNode(node: OrganizationalNode) {
    setDeleteRequest({
      title: "Excluir item da estrutura",
      impact: buildDomainDeletionImpact(data, "organizational_nodes", node.id, node.nome),
      onConfirm: async () => {
        const deleted = await data.deleteOrganizationalNode(node.id);
        if (deleted && nodeForm.id === node.id) resetNodeForm();
        return deleted;
      },
    });
  }

  function editAssignment(assignment: EmployeeAssignment) {
    setStructureView("assignments");
    setAssignmentForm({
      id: assignment.id,
      employeeId: assignment.employeeId,
      nodeId: assignment.nodeId,
      role: assignment.role,
    });
  }

  function resetAssignmentForm() {
    setAssignmentForm(emptyAssignmentForm());
  }

  async function submitEmployeeAssignment(event: FormEvent) {
    event.preventDefault();
    if (!selectedCompany || !assignmentForm.employeeId) return;

    try {
      const rootNode = await ensureCompanyRootNode();
      const nodeId = assignmentForm.nodeId === rootParentValue ? rootNode.id : assignmentForm.nodeId;

      await data.upsertEmployeeAssignment({
        id: assignmentForm.id || undefined,
        companyId: selectedCompany.id,
        employeeId: assignmentForm.employeeId,
        nodeId,
        role: assignmentForm.role,
        createdAt: data.employee_assignments.find((item) => item.id === assignmentForm.id)?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      resetAssignmentForm();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Nao foi possivel salvar o vinculo.");
    }
  }

  function deleteAssignment(assignment: EmployeeAssignment) {
    setDeleteRequest({
      title: "Excluir vínculo",
      impact: buildDomainDeletionImpact(data, "employee_assignments", assignment.id, "Vínculo selecionado"),
      onConfirm: async () => {
        const deleted = await data.deleteEmployeeAssignment(assignment.id);
        if (deleted && assignmentForm.id === assignment.id) resetAssignmentForm();
        return deleted;
      },
    });
  }

  function openCompanyManager() {
    closeForm();
    const nextCompanyId = selectedCompanyId || data.companies[0]?.id || "";
    setManagerCompanyId(nextCompanyId);
    setManagerGroupId(companyGroupForCompany(nextCompanyId)?.id || companyGroups[0]?.id || "");
    setCompanyManagerOpen(true);
  }

  function startCreateCompanyStructure() {
    setCompanyManagerOpen(false);
    setActiveTab("companies");
    openCreate("company");
    setCreateCompanyThenOpenStructure(true);
  }

  function startChangeCompanyStructure() {
    const targetCompanyId = managerCompanyId || selectedCompanyId;
    if (!targetCompanyId) {
      alert("Selecione uma empresa para alterar a estrutura.");
      return;
    }

    setSelectedCompanyId(targetCompanyId);
    setCompanyManagerOpen(false);
    setStructureView("tree");
    setActiveTab("structure");
    resetNodeForm();
    resetAssignmentForm();
  }

  function startChangeGroupStructure() {
    const targetGroupId = managerGroupId
      || companyGroupForCompany(managerCompanyId || selectedCompanyId)?.id
      || companyGroups[0]?.id
      || "";

    if (!targetGroupId) {
      alert("Selecione um grupo para alterar a estrutura.");
      return;
    }

    const group = companyGroups.find((item) => item.id === targetGroupId);
    if (!group) {
      alert("Grupo não encontrado.");
      return;
    }

    setCompanyManagerOpen(false);
    setGroupDetailTab("structure");
    setGroupStructureView("tree");
    setGroupDetailId(group.id);
  }

  function openVirtualGroupCompany() {
    const targetGroupId = managerGroupId
      || companyGroupForCompany(managerCompanyId || selectedCompanyId)?.id
      || companyGroups[0]?.id
      || "";

    if (!targetGroupId) {
      alert("Selecione um grupo para visualizar a empresa virtual.");
      return;
    }

    setCompanyManagerOpen(false);
    setGroupDetailTab("employees");
    setGroupDetailId(targetGroupId);
  }


  async function exportCompanyStructure() {
    const targetCompanyId = managerCompanyId || selectedCompanyId;
    if (!targetCompanyId) {
      alert("Selecione uma empresa para exportar a estrutura.");
      return;
    }

    const company = data.companies.find((item) => item.id === targetCompanyId);
    if (!company) {
      alert("Empresa não encontrada.");
      return;
    }

    const departments = departmentsForStructureCompany(company.id);
    const sectors = sectorsForStructureCompany(company.id);
    const subsectors = subsectorsForStructureCompany(company.id);
    const rows: Array<Record<string, string>> = [];

    departments.forEach((department) => {
      const departmentSectors = sectors.filter((sector) => sector.departmentId === department.id);
      if (departmentSectors.length === 0) {
        rows.push({ Empresa: company.name, Departamento: department.name, Setor: "", Subsetor: "" });
        return;
      }

      departmentSectors.forEach((sector) => {
        const sectorSubsectors = subsectors.filter((subsector) => subsector.sectorId === sector.id);
        if (sectorSubsectors.length === 0) {
          rows.push({ Empresa: company.name, Departamento: department.name, Setor: sector.name, Subsetor: "" });
          return;
        }

        sectorSubsectors.forEach((subsector) => {
          rows.push({ Empresa: company.name, Departamento: department.name, Setor: sector.name, Subsetor: subsector.name });
        });
      });
    });

    if (rows.length === 0) {
      rows.push({ Empresa: company.name, Departamento: "", Setor: "", Subsetor: "" });
    }

    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows, { header: ["Empresa", "Departamento", "Setor", "Subsetor"] });
    XLSX.utils.book_append_sheet(workbook, worksheet, "Estrutura");
    XLSX.writeFile(workbook, `${company.name.replace(/[^a-z0-9]/gi, "_").slice(0, 120)}_estrutura.xlsx`);
  }

  function openStructureWizard(companyId = "") {
  closeForm();
  setWizardStep(0);
  setWizardCompanyId(companyId || selectedCompanyId || "");
  setWizardCompanyForm({ name: "", legalName: "", document: "", location: "" });
  setWizardDepartments([emptyWizardDepartment()]);
  setWizardSectors([emptyWizardSector()]);
  setWizardTeams([emptyWizardTeam()]);
  setWizardLeaderships([]);
  setIsWizardOpen(true);
}

async function applyImportedRows(rows: Record<string, string>[]) {
  if (!rows || !rows.length) return;
  setImporting(true);
  let created = 0;
  let skipped = 0;

  const getValue = (row: Record<string, string>, keys: string[]) => {
    const normalized = Object.keys(row).reduce<Record<string, string>>((acc, key) => {
      acc[key.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")] = row[key];
      return acc;
    }, {});

    for (const key of keys) {
      const value = normalized[key.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")];
      if (value) return value.trim();
    }

    return "";
  };

  try {
    const map = previewMapping;
    const report: Array<{ index: number; row: Record<string, string>; status: string; message?: string }> = [];
    const companyCache = new Map(data.companies.map((company) => [company.name.trim().toLowerCase(), company]));
    const departmentCache = new Map(data.departments.map((department) => [`${department.groupId || department.companyId}::${department.name.trim().toLowerCase()}`, department]));
    const sectorCache = new Map(data.sectors.map((sector) => [`${sector.departmentId}::${sector.name.trim().toLowerCase()}`, sector]));
    const subsectorCache = new Map(data.subsectors.map((subsector) => [`${subsector.sectorId}::${subsector.name.trim().toLowerCase()}`, subsector]));

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      try {
        const companyName = getValue(row, ["Empresa", "Company"]);
        const departmentName = ((map.department ? row[map.department] : "") || getValue(row, ["Departamento", "Department"])).trim();
        const sectorName = ((map.sector ? row[map.sector] : "") || getValue(row, ["Setor", "Sector"])).trim();
        const subsectorName = ((map.subsector ? row[map.subsector] : "") || getValue(row, ["Subsetor", "Subsector", "Sub-setor"])).trim();

        if (!departmentName && !sectorName && !subsectorName) {
          skipped += 1;
          report.push({ index: i + 1, row, status: "skipped", message: "Linha ignorada: sem departamento, setor ou subsetor" });
          continue;
        }

        const actions: string[] = [];
        let targetCompany = wizardCompanyId ? data.companies.find((company) => company.id === wizardCompanyId) : undefined;

        if (!targetCompany && companyName) {
          const key = companyName.toLowerCase();
          targetCompany = companyCache.get(key);
          if (!targetCompany) {
            targetCompany = await data.upsertCompany({
              name: companyName,
              legalName: companyName,
              document: "",
              location: "",
              active: true,
              createdAt: new Date().toISOString(),
            });
            companyCache.set(key, targetCompany);
            created += 1;
            actions.push(`Empresa criada: ${companyName}`);
          }
        }

        if (!targetCompany) {
          skipped += 1;
          report.push({ index: i + 1, row, status: "skipped", message: "Selecione uma empresa ou informe a coluna EMPRESA no arquivo" });
          continue;
        }

        const targetStructureGroup = structureGroupForCompany(targetCompany.id);
        const targetStructureScope = structureScopePayload(targetStructureGroup, data.companyGroupCompanies, data.companies);
        const targetStructureCompanyId = targetStructureScope.companyId || targetCompany.id;

        let department: Department | undefined;
        if (departmentName) {
          const depKey = `${targetStructureScope.groupId || targetStructureCompanyId}::${departmentName.toLowerCase()}`;
          department = departmentCache.get(depKey)
            || structureItemsForGroup(data.departments, targetStructureGroup, data.companyGroupCompanies, data.companies)
              .find((item) => item.name.trim().toLowerCase() === departmentName.toLowerCase());
          if (department) {
            actions.push(`Departamento existente: ${departmentName}`);
          } else {
            department = await data.upsertDepartment({
              companyId: targetStructureCompanyId,
              groupId: targetStructureScope.groupId,
              name: departmentName,
              managerName: "",
              description: "",
              active: true,
              createdAt: new Date().toISOString(),
            });
            departmentCache.set(depKey, department);
            created += 1;
            actions.push(`Departamento criado: ${departmentName}`);
          }
        }

        let sector: Sector | undefined;
        if (sectorName) {
          if (!department) {
            skipped += 1;
            report.push({ index: i + 1, row, status: "skipped", message: `Setor "${sectorName}" ignorado: informe o departamento` });
            continue;
          }

          const sectorKey = `${department.id}::${sectorName.toLowerCase()}`;
          sector = sectorCache.get(sectorKey);
          if (sector) {
            actions.push(`Setor existente: ${sectorName}`);
          } else {
            sector = await data.upsertSector({
              companyId: targetStructureCompanyId,
              groupId: targetStructureScope.groupId,
              departmentId: department.id,
              name: sectorName,
              leaderName: "",
              costCenter: "",
              active: true,
              createdAt: new Date().toISOString(),
            } as any);
            sectorCache.set(sectorKey, sector);
            created += 1;
            actions.push(`Setor criado: ${sectorName}`);
          }
        }

        if (subsectorName) {
          if (!sector || !department) {
            skipped += 1;
            report.push({ index: i + 1, row, status: "skipped", message: `Subsetor "${subsectorName}" ignorado: informe o setor e o departamento` });
            continue;
          }

          const subsectorKey = `${sector.id}::${subsectorName.toLowerCase()}`;
          const subsector = subsectorCache.get(subsectorKey);
          if (subsector) {
            actions.push(`Subsetor existente: ${subsectorName}`);
          } else {
            const saved = await data.upsertSubsector({
              companyId: targetStructureCompanyId,
              groupId: targetStructureScope.groupId,
              departmentId: department.id,
              sectorId: sector.id,
              name: subsectorName,
              leaderName: "",
              active: true,
              createdAt: new Date().toISOString(),
            } as any);
            subsectorCache.set(subsectorKey, saved);
            created += 1;
            actions.push(`Subsetor criado: ${subsectorName}`);
          }
        }

        const hasCreated = actions.some((a) => a.includes("criad"));
        report.push({ index: i + 1, row, status: hasCreated ? "created" : actions.length ? "exists" : "skipped", message: actions.join("; ") });
        if (!wizardCompanyId && targetCompany) setWizardCompanyId(targetCompany.id);
      } catch (err: any) {
        skipped += 1;
        report.push({ index: i + 1, row, status: "error", message: String(err?.message || err) });
      }
    }
    setImportReport(report);
    setWizardDepartments([emptyWizardDepartment()]);
    setWizardSectors([emptyWizardSector()]);
    if (wizardCompanyId) setSelectedCompanyId(wizardCompanyId);
    setActiveTab("structure");
    closeStructureWizard();
  } catch (err) {
    console.error(err);
    alert("Erro ao importar a estrutura. Verifique se o arquivo segue o modelo exibido na tela.");
  } finally {
    setImportSummary({ created: created ?? 0, skipped: skipped ?? 0 });
    setImporting(false);
    setPreviewRows([]);
    setPreviewFileName("");
  }
}

async function handleImportExcel(file?: File) {
  if (!file) return;
  try {
    const rows = await parseExcelFile(file);
    setPreviewRows(rows);
    setPreviewFileName(file.name);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    alert("Erro ao ler o arquivo. Verifique o formato.");
  }
}

function closeStructureWizard() {
  setIsWizardOpen(false);
  setWizardStep(0);
  setWizardCompanyId("");
  setWizardDepartments([emptyWizardDepartment()]);
  setWizardSectors([emptyWizardSector()]);
  setWizardTeams([emptyWizardTeam()]);
  setWizardLeaderships([]);
}

function addWizardDepartment() {
  setWizardDepartments((current) => [...current, emptyWizardDepartment()]);
}

function updateWizardDepartment(id: string, field: keyof WizardDepartmentDraft, value: string) {
  setWizardDepartments((current) =>
    current.map((department) => (department.id === id ? { ...department, [field]: value } : department)),
  );
}

function removeWizardDepartment(id: string) {
  setWizardDepartments((current) => {
    if (current.length === 1) return current;
    return current.filter((department) => department.id !== id);
  });
  setWizardSectors((current) => current.map((sector) => (
    sector.departmentId === id ? { ...sector, departmentId: "" } : sector
  )));
}

function addWizardSector() {
  setWizardSectors((current) => [...current, emptyWizardSector()]);
}

function updateWizardSector(id: string, field: keyof WizardSectorDraft, value: string) {
  setWizardSectors((current) =>
    current.map((sector) => (sector.id === id ? { ...sector, [field]: value } : sector)),
  );
}

function removeWizardSector(id: string) {
  setWizardSectors((current) => {
    if (current.length === 1) return current;
    return current.filter((sector) => sector.id !== id);
  });
}

function addWizardSubsector(sectorId: string) {
  setWizardSectors((current) =>
    current.map((sector) =>
      sector.id === sectorId
        ? {
            ...sector,
            subsectors: [
              ...sector.subsectors,
              {
                id: crypto.randomUUID(),
                existingSubsectorId: "",
                name: "",
                leaderName: "",
                leaderEmployeeId: "",
              },
            ],
          }
        : sector,
    ),
  );
}

function updateWizardSubsector(
  sectorId: string,
  subsectorId: string,
  field: keyof WizardSubsectorDraft,
  value: string,
) {
  setWizardSectors((current) =>
    current.map((sector) =>
      sector.id === sectorId
        ? {
            ...sector,
            subsectors: sector.subsectors.map((subsector) =>
              subsector.id === subsectorId ? { ...subsector, [field]: value } : subsector,
            ),
          }
        : sector,
    ),
  );
}

function removeWizardSubsector(sectorId: string, subsectorId: string) {
  setWizardSectors((current) =>
    current.map((sector) =>
      sector.id === sectorId
        ? {
            ...sector,
            subsectors: sector.subsectors.filter((subsector) => subsector.id !== subsectorId),
          }
        : sector,
    ),
  );
}

function addWizardTeam() {
  setWizardTeams((current) => [...current, emptyWizardTeam()]);
}

function updateWizardTeam(id: string, field: keyof WizardTeamDraft, value: string) {
  setWizardTeams((current) => current.map((team) => (team.id === id ? { ...team, [field]: value } : team)));
}

function removeWizardTeam(id: string) {
  setWizardTeams((current) => current.length > 1 ? current.filter((team) => team.id !== id) : current);
}

function addWizardLeadership() {
  setWizardLeaderships((current) => [
    ...current,
    {
      id: crypto.randomUUID(),
      employeeId: "",
      role: "Líder",
      targetType: "department",
      targetId: "",
    },
  ]);
}

function updateWizardLeadership(id: string, field: keyof WizardLeadershipDraft, value: string) {
  setWizardLeaderships((current) =>
    current.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
  );
}

function removeWizardLeadership(id: string) {
  setWizardLeaderships((current) => current.filter((item) => item.id !== id));
}

function canAdvanceWizard() {
  if (wizardStep === 0) return Boolean(wizardCompanyId || wizardCompanyForm.name.trim());

  if (wizardStep === 1) {
    return wizardDepartments.some((department) => department.existingDepartmentId || department.name.trim());
  }

  if (wizardStep === 2) {
    return wizardSectors.some((sector) => (sector.existingSectorId || sector.name.trim()) && sector.departmentId);
  }

  return true;
}

function resolveWizardDepartmentLabel(value: string) {
  if (!value) return "";
  if (value.startsWith("new:")) {
    const draft = wizardDepartments.find((department) => department.id === value.slice(4));
    return draft?.name ? `Novo: ${draft.name}` : "Novo departamento";
  }
  return data.departments.find((department) => department.id === value)?.name || "Departamento existente";
}

function resolveWizardSectorLabel(value: string) {
  if (!value) return "";
  if (value.startsWith("new:")) {
    const draft = wizardSectors.find((sector) => sector.id === value.slice(4));
    return draft?.name ? `Novo: ${draft.name}` : "Novo setor";
  }
  return data.sectors.find((sector) => sector.id === value)?.name || "Setor existente";
}

function getWizardDepartmentSelectOptions() {
  const existing = departmentsForStructureCompany(wizardCompanyId || selectedCompanyId)
    .map((department) => ({ value: department.id, label: department.name }));
  const drafts = wizardDepartments
    .filter((department) => !department.existingDepartmentId && department.name.trim())
    .map((department) => ({ value: `new:${department.id}`, label: `Novo: ${department.name.trim()}` }));
  return [...existing, ...drafts];
}

function getWizardSectorSelectOptions() {
  const existing = sectorsForStructureCompany(wizardCompanyId || selectedCompanyId)
    .map((sector) => ({ value: sector.id, label: sector.name }));
  const drafts = wizardSectors
    .filter((sector) => !sector.existingSectorId && sector.name.trim())
    .map((sector) => ({ value: `new:${sector.id}`, label: `Novo: ${sector.name.trim()}` }));
  return [...existing, ...drafts];
}

async function finishStructureWizard() {
  let targetCompanyId = wizardCompanyId;
  const now = new Date().toISOString();
  if (!targetCompanyId && wizardCompanyForm.name.trim()) {
    const savedCompany = await data.upsertCompany({
      name: wizardCompanyForm.name.trim(),
      legalName: wizardCompanyForm.legalName.trim() || wizardCompanyForm.name.trim(),
      document: wizardCompanyForm.document.trim(),
      location: wizardCompanyForm.location.trim(),
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    targetCompanyId = savedCompany.id;
    setWizardCompanyId(savedCompany.id);
  }
  if (!targetCompanyId) return;
  const wizardStructureGroup = resolveCompanyGroupForCompany(targetCompanyId, data.companyGroups, data.companyGroupCompanies)
    || primaryStructureGroup;
  const wizardStructureScope = structureScopePayload(wizardStructureGroup, data.companyGroupCompanies, data.companies);
  const wizardStructureCompanyId = wizardStructureScope.companyId || targetCompanyId;
  const savedDepartmentMap = new Map<string, Department>();
  const savedSectorMap = new Map<string, Sector>();
  const savedSubsectorMap = new Map<string, Subsector>();
  const savedTeamMap = new Map<string, Team>();

  for (const department of wizardDepartments.filter((item) => item.existingDepartmentId || item.name.trim())) {
    if (department.existingDepartmentId) {
      const existing = data.departments.find((item) => item.id === department.existingDepartmentId);
      if (existing) savedDepartmentMap.set(department.id, existing);
      continue;
    }

    const existing = structureItemsForGroup(data.departments, wizardStructureGroup, data.companyGroupCompanies, data.companies)
      .find((item) => item.name.trim().toLowerCase() === department.name.trim().toLowerCase());
    const saved = existing || await data.upsertDepartment({
      companyId: wizardStructureCompanyId,
      groupId: wizardStructureScope.groupId,
      name: department.name.trim(),
      managerName: department.managerEmployeeId ? employeeName(department.managerEmployeeId) : department.managerName.trim(),
      managerEmployeeId: department.managerEmployeeId,
      description: department.description.trim(),
      active: true,
      createdAt: now,
    });
    savedDepartmentMap.set(department.id, saved);
  }

  for (const sector of wizardSectors.filter((item) => (item.existingSectorId || item.name.trim()) && item.departmentId)) {
    const departmentId = sector.departmentId.startsWith("new:")
      ? savedDepartmentMap.get(sector.departmentId.slice(4))?.id || ""
      : sector.departmentId;
    if (!departmentId) continue;

    if (sector.existingSectorId) {
      const existing = data.sectors.find((item) => item.id === sector.existingSectorId);
      if (existing) savedSectorMap.set(sector.id, existing);
    } else {
      const existing = structureItemsForGroup(data.sectors, wizardStructureGroup, data.companyGroupCompanies, data.companies).find(
        (item) => item.departmentId === departmentId
          && item.name.trim().toLowerCase() === sector.name.trim().toLowerCase(),
      );
      const saved = existing || await data.upsertSector({
        companyId: wizardStructureCompanyId,
        groupId: wizardStructureScope.groupId,
        departmentId,
        name: sector.name.trim(),
        coordinatorName: sector.coordinatorEmployeeId ? employeeName(sector.coordinatorEmployeeId) : sector.coordinatorName.trim(),
        coordinatorEmployeeId: sector.coordinatorEmployeeId,
        leaderName: sector.leaderEmployeeId ? employeeName(sector.leaderEmployeeId) : sector.leaderName.trim(),
        leaderEmployeeId: sector.leaderEmployeeId,
        costCenter: sector.costCenter.trim(),
        active: true,
        createdAt: now,
      } as any);
      savedSectorMap.set(sector.id, saved);
    }

    const savedSector = savedSectorMap.get(sector.id);
    if (!savedSector) continue;

    for (const subsector of sector.subsectors.filter((item) => item.existingSubsectorId || item.name.trim())) {
      if (subsector.existingSubsectorId) {
        const existing = data.subsectors.find((item) => item.id === subsector.existingSubsectorId);
        if (existing) savedSubsectorMap.set(subsector.id, existing);
        continue;
      }

      const existing = structureItemsForGroup(data.subsectors, wizardStructureGroup, data.companyGroupCompanies, data.companies).find(
        (item) => item.sectorId === savedSector.id
          && item.name.trim().toLowerCase() === subsector.name.trim().toLowerCase(),
      );
      const saved = existing || await data.upsertSubsector({
        companyId: wizardStructureCompanyId,
        groupId: wizardStructureScope.groupId,
        departmentId: savedSector.departmentId,
        sectorId: savedSector.id,
        name: subsector.name.trim(),
        leaderName: subsector.leaderEmployeeId ? employeeName(subsector.leaderEmployeeId) : subsector.leaderName.trim(),
        leaderEmployeeId: subsector.leaderEmployeeId,
        active: true,
        createdAt: now,
      } as any);
      savedSubsectorMap.set(subsector.id, saved);
    }
  }

  for (const team of wizardTeams.filter((item) => item.existingTeamId || item.name.trim())) {
    if (team.existingTeamId) {
      const existing = data.teams.find((item) => item.id === team.existingTeamId);
      if (existing) savedTeamMap.set(team.id, existing);
      continue;
    }

    const existing = structureItemsForGroup(data.teams, wizardStructureGroup, data.companyGroupCompanies, data.companies)
      .find((item) => item.name.trim().toLowerCase() === team.name.trim().toLowerCase());
    const saved = existing || await data.upsertTeam({
      companyId: wizardStructureCompanyId,
      groupId: wizardStructureScope.groupId,
      name: team.name.trim(),
      description: team.description.trim(),
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    savedTeamMap.set(team.id, saved);
  }

  for (const leadership of wizardLeaderships.filter((item) => item.employeeId && item.targetId && item.role.trim())) {
    const target = leadership.targetType === "department"
      ? data.departments.find((item) => item.id === leadership.targetId) || savedDepartmentMap.get(leadership.targetId.replace(/^new:/, ""))
      : leadership.targetType === "sector"
        ? data.sectors.find((item) => item.id === leadership.targetId) || savedSectorMap.get(leadership.targetId.replace(/^new:/, ""))
        : data.subsectors.find((item) => item.id === leadership.targetId) || savedSubsectorMap.get(leadership.targetId.replace(/^new:/, ""));

    if (!target) continue;

    const employee = data.employees.find((item) => item.id === leadership.employeeId);
    const leadershipAssignments = Array.isArray((target as any).leadershipAssignments)
      ? (target as any).leadershipAssignments.filter((assignment: any) => assignment.employeeId !== leadership.employeeId || assignment.role !== leadership.role)
      : [];

    const nextTarget = {
      ...target,
      leadershipAssignments: [
        ...leadershipAssignments,
        {
          employeeId: leadership.employeeId,
          employeeName: employee?.name ?? "",
          role: leadership.role.trim(),
        },
      ],
    };

    if (leadership.targetType === "department") {
      await (data.upsertDepartment as any)(nextTarget);
    } else if (leadership.targetType === "sector") {
      await (data.upsertSector as any)(nextTarget);
    } else {
      await (data.upsertSubsector as any)(nextTarget);
    }
  }

  setSelectedCompanyId(targetCompanyId);
  setActiveTab("structure");
  closeStructureWizard();
}

function openCompanyStructure(companyIdToOpen: string) {
  setStructureCompanyId(companyIdToOpen);
}

function closeCompanyStructure() {
  setStructureCompanyId("");
}

function clearDatabaseFromScreen() {
  if (!canUseTiTools) {
    alert("Somente usuários do Setor TI podem limpar o banco.");
    return;
  }

  const totalRecords = [
    data.companies.length,
    data.departments.length,
    data.sectors.length,
    data.subsectors.length,
    data.teams.length,
    data.employees.length,
    data.employeeDocuments.length,
    data.documentAlerts.length,
    data.timeRecords.length,
    data.benefitContracts.length,
    data.employeeBenefits.length,
    data.customModules.length,
  ].reduce((total, count) => total + count, 0);

  setDeleteRequest({
    title: "Limpar banco de dados",
    confirmLabel: "Apagar todos os dados",
    impact: {
      entityType: "dados do sistema",
      entityLabel: "Limpeza completa do banco",
      reasons: [
        "Esta ação remove praticamente todos os cadastros operacionais do sistema.",
        "A recuperação dependerá de backup ou da opção de desfazer enquanto ela estiver disponível.",
      ],
      links: [
        { label: "Empresas", count: data.companies.length },
        { label: "Funcionários", count: data.employees.length },
        { label: "Documentos", count: data.employeeDocuments.length },
        { label: "Registros de ponto", count: data.timeRecords.length },
        { label: "Benefícios e vínculos", count: data.benefitContracts.length + data.employeeBenefits.length },
        { label: "Demais registros carregados", count: Math.max(0, totalRecords - data.companies.length - data.employees.length - data.employeeDocuments.length - data.timeRecords.length - data.benefitContracts.length - data.employeeBenefits.length) },
      ],
      consequences: [
        "Empresas, estruturas, funcionários, documentos, benefícios e históricos serão removidos.",
        "Os administradores protegidos e as chaves administrativas serão preservados.",
        "O usuário atual será desconectado depois da limpeza.",
      ],
      note: "Use esta opção somente para reinicialização controlada do ambiente.",
    },
    onConfirm: async () => {
      const cleared = await data.clearDomainData();
      if (!cleared) return false;

      setSelectedCompanyId("");
      setActiveTab("companies");
      closeForm();
      window.localStorage.removeItem("macro-dp:user");
      alert("Banco limpo. Os administradores cadastrados no banco foram preservados para acesso administrativo.");
      return true;
    },
  });
}

  async function submitModule(event: FormEvent) {
    event.preventDefault();
    if (!companyId) return;

    const existing = data.customModules.find((item) => item.id === editingId) as any;
    await data.upsertCustomModule({
      id: editingId || undefined,
      companyId,
      name: moduleForm.name,
      description: moduleForm.description,
      targetScreen: moduleForm.targetScreen,
      columns: moduleForm.columns
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      active: existing?.active ?? true,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    });

    closeForm();
  }

    const ActionButtons = ({ onEdit, onToggle, onDelete, onStructure, active = true }: any) => (
      <div className="table-actions">
        {onStructure && (
        <button className="btn btn-secondary" type="button" onClick={onStructure}
          title="Ver estrutura" aria-label="Ver estrutura"
        >
          <Building2 size={14} />
        </button>
        )}


        <button className="btn btn-secondary" type="button" onClick={onEdit}>
          <Edit2 size={14} />
        </button>

        <button className="btn btn-secondary" type="button" onClick={onToggle}>
          <Power size={14} /> {active === false ? "Ativar" : ""}
        </button>

        <button className="btn btn-secondary" type="button" onClick={onDelete}>
          <Trash2 size={14} />
        </button>
      </div>
    );

  function renderOrganizationNode(node: OrganizationalNode, level = 0) {
    const assignments = companyAssignments.filter((assignment) => assignment.nodeId === node.id);
    const children = nodeChildren(node.id);

    return (
      <div className="org-tree-node" key={node.id} style={{ marginLeft: level ? 18 : 0 }}>
        <div className="org-tree-row">
          <span className={`org-node-type is-${node.tipo}`}>{nodeTypeLabels[node.tipo]}</span>
          <strong>{node.nome}</strong>
          {assignments.length ? <small>{assignments.length} vinculo(s)</small> : null}
          <div className="org-node-actions">
            {node.tipo !== "empresa" ? (
              <>
                <button className="table-action" type="button" onClick={() => editNode(node)}>Editar</button>
                <button className="table-action danger-text" type="button" onClick={() => void deleteOrganizationNode(node)}>Excluir</button>
              </>
            ) : null}
          </div>
        </div>
        {assignments.length ? (
          <div className="org-node-assignments">
            {assignments.map((assignment) => {
              const employee = data.employees.find((item) => item.id === assignment.employeeId);
              const role = assignmentRoles.find((item) => item.value === assignment.role)?.label || assignment.role;
              return <span key={assignment.id}>{employee?.name || "Funcionario"} - {role}</span>;
            })}
          </div>
        ) : null}
        {children.map((child) => renderOrganizationNode(child, level + 1))}
      </div>
    );
  }

  const EmptyRow = ({ colSpan, text }: { colSpan: number; text: string }) => (
    <tr>
      <td colSpan={colSpan}>{text}</td>
    </tr>
  );

  function groupSourceOptions(type: GroupUnitType, companyId: string) {
    if (type === "department") return departmentsForStructureCompany(companyId);
    if (type === "sector") return sectorsForStructureCompany(companyId);
    if (type === "subsector") return subsectorsForStructureCompany(companyId);
    return teamsForStructureCompany(companyId);
  }

  function groupSourceName(type: GroupUnitType, sourceId: string) {
    const collection = type === "department"
      ? data.departments
      : type === "sector"
        ? data.sectors
        : type === "subsector"
          ? data.subsectors
          : data.teams;
    return collection.find((item) => item.id === sourceId)?.name || "Estrutura removida";
  }

  function groupSourcePath(type: GroupUnitType, sourceId: string) {
    if (type === "department") return groupSourceName(type, sourceId);
    if (type === "team") return `Equipes / ${groupSourceName(type, sourceId)}`;
    if (type === "sector") {
      const sector = data.sectors.find((item) => item.id === sourceId);
      const department = data.departments.find((item) => item.id === sector?.departmentId);
      return [department?.name, sector?.name].filter(Boolean).join(" / ") || "Estrutura removida";
    }
    const subsector = data.subsectors.find((item) => item.id === sourceId);
    const sector = data.sectors.find((item) => item.id === subsector?.sectorId);
    const department = data.departments.find((item) => item.id === subsector?.departmentId || item.id === sector?.departmentId);
    return [department?.name, sector?.name, subsector?.name].filter(Boolean).join(" / ") || "Estrutura removida";
  }

  function companyStructureNames(companyIdValue: string, type: GroupUnitType) {
    return new Set<string>(
      groupSourceOptions(type, companyIdValue)
        .map((item) => normalizeStructureName(item.name || ""))
        .filter(Boolean),
    );
  }

  function pairSimilarity(firstCompanyId: string, secondCompanyId: string): GroupSimilarity {
    const types: GroupUnitType[] = ["department", "sector", "subsector", "team"];
    const scores = types.map((type) => jaccardSimilarity(
      companyStructureNames(firstCompanyId, type),
      companyStructureNames(secondCompanyId, type),
    ));
    const comparable = scores.filter((score): score is number => score !== null);
    return {
      overall: comparable.length ? Math.round(comparable.reduce((total, score) => total + score, 0) / comparable.length) : 0,
      department: scores[0] ?? 0,
      sector: scores[1] ?? 0,
      subsector: scores[2] ?? 0,
      team: scores[3] ?? 0,
    };
  }

  function groupSimilarity(companyIds: string[]): GroupSimilarity {
    const pairs: GroupSimilarity[] = [];
    for (let first = 0; first < companyIds.length; first += 1) {
      for (let second = first + 1; second < companyIds.length; second += 1) {
        pairs.push(pairSimilarity(companyIds[first], companyIds[second]));
      }
    }
    if (!pairs.length) return { overall: 0, department: 0, sector: 0, subsector: 0, team: 0 };
    const average = (key: keyof GroupSimilarity) => Math.round(
      pairs.reduce((total, score) => total + score[key], 0) / pairs.length,
    );
    return {
      overall: average("overall"),
      department: average("department"),
      sector: average("sector"),
      subsector: average("subsector"),
      team: average("team"),
    };
  }

  function openGroupWizard(group?: CompanyGroup, initialStep: GroupWizardStep = 1) {
    setGroupWizardDraft(group
      ? {
          ...group,
          companyIds: [...group.companyIds],
          units: group.units.map((unit) => ({ ...unit, links: unit.links.map((link) => ({ ...link })) })),
          autoSyncStructure: group.autoSyncStructure,
          divergenceMode: group.divergenceMode === "copy_from_source" ? "use_reference" : (group.divergenceMode || "keep_existing"),
          divergenceSourceCompanyId: group.divergenceSourceCompanyId || "",
          divergenceTypes: [...(group.divergenceTypes || [])],
          employeeAssignments: (group.employeeAssignments || []).map((assignment) => ({ ...assignment })),
          leadershipAssignments: (group.leadershipAssignments || []).map((assignment) => ({ ...assignment })),
          createdAt: group.createdAt,
          updatedAt: group.updatedAt,
        }
      : {
          id: "",
          name: "",
          companyIds: [],
          units: [],
          active: true,
          divergenceMode: "keep_existing",
          divergenceSourceCompanyId: "",
          divergenceTypes: [],
          employeeAssignments: [],
          leadershipAssignments: [],
        });
    setGroupWizardStep(initialStep);
    setGroupStructureFilter("all");
    setGroupWizardOpen(true);
  }

  function closeGroupWizard() {
    setGroupWizardOpen(false);
    setGroupWizardStep(1);
    setGroupStructureFilter("all");
    setGroupWizardDraft({
      id: "",
      name: "",
      companyIds: [],
      units: [],
      active: true,
      divergenceMode: "keep_existing",
      divergenceSourceCompanyId: "",
      divergenceTypes: [],
      employeeAssignments: [],
      leadershipAssignments: [],
    });
  }

  function toggleGroupCompany(companyIdValue: string) {
    setGroupWizardDraft((current) => {
      const selected = current.companyIds.includes(companyIdValue);
      const companyIds = selected
        ? current.companyIds.filter((id) => id !== companyIdValue)
        : [...current.companyIds, companyIdValue];
      return {
        ...current,
        companyIds,
        units: current.units.map((unit) => ({
          ...unit,
          links: unit.links.filter((link) => companyIds.includes(link.companyId)),
        })),
        divergenceSourceCompanyId: companyIds.includes(current.divergenceSourceCompanyId || "")
          ? current.divergenceSourceCompanyId
          : "",
        employeeAssignments: (current.employeeAssignments || []).filter((assignment) => {
          const employee = data.employees.find((item) => item.id === assignment.employeeId);
          return employee ? companyIds.includes(employee.companyId) : false;
        }),
        leadershipAssignments: (current.leadershipAssignments || []).filter((assignment) => {
          const employee = data.employees.find((item) => item.id === assignment.employeeId);
          return employee ? companyIds.includes(employee.companyId) : false;
        }),
      };
    });
  }

  function toggleSuggestedGroupUnit(suggestion: CompanyGroupUnit) {
    setGroupWizardDraft((current) => {
      const exists = current.units.some((unit) => unit.id === suggestion.id);
      return {
        ...current,
        units: exists
          ? current.units.filter((unit) => unit.id !== suggestion.id)
          : [...current.units, { ...suggestion, links: suggestion.links.map((link) => ({ ...link })) }],
      };
    });
  }

  function toggleAllSuggestedGroupUnits() {
    setGroupWizardDraft((current) => {
      const filteredIds = new Set(filteredSuggestedGroupUnits.map((unit) => unit.id));
      const allSelected = filteredSuggestedGroupUnits.length > 0
        && filteredSuggestedGroupUnits.every((unit) => current.units.some((selected) => selected.id === unit.id));
      if (allSelected) {
        return { ...current, units: current.units.filter((unit) => !filteredIds.has(unit.id)) };
      }
      const existingIds = new Set(current.units.map((unit) => unit.id));
      const additions = filteredSuggestedGroupUnits
        .filter((unit) => !existingIds.has(unit.id))
        .map((unit) => ({ ...unit, links: unit.links.map((link) => ({ ...link })) }));
      return { ...current, units: [...current.units, ...additions] };
    });
  }

  function addManualGroupUnit() {
    setGroupWizardDraft((current) => ({
      ...current,
      units: [...current.units, {
        id: crypto.randomUUID(),
        name: "",
        type: "sector",
        links: [],
        coordinatorEmployeeId: "",
      }],
    }));
  }

  function updateGroupUnit(unitId: string, changes: Partial<CompanyGroupUnit>) {
    setGroupWizardDraft((current) => ({
      ...current,
      units: current.units.map((unit) => unit.id === unitId ? { ...unit, ...changes } : unit),
    }));
  }

  function updateGroupUnitLink(unitId: string, companyIdValue: string, sourceId: string) {
    setGroupWizardDraft((current) => ({
      ...current,
      units: current.units.map((unit) => {
        if (unit.id !== unitId) return unit;
        const links = unit.links.filter((link) => link.companyId !== companyIdValue);
        if (sourceId) links.push({ companyId: companyIdValue, sourceId });
        return { ...unit, links };
      }),
    }));
  }

  function removeGroupUnit(unitId: string) {
    setGroupWizardDraft((current) => ({
      ...current,
      units: current.units.filter((unit) => unit.id !== unitId),
    }));
  }

  function toggleDivergenceType(type: GroupUnitType) {
    setGroupWizardDraft((current) => {
      const selected = current.divergenceTypes || [];
      return {
        ...current,
        divergenceTypes: selected.includes(type)
          ? selected.filter((item) => item !== type)
          : [...selected, type],
      };
    });
  }

  function sourceDivergenceItemsForDraft(draft: CompanyGroup, sourceCompanyId: string, type: GroupUnitType) {
    if (!sourceCompanyId) return [];
    const otherCompanyIds = draft.companyIds.filter((id) => id !== sourceCompanyId);
    return groupSourceOptions(type, sourceCompanyId).filter((sourceItem) => {
      const normalized = normalizeStructureName(sourceItem.name || "");
      return normalized && otherCompanyIds.some((companyIdValue) =>
        !groupSourceOptions(type, companyIdValue).some((item) => normalizeStructureName(item.name || "") === normalized),
      );
    });
  }

  function sourceDivergenceItems(sourceCompanyId: string, type: GroupUnitType) {
    return sourceDivergenceItemsForDraft(groupWizardDraft, sourceCompanyId, type);
  }

  function divergenceCopyCount(sourceCompanyId: string, type: GroupUnitType) {
    return sourceDivergenceItems(sourceCompanyId, type).length;
  }

  function mergeGroupUnits(units: CompanyGroupUnit[]) {
    const merged = new Map<string, CompanyGroupUnit>();
    units.forEach((unit) => {
      const key = `${unit.type}:${normalizeStructureName(unit.name)}`;
      const current = merged.get(key);
      if (!current) {
        merged.set(key, { ...unit, parentUnitId: unit.parentUnitId || "", links: unit.links.map((link) => ({ ...link })) });
        return;
      }
      const links = [...current.links];
      unit.links.forEach((link) => {
        if (!links.some((item) => item.companyId === link.companyId && item.sourceId === link.sourceId)) links.push({ ...link });
      });
      merged.set(key, {
        ...current,
        links,
        coordinatorEmployeeId: current.coordinatorEmployeeId || unit.coordinatorEmployeeId,
        parentUnitId: current.parentUnitId || unit.parentUnitId || "",
      });
    });
    return [...merged.values()];
  }

  function buildReferenceVirtualUnits(draft: CompanyGroup): CompanyGroupUnit[] {
    const sourceCompanyId = draft.divergenceSourceCompanyId || "";
    const selectedTypes = new Set(draft.divergenceTypes || []);
    const usesReference = usesReferenceDivergence(draft);
    if (!usesReference || !sourceCompanyId || selectedTypes.size === 0) return [];

    const generatedUnits: CompanyGroupUnit[] = [];
    selectedTypes.forEach((type) => {
      sourceDivergenceItemsForDraft(draft, sourceCompanyId, type).forEach((sourceItem) => {
        generatedUnits.push({
          id: `reference-${type}-${sourceItem.id}`,
          name: sourceItem.name,
          type,
          parentUnitId: "",
          links: [{ companyId: sourceCompanyId, sourceId: sourceItem.id }],
          coordinatorEmployeeId: "",
        });
      });
    });
    return generatedUnits;
  }

  function employeeSourceId(employee: any, type: GroupUnitType) {
    if (type === "department") return employee.departmentId || "";
    if (type === "sector") return employee.sectorId || "";
    if (type === "subsector") return employee.subsectorId || "";
    return employee.teamId || "";
  }

  function inferredGroupUnitId(group: CompanyGroup, employee: any, type: GroupUnitType) {
    return inferEmployeeGroupUnitId(group, employee, type);
  }

  function getGroupEmployeeUnitId(group: CompanyGroup, employee: any, type: GroupUnitType) {
    const assignment = (group.employeeAssignments || []).find((item) => item.employeeId === employee.id);
    const assignmentKey = `${type}UnitId` as keyof GroupEmployeeAssignment;
    const explicit = assignment?.[assignmentKey];
    return typeof explicit === "string" && explicit ? explicit : inferredGroupUnitId(group, employee, type);
  }

  async function updateGroupEmployeeUnit(groupId: string, employeeId: string, type: GroupUnitType, unitId: string) {
    const assignmentKey = `${type}UnitId` as keyof GroupEmployeeAssignment;
    const group = companyGroups.find((item) => item.id === groupId);
    const current = (group?.employeeAssignments || []).find((item) => item.employeeId === employeeId) || {
      employeeId,
      departmentUnitId: "",
      sectorUnitId: "",
      subsectorUnitId: "",
      teamUnitId: "",
    };
    const nextAssignment = { ...current, [assignmentKey]: unitId } as GroupEmployeeAssignment;
    const existing = data.companyGroupEmployeeAssignments.find((item) => item.groupId === groupId && item.employeeId === employeeId);

    try {
      await data.upsertCompanyGroupEmployeeAssignment({
        id: existing?.id,
        groupId,
        employeeId,
        departmentUnitId: nextAssignment.departmentUnitId || "",
        sectorUnitId: nextAssignment.sectorUnitId || "",
        subsectorUnitId: nextAssignment.subsectorUnitId || "",
        teamUnitId: nextAssignment.teamUnitId || "",
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Não foi possível atualizar o vínculo do funcionário no grupo.");
    }
  }

  function saveGroupWizard() {
    if (!groupWizardDraft.name.trim() || groupWizardDraft.companyIds.length < 1) return;
    const normalizedGroupName = normalizeStructureName(groupWizardDraft.name);
    const duplicatedName = companyGroups.some((group) => (
      group.id !== groupWizardDraft.id && normalizeStructureName(group.name) === normalizedGroupName
    ));
    if (duplicatedName) {
      alert("Já existe um grupo com esse nome. Use um nome diferente.");
      return;
    }

    const referenceUnits = buildReferenceVirtualUnits(groupWizardDraft);
    const units = mergeGroupUnits([...groupWizardDraft.units, ...referenceUnits])
      .filter((unit) => unit.name.trim() && unit.links.length >= 1);
    const allowedEmployeeIds = new Set(
      data.employees.filter((employee) => groupWizardDraft.companyIds.includes(employee.companyId)).map((employee) => employee.id),
    );
    const autoSyncStructure = groupWizardDraft.companyIds.length === 1 && (groupWizardDraft.autoSyncStructure !== false || units.length === 0);
    const group: CompanyGroup = {
      ...groupWizardDraft,
      id: groupWizardDraft.id || crypto.randomUUID(),
      name: groupWizardDraft.name.trim(),
      units: units.map((unit) => ({ ...unit, name: unit.name.trim() })),
      active: groupWizardDraft.active !== false,
      autoSyncStructure,
      divergenceMode: groupWizardDraft.divergenceMode === "copy_from_source" ? "use_reference" : (groupWizardDraft.divergenceMode || "keep_existing"),
      divergenceSourceCompanyId: groupWizardDraft.divergenceSourceCompanyId || "",
      divergenceTypes: [...(groupWizardDraft.divergenceTypes || [])],
      employeeAssignments: (groupWizardDraft.employeeAssignments || []).filter((assignment) => allowedEmployeeIds.has(assignment.employeeId)),
      leadershipAssignments: (groupWizardDraft.leadershipAssignments || []).filter((assignment) => allowedEmployeeIds.has(assignment.employeeId)),
      createdAt: groupWizardDraft.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const groupWithAssignments = {
      ...group,
      employeeAssignments: buildGroupEmployeeAssignments(group),
    };
    const selectedCompanyIds = new Set(groupWithAssignments.companyIds);

    setNormalizedCompanyGroups((current) => [
      ...current
        .filter((item) => item.id !== groupWithAssignments.id)
        .map((item) => ({
          ...item,
          companyIds: item.companyIds.filter((companyIdValue) => !selectedCompanyIds.has(companyIdValue)),
          units: item.units.map((unit) => ({
            ...unit,
            links: unit.links.filter((link) => !selectedCompanyIds.has(link.companyId)),
          })),
        }))
        .filter((item) => item.companyIds.length > 0),
      groupWithAssignments,
    ]);
    setActiveTab("groups");
    closeGroupWizard();
  }

  function renderGroupCompanyTree(companyIdValue: string) {
    const company = data.companies.find((item) => item.id === companyIdValue);
    const departments = departmentsForStructureCompany(companyIdValue);
    const teams = teamsForStructureCompany(companyIdValue);
    return (
      <article className="group-structure-company" key={companyIdValue}>
        <div className="group-structure-company-header">
          <Building2 size={16} />
          <div>
            <strong>{company?.name}</strong>
            <small>{company?.document || "CNPJ não informado"}</small>
          </div>
        </div>
        <div className="group-structure-tree">
          {departments.length === 0 && teams.length === 0 && <span className="group-tree-empty">Nenhuma estrutura cadastrada.</span>}
          {departments.map((department) => {
            const sectors = sectorsForStructureCompany(companyIdValue).filter((sector) => sector.departmentId === department.id);
            return (
              <div className="group-tree-department" key={department.id}>
                <strong>{department.name}</strong>
                {sectors.map((sector) => {
                  const subsectors = subsectorsForStructureCompany(companyIdValue).filter((subsector) => subsector.sectorId === sector.id);
                  return (
                    <div className="group-tree-sector" key={sector.id}>
                      <span>{sector.name}</span>
                      {subsectors.map((subsector) => <small key={subsector.id}>{subsector.name}</small>)}
                    </div>
                  );
                })}
              </div>
            );
          })}
          {teams.length > 0 && (
            <div className="group-tree-teams">
              <strong>Equipes</strong>
              {teams.map((team) => <small key={team.id}>{team.name}</small>)}
            </div>
          )}
        </div>
      </article>
    );
  }

  const currentGroupSimilarity = groupSimilarity(groupWizardDraft.companyIds);
  const groupPairScores = groupWizardDraft.companyIds.flatMap((firstCompanyId, firstIndex) =>
    groupWizardDraft.companyIds.slice(firstIndex + 1).map((secondCompanyId) => ({
      firstCompanyId,
      secondCompanyId,
      score: pairSimilarity(firstCompanyId, secondCompanyId),
    })),
  );

  const suggestedGroupUnits: CompanyGroupUnit[] = (["department", "sector", "subsector", "team"] as GroupUnitType[])
    .flatMap((type) => {
      const matches = new Map<string, { name: string; links: GroupUnitLink[] }>();
      groupWizardDraft.companyIds.forEach((companyIdValue) => {
        groupSourceOptions(type, companyIdValue).forEach((item) => {
          const normalized = normalizeStructureName(item.name || "");
          if (!normalized) return;
          const match = matches.get(normalized) || { name: item.name, links: [] };
          if (!match.links.some((link) => link.companyId === companyIdValue)) {
            match.links.push({ companyId: companyIdValue, sourceId: item.id });
          }
          matches.set(normalized, match);
        });
      });
      return [...matches.entries()]
        .filter(([, match]) => new Set(match.links.map((link) => link.companyId)).size >= 2)
        .map(([normalized, match]) => ({
          id: `suggested-${type}-${normalized.replace(/\s+/g, "-")}`,
          name: match.name,
          type,
          links: match.links,
          coordinatorEmployeeId: "",
        }));
    })
    .sort((first, second) => first.type.localeCompare(second.type) || first.name.localeCompare(second.name));

  const filteredSuggestedGroupUnits = suggestedGroupUnits.filter((unit) =>
    groupStructureFilter === "all" || unit.type === groupStructureFilter,
  );
  const allFilteredSuggestionsSelected = filteredSuggestedGroupUnits.length > 0
    && filteredSuggestedGroupUnits.every((suggestion) => groupWizardDraft.units.some((unit) => unit.id === suggestion.id));
  const divergenceSourceCompany = data.companies.find((company) => company.id === groupWizardDraft.divergenceSourceCompanyId);
  const divergencePlanCopyCount = (groupWizardDraft.divergenceTypes || []).reduce(
    (total, type) => total + divergenceCopyCount(groupWizardDraft.divergenceSourceCompanyId || "", type),
    0,
  );
  const hasValidDivergencePlan = (groupWizardDraft.divergenceMode === "use_reference" || groupWizardDraft.divergenceMode === "copy_from_source")
    && Boolean(groupWizardDraft.divergenceSourceCompanyId)
    && (groupWizardDraft.divergenceTypes || []).length > 0
    && divergencePlanCopyCount > 0;
  const groupWizardDisplayUnits = mergeGroupUnits([
    ...groupWizardDraft.units,
    ...buildReferenceVirtualUnits(groupWizardDraft),
  ]);
  const validGroupUnits = groupWizardDisplayUnits.filter((unit) => unit.name.trim() && unit.links.length >= 1);
  const groupWizardCanContinue = groupWizardStep === 1
    ? Boolean(groupWizardDraft.name.trim())
    : groupWizardDraft.companyIds.length >= 1;
  const selectedGroupDetail = companyGroups.find((group) => group.id === groupDetailId);
  const selectedGroupEmployees = selectedGroupDetail
    ? data.employees.filter((employee) => selectedGroupDetail.companyIds.includes(employee.companyId))
    : [];
  const selectedGroupUnits = selectedGroupDetail ? effectiveGroupUnits(selectedGroupDetail) : [];
  const selectedGroupLeadershipAssignments = selectedGroupDetail
    ? synchronizeUnitCoordinatorAssignments(
        selectedGroupUnits,
        selectedGroupDetail.leadershipAssignments || [],
      )
    : [];
  const selectedGroupDetailStats = selectedGroupDetail
    ? [
        {
          label: "Departamentos",
          value: selectedGroupUnits.filter((unit) => unit.type === "department").length,
        },
        {
          label: "Setores",
          value: selectedGroupUnits.filter((unit) => unit.type === "sector").length,
        },
        {
          label: "Subsetores",
          value: selectedGroupUnits.filter((unit) => unit.type === "subsector").length,
        },
        {
          label: "Funcionários",
          value: selectedGroupEmployees.length,
        },
        {
          label: "Equipes",
          value: selectedGroupUnits.filter((unit) => unit.type === "team").length,
        },
      ]
    : [];

  function resetGroupNodeForm() {
    setGroupNodeForm(emptyGroupNodeForm());
  }

  function resetGroupAssignmentForm() {
    setGroupAssignmentForm(emptyAssignmentForm());
  }

  function groupNodeChildren(parentId: string) {
    if (!selectedGroupDetail) return [] as CompanyGroupUnit[];
    return selectedGroupUnits.filter((unit) => (unit.parentUnitId || rootParentValue) === parentId);
  }

  function groupAllowedParentTypes(type: GroupUnitType) {
    if (type === "department") return [] as GroupUnitType[];
    if (type === "sector") return ["department"] as GroupUnitType[];
    if (type === "subsector") return ["sector"] as GroupUnitType[];
    return ["subsector", "sector"] as GroupUnitType[];
  }

  function groupParentOptions(type: GroupUnitType) {
    const allowed = new Set(groupAllowedParentTypes(type));
    return selectedGroupUnits.filter((unit) => allowed.has(unit.type));
  }

  function groupUnitPath(unitId: string) {
    if (!selectedGroupDetail) return "";
    const target = selectedGroupUnits.find((unit) => unit.id === unitId);
    if (!target) return selectedGroupDetail.name;
    const visited = new Set<string>();
    const parts: string[] = [target.name];
    let currentParentId = target.parentUnitId || "";
    while (currentParentId && !visited.has(currentParentId)) {
      visited.add(currentParentId);
      const parent = selectedGroupUnits.find((unit) => unit.id === currentParentId);
      if (!parent) break;
      parts.unshift(parent.name);
      currentParentId = parent.parentUnitId || "";
    }
    return parts.join(" / ");
  }

  function renderGroupOrganizationNode(unit: CompanyGroupUnit, level = 0) {
    const assignments = selectedGroupLeadershipAssignments.filter((assignment) => assignment.unitId === unit.id);
    const children = groupNodeChildren(unit.id);
    return (
      <div className="org-tree-node" key={unit.id} style={{ marginLeft: level ? 18 : 0 }}>
        <div className="org-tree-row">
          <span className={`org-node-type is-${unit.type}`}>{groupUnitTypeLabels[unit.type]}</span>
          <strong>{unit.name}</strong>
          {assignments.length ? <small>{assignments.length} vínculo(s)</small> : null}
          <div className="org-node-actions">
            <button className="table-action" type="button" onClick={() => setGroupNodeForm({ id: unit.id, nome: unit.name, tipo: unit.type, parentId: unit.parentUnitId || rootParentValue })}>Editar</button>
            <button className="table-action danger-text" type="button" onClick={() => void deleteGroupOrganizationUnit(unit)}>Excluir</button>
          </div>
        </div>
        {assignments.length ? (
          <div className="org-node-assignments">
            {assignments.map((assignment) => {
              const employee = data.employees.find((item) => item.id === assignment.employeeId);
              const role = assignmentRoles.find((item) => item.value === assignment.role)?.label || assignment.role;
              return <span key={assignment.id}>{employee?.name || "Funcionário"} - {role}</span>;
            })}
          </div>
        ) : null}
        {children.map((child) => renderGroupOrganizationNode(child, level + 1))}
      </div>
    );
  }

  async function submitGroupOrganizationUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedGroupDetail || !groupNodeForm.nome.trim()) return;
    const normalizedName = normalizeStructureName(groupNodeForm.nome);
    const duplicated = selectedGroupUnits.some((unit) => unit.id !== groupNodeForm.id && unit.type === groupNodeForm.tipo && normalizeStructureName(unit.name) === normalizedName);
    if (duplicated) {
      alert("Já existe um item com esse nome nesse nível do grupo.");
      return;
    }
    const parentUnitId = groupNodeForm.tipo === "department" ? "" : (groupNodeForm.parentId === rootParentValue ? "" : groupNodeForm.parentId);
    const nextUnit: CompanyGroupUnit = {
      id: groupNodeForm.id || `group-unit-${Date.now()}`,
      name: groupNodeForm.nome.trim(),
      type: groupNodeForm.tipo,
      parentUnitId,
      links: groupNodeForm.id ? (selectedGroupUnits.find((unit) => unit.id === groupNodeForm.id)?.links || []) : [],
      coordinatorEmployeeId: groupNodeForm.id ? (selectedGroupUnits.find((unit) => unit.id === groupNodeForm.id)?.coordinatorEmployeeId || "") : "",
    };
    setNormalizedCompanyGroups((current) => current.map((group) => {
      if (group.id !== selectedGroupDetail.id) return group;
      return {
        ...group,
        units: [
          ...(group.units || []).filter((unit) => unit.id !== nextUnit.id),
          nextUnit,
        ],
        updatedAt: new Date().toISOString(),
      };
    }));
    resetGroupNodeForm();
  }

  function deleteGroupOrganizationUnit(unit: CompanyGroupUnit) {
    if (!selectedGroupDetail) return;
    const descendants = new Set<string>([unit.id]);
    let changed = true;
    while (changed) {
      changed = false;
      selectedGroupUnits.forEach((current) => {
        if (current.parentUnitId && descendants.has(current.parentUnitId) && !descendants.has(current.id)) {
          descendants.add(current.id);
          changed = true;
        }
      });
    }
    const leadershipCount = (selectedGroupDetail.leadershipAssignments || []).filter((item) => descendants.has(item.unitId)).length;
    const employeeCount = (selectedGroupDetail.employeeAssignments || []).filter((assignment) => (
      descendants.has(assignment.departmentUnitId)
      || descendants.has(assignment.sectorUnitId)
      || descendants.has(assignment.subsectorUnitId)
      || descendants.has(assignment.teamUnitId)
    )).length;
    const sourceLinks = selectedGroupUnits
      .filter((item) => descendants.has(item.id))
      .reduce((total, item) => total + (item.links || []).length, 0);

    setDeleteRequest({
      title: "Excluir unidade do grupo",
      impact: {
        entityType: "unidade do grupo",
        entityLabel: unit.name,
        reasons: ["A unidade participa da estrutura unificada do grupo e pode possuir itens dependentes."],
        links: [
          { label: "Unidades descendentes", count: Math.max(0, descendants.size - 1) },
          { label: "Mapeamentos com estruturas das empresas", count: sourceLinks },
          { label: "Funcionários vinculados", count: employeeCount },
          { label: "Lideranças vinculadas", count: leadershipCount },
        ],
        consequences: [
          "A unidade e todas as unidades descendentes serão removidas do grupo.",
          "Os funcionários permanecerão cadastrados, mas perderão os vínculos com essas unidades no grupo.",
          "As lideranças dessas unidades serão removidas da estrutura unificada.",
        ],
      },
      onConfirm: () => {
        setNormalizedCompanyGroups((current) => current.map((group) => {
          if (group.id !== selectedGroupDetail.id) return group;
          return {
            ...group,
            units: (group.units || []).filter((item) => !descendants.has(item.id)),
            leadershipAssignments: (group.leadershipAssignments || []).filter((item) => item.unitId === rootParentValue || !descendants.has(item.unitId)),
            employeeAssignments: (group.employeeAssignments || []).map((assignment) => ({
              ...assignment,
              departmentUnitId: descendants.has(assignment.departmentUnitId) ? "" : assignment.departmentUnitId,
              sectorUnitId: descendants.has(assignment.sectorUnitId) ? "" : assignment.sectorUnitId,
              subsectorUnitId: descendants.has(assignment.subsectorUnitId) ? "" : assignment.subsectorUnitId,
              teamUnitId: descendants.has(assignment.teamUnitId) ? "" : assignment.teamUnitId,
            })),
            updatedAt: new Date().toISOString(),
          };
        }));
        resetGroupNodeForm();
        return true;
      },
    });
  }

  async function submitGroupLeadershipAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedGroupDetail || !groupAssignmentForm.employeeId) return;

    try {
      const existing = groupAssignmentForm.id
        ? data.companyGroupLeadershipAssignments.find((item) => item.id === groupAssignmentForm.id)
        : undefined;
      await data.upsertCompanyGroupLeadershipAssignment({
        id: groupAssignmentForm.id || undefined,
        groupId: selectedGroupDetail.id,
        employeeId: groupAssignmentForm.employeeId,
        unitId: groupAssignmentForm.nodeId || rootParentValue,
        role: groupAssignmentForm.role,
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      resetGroupAssignmentForm();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Não foi possível salvar o vínculo do grupo.");
    }
  }

  function editGroupLeadershipAssignment(assignment: GroupLeadershipAssignment) {
    setGroupAssignmentForm({
      id: assignment.id,
      employeeId: assignment.employeeId,
      nodeId: assignment.unitId || rootParentValue,
      role: assignment.role,
    });
    setGroupStructureView("assignments");
  }

  function deleteGroupLeadershipAssignment(assignment: GroupLeadershipAssignment) {
    if (!selectedGroupDetail) return;
    setDeleteRequest({
      title: "Excluir liderança do grupo",
      impact: buildDomainDeletionImpact(data, "companyGroupLeadershipAssignments", assignment.id, "Vínculo de liderança"),
      onConfirm: async () => {
        await data.deleteCompanyGroupLeadershipAssignment(assignment.id);
        resetGroupAssignmentForm();
        return true;
      },
    });
  }

  function deleteCompanyGroup(group: CompanyGroup) {
    const persisted = data.companyGroups.some((item) => item.id === group.id);
    const impact = persisted
      ? buildDomainDeletionImpact(data, "companyGroups", group.id, group.name)
      : {
          entityType: "grupo empresarial",
          entityLabel: group.name,
          reasons: ["O grupo reúne empresas, estruturas, funcionários e lideranças em uma visão unificada."],
          links: [
            { label: "Empresas", count: group.companyIds.length },
            { label: "Unidades unificadas", count: (group.units || []).length },
            { label: "Funcionários vinculados", count: (group.employeeAssignments || []).length },
            { label: "Lideranças", count: (group.leadershipAssignments || []).length },
          ],
          consequences: [
            "A configuração unificada do grupo será excluída.",
            "As empresas, funcionários e estruturas originais continuarão cadastrados separadamente.",
            "As empresas voltarão a funcionar fora deste grupo.",
          ],
        } satisfies DeleteImpact;

    setDeleteRequest({
      title: "Excluir grupo empresarial",
      impact,
      onConfirm: () => {
        setNormalizedCompanyGroups((current) => current.filter((item) => item.id !== group.id));
        if (groupDetailId === group.id) setGroupDetailId("");
        return true;
      },
    });
  }

  useEffect(() => {
    resetGroupNodeForm();
    resetGroupAssignmentForm();
    setGroupStructureView("tree");
  }, [groupDetailId]);

  return (
    <section className="page companies-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Empresas</h1>
          <p className="page-subtitle">
            Gerencie empresas, departamentos, setores, subsetores, benefícios e módulos de forma limpa e organizada.
          </p>
        </div>
        <div className="page-header-actions companies-header-actions">
          <button className="btn btn-primary" type="button" onClick={openCompanyManager}>
            <Building2 size={16} /> Empresas
          </button>
          <button className="btn btn-primary" type="button" onClick={() => openGroupWizard()}>
            <GitBranch size={16} /> Criar grupo
          </button>
        </div>
      </div>

      {importSummary && (
        <article className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Resumo da importação</h2>
          </div>

          <div className="import-summary-content">
            <p>
              Criados: <strong>{importSummary.created}</strong> — Pulados/Erro: <strong>{importSummary.skipped}</strong>
            </p>

            <div className="table-wrap import-report-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Status</th>
                    <th>Mensagem</th>
                    <th>Dados</th>
                  </tr>
                </thead>
                <tbody>
                  {importReport.length === 0 && (
                    <tr>
                      <td colSpan={4}>Nenhum detalhe disponível.</td>
                    </tr>
                  )}
                  {importReport.map((item) => (
                    <tr key={item.index}>
                      <td>{item.index}</td>
                      <td>{item.status}</td>
                      <td>{item.message}</td>
                      <td>
                        {Object.entries(item.row)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(" | ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="import-report-actions">
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => {
                  // export CSV
                  const headers = ["index", "status", "message", ...new Set(importReport.flatMap((r) => Object.keys(r.row)))];
                  const lines = [headers.join(",")];
                  for (const r of importReport) {
                    const rowValues = headers.map((h) => {
                      if (h === "index") return String(r.index);
                      if (h === "status") return r.status;
                      if (h === "message") return `"${(r.message || "").replace(/"/g, '""') }"`;
                      const val = r.row[h] ?? "";
                      return `"${String(val).replace(/"/g, '""') }"`;
                    });
                    lines.push(rowValues.join(","));
                  }
                  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `import_report_${Date.now()}.csv`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                }}
              >
                Exportar relatório CSV
              </button>
            </div>
          </div>
        </article>
      )}

    <div className="panel form-card">
      <div className="panel-header">
        <h2 className="panel-title">
          <Building2 size={18} /> Estrutura organizacional
        </h2>

        <span className="module-pill">Use o botao Empresas para criar ou alterar estruturas.</span>
      </div>

      <p className="page-subtitle">
        Cadastre setores, subsetores e, opcionalmente, relacione funcionários a cargos de liderança.
      </p>
    </div>

      {companyId && (
        <article className="panel">
          <div className="panel-header">
            <h2 className="panel-title">{selectedCompany?.name}</h2>
          </div>
          <div className="module-list">
            <span className="module-pill">{companyDepartments.length} departamentos</span>
            <span className="module-pill">{companySectors.length} setores</span>
            <span className="module-pill">{companySubsectors.length} subsetores</span>
            <span className="module-pill">{companyTeams.length} equipes</span>
            <span className="module-pill">{companyContracts.length} contratos</span>
            <span className="module-pill">{companyModules.length} módulos</span>
          </div>
        </article>
      )}

      <div className="company-switcher">
        <button
          className={`company-tab ${activeTab === "companies" ? "is-active" : ""}`}
          type="button"
          onClick={() => {
            setActiveTab("companies");
            closeForm();
          }}
        >
          Empresas
        </button>

        <button
          className={`company-tab ${activeTab === "groups" ? "is-active" : ""}`}
          type="button"
          onClick={() => {
            setActiveTab("groups");
            closeForm();
          }}
        >
          <GitBranch size={16} /> Ver grupos
        </button>

        {companyId && (
          <button
            className={`company-tab ${activeTab === "departments" ? "is-active" : ""}`}
            type="button"
            onClick={() => {
              setActiveTab("departments");
              closeForm();
            }}
          >
            Departamentos
          </button>
        )}

        {companyId && (
          <button
            className={`company-tab ${activeTab === "sectors" ? "is-active" : ""}`}
            type="button"
            onClick={() => {
              setActiveTab("sectors");
              closeForm();
            }}
          >
            Setores e subsetores
          </button>
        )}

        {companyId && (
          <button
            className={`company-tab ${activeTab === "teams" ? "is-active" : ""}`}
            type="button"
            onClick={() => {
              setActiveTab("teams");
              closeForm();
            }}
          >
            Equipes
          </button>
        )}

        {companyId && (
          <button
            className={`company-tab ${activeTab === "benefits" ? "is-active" : ""}`}
            type="button"
            onClick={() => {
              setActiveTab("benefits");
              closeForm();
            }}
          >
            Benefícios
          </button>
        )}

        {companyId && (
          <button
            className={`company-tab ${activeTab === "modules" ? "is-active" : ""}`}
            type="button"
            onClick={() => {
              setActiveTab("modules");
              closeForm();
            }}
          >
            Módulos
          </button>
        )}

        {companyId && (
          <button
            className={`company-tab ${activeTab === "structure" ? "is-active" : ""}`}
            type="button"
            onClick={() => {
              setActiveTab("structure");
              closeForm();
            }}
          >
            Estrutura
          </button>
        )}
      </div>


      {activeTab === "companies" && (
        <>
          {editingKind === "company" && (
            <form className="panel form-card" onSubmit={submitCompany}>
              <div className="panel-header">
                <h2 className="panel-title">
                  <Plus size={18} /> {isEditing ? "Editar empresa" : "Nova empresa"}
                </h2>
                <button className="btn btn-secondary" type="button" onClick={closeForm}>
                  <X size={14} /> Cancelar
                </button>
              </div>

              <div className="form-grid">
                <label className="field">
                  Nome
                  <input
                    required
                    value={companyForm.name}
                    onChange={(event) => setCompanyForm({ ...companyForm, name: event.target.value })}
                  />
                </label>

                <label className="field">
                  Razão social
                  <input
                    value={companyForm.legalName}
                    onChange={(event) => setCompanyForm({ ...companyForm, legalName: event.target.value })}
                  />
                </label>

                <label className="field">
                  CNPJ
                  <input
                    value={companyForm.document}
                    onChange={(event) => setCompanyForm({ ...companyForm, document: event.target.value })}
                  />
                </label>

                <label className="field">
                  Localização
                  <input
                    value={companyForm.location}
                    onChange={(event) => setCompanyForm({ ...companyForm, location: event.target.value })}
                  />
                </label>
              </div>

              <button className="btn btn-primary" type="submit">
                {isEditing ? "Salvar alterações" : "Salvar empresa"}
              </button>
            </form>
          )}

          <article className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Empresas cadastradas</h2>
            </div>

            <div className="table-wrap companies-table-wrap">
              <table className="data-table companies-table">
                <thead>
                  <tr>
                    <th>Empresa</th>
                    <th>CNPJ</th>
                    <th>Grupo</th>
                    <th>Localização</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {data.companies.length === 0 && <EmptyRow colSpan={6} text="Nenhuma empresa cadastrada." />}
                  {data.companies.map((company: any) => {
                    const group = companyGroupForCompany(company.id);
                    return (
                      <tr key={company.id}>
                        <td className="company-name-cell">{company.name}</td>
                        <td className="company-document-cell">{company.document || "-"}</td>
                        <td className="company-group-cell">
                          <strong>{group?.name || "Grupo pendente"}</strong>
                          <small>{group ? `${group.companyIds.length} CNPJ(s)` : "Criado automaticamente"}</small>
                        </td>
                        <td className="company-location-cell">{company.location || "-"}</td>
                        <td className="company-status-cell">{company.active === false ? "Inativa" : "Ativa"}</td>
                        <td className="company-actions-cell">
                          <ActionButtons
                            active={company.active}
                            onStructure={() => openCompanyStructure(company.id)}
                            onEdit={() => startEditCompany(company)}
                            onToggle={() => toggleActive(company, "upsertCompany")}
                            onDelete={() => tryDelete("deleteCompany", company.id)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </article>

        </>
      )}

      {activeTab === "groups" && (
        <article className="panel groups-list-panel">
          <div className="panel-header groups-overview-header">
            <div>
              <h2 className="panel-title"><GitBranch size={18} /> Grupos cadastrados</h2>
              <p className="page-subtitle">Cada grupo funciona como uma empresa virtual: reúne estruturas e funcionários sem alterar os cadastros originais dos CNPJs.</p>
            </div>
          </div>

          <div className="table-wrap groups-table-wrap">
            <table className="data-table groups-table">
              <thead>
                <tr>
                  <th>Grupo</th>
                  <th>Empresas participantes</th>
                  <th>Estrutura do grupo</th>
                  <th>Semelhança</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {companyGroups.length === 0 && <EmptyRow colSpan={6} text="Nenhum grupo cadastrado." />}
                {companyGroups.map((group) => {
                  const similarity = groupSimilarity(group.companyIds);
                  const groupUnits = effectiveGroupUnits(group);
                  return (
                    <tr key={group.id}>
                      <td className="group-name-cell">
                        <strong>{group.name}</strong>
                        <small>{group.companyIds.length} empresa(s) · {data.employees.filter((employee) => group.companyIds.includes(employee.companyId)).length} funcionário(s)</small>
                      </td>
                      <td>
                        <div className="group-table-company-list">
                          {group.companyIds.map((id) => (
                            <span key={id}>{data.companies.find((company) => company.id === id)?.name || "Empresa removida"}</span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <div className="group-table-unit-summary">
                          <strong>{groupUnits.length}</strong>
                          <span>estrutura(s) da empresa virtual</span>
                          {groupUnits.slice(0, 2).map((unit) => (
                            <small key={unit.id}>{groupUnitTypeLabels[unit.type]}: {unit.name}</small>
                          ))}
                          {groupUnits.length > 2 && <small>+ {groupUnits.length - 2} outra(s)</small>}
                        </div>
                      </td>
                      <td>
                        <span className="group-similarity-badge">{similarity.overall}%</span>
                      </td>
                      <td>{group.active === false ? "Inativo" : "Ativo"}</td>
                      <td className="company-actions-cell">
                        <div className="table-actions group-table-actions">
                          <button
                            className="btn btn-secondary"
                            type="button"
                            title="Abrir empresa virtual"
                            aria-label="Abrir empresa virtual"
                            onClick={() => { setGroupDetailId(group.id); setGroupDetailTab("structure"); }}
                          >
                            <Eye size={14} />
                          </button>
                          <button className="btn btn-secondary" type="button" title="Gerenciar estrutura do grupo" aria-label="Gerenciar estrutura do grupo" onClick={() => openGroupWizard(group, 3)}>
                            <GitBranch size={14} />
                          </button>
                          <button className="btn btn-secondary" type="button" title="Editar grupo" aria-label="Editar grupo" onClick={() => openGroupWizard(group, 1)}>
                            <Edit2 size={14} />
                          </button>
                          <button
                            className="btn btn-secondary"
                            type="button"
                            title={group.active === false ? "Ativar grupo" : "Desativar grupo"}
                            aria-label={group.active === false ? "Ativar grupo" : "Desativar grupo"}
                            onClick={() => setNormalizedCompanyGroups((current) => current.map((item) => item.id === group.id ? { ...item, active: item.active === false, updatedAt: new Date().toISOString() } : item))}
                          >
                            <Power size={14} />
                          </button>
                          <button
                            className="btn btn-secondary danger-text"
                            type="button"
                            title="Excluir grupo"
                            aria-label="Excluir grupo"
                            onClick={() => deleteCompanyGroup(group)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </article>
      )}

      {!companyId && activeTab !== "companies" && activeTab !== "groups" && (
        <article className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Selecione uma empresa</h2>
          </div>
          <p className="page-subtitle">Selecione uma empresa para liberar os módulos.</p>
        </article>
      )}

      {companyId && activeTab === "departments" && (
        <>
          {editingKind === "department" && (
            <ModalPortal className="modal-backdrop" role="presentation">
              <form className="panel form-card entity-form-modal" role="dialog" aria-modal="true" aria-labelledby="department-form-title" onSubmit={submitDepartment}>
                <div className="panel-header">
                  <h2 className="panel-title" id="department-form-title">{isEditing ? "Editar departamento" : "Novo departamento"}</h2>
                  <button className="btn btn-secondary" type="button" onClick={closeForm}>
                    <X size={14} /> Cancelar
                  </button>
                </div>

                <div className="form-grid">
                  <label className="field">
                    Nome
                    <input
                      required
                      value={departmentForm.name}
                      onChange={(event) => setDepartmentForm({ ...departmentForm, name: event.target.value })}
                    />
                  </label>

                  <label className="field">
                    Administrador/Gerente
                    <EmployeeSelect
                      value={departmentForm.managerEmployeeId}
                      onChange={(value) => setDepartmentForm({ ...departmentForm, managerEmployeeId: value, managerName: value ? employeeName(value) : "" })}
                    />
                  </label>

                  <label className="field is-wide-field">
                    Descrição
                    <input
                      value={departmentForm.description}
                      onChange={(event) => setDepartmentForm({ ...departmentForm, description: event.target.value })}
                    />
                  </label>
                </div>

                <button className="btn btn-primary" type="submit">
                  {isEditing ? "Salvar alterações" : "Salvar departamento"}
                </button>
              </form>
            </ModalPortal>
          )}

          <article className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Departamentos cadastrados</h2>
              <button className="btn btn-primary" type="button" onClick={() => openCreate("department")}>
                <Plus size={14} /> Adicionar departamento
              </button>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Administrador/Gerente</th>
                    <th>Descrição</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {companyDepartments.length === 0 && <EmptyRow colSpan={5} text="Nenhum departamento cadastrado." />}
                  {companyDepartments.map((item: any) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.managerName || "-"}</td>
                      <td>{item.description || "-"}</td>
                      <td>{item.active === false ? "Inativo" : "Ativo"}</td>
                      <td>
                        <ActionButtons
                          active={item.active}
                          onEdit={() => startEditDepartment(item)}
                          onToggle={() => toggleActive(item, "upsertDepartment")}
                          onDelete={() => tryDelete("deleteDepartment", item.id)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </>
      )}

      {companyId && activeTab === "sectors" && (
        <>
          {editingKind === "sector" && (
            <ModalPortal className="modal-backdrop" role="presentation">
              <form className="panel form-card entity-form-modal" role="dialog" aria-modal="true" aria-labelledby="sector-form-title" onSubmit={submitSector}>
                <div className="panel-header">
                  <h2 className="panel-title" id="sector-form-title">{isEditing ? "Editar setor" : "Novo setor"}</h2>
                  <button className="btn btn-secondary" type="button" onClick={closeForm}>
                    <X size={14} /> Cancelar
                  </button>
                </div>

                <div className="form-grid">
                  <label className="field">
                    Departamento
                    <select
                      required
                      value={sectorForm.departmentId}
                      onChange={(event) => setSectorForm({ ...sectorForm, departmentId: event.target.value })}
                    >
                      <option value="">Selecione</option>
                      {companyDepartments.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    Nome
                    <input
                      required
                      value={sectorForm.name}
                      onChange={(event) => setSectorForm({ ...sectorForm, name: event.target.value })}
                    />
                  </label>

                  <label className="field">
                    Coordenador
                    <EmployeeSelect
                      value={sectorForm.coordinatorEmployeeId}
                      onChange={(value) => setSectorForm({ ...sectorForm, coordinatorEmployeeId: value, coordinatorName: value ? employeeName(value) : "" })}
                    />
                  </label>

                  <label className="field">
                    Líder
                    <EmployeeSelect
                      value={sectorForm.leaderEmployeeId}
                      onChange={(value) => setSectorForm({ ...sectorForm, leaderEmployeeId: value, leaderName: value ? employeeName(value) : "" })}
                    />
                  </label>

                  <label className="field">
                    Centro de custo
                    <input
                      value={sectorForm.costCenter}
                      onChange={(event) => setSectorForm({ ...sectorForm, costCenter: event.target.value })}
                    />
                  </label>
                </div>

                <button className="btn btn-primary" type="submit">
                  {isEditing ? "Salvar alterações" : "Salvar setor"}
                </button>
              </form>
            </ModalPortal>
          )}

          {editingKind === "subsector" && (
            <ModalPortal className="modal-backdrop" role="presentation">
              <form className="panel form-card entity-form-modal" role="dialog" aria-modal="true" aria-labelledby="subsector-form-title" onSubmit={submitSubsector}>
                <div className="panel-header">
                  <h2 className="panel-title" id="subsector-form-title">{isEditing ? "Editar subsetor" : "Novo subsetor"}</h2>
                  <button className="btn btn-secondary" type="button" onClick={closeForm}>
                    <X size={14} /> Cancelar
                  </button>
                </div>

                <div className="form-grid">
                  <label className="field">
                    Setor
                    <select
                      required
                      value={subsectorForm.sectorId}
                      onChange={(event) => setSubsectorForm({ ...subsectorForm, sectorId: event.target.value })}
                    >
                      <option value="">Selecione</option>
                      {companySectors.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    Nome
                    <input
                      required
                      value={subsectorForm.name}
                      onChange={(event) => setSubsectorForm({ ...subsectorForm, name: event.target.value })}
                    />
                  </label>

                  <label className="field">
                    Líder
                    <EmployeeSelect
                      value={subsectorForm.leaderEmployeeId}
                      onChange={(value) => setSubsectorForm({ ...subsectorForm, leaderEmployeeId: value, leaderName: value ? employeeName(value) : "" })}
                    />
                  </label>
                </div>

                <button className="btn btn-primary" type="submit">
                  {isEditing ? "Salvar alterações" : "Salvar subsetor"}
                </button>
              </form>
            </ModalPortal>
          )}

          <article className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Setores cadastrados</h2>
              <button className="btn btn-primary" type="button" onClick={() => openCreate("sector")}>
                <Plus size={14} /> Adicionar setor
              </button>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Setor</th>
                    <th>Departamento</th>
                    <th>Coordenador</th>
                    <th>Líder</th>
                    <th>Centro de custo</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {companySectors.length === 0 && <EmptyRow colSpan={7} text="Nenhum setor cadastrado." />}
                  {companySectors.map((item: any) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{companyDepartments.find((dep) => dep.id === item.departmentId)?.name ?? "-"}</td>
                      <td>{item.coordinatorName || "-"}</td>
                      <td>{item.leaderName || "-"}</td>
                      <td>{item.costCenter || "-"}</td>
                      <td>{item.active === false ? "Inativo" : "Ativo"}</td>
                      <td>
                        <ActionButtons
                          active={item.active}
                          onEdit={() => startEditSector(item)}
                          onToggle={() => toggleActive(item, "upsertSector")}
                          onDelete={() => tryDelete("deleteSector", item.id)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Subsetores cadastrados</h2>
              <button className="btn btn-primary" type="button" onClick={() => openCreate("subsector")}>
                <Plus size={14} /> Adicionar subsetor
              </button>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Subsetor</th>
                    <th>Setor</th>
                    <th>Líder</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {companySubsectors.length === 0 && <EmptyRow colSpan={5} text="Nenhum subsetor cadastrado." />}
                  {companySubsectors.map((item: any) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{companySectors.find((sector) => sector.id === item.sectorId)?.name ?? "-"}</td>
                      <td>{item.leaderName || "-"}</td>
                      <td>{item.active === false ? "Inativo" : "Ativo"}</td>
                      <td>
                        <ActionButtons
                          active={item.active}
                          onEdit={() => startEditSubsector(item)}
                          onToggle={() => toggleActive(item, "upsertSubsector")}
                          onDelete={() => tryDelete("deleteSubsector", item.id)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </>
      )}


      {companyId && activeTab === "teams" && (
        <>
          {editingKind === "team" && (
            <ModalPortal className="modal-backdrop" role="presentation">
              <form className="panel form-card entity-form-modal" role="dialog" aria-modal="true" aria-labelledby="team-form-title" onSubmit={submitTeam}>
                <div className="panel-header">
                  <h2 className="panel-title" id="team-form-title">{isEditing ? "Editar equipe" : "Nova equipe"}</h2>
                  <button className="btn btn-secondary" type="button" onClick={closeForm}>
                    <X size={14} /> Cancelar
                  </button>
                </div>

                <div className="form-grid">
                  <label className="field">
                    Nome da equipe
                    <input required value={teamForm.name} onChange={(event) => setTeamForm({ ...teamForm, name: event.target.value })} />
                  </label>
                  <label className="field is-wide-field">
                    Descrição
                    <input value={teamForm.description} onChange={(event) => setTeamForm({ ...teamForm, description: event.target.value })} />
                  </label>
                </div>

                <button className="btn btn-primary" type="submit">
                  {isEditing ? "Salvar alterações" : "Salvar equipe"}
                </button>
              </form>
            </ModalPortal>
          )}

          <article className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Equipes da empresa</h2>
              <button className="btn btn-primary" type="button" onClick={() => openCreate("team")}>
                <Plus size={14} /> Adicionar equipe
              </button>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Equipe</th>
                    <th>Descrição</th>
                    <th>Funcionários</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {companyTeams.length === 0 && <EmptyRow colSpan={5} text="Nenhuma equipe cadastrada." />}
                  {companyTeams.map((team) => (
                    <tr key={team.id}>
                      <td>{team.name}</td>
                      <td>{team.description || "-"}</td>
                      <td>{data.employees.filter((employee) => employee.teamId === team.id).length}</td>
                      <td>{team.active === false ? "Inativa" : "Ativa"}</td>
                      <td>
                        <ActionButtons
                          active={team.active}
                          onEdit={() => startEditTeam(team)}
                          onToggle={() => toggleActive(team, "upsertTeam")}
                          onDelete={() => tryDelete("deleteTeam", team.id)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </>
      )}

      {companyId && activeTab === "benefits" && (
        <>
          {editingKind === "contract" && (
            <form className="panel form-card" onSubmit={submitContract}>
              <div className="panel-header">
                <h2 className="panel-title">{isEditing ? "Editar contrato" : "Novo contrato"}</h2>
                <button className="btn btn-secondary" type="button" onClick={closeForm}>
                  <X size={14} /> Cancelar
                </button>
              </div>

              <div className="form-grid">
                <label className="field">
                  Contrato
                  <input
                    required
                    value={contractForm.name}
                    onChange={(event) => setContractForm({ ...contractForm, name: event.target.value })}
                  />
                </label>

                <label className="field">
                  Fornecedor
                  <input
                    value={contractForm.providerName}
                    onChange={(event) => setContractForm({ ...contractForm, providerName: event.target.value })}
                  />
                </label>

                <label className="field">
                  Tipo
                  <select
                    value={contractForm.type}
                    onChange={(event) => setContractForm({ ...contractForm, type: event.target.value as BenefitType })}
                  >
                    {benefitTypes.map((type) => (
                      <option key={type} value={type}>
                        {labelStatus(type)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  Site
                  <input
                    value={contractForm.websiteUrl}
                    onChange={(event) => setContractForm({ ...contractForm, websiteUrl: event.target.value })}
                  />
                </label>

                <label className="field">
                  Início
                  <input
                    type="date"
                    value={contractForm.startDate}
                    onChange={(event) => setContractForm({ ...contractForm, startDate: event.target.value })}
                  />
                </label>

                <label className="field">
                  Fim
                  <input
                    type="date"
                    value={contractForm.endDate}
                    onChange={(event) => setContractForm({ ...contractForm, endDate: event.target.value })}
                  />
                </label>

                <label className="field">
                  Campo personalizado
                  <input
                    placeholder="nome do campo"
                    value={contractForm.fieldKey}
                    onChange={(event) => setContractForm({ ...contractForm, fieldKey: event.target.value })}
                  />
                </label>

                <label className="field">
                  Valor personalizado
                  <input
                    value={contractForm.fieldValue}
                    onChange={(event) => setContractForm({ ...contractForm, fieldValue: event.target.value })}
                  />
                </label>
              </div>

              <button className="btn btn-primary" type="submit">
                {isEditing ? "Salvar alterações" : "Salvar contrato"}
              </button>
            </form>
          )}

          <article className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Contratos cadastrados</h2>
              <button className="btn btn-primary" type="button" onClick={() => openCreate("contract")}>
                <Plus size={14} /> Adicionar contrato
              </button>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Contrato</th>
                    <th>Fornecedor</th>
                    <th>Tipo</th>
                    <th>Período</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {companyContracts.length === 0 && <EmptyRow colSpan={6} text="Nenhum contrato cadastrado." />}
                  {companyContracts.map((item: any) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.providerName || "-"}</td>
                      <td>{labelStatus(item.type ?? "custom")}</td>
                      <td>
                        {item.startDate || "-"} até {item.endDate || "-"}
                      </td>
                      <td>{item.active === false ? "Inativo" : "Ativo"}</td>
                      <td>
                        <ActionButtons
                          active={item.active}
                          onEdit={() => startEditContract(item)}
                          onToggle={() => toggleActive(item, "upsertBenefitContract")}
                          onDelete={() => tryDelete("deleteBenefitContract", item.id)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

        </>
      )}

      {companyId && activeTab === "modules" && (
        <>
          {editingKind === "module" && (
            <form className="panel form-card" onSubmit={submitModule}>
              <div className="panel-header">
                <h2 className="panel-title">
                  <GitBranch size={18} /> {isEditing ? "Editar módulo" : "Novo módulo customizado"}
                </h2>
                <button className="btn btn-secondary" type="button" onClick={closeForm}>
                  <X size={14} /> Cancelar
                </button>
              </div>

              <div className="form-grid">
                <label className="field">
                  Nome do módulo
                  <input
                    required
                    value={moduleForm.name}
                    onChange={(event) => setModuleForm({ ...moduleForm, name: event.target.value })}
                  />
                </label>

                <label className="field">
                  Tela de destino
                  <select
                    value={moduleForm.targetScreen}
                    onChange={(event) =>
                      setModuleForm({
                        ...moduleForm,
                        targetScreen: event.target.value as CustomModule["targetScreen"],
                      })
                    }
                  >
                    <option value="companies">Empresas</option>
                    <option value="employees">Funcionários</option>
                    <option value="records">Registros</option>
                    <option value="benefits">Benefícios</option>
                    <option value="timekeeping">Controle de ponto</option>
                  </select>
                </label>

                <label className="field is-wide-field">
                  Colunas
                  <input
                    placeholder="coluna 1, coluna 2"
                    value={moduleForm.columns}
                    onChange={(event) => setModuleForm({ ...moduleForm, columns: event.target.value })}
                  />
                </label>

                <label className="field is-wide-field">
                  Descrição
                  <input
                    value={moduleForm.description}
                    onChange={(event) => setModuleForm({ ...moduleForm, description: event.target.value })}
                  />
                </label>
              </div>

              <button className="btn btn-primary" type="submit">
                {isEditing ? "Salvar alterações" : "Salvar módulo"}
              </button>
            </form>
          )}

          <article className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Módulos cadastrados</h2>
              <button className="btn btn-primary" type="button" onClick={() => openCreate("module")}>
                <Plus size={14} /> Adicionar módulo
              </button>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Módulo</th>
                    <th>Tela</th>
                    <th>Colunas</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {companyModules.length === 0 && <EmptyRow colSpan={5} text="Nenhum módulo cadastrado." />}
                  {companyModules.map((item: any) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.targetScreen}</td>
                      <td>{Array.isArray(item.columns) ? item.columns.join(", ") : "-"}</td>
                      <td>{item.active === false ? "Inativo" : "Ativo"}</td>
                      <td>
                        <ActionButtons
                          active={item.active}
                          onEdit={() => startEditModule(item)}
                          onToggle={() => toggleActive(item, "upsertCustomModule")}
                          onDelete={() => tryDelete("deleteCustomModule", item.id)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </>
      )}

      {companyId && activeTab === "structure" && (
        <div className="structure-workspace">
          <article className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Estrutura organizacional</h2>
                <p className="panel-subtitle">
                  Modelo em arvore salvo em organizational_nodes. Funcionarios ficam separados em employee_assignments.
                </p>
              </div>
              <div className="segmented-control">
                <button
                  className={structureView === "tree" ? "is-active" : ""}
                  type="button"
                  onClick={() => setStructureView("tree")}
                >
                  Arvore
                </button>
                <button
                  className={structureView === "assignments" ? "is-active" : ""}
                  type="button"
                  onClick={() => setStructureView("assignments")}
                >
                  Vinculos
                </button>
              </div>
            </div>

            {structureView === "tree" ? (
              <div className="structure-grid">
                <form className="structure-editor" onSubmit={submitOrganizationNode}>
                  <h3>{nodeForm.id ? "Editar item" : "Novo item da arvore"}</h3>
                  <p className="muted">Crie departamentos, setores, subsetores e equipes com apenas um pai por item.</p>
                  <label className="field">
                    Nome
                    <input
                      value={nodeForm.nome}
                      onChange={(event) => setNodeForm({ ...nodeForm, nome: event.target.value })}
                      required
                    />
                  </label>
                  <label className="field">
                    Tipo
                    <select
                      value={nodeForm.tipo}
                      onChange={(event) => setNodeForm({ ...nodeForm, tipo: event.target.value as OrganizationalNodeType })}
                    >
                      <option value="departamento">Departamento</option>
                      <option value="setor">Setor</option>
                      <option value="subsetor">Subsetor</option>
                      <option value="equipe">Equipe</option>
                    </select>
                  </label>
                  <label className="field">
                    Pai na arvore
                    <select
                      value={nodeForm.parentId}
                      onChange={(event) => setNodeForm({ ...nodeForm, parentId: event.target.value })}
                    >
                      <option value={rootParentValue}>{selectedCompany?.name || "Empresa"}</option>
                      {parentOptions().map((node) => (
                        <option key={node.id} value={node.id}>{nodePath(node.id)}</option>
                      ))}
                    </select>
                  </label>
                  <div className="form-actions">
                    <button className="btn btn-primary" type="submit">
                      {nodeForm.id ? "Salvar item" : "Criar item"}
                    </button>
                    {nodeForm.id ? (
                      <button className="btn btn-secondary" type="button" onClick={resetNodeForm}>
                        Cancelar edicao
                      </button>
                    ) : null}
                  </div>
                </form>

                <div className="org-tree">
                  {companyRootNode ? (
                    renderOrganizationNode(companyRootNode)
                  ) : (
                    <div className="org-tree-node">
                      <div className="org-tree-row">
                        <span className="org-node-type is-empresa">Empresa</span>
                        <strong>{selectedCompany?.name}</strong>
                        <small>Raiz criada automaticamente ao salvar o primeiro item ou vinculo.</small>
                      </div>
                      {nodeChildren(rootParentValue).map((child) => renderOrganizationNode(child, 1))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="structure-grid">
                <form className="structure-editor" onSubmit={submitEmployeeAssignment}>
                  <h3>{assignmentForm.id ? "Editar vinculo" : "Novo vinculo"}</h3>
                  <p className="muted">
                    Vincule funcionarios a qualquer nivel da arvore. Gerentes podem ficar direto na empresa.
                  </p>
                  <label className="field">
                    Funcionario
                    <select
                      value={assignmentForm.employeeId}
                      onChange={(event) => setAssignmentForm({ ...assignmentForm, employeeId: event.target.value })}
                      required
                    >
                      <option value="">Selecione</option>
                      {selectedCompanyEmployees.map((employee) => (
                        <option key={employee.id} value={employee.id}>{employee.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Cargo
                    <select
                      value={assignmentForm.role}
                      onChange={(event) => setAssignmentForm({ ...assignmentForm, role: event.target.value as EmployeeAssignmentRole })}
                    >
                      {assignmentRoles.map((role) => (
                        <option key={role.value} value={role.value}>{role.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Vinculado a
                    <select
                      value={assignmentForm.nodeId}
                      onChange={(event) => setAssignmentForm({ ...assignmentForm, nodeId: event.target.value })}
                    >
                      <option value={rootParentValue}>{selectedCompany?.name || "Empresa"}</option>
                      {companyOrganizationNodes
                        .filter((node) => node.tipo !== "empresa")
                        .map((node) => (
                          <option key={node.id} value={node.id}>{nodePath(node.id)}</option>
                        ))}
                    </select>
                  </label>
                  <p className="muted">
                    Regras ativas: um setor tem apenas um coordenador; um lider pode liderar varios subsetores,
                    mas nao varios setores.
                  </p>
                  <div className="form-actions">
                    <button className="btn btn-primary" type="submit">
                      {assignmentForm.id ? "Salvar vinculo" : "Criar vinculo"}
                    </button>
                    {assignmentForm.id ? (
                      <button className="btn btn-secondary" type="button" onClick={resetAssignmentForm}>
                        Cancelar edicao
                      </button>
                    ) : null}
                  </div>
                </form>

                <div className="table-panel">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Funcionario</th>
                        <th>Cargo</th>
                        <th>Vinculado a</th>
                        <th>Acoes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {companyAssignments.map((assignment) => {
                        const employee = data.employees.find((item) => item.id === assignment.employeeId);
                        const role = assignmentRoles.find((item) => item.value === assignment.role)?.label || assignment.role;
                        return (
                          <tr key={assignment.id}>
                            <td>{employee?.name || "-"}</td>
                            <td>{role}</td>
                            <td>{nodePath(assignment.nodeId)}</td>
                            <td className="action-row">
                              <button className="table-action" type="button" onClick={() => editAssignment(assignment)}>Editar</button>
                              <button className="table-action danger-text" type="button" onClick={() => void deleteAssignment(assignment)}>Excluir</button>
                            </td>
                          </tr>
                        );
                      })}
                      {!companyAssignments.length ? <tr><td colSpan={4}>Nenhum vinculo cadastrado.</td></tr> : null}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </article>
        </div>
      )}

      {false && companyId && activeTab === "structure" && (
        <article className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Estrutura atual</h2>
          </div>

          <div className="structure-tree">
            <strong>{selectedCompany?.name}</strong>
            {companyDepartments.map((department) => (
              <div className="tree-node" key={department.id}>
                ↳ {department.name}
                {companySectors
                  .filter((sector) => sector.departmentId === department.id)
                  .map((sector) => (
                    <div className="tree-node" key={sector.id}>
                      ↳ {sector.name}
                      {companySubsectors
                        .filter((subsector) => subsector.sectorId === sector.id)
                        .map((subsector) => (
                          <div className="tree-node" key={subsector.id}>
                            ↳ {subsector.name}
                          </div>
                        ))}
                    </div>
                  ))}
              </div>
            ))}
          </div>

          <div className="module-list">
            {companyContracts.map((contract) => (
              <span className="module-pill" key={contract.id}>
                {contract.name}
              </span>
            ))}
            {companyModules.map((module) => (
              <span className="module-pill" key={module.id}>
                {module.name}
              </span>
            ))}
          </div>
        </article>
      )}
      {conflictState && (
        <ModalPortal className="modal-backdrop" role="presentation">
          <div className="confirm-modal" role="dialog" aria-modal="true">
            <h2>{conflictState.title}</h2>
            <p>{conflictState.description}</p>
            <div className="form-actions">
              <button className="btn btn-primary" type="button" onClick={() => setConflictState(null)}>
                OK
              </button>
            </div>
          </div>
        </ModalPortal>
      )}
      {deleteRequest ? (
        <DeleteImpactModal
          title={deleteRequest.title}
          impact={deleteRequest.impact}
          confirmLabel={deleteRequest.confirmLabel || "Excluir mesmo assim"}
          busy={deleteRequestBusy}
          secondaryLabel={deleteRequest.secondaryLabel}
          onSecondary={deleteRequest.onSecondary ? () => void executeDeleteSecondary() : undefined}
          onCancel={() => setDeleteRequest(null)}
          onConfirm={() => void executeDeleteRequest()}
        />
      ) : null}
      {companyManagerOpen && (
        <ModalPortal className="modal-backdrop" role="presentation">
          <div className="confirm-modal company-manager-modal" role="dialog" aria-modal="true">
            <div className="modal-header">
              <div>
                <h2>Empresas e grupos</h2>
                <p>Escolha se deseja criar uma nova empresa, alterar a estrutura de um CNPJ ou gerenciar a estrutura unificada de um grupo.</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setCompanyManagerOpen(false)} aria-label="Fechar">
                <X size={18} />
              </button>
            </div>

            <div className="company-manager-actions">
                          <div className="company-manager-option">
              <Building2 size={18} />
              <span>
                <strong>Cadastrar empresa</strong>
                <small>Crie uma nova empresa com nome, razão social, CNPJ e localização.</small>
              </span>

              <button className="btn btn-primary" type="button" onClick={startCreateCompanyStructure}>
                <Plus size={14} /> Cadastrar empresa
              </button>
            </div>

              <div className="company-manager-option is-form">
                <GitBranch size={18} />
                <span>
                  <strong>Alterar estrutura</strong>
                  <small>Selecione a empresa para editar a arvore e os vinculos dinamicos.</small>
                </span>
                <select
                  value={managerCompanyId}
                  onChange={(event) => {
                    const nextCompanyId = event.target.value;
                    setManagerCompanyId(nextCompanyId);
                    setManagerGroupId(companyGroupForCompany(nextCompanyId)?.id || managerGroupId || "");
                  }}
                >
                  <option value="">Selecione a empresa</option>
                  {data.companies.map((company) => (
                    <option key={company.id} value={company.id}>{company.name}</option>
                  ))}
                </select>
                <div className="company-manager-action-buttons">
                  <button className="btn btn-primary" type="button" onClick={startChangeCompanyStructure}>
                    Alterar estrutura
                  </button>
                  <button className="btn btn-secondary" type="button" onClick={() => openStructureWizard(managerCompanyId || selectedCompanyId)}>
                    Importar estrutura
                  </button>
                  <button className="btn btn-secondary" type="button" onClick={exportCompanyStructure}>
                    Exportar estrutura
                  </button>
                </div>
              </div>

              <div className="company-manager-option is-form">
                <Users size={18} />
                <span>
                  <strong>Alterar estrutura do grupo</strong>
                  <small>Selecione o grupo para definir a estrutura unificada e os responsaveis compartilhados, como gerentes, coordenadores, lideres e encarregados.</small>
                </span>
                <select value={managerGroupId} onChange={(event) => setManagerGroupId(event.target.value)}>
                  <option value="">Selecione o grupo</option>
                  {companyGroups.map((group) => (
                    <option key={group.id} value={group.id}>{group.name}</option>
                  ))}
                </select>
                <div className="company-manager-action-buttons">
                  <button className="btn btn-primary" type="button" onClick={startChangeGroupStructure}>
                    Alterar estrutura do grupo
                  </button>
                  <button className="btn btn-secondary" type="button" onClick={openVirtualGroupCompany}>
                    Abrir empresa virtual
                  </button>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {selectedGroupDetail && (
        <ModalPortal className="modal-backdrop" role="presentation">
          <div className="group-detail-modal" role="dialog" aria-modal="true" aria-labelledby="group-detail-title">
            <div className="modal-header group-detail-header">
              <div>
                <span className="group-wizard-eyebrow">Empresa virtual do grupo</span>
                <h2 id="group-detail-title">{selectedGroupDetail.name}</h2>
                <p>{selectedGroupDetail.companyIds.length} CNPJ(s) participante(s) · {selectedGroupEmployees.length} funcionário(s) unificado(s)</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setGroupDetailId("")} aria-label="Fechar grupo">
                <X size={18} />
              </button>
            </div>

            <div className="group-detail-summary">
              <div>
                <GitBranch size={22} />
                <div>
                  <strong>Este grupo funciona como uma empresa unificada</strong>
                  <span>Os funcionários aparecem juntos e podem ocupar a mesma estrutura do grupo, mesmo pertencendo a CNPJs diferentes.</span>
                </div>
              </div>
              <span className="group-detail-safety">As empresas originais não são alteradas</span>
            </div>

            <div className="group-detail-stat-grid" aria-label="Resumo unificado do grupo">
              {selectedGroupDetailStats.map((stat) => (
                <div className="group-detail-stat-card" key={stat.label}>
                  <span>{stat.label}</span>
                  <strong>{stat.value}</strong>
                  <small>unificado(s)</small>
                </div>
              ))}
            </div>

            <div className="group-detail-tabs">
              <button className={groupDetailTab === "structure" ? "is-active" : ""} type="button" onClick={() => setGroupDetailTab("structure")}>
                <GitBranch size={15} /> Estrutura unificada
              </button>
              <button className={groupDetailTab === "employees" ? "is-active" : ""} type="button" onClick={() => setGroupDetailTab("employees")}>
                <Users size={15} /> Funcionários do grupo
              </button>
            </div>

            <div className="group-detail-body">
              {groupDetailTab === "structure" && (
                <div>
                  <div className="panel-header">
                    <div>
                      <h2 className="panel-title">Estrutura organizacional do grupo</h2>
                      <p className="panel-subtitle">
                        Aqui você define a árvore do grupo e os vínculos compartilhados de administradores, gerentes, coordenadores, líderes e colaboradores.
                      </p>
                    </div>
                    <div className="segmented-control">
                      <button
                        className={groupStructureView === "tree" ? "is-active" : ""}
                        type="button"
                        onClick={() => setGroupStructureView("tree")}
                      >
                        Arvore
                      </button>
                      <button
                        className={groupStructureView === "assignments" ? "is-active" : ""}
                        type="button"
                        onClick={() => setGroupStructureView("assignments")}
                      >
                        Vinculos
                      </button>
                    </div>
                  </div>

                  {groupStructureView === "tree" ? (
                    <div className="structure-grid">
                      <form className="structure-editor" onSubmit={submitGroupOrganizationUnit}>
                        <h3>{groupNodeForm.id ? "Editar item do grupo" : "Novo item da arvore do grupo"}</h3>
                        <p className="muted">Crie departamentos, setores, subsetores e equipes para a empresa virtual do grupo.</p>
                        <label className="field">
                          Nome
                          <input
                            value={groupNodeForm.nome}
                            onChange={(event) => setGroupNodeForm({ ...groupNodeForm, nome: event.target.value })}
                            required
                          />
                        </label>
                        <label className="field">
                          Tipo
                          <select
                            value={groupNodeForm.tipo}
                            onChange={(event) => setGroupNodeForm({ ...groupNodeForm, tipo: event.target.value as GroupUnitType, parentId: event.target.value === "department" ? rootParentValue : groupNodeForm.parentId })}
                          >
                            <option value="department">Departamento</option>
                            <option value="sector">Setor</option>
                            <option value="subsector">Subsetor</option>
                            <option value="team">Equipe</option>
                          </select>
                        </label>
                        <label className="field">
                          Pai na arvore
                          <select
                            value={groupNodeForm.tipo === "department" ? rootParentValue : groupNodeForm.parentId}
                            onChange={(event) => setGroupNodeForm({ ...groupNodeForm, parentId: event.target.value })}
                            disabled={groupNodeForm.tipo === "department"}
                          >
                            <option value={rootParentValue}>{selectedGroupDetail.name}</option>
                            {groupParentOptions(groupNodeForm.tipo).map((unit) => (
                              <option key={unit.id} value={unit.id}>{groupUnitPath(unit.id)}</option>
                            ))}
                          </select>
                        </label>
                        <div className="form-actions">
                          <button className="btn btn-primary" type="submit">
                            {groupNodeForm.id ? "Salvar item" : "Criar item"}
                          </button>
                          {groupNodeForm.id ? (
                            <button className="btn btn-secondary" type="button" onClick={resetGroupNodeForm}>
                              Cancelar edicao
                            </button>
                          ) : null}
                        </div>
                      </form>

                      <div className="org-tree">
                        <div className="org-tree-node">
                          <div className="org-tree-row">
                            <span className="org-node-type is-empresa">Grupo</span>
                            <strong>{selectedGroupDetail.name}</strong>
                            {selectedGroupLeadershipAssignments.filter((assignment) => assignment.unitId === rootParentValue).length ? (
                              <small>{selectedGroupLeadershipAssignments.filter((assignment) => assignment.unitId === rootParentValue).length} vínculo(s)</small>
                            ) : null}
                          </div>
                          {selectedGroupLeadershipAssignments.filter((assignment) => assignment.unitId === rootParentValue).length ? (
                            <div className="org-node-assignments">
                              {selectedGroupLeadershipAssignments.filter((assignment) => assignment.unitId === rootParentValue).map((assignment) => {
                                const employee = data.employees.find((item) => item.id === assignment.employeeId);
                                const role = assignmentRoles.find((item) => item.value === assignment.role)?.label || assignment.role;
                                return <span key={assignment.id}>{employee?.name || "Funcionário"} - {role}</span>;
                              })}
                            </div>
                          ) : null}
                          {groupNodeChildren(rootParentValue).map((child) => renderGroupOrganizationNode(child, 1))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="structure-grid">
                      <form className="structure-editor" onSubmit={submitGroupLeadershipAssignment}>
                        <h3>{groupAssignmentForm.id ? "Editar vínculo do grupo" : "Novo vínculo do grupo"}</h3>
                        <p className="muted">Defina quem atua como administrador, gerente, coordenador, líder ou colaborador dentro da estrutura compartilhada do grupo.</p>
                        <label className="field">
                          Funcionário
                          <select
                            value={groupAssignmentForm.employeeId}
                            onChange={(event) => setGroupAssignmentForm({ ...groupAssignmentForm, employeeId: event.target.value })}
                            required
                          >
                            <option value="">Selecione</option>
                            {selectedGroupEmployees.map((employee) => (
                              <option key={employee.id} value={employee.id}>{employee.name}</option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          Cargo
                          <select
                            value={groupAssignmentForm.role}
                            onChange={(event) => setGroupAssignmentForm({ ...groupAssignmentForm, role: event.target.value as EmployeeAssignmentRole })}
                          >
                            {assignmentRoles.map((role) => (
                              <option key={role.value} value={role.value}>{role.label}</option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          Vinculado a
                          <select
                            value={groupAssignmentForm.nodeId}
                            onChange={(event) => setGroupAssignmentForm({ ...groupAssignmentForm, nodeId: event.target.value })}
                          >
                            <option value={rootParentValue}>{selectedGroupDetail.name}</option>
                            {selectedGroupUnits.map((unit) => (
                              <option key={unit.id} value={unit.id}>{groupUnitPath(unit.id)}</option>
                            ))}
                          </select>
                        </label>
                        <div className="form-actions">
                          <button className="btn btn-primary" type="submit">
                            {groupAssignmentForm.id ? "Salvar vínculo" : "Criar vínculo"}
                          </button>
                          {groupAssignmentForm.id ? (
                            <button className="btn btn-secondary" type="button" onClick={resetGroupAssignmentForm}>
                              Cancelar edicao
                            </button>
                          ) : null}
                        </div>
                      </form>

                      <div className="table-panel">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Funcionário</th>
                              <th>Cargo</th>
                              <th>Vinculado a</th>
                              <th>Ações</th>
                            </tr>
                          </thead>
                          <tbody>
                            {!selectedGroupLeadershipAssignments.length ? <EmptyRow colSpan={4} text="Nenhum vínculo compartilhado cadastrado." /> : null}
                            {selectedGroupLeadershipAssignments.map((assignment) => {
                              const employee = data.employees.find((item) => item.id === assignment.employeeId);
                              const role = assignmentRoles.find((item) => item.value === assignment.role)?.label || assignment.role;
                              return (
                                <tr key={assignment.id}>
                                  <td>{employee?.name || "-"}</td>
                                  <td>{role}</td>
                                  <td>{assignment.unitId === rootParentValue ? selectedGroupDetail.name : groupUnitPath(assignment.unitId)}</td>
                                  <td className="action-row">
                                    <button className="table-action" type="button" onClick={() => editGroupLeadershipAssignment(assignment)}>Editar</button>
                                    <button className="table-action danger-text" type="button" onClick={() => void deleteGroupLeadershipAssignment(assignment)}>Excluir</button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {groupDetailTab === "employees" && (
                <div className="group-employees-panel">
                  <div className="group-employees-note">
                    <Users size={18} />
                    <div>
                      <strong>Vínculo organizacional exclusivo do grupo</strong>
                      <span>Alterar os campos abaixo não muda o CNPJ, o departamento, o setor, o subsetor ou a equipe cadastrados na empresa original.</span>
                    </div>
                  </div>
                  <div className="table-wrap group-employees-table-wrap">
                    <table className="data-table group-employees-table">
                      <thead>
                        <tr>
                          <th>Funcionário</th>
                          <th>Empresa no grupo</th>
                          <th>Vínculo legal</th>
                          <th>Departamento</th>
                          <th>Setor</th>
                          <th>Subsetor</th>
                          <th>Equipe</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedGroupEmployees.length === 0 && <EmptyRow colSpan={7} text="Nenhum funcionário cadastrado nos CNPJs deste grupo." />}
                        {selectedGroupEmployees.map((employee) => {
                          const legalCompany = data.companies.find((company) => company.id === employee.companyId);
                          const unitOptions = (type: GroupUnitType) => effectiveGroupUnits(selectedGroupDetail).filter((unit) => unit.type === type);
                          return (
                            <tr key={employee.id}>
                              <td><strong>{employee.name}</strong><small>{(employee as any).cpf || (employee as any).document || ""}</small></td>
                              <td><strong>{selectedGroupDetail.name}</strong><small>Empresa virtual</small></td>
                              <td><strong>{legalCompany?.name || "Empresa removida"}</strong><small>{legalCompany?.document || "CNPJ não informado"}</small></td>
                              {(["department", "sector", "subsector", "team"] as GroupUnitType[]).map((type) => (
                                <td key={type}>
                                  <select
                                    value={getGroupEmployeeUnitId(selectedGroupDetail, employee, type)}
                                    onChange={(event) => updateGroupEmployeeUnit(selectedGroupDetail.id, employee.id, type, event.target.value)}
                                  >
                                    <option value="">Não definido</option>
                                    {unitOptions(type).map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
                                  </select>
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="group-detail-footer">
              <button className="btn btn-secondary" type="button" onClick={() => { setGroupDetailId(""); openGroupWizard(selectedGroupDetail, 3); }}>
                <Edit2 size={14} /> Editar unificações do grupo
              </button>
              <button className="btn btn-primary" type="button" onClick={() => setGroupDetailId("")}>Fechar</button>
            </div>
          </div>
        </ModalPortal>
      )}

      {groupWizardOpen && (
        <ModalPortal className="modal-backdrop" role="presentation">
          <div className="group-wizard-modal" role="dialog" aria-modal="true" aria-labelledby="group-wizard-title">
            <div className="modal-header group-wizard-header">
              <div>
                <span className="group-wizard-eyebrow">Grupo empresarial</span>
                <h2 id="group-wizard-title">{groupWizardDraft.id ? "Editar grupo" : "Criar novo grupo"}</h2>
                <p>Etapa {groupWizardStep} de 3</p>
              </div>
              <button className="icon-button" type="button" onClick={closeGroupWizard} aria-label="Fechar criação de grupo">
                <X size={18} />
              </button>
            </div>

            <div className="group-wizard-steps" aria-label="Etapas da criação do grupo">
              <button className={groupWizardStep === 1 ? "is-active" : groupWizardStep > 1 ? "is-complete" : ""} type="button" onClick={() => setGroupWizardStep(1)}>
                <span>{groupWizardStep > 1 ? <Check size={15} /> : "1"}</span>
                <div><strong>Nome do grupo</strong><small>Identificação</small></div>
              </button>
              <button className={groupWizardStep === 2 ? "is-active" : groupWizardStep > 2 ? "is-complete" : ""} type="button" disabled={!groupWizardDraft.name.trim()} onClick={() => setGroupWizardStep(2)}>
                <span>{groupWizardStep > 2 ? <Check size={15} /> : "2"}</span>
                <div><strong>Selecionar empresas</strong><small>CNPJs participantes</small></div>
              </button>
              <button className={groupWizardStep === 3 ? "is-active" : ""} type="button" disabled={groupWizardDraft.companyIds.length < 1} onClick={() => setGroupWizardStep(3)}>
                <span>3</span>
                <div><strong>Criar estrutura do grupo</strong><small>Empresa virtual</small></div>
              </button>
            </div>

            <div className="group-wizard-body">
              {groupWizardStep === 1 && (
                <div className="group-wizard-step-content group-wizard-name-step">
                  <div className="group-wizard-step-heading">
                    <span className="group-wizard-step-number">1</span>
                    <div>
                      <h3>Qual será o nome deste grupo?</h3>
                      <p>Use um nome que represente as empresas que compartilham a mesma estrutura organizacional.</p>
                    </div>
                  </div>

                  <label className="field group-name-field">
                    <span>Nome do grupo</span>
                    <input
                      autoFocus
                      value={groupWizardDraft.name}
                      onChange={(event) => setGroupWizardDraft((current) => ({ ...current, name: event.target.value }))}
                      placeholder="Ex.: Grupo Macro Ambiental"
                    />
                  </label>

                  <div className="group-wizard-info-card">
                    <GitBranch size={20} />
                    <div>
                      <strong>O grupo será uma nova empresa virtual</strong>
                      <span>Os CNPJs e as estruturas originais continuam separados e intactos. Dentro do grupo, os funcionários aparecerão juntos na estrutura unificada.</span>
                    </div>
                  </div>
                </div>
              )}

              {groupWizardStep === 2 && (
                <div className="group-wizard-step-content">
                  <div className="group-wizard-step-heading">
                    <span className="group-wizard-step-number">2</span>
                    <div>
                      <h3>Selecione as empresas do grupo</h3>
                      <p>Escolha uma ou mais empresas. Cada CNPJ ficará vinculado a um único grupo e poderá ser movido para outro grupo sem alterar sua estrutura original.</p>
                    </div>
                  </div>

                  <div className="group-wizard-company-grid">
                    {data.companies.map((company) => {
                      const selected = groupWizardDraft.companyIds.includes(company.id);
                      const departments = departmentsForStructureCompany(company.id).length;
                      const sectors = sectorsForStructureCompany(company.id).length;
                      const subsectors = subsectorsForStructureCompany(company.id).length;
                      const teams = teamsForStructureCompany(company.id).length;
                      return (
                        <label className={`group-wizard-company-card ${selected ? "is-selected" : ""}`} key={company.id}>
                          <input type="checkbox" checked={selected} onChange={() => toggleGroupCompany(company.id)} />
                          <span className="group-company-check">{selected && <Check size={17} />}</span>
                          <div className="group-company-main">
                            <strong>{company.name}</strong>
                            <small>{company.document || "CNPJ não informado"}</small>
                          </div>
                          <div className="group-company-stats">
                            <span><b>{departments}</b> departamentos</span>
                            <span><b>{sectors}</b> setores</span>
                            <span><b>{subsectors}</b> subsetores</span>
                            <span><b>{teams}</b> equipes</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>

                  {groupWizardDraft.companyIds.length >= 2 && (
                    <div className="group-similarity-panel">
                      <div className="group-similarity-main">
                        <div className="group-similarity-circle" style={{ "--similarity": `${currentGroupSimilarity.overall}%` } as CSSProperties}>
                          <strong>{currentGroupSimilarity.overall}%</strong>
                          <small>semelhança</small>
                        </div>
                        <div>
                          <h4>Semelhança média das empresas selecionadas</h4>
                          <p>O cálculo compara os nomes dos departamentos, setores, subsetores e equipes já cadastrados.</p>
                        </div>
                      </div>

                      <div className="group-similarity-types">
                        <span><b>{currentGroupSimilarity.department}%</b> Departamentos</span>
                        <span><b>{currentGroupSimilarity.sector}%</b> Setores</span>
                        <span><b>{currentGroupSimilarity.subsector}%</b> Subsetores</span>
                        <span><b>{currentGroupSimilarity.team}%</b> Equipes</span>
                      </div>

                      {groupPairScores.length > 1 && (
                        <div className="group-pair-scores">
                          {groupPairScores.map((pair) => (
                            <div key={`${pair.firstCompanyId}-${pair.secondCompanyId}`}>
                              <span>{data.companies.find((company) => company.id === pair.firstCompanyId)?.name}</span>
                              <b>{pair.score.overall}%</b>
                              <span>{data.companies.find((company) => company.id === pair.secondCompanyId)?.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {groupWizardStep === 3 && (
                <div className="group-wizard-step-content group-wizard-structure-step">
                  <div className="group-wizard-step-heading group-wizard-step-heading-with-score">
                    <span className="group-wizard-step-number">3</span>
                    <div>
                      <h3>Como será a estrutura da empresa virtual?</h3>
                      <p>Use as estruturas existentes apenas como referência para montar o grupo. Nenhuma empresa selecionada será alterada.</p>
                    </div>
                    <span className="group-inline-similarity"><b>{currentGroupSimilarity.overall}%</b> semelhantes</span>
                  </div>

                  <section className="group-wizard-section">
                    <div className="group-wizard-section-header">
                      <div>
                        <h4>Estrutura identificada por empresa</h4>
                        <p>Departamentos, setores, subsetores e equipes aparecem na hierarquia em que foram cadastrados.</p>
                      </div>
                    </div>
                    <div className="group-structure-company-grid">
                      {groupWizardDraft.companyIds.map((companyIdValue) => renderGroupCompanyTree(companyIdValue))}
                    </div>
                  </section>

                  <section className="group-wizard-section">
                    <div className="group-wizard-section-header">
                      <div>
                        <h4>Sugestões automáticas de unificação</h4>
                        <p>Itens com o mesmo nome em duas ou mais empresas foram relacionados automaticamente.</p>
                      </div>
                      <div className="group-suggestion-header-actions">
                        <button
                          className="btn btn-secondary"
                          type="button"
                          onClick={toggleAllSuggestedGroupUnits}
                          disabled={filteredSuggestedGroupUnits.length === 0}
                        >
                          <Check size={14} /> {allFilteredSuggestionsSelected ? "Desmarcar tudo" : "Selecionar tudo"}
                        </button>
                        <button className="btn btn-secondary" type="button" onClick={addManualGroupUnit}>
                          <Plus size={14} /> Unificação manual
                        </button>
                      </div>
                    </div>

                    <div className="group-structure-filters">
                      {(["all", "department", "sector", "subsector", "team"] as const).map((type) => (
                        <button className={groupStructureFilter === type ? "is-active" : ""} type="button" key={type} onClick={() => setGroupStructureFilter(type)}>
                          {type === "all" ? "Todos" : groupUnitTypeLabels[type]}
                          {type !== "all" && <small>{type === "department" ? currentGroupSimilarity.department : type === "sector" ? currentGroupSimilarity.sector : type === "subsector" ? currentGroupSimilarity.subsector : currentGroupSimilarity.team}%</small>}
                        </button>
                      ))}
                    </div>

                    {filteredSuggestedGroupUnits.length === 0 ? (
                      <div className="group-suggestions-empty">
                        <span>Nenhum item de mesmo nome foi encontrado neste filtro.</span>
                        <small>Use “Unificação manual” para relacionar estruturas com nomes diferentes.</small>
                      </div>
                    ) : (
                      <div className="group-suggestion-grid">
                        {filteredSuggestedGroupUnits.map((suggestion) => {
                          const selected = groupWizardDraft.units.some((unit) => unit.id === suggestion.id);
                          return (
                            <button className={`group-suggestion-card ${selected ? "is-selected" : ""}`} type="button" key={suggestion.id} onClick={() => toggleSuggestedGroupUnit(suggestion)}>
                              <div>
                                <span className={`group-unit-type is-${suggestion.type}`}>{groupUnitTypeLabels[suggestion.type]}</span>
                                <strong>{suggestion.name}</strong>
                                <small>{suggestion.links.length} empresas identificadas</small>
                              </div>
                              <span className="group-suggestion-action">{selected ? <><Check size={15} /> Selecionado</> : "+ Unificar"}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  <section className="group-wizard-section group-divergence-section">
                    <div className="group-wizard-section-header">
                      <div>
                        <h4>Resolver divergências entre as empresas</h4>
                        <p>Escolha o que fazer quando uma empresa possui estruturas que a outra não possui.</p>
                      </div>
                      {hasValidDivergencePlan && <span className="group-divergence-copy-badge">{divergencePlanCopyCount} estrutura(s) entrarão somente no grupo</span>}
                    </div>

                    <div className="group-divergence-mode-grid">
                      <label className={`group-divergence-mode ${(groupWizardDraft.divergenceMode !== "use_reference" && groupWizardDraft.divergenceMode !== "copy_from_source") ? "is-selected" : ""}`}>
                        <input
                          type="radio"
                          name="group-divergence-mode"
                          checked={groupWizardDraft.divergenceMode !== "use_reference" && groupWizardDraft.divergenceMode !== "copy_from_source"}
                          onChange={() => setGroupWizardDraft((current) => ({
                            ...current,
                            divergenceMode: "keep_existing",
                            divergenceSourceCompanyId: "",
                            divergenceTypes: [],
                            units: current.units.filter((unit) => !isReferenceGroupUnit(unit)),
                          }))}
                        />
                        <div>
                          <strong>Manter somente as unificações selecionadas</strong>
                          <span>O grupo será criado com os itens escolhidos acima. A estrutura original das empresas permanecerá intacta.</span>
                        </div>
                      </label>

                      <label className={`group-divergence-mode ${(groupWizardDraft.divergenceMode === "use_reference" || groupWizardDraft.divergenceMode === "copy_from_source") ? "is-selected" : ""}`}>
                        <input
                          type="radio"
                          name="group-divergence-mode"
                          checked={groupWizardDraft.divergenceMode === "use_reference" || groupWizardDraft.divergenceMode === "copy_from_source"}
                          onChange={() => setGroupWizardDraft((current) => ({ ...current, divergenceMode: "use_reference" }))}
                        />
                        <div>
                          <strong>Usar uma empresa como referência do grupo</strong>
                          <span>As estruturas exclusivas dessa empresa entrarão apenas na empresa virtual do grupo, sem alterar nenhum CNPJ.</span>
                        </div>
                      </label>
                    </div>

                    {(groupWizardDraft.divergenceMode === "use_reference" || groupWizardDraft.divergenceMode === "copy_from_source") && (
                      <div className="group-divergence-config">
                        <div>
                          <strong className="group-divergence-label">1. Qual empresa será a referência?</strong>
                          <div className="group-divergence-company-grid">
                            {groupWizardDraft.companyIds.map((companyIdValue) => {
                              const company = data.companies.find((item) => item.id === companyIdValue);
                              const selected = groupWizardDraft.divergenceSourceCompanyId === companyIdValue;
                              return (
                                <button
                                  className={`group-divergence-company ${selected ? "is-selected" : ""}`}
                                  type="button"
                                  key={companyIdValue}
                                  onClick={() => setGroupWizardDraft((current) => ({ ...current, divergenceSourceCompanyId: companyIdValue }))}
                                >
                                  <span className="group-divergence-company-check">{selected ? <Check size={14} /> : null}</span>
                                  <div>
                                    <strong>{company?.name}</strong>
                                    <small>
                                      {groupSourceOptions("department", companyIdValue).length} dep. · {groupSourceOptions("sector", companyIdValue).length} setores · {groupSourceOptions("subsector", companyIdValue).length} subsetores · {groupSourceOptions("team", companyIdValue).length} equipes
                                    </small>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div>
                          <strong className="group-divergence-label">2. O que deve seguir o lado escolhido?</strong>
                          <div className="group-divergence-type-grid">
                            {(["department", "sector", "subsector", "team"] as GroupUnitType[]).map((type) => {
                              const selected = (groupWizardDraft.divergenceTypes || []).includes(type);
                              const uniqueItems = sourceDivergenceItems(groupWizardDraft.divergenceSourceCompanyId || "", type).length;
                              const copies = divergenceCopyCount(groupWizardDraft.divergenceSourceCompanyId || "", type);
                              return (
                                <button
                                  className={`group-divergence-type ${selected ? "is-selected" : ""}`}
                                  type="button"
                                  key={type}
                                  disabled={!groupWizardDraft.divergenceSourceCompanyId}
                                  onClick={() => toggleDivergenceType(type)}
                                >
                                  <span>{selected ? <Check size={14} /> : null}</span>
                                  <div>
                                    <strong>{groupUnitTypeLabels[type]}</strong>
                                    <small>{uniqueItems} estrutura(s) exclusiva(s) · {copies} entrarão no grupo</small>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className={`group-divergence-preview ${hasValidDivergencePlan ? "is-ready" : ""}`}>
                          <GitBranch size={19} />
                          <div>
                            {divergenceSourceCompany ? (
                              <>
                                <strong>{divergenceSourceCompany.name} será usada como referência</strong>
                                <span>
                                  {hasValidDivergencePlan
                                    ? `${divergencePlanCopyCount} estrutura(s) exclusiva(s) serão adicionadas somente à estrutura virtual do grupo. Nenhuma empresa selecionada será alterada.`
                                    : "Selecione ao menos um tipo com diferenças para visualizar o resultado."}
                                </span>
                              </>
                            ) : (
                              <>
                                <strong>Selecione uma empresa de referência</strong>
                                <span>Exemplo: se ela tiver 5 equipes e outra empresa tiver 0, o grupo poderá ter as 5 equipes sem criá-las na outra empresa.</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </section>

                  <section className="group-wizard-section">
                    <div className="group-wizard-section-header">
                      <div>
                        <h4>Estrutura da empresa virtual</h4>
                        <p>Defina os nomes e responsáveis que valerão somente dentro do grupo.</p>
                      </div>
                      <span className="group-selected-count">
                        {validGroupUnits.length} estrutura(s) na empresa virtual
                      </span>
                    </div>

                    {groupWizardDisplayUnits.length === 0 ? (
                      <div className="group-selected-empty">
                        <GitBranch size={24} />
                        <strong>Nenhuma estrutura selecionada</strong>
                        <span>Você pode criar o grupo sem estrutura e organizar os departamentos, setores, subsetores e equipes depois.</span>
                      </div>
                    ) : (
                      <div className="group-selected-units">
                        {groupWizardDisplayUnits.map((unit, index) => {
                          const linkedCompanies = new Set(unit.links.map((link) => link.companyId)).size;
                          const generatedByReference = isReferenceGroupUnit(unit)
                            && !groupWizardDraft.units.some((draftUnit) => draftUnit.id === unit.id);
                          return (
                            <article className={`group-selected-unit ${linkedCompanies >= 1 && unit.name.trim() ? "is-valid" : ""}`} key={unit.id}>
                              <div className="group-selected-unit-header">
                                <div>
                                  <span>{generatedByReference ? "Referência" : "Unificação"} {index + 1}</span>
                                  <strong>{unit.name || "Sem nome"}</strong>
                                </div>
                                <div>
                                  <span className={linkedCompanies >= 1 ? "group-link-status is-valid" : "group-link-status"}>{linkedCompanies} origem(ns)</span>
                                  {!generatedByReference ? (
                                    <button className="icon-button" type="button" onClick={() => removeGroupUnit(unit.id)} aria-label="Remover unificação">
                                      <Trash2 size={15} />
                                    </button>
                                  ) : null}
                                </div>
                              </div>

                              <div className="group-selected-unit-fields">
                                <label className="field">
                                  <span>Tipo</span>
                                  <select
                                    value={unit.type}
                                    disabled={generatedByReference}
                                    onChange={(event) => updateGroupUnit(unit.id, { type: event.target.value as GroupUnitType, links: [] })}
                                  >
                                    <option value="department">Departamento</option>
                                    <option value="sector">Setor</option>
                                    <option value="subsector">Subsetor</option>
                                    <option value="team">Equipe</option>
                                  </select>
                                </label>
                                <label className="field">
                                  <span>Nome unificado</span>
                                  <input
                                    value={unit.name}
                                    readOnly={generatedByReference}
                                    onChange={(event) => updateGroupUnit(unit.id, { name: event.target.value })}
                                    placeholder="Nome comum no grupo"
                                  />
                                </label>
                                <label className="field group-coordinator-field">
                                  <span>{groupUnitResponsibleLabel(unit.type)}</span>
                                  <select
                                    value={unit.coordinatorEmployeeId}
                                    disabled={generatedByReference}
                                    onChange={(event) => updateGroupUnit(unit.id, { coordinatorEmployeeId: event.target.value })}
                                  >
                                    <option value="">Definir depois</option>
                                    {data.employees
                                      .filter((employee) => groupWizardDraft.companyIds.includes(employee.companyId))
                                      .map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
                                  </select>
                                  <small>{generatedByReference ? "Vem da empresa de referência e será salva ao confirmar." : "Será o responsável desta estrutura dentro do grupo, para funcionários de qualquer CNPJ participante."}</small>
                                </label>
                              </div>

                              <div className="group-selected-unit-links">
                                {groupWizardDraft.companyIds.map((companyIdValue) => {
                                  const company = data.companies.find((item) => item.id === companyIdValue);
                                  const selectedSourceId = unit.links.find((link) => link.companyId === companyIdValue)?.sourceId || "";
                                  return (
                                    <label className="field" key={companyIdValue}>
                                      <span>{company?.name}</span>
                                      <select
                                        value={selectedSourceId}
                                        disabled={generatedByReference}
                                        onChange={(event) => updateGroupUnitLink(unit.id, companyIdValue, event.target.value)}
                                      >
                                        <option value="">Sem estrutura de origem nesta empresa</option>
                                        {groupSourceOptions(unit.type, companyIdValue).map((item) => (
                                          <option key={item.id} value={item.id}>{groupSourcePath(unit.type, item.id)}</option>
                                        ))}
                                      </select>
                                    </label>
                                  );
                                })}
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </div>
              )}
            </div>

            <div className="group-wizard-footer">
              <button className="btn btn-secondary" type="button" onClick={groupWizardStep === 1 ? closeGroupWizard : () => setGroupWizardStep((groupWizardStep - 1) as GroupWizardStep)}>
                {groupWizardStep === 1 ? "Cancelar" : <><ChevronLeft size={15} /> Voltar</>}
              </button>
              <div>
                {groupWizardStep === 2 && <span>{groupWizardDraft.companyIds.length} empresa(s) selecionada(s)</span>}
                {groupWizardStep === 3 && <span>{validGroupUnits.length} unificação(ões) válida(s)</span>}
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={!groupWizardCanContinue}
                  onClick={groupWizardStep === 3 ? saveGroupWizard : () => setGroupWizardStep((groupWizardStep + 1) as GroupWizardStep)}
                >
                  {groupWizardStep === 3 ? (groupWizardDraft.id ? "Salvar alterações" : "Criar grupo") : <>Continuar <ChevronRight size={15} /></>}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {isWizardOpen && (
  <ModalPortal className="modal-backdrop">
    <div className="wizard-modal">
      <div className="modal-header">
        <div>
          <h2>Assistente de estrutura</h2>
          <p>Etapa {wizardStep + 1} de 6</p>
        </div>

        <button className="icon-button" type="button" onClick={closeStructureWizard} aria-label="Fechar assistente" title="Fechar assistente">
          <X size={18} />
        </button>
      </div>

      <div className="wizard-steps">
        <span className={wizardStep === 0 ? "is-active" : ""}>Empresa</span>
        <span className={wizardStep === 1 ? "is-active" : ""}>Departamentos</span>
        <span className={wizardStep === 2 ? "is-active" : ""}>Setores</span>
        <span className={wizardStep === 3 ? "is-active" : ""}>Subsetores</span>
        <span className={wizardStep === 4 ? "is-active" : ""}>Equipes</span>
        <span className={wizardStep === 5 ? "is-active" : ""}>Vínculos</span>
      </div>

      {wizardStep === 0 && (
        <div className="wizard-body">
          <h3>Selecione a empresa</h3>

          <label className="field is-wide-field">
            Empresa
            <select value={wizardCompanyId} onChange={(event) => setWizardCompanyId(event.target.value)}>
              <option value="">Selecione uma empresa</option>
              {summary.map((item) => (
                <option key={item.company.id} value={item.company.id}>
                  {item.company.name} - {item.departments} dep. - {item.sectors} setores - {item.employees} func.
                </option>
              ))}
            </select>
          </label>

          <div className="form-grid">
            <label className="field">
              Ou crie uma nova empresa
              <input value={wizardCompanyForm.name} disabled={Boolean(wizardCompanyId)} onChange={(event) => setWizardCompanyForm({ ...wizardCompanyForm, name: event.target.value })} placeholder="Nome fantasia" />
            </label>
            <label className="field">
              Razão social
              <input value={wizardCompanyForm.legalName} disabled={Boolean(wizardCompanyId)} onChange={(event) => setWizardCompanyForm({ ...wizardCompanyForm, legalName: event.target.value })} />
            </label>
            <label className="field">
              CNPJ
              <input value={wizardCompanyForm.document} disabled={Boolean(wizardCompanyId)} onChange={(event) => setWizardCompanyForm({ ...wizardCompanyForm, document: event.target.value })} />
            </label>
            <label className="field">
              Localização
              <input value={wizardCompanyForm.location} disabled={Boolean(wizardCompanyId)} onChange={(event) => setWizardCompanyForm({ ...wizardCompanyForm, location: event.target.value })} />
            </label>
          </div>

          <div className="import-model-card">
            <strong>Modelo aceito para importação</strong>
            <p className="page-subtitle">
              Use uma planilha XLSX/CSV com as colunas EMPRESA, DEPARTAMENTO, SETOR e SUBSETOR. A empresa pode ser preenchida na planilha ou selecionada acima.
            </p>
            <pre>{`EMPRESA | DEPARTAMENTO | SETOR | SUBSETOR
Macro Ambiental | Administrativo | Recursos Humanos | Recrutamento
Macro Ambiental | Administrativo | Recursos Humanos | Folha de Pagamento
Macro Ambiental | Administrativo | Recursos Humanos | Benefícios
Macro Ambiental | Administrativo | Financeiro | Contas a Pagar
Macro Ambiental | Administrativo | Financeiro | Contas a Receber
Macro Ambiental | Operacional | Obras | Pavimentação
Macro Ambiental | Operacional | Obras | Drenagem
Macro Ambiental | Operacional | Manutenção | Equipamentos
Macro Ambiental | Qualidade e Segurança | Qualidade | Relatórios
Macro Ambiental | Qualidade e Segurança | Segurança do Trabalho | EPI`}</pre>
            <details>
              <summary>Ver modelo hierárquico</summary>
              <pre>{`Empresa: Macro Ambiental

Departamento: Administrativo
  Setor: Recursos Humanos
    Subsetor: Recrutamento
    Subsetor: Folha de Pagamento
    Subsetor: Benefícios

  Setor: Financeiro
    Subsetor: Contas a Pagar
    Subsetor: Contas a Receber
    Subsetor: Faturamento

Departamento: Operacional
  Setor: Obras
    Subsetor: Pavimentação
    Subsetor: Drenagem
    Subsetor: Terraplenagem

  Setor: Manutenção
    Subsetor: Equipamentos
    Subsetor: Veículos
    Subsetor: Ferramentas

Departamento: Qualidade e Segurança
  Setor: Qualidade
    Subsetor: Inspeção
    Subsetor: Relatórios
    Subsetor: Controle de Documentos

  Setor: Segurança do Trabalho
    Subsetor: EPI
    Subsetor: Treinamentos
    Subsetor: Fiscalização de Campo`}</pre>
            </details>
          </div>

          <label className="field is-wide-field">
            Importar estrutura XLSX/CSV
            <input type="file" accept=".xls,.xlsx,.csv" onChange={(e) => handleImportExcel(e.target.files?.[0])} />
            {importing ? <small>Importando...</small> : null}
          </label>
          {previewRows.length > 0 && (
            <div className="wizard-preview">
              <h4>Pré-visualização: {previewFileName}</h4>
              <div className="preview-mapping">
                <p>Mapear colunas:</p>
                <div className="form-grid">
                  <label className="field">
                    Departamento
                    <select
                      value={previewMapping.department || ""}
                      onChange={(e) => setPreviewMapping({ ...previewMapping, department: e.target.value || undefined })}
                    >
                      <option value="">(auto)</option>
                      {Object.keys(previewRows[0] || {}).map((key) => (
                        <option key={key} value={key}>
                          {key}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    Setor
                    <select
                      value={previewMapping.sector || ""}
                      onChange={(e) => setPreviewMapping({ ...previewMapping, sector: e.target.value || undefined })}
                    >
                      <option value="">(auto)</option>
                      {Object.keys(previewRows[0] || {}).map((key) => (
                        <option key={key} value={key}>
                          {key}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    Subsetor
                    <select
                      value={previewMapping.subsector || ""}
                      onChange={(e) => setPreviewMapping({ ...previewMapping, subsector: e.target.value || undefined })}
                    >
                      <option value="">(auto)</option>
                      {Object.keys(previewRows[0] || {}).map((key) => (
                        <option key={key} value={key}>
                          {key}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      {Object.keys(previewRows[0] || {}).map((key) => (
                        <th key={key}>{key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.slice(0, 50).map((row, idx) => (
                      <tr key={idx}>
                        {Object.keys(previewRows[0] || {}).map((key) => (
                          <td key={key + idx}>{row[key] ?? ""}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

                  <div className="preview-actions">
                <button className="btn btn-primary" type="button" onClick={() => applyImportedRows(previewRows)}>
                  Confirmar importação
                </button>

                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => {
                    setPreviewRows([]);
                    setPreviewFileName("");
                  }}
                >
                  Cancelar pré-visualização
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {wizardStep === 1 && (
        <div className="wizard-body">
          <div className="wizard-title-row">
            <h3>Cadastrar ou selecionar departamentos</h3>
            <button className="btn btn-secondary" type="button" onClick={addWizardDepartment}>
              <Plus size={14} /> Adicionar departamento
            </button>
          </div>

          {wizardDepartments.map((department, index) => (
            <div className="wizard-card" key={department.id}>
              <div className="wizard-card-header">
                <strong>Departamento {index + 1}</strong>
                {wizardDepartments.length > 1 && (
                  <button className="btn btn-secondary" type="button" onClick={() => removeWizardDepartment(department.id)}>
                    <Trash2 size={14} /> Remover
                  </button>
                )}
              </div>

              <div className="form-grid">
                <label className="field is-wide-field">
                  Selecionar departamento existente
                  <select
                    value={department.existingDepartmentId}
                    onChange={(event) => {
                      updateWizardDepartment(department.id, "existingDepartmentId", event.target.value);
                      if (event.target.value) updateWizardDepartment(department.id, "name", "");
                    }}
                  >
                    <option value="">Criar novo departamento</option>
                    {departmentsForStructureCompany(wizardCompanyId || selectedCompanyId)
                      .map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                  </select>
                </label>

                <label className="field">
                  Nome do departamento
                  <input
                    disabled={Boolean(department.existingDepartmentId)}
                    value={department.name}
                    onChange={(event) => updateWizardDepartment(department.id, "name", event.target.value)}
                  />
                </label>

                <label className="field">
                  Administrador/Gerente
                  <WizardEmployeeSelect
                    disabled={Boolean(department.existingDepartmentId)}
                    value={department.managerEmployeeId}
                    onChange={(value) => {
                      updateWizardDepartment(department.id, "managerEmployeeId", value);
                      updateWizardDepartment(department.id, "managerName", value ? employeeName(value) : "");
                    }}
                  />
                </label>

                <label className="field is-wide-field">
                  Descrição
                  <input
                    disabled={Boolean(department.existingDepartmentId)}
                    value={department.description}
                    onChange={(event) => updateWizardDepartment(department.id, "description", event.target.value)}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      )}

      {wizardStep === 2 && (
        <div className="wizard-body">
          <div className="wizard-title-row">
            <h3>Cadastrar ou selecionar setores</h3>
            <button className="btn btn-secondary" type="button" onClick={addWizardSector}>
              <Plus size={14} /> Adicionar setor
            </button>
          </div>

          {wizardSectors.map((sector, index) => (
            <div className="wizard-card" key={sector.id}>
              <div className="wizard-card-header">
                <strong>Setor {index + 1}</strong>

                {wizardSectors.length > 1 && (
                  <button className="btn btn-secondary" type="button" onClick={() => removeWizardSector(sector.id)}>
                    <Trash2 size={14} /> Remover
                  </button>
                )}
              </div>

              <div className="form-grid">
                <label className="field">
                  Departamento
                  <select
                    required
                    value={sector.departmentId}
                    onChange={(event) => updateWizardSector(sector.id, "departmentId", event.target.value)}
                  >
                    <option value="">Selecione</option>
                    {getWizardDepartmentSelectOptions().map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>

                <label className="field is-wide-field">
                  Selecionar setor existente
                  <select
                    value={sector.existingSectorId}
                    onChange={(event) => {
                      updateWizardSector(sector.id, "existingSectorId", event.target.value);
                      if (event.target.value) {
                        const selected = data.sectors.find((item) => item.id === event.target.value);
                        updateWizardSector(sector.id, "departmentId", selected?.departmentId || sector.departmentId);
                        updateWizardSector(sector.id, "name", "");
                      }
                    }}
                  >
                    <option value="">Criar novo setor</option>
                    {sectorsForStructureCompany(wizardCompanyId || selectedCompanyId)
                      .filter((item) => !sector.departmentId || item.departmentId === sector.departmentId)
                      .map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                  </select>
                </label>

                <label className="field">
                  Nome do setor
                  <input
                    disabled={Boolean(sector.existingSectorId)}
                    value={sector.name}
                    onChange={(event) => updateWizardSector(sector.id, "name", event.target.value)}
                  />
                </label>

                <label className="field">
                  Coordenador
                  <WizardEmployeeSelect
                    disabled={Boolean(sector.existingSectorId)}
                    value={sector.coordinatorEmployeeId}
                    onChange={(value) => {
                      updateWizardSector(sector.id, "coordinatorEmployeeId", value);
                      updateWizardSector(sector.id, "coordinatorName", value ? employeeName(value) : "");
                    }}
                  />
                </label>

                <label className="field">
                  Líder
                  <WizardEmployeeSelect
                    disabled={Boolean(sector.existingSectorId)}
                    value={sector.leaderEmployeeId}
                    onChange={(value) => {
                      updateWizardSector(sector.id, "leaderEmployeeId", value);
                      updateWizardSector(sector.id, "leaderName", value ? employeeName(value) : "");
                    }}
                  />
                </label>

                <label className="field">
                  Centro de custo
                  <input
                    disabled={Boolean(sector.existingSectorId)}
                    value={sector.costCenter}
                    onChange={(event) => updateWizardSector(sector.id, "costCenter", event.target.value)}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      )}

      {wizardStep === 3 && (
        <div className="wizard-body">
          <h3>Cadastrar ou selecionar subsetores</h3>
          <p className="page-subtitle">Esta etapa é opcional. Você pode avançar sem cadastrar subsetores.</p>

          {wizardSectors
            .filter((sector) => sector.existingSectorId || sector.name.trim())
            .map((sector) => (
              <div className="wizard-card" key={sector.id}>
                <div className="wizard-card-header">
                  <strong>{sector.existingSectorId ? resolveWizardSectorLabel(sector.existingSectorId) : sector.name}</strong>
                  <button className="btn btn-secondary" type="button" onClick={() => addWizardSubsector(sector.id)}>
                    <Plus size={14} /> Adicionar subsetor
                  </button>
                </div>

                {!sector.subsectors.length && <p className="page-subtitle">Nenhum subsetor para este setor.</p>}

                {sector.subsectors.map((subsector) => (
                  <div className="form-grid wizard-inline-grid" key={subsector.id}>
                    <label className="field">
                      Selecionar subsetor existente
                      <select
                        value={subsector.existingSubsectorId}
                        onChange={(event) => {
                          updateWizardSubsector(sector.id, subsector.id, "existingSubsectorId", event.target.value);
                          if (event.target.value) updateWizardSubsector(sector.id, subsector.id, "name", "");
                        }}
                      >
                        <option value="">Criar novo subsetor</option>
                        {subsectorsForStructureCompany(wizardCompanyId || selectedCompanyId)
                          .filter((item) => !sector.existingSectorId || item.sectorId === sector.existingSectorId)
                          .map((item) => (
                            <option key={item.id} value={item.id}>{item.name}</option>
                          ))}
                      </select>
                    </label>

                    <label className="field">
                      Nome do subsetor
                      <input
                        disabled={Boolean(subsector.existingSubsectorId)}
                        value={subsector.name}
                        onChange={(event) =>
                          updateWizardSubsector(sector.id, subsector.id, "name", event.target.value)
                        }
                      />
                    </label>

                    <label className="field">
                      Líder
                      <WizardEmployeeSelect
                        disabled={Boolean(subsector.existingSubsectorId)}
                        value={subsector.leaderEmployeeId}
                        onChange={(value) => {
                          updateWizardSubsector(sector.id, subsector.id, "leaderEmployeeId", value);
                          updateWizardSubsector(sector.id, subsector.id, "leaderName", value ? employeeName(value) : "");
                        }}
                      />
                    </label>

                    <button
                      className="btn btn-secondary wizard-remove-button"
                      type="button"
                      onClick={() => removeWizardSubsector(sector.id, subsector.id)}
                    >
                      <Trash2 size={14} /> Remover
                    </button>
                  </div>
                ))}
              </div>
            ))}
        </div>
      )}

      {wizardStep === 4 && (
        <div className="wizard-body">
          <div className="wizard-title-row">
            <h3>Criar equipes da empresa</h3>
            <button className="btn btn-secondary" type="button" onClick={addWizardTeam}>
              <Plus size={14} /> Adicionar equipe
            </button>
          </div>

          <p className="page-subtitle">
            As equipes criadas aqui ficam salvas na coleção teams do Firestore e aparecem depois no cadastro do funcionário, no campo Equipe.
          </p>

          {wizardTeams.map((team, index) => (
            <div className="wizard-card" key={team.id}>
              <div className="wizard-card-header">
                <strong>Equipe {index + 1}</strong>
                {wizardTeams.length > 1 && (
                  <button className="btn btn-secondary" type="button" onClick={() => removeWizardTeam(team.id)}>
                    <Trash2 size={14} /> Remover
                  </button>
                )}
              </div>

              <div className="form-grid">
                <label className="field is-wide-field">
                  Selecionar equipe existente
                  <select
                    value={team.existingTeamId}
                    onChange={(event) => {
                      updateWizardTeam(team.id, "existingTeamId", event.target.value);
                      if (event.target.value) updateWizardTeam(team.id, "name", "");
                    }}
                  >
                    <option value="">Criar nova equipe</option>
                    {teamsForStructureCompany(wizardCompanyId || selectedCompanyId)
                      .map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                  </select>
                </label>

                <label className="field">
                  Nome da equipe
                  <input
                    value={team.name}
                    disabled={Boolean(team.existingTeamId)}
                    onChange={(event) => updateWizardTeam(team.id, "name", event.target.value)}
                    placeholder="Ex.: Equipe de Campo 01"
                  />
                </label>

                <label className="field is-wide-field">
                  Descrição
                  <input
                    value={team.description}
                    disabled={Boolean(team.existingTeamId)}
                    onChange={(event) => updateWizardTeam(team.id, "description", event.target.value)}
                    placeholder="Ex.: Equipe responsável pela obra, frente ou turno"
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      )}

      {wizardStep === 5 && (
        <div className="wizard-body">
          <div className="wizard-title-row">
            <div>
              <h3>Relacionar funcionário à liderança</h3>
              <p className="page-subtitle">Opcional. Você pode finalizar sem relacionar ninguém.</p>
            </div>

            <button className="btn btn-secondary" type="button" onClick={addWizardLeadership}>
              <Users size={14} /> Adicionar relação
            </button>
          </div>

          {!wizardLeaderships.length && (
            <p className="page-subtitle">Nenhuma liderança relacionada. Clique em finalizar para pular esta etapa.</p>
          )}

          {wizardLeaderships.map((leadership) => {
            const departmentOptions = [
              ...departmentsForStructureCompany(wizardCompanyId || selectedCompanyId),
              ...wizardDepartments
                .filter((department) => !department.existingDepartmentId && department.name.trim())
                .map((department) => ({ ...department, name: `Novo: ${department.name}` })),
            ];

            const sectorOptions = [
              ...sectorsForStructureCompany(wizardCompanyId || selectedCompanyId),
              ...wizardSectors
                .filter((sector) => !sector.existingSectorId && sector.name.trim())
                .map((sector) => ({ ...sector, name: `Novo: ${sector.name}` })),
            ];

            const subsectorOptions = [
              ...subsectorsForStructureCompany(wizardCompanyId || selectedCompanyId),
              ...wizardSectors.flatMap((sector) =>
                sector.subsectors
                  .filter((subsector) => !subsector.existingSubsectorId && subsector.name.trim())
                  .map((subsector) => ({ ...subsector, name: `Novo: ${subsector.name}` })),
              ),
            ];

            const targetOptions = leadership.targetType === "department"
              ? departmentOptions
              : leadership.targetType === "sector"
                ? sectorOptions
                : subsectorOptions;

            return (
              <div className="wizard-card" key={leadership.id}>
                <div className="form-grid">
                  <label className="field">
                    Funcionário
                    <select
                      value={leadership.employeeId}
                      onChange={(event) => updateWizardLeadership(leadership.id, "employeeId", event.target.value)}
                    >
                      <option value="">Selecione</option>
                      {wizardCompanyEmployees
                        .map((employee) => (
                          <option key={employee.id} value={employee.id}>
                            {employee.name}
                          </option>
                        ))}
                    </select>
                  </label>

                  <label className="field">
                    Tipo de vínculo / liderança
                    <input
                      list="leadership-role-options"
                      value={leadership.role}
                      onChange={(event) => updateWizardLeadership(leadership.id, "role", event.target.value)}
                      placeholder="Ex.: Líder, Coordenador, Responsável"
                    />
                    <datalist id="leadership-role-options">
                      <option value="Coordenador" />
                      <option value="Líder" />
                      <option value="Gerente" />
                      <option value="Administrador" />
                      <option value="Responsável técnico" />
                    </datalist>
                  </label>

                  <label className="field">
                    Selecionar tipo de vínculo
                    <select
                      value={leadership.targetType}
                      onChange={(event) => {
                        updateWizardLeadership(leadership.id, "targetType", event.target.value);
                        updateWizardLeadership(leadership.id, "targetId", "");
                      }}
                    >
                      <option value="department">Departamento</option>
                      <option value="sector">Setor</option>
                      <option value="subsector">Subsetor</option>
                    </select>
                  </label>

                  <label className="field">
                    Departamento, setor ou subsetor
                    <select
                      value={leadership.targetId}
                      onChange={(event) => updateWizardLeadership(leadership.id, "targetId", event.target.value)}
                    >
                      <option value="">Selecione</option>
                      {targetOptions.map((target: any) => (
                        <option key={target.id} value={target.id}>
                          {target.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <button className="btn btn-secondary" type="button" onClick={() => removeWizardLeadership(leadership.id)}>
                  <Trash2 size={14} /> Remover relação
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="wizard-footer">
        <button
          className="btn btn-secondary"
          type="button"
          disabled={wizardStep === 0}
          onClick={() => setWizardStep((current) => Math.max(0, current - 1) as WizardStep)}
        >
          <ChevronLeft size={14} /> Voltar
        </button>

        {wizardStep < 5 ? (
          <button
            className="btn btn-primary"
            type="button"
            disabled={!canAdvanceWizard()}
            onClick={() => setWizardStep((current) => Math.min(5, current + 1) as WizardStep)}
          >
            Avançar <ChevronRight size={14} />
          </button>
        ) : (
          <button className="btn btn-primary" type="button" onClick={finishStructureWizard}>
            Finalizar estrutura
          </button>
        )}
      </div>
    </div>
  </ModalPortal>
)}

{structureCompanyId && (
  <ModalPortal className="modal-backdrop">
    <div className="structure-modal">
      <div className="modal-header">
        <div>
          <h2>Estrutura da empresa</h2>
          <p>{data.companies.find((company) => company.id === structureCompanyId)?.name}</p>
        </div>

        <button className="icon-button" type="button" onClick={closeCompanyStructure} aria-label="Fechar estrutura" title="Fechar estrutura">
          <X size={18} />
        </button>
      </div>

      <div className="structure-tree">
        {departmentsForStructureCompany(structureCompanyId)
          .map((department) => {
            const departmentEmployees = employeesForStructureCompany(structureCompanyId)
              .filter((employee) => employee.departmentId === department.id);

            return (
              <div className="structure-block" key={department.id}>
                <strong>Departamento: {department.name}</strong>
                {(department as any).managerName && <div className="tree-node">Administrador/Gerente: {(department as any).managerName}</div>}

                {Array.isArray((department as any).leadershipAssignments) &&
                  (department as any).leadershipAssignments.map((leadership: any, index: number) => (
                    <div className="tree-node" key={`${department.id}-leader-${index}`}>
                      {leadership.role}: {leadership.employeeName}
                    </div>
                  ))}

                {departmentEmployees.length > 0 && (
                  <div className="tree-node">
                    Funcionários no departamento:
                    {departmentEmployees.map((employee) => (
                      <div className="tree-node" key={employee.id}>
                        ↳ {employee.name} - {employee.role || "Sem cargo"}
                      </div>
                    ))}
                  </div>
                )}

                {sectorsForStructureCompany(structureCompanyId)
                  .filter((sector) => sector.departmentId === department.id)
                  .map((sector: any) => {
                    const sectorEmployees = employeesForStructureCompany(structureCompanyId)
                      .filter((employee) => employee.sectorId === sector.id);

                    return (
                      <div className="tree-node" key={sector.id}>
                        <strong>↳ Setor: {sector.name}</strong>
                        {sector.coordinatorName && <div className="tree-node">Coordenador: {sector.coordinatorName}</div>}
                        {sector.leaderName && <div className="tree-node">Líder: {sector.leaderName}</div>}

                        {Array.isArray(sector.leadershipAssignments) &&
                          sector.leadershipAssignments.map((leadership: any, index: number) => (
                            <div className="tree-node" key={`${sector.id}-leader-${index}`}>
                              {leadership.role}: {leadership.employeeName}
                            </div>
                          ))}

                        {sectorEmployees.map((employee) => (
                          <div className="tree-node" key={employee.id}>
                            Funcionário: {employee.name} - {employee.role || "Sem cargo"}
                          </div>
                        ))}

                        {subsectorsForStructureCompany(structureCompanyId)
                          .filter((subsector) => subsector.sectorId === sector.id)
                          .map((subsector: any) => {
                            const subsectorEmployees = employeesForStructureCompany(structureCompanyId)
                              .filter((employee: any) => employee.subsectorId === subsector.id);

                            return (
                              <div className="tree-node" key={subsector.id}>
                                <strong>↳ Subsetor: {subsector.name}</strong>
                                {subsector.leaderName && (
                                  <div className="tree-node">Líder: {subsector.leaderName}</div>
                                )}

                                {Array.isArray(subsector.leadershipAssignments) &&
                                  subsector.leadershipAssignments.map((leadership: any, index: number) => (
                                    <div className="tree-node" key={`${subsector.id}-leader-${index}`}>
                                      {leadership.role}: {leadership.employeeName}
                                    </div>
                                  ))}

                                {subsectorEmployees.map((employee: any) => (
                                  <div className="tree-node" key={employee.id}>
                                    Funcionário: {employee.name} - {employee.role || "Sem cargo"}
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                      </div>
                    );
                  })}
              </div>
            );
          })}

        {employeesForStructureCompany(structureCompanyId).length === 0 && (
          <p className="page-subtitle">Nenhum funcionário vinculado a esta empresa.</p>
        )}
      </div>
    </div>
  </ModalPortal>
)}
    </section>
  );
}

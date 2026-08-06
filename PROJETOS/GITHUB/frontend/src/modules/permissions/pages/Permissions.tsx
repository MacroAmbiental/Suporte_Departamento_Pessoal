import { ChevronLeft, ChevronRight, KeyRound, Layers3, Pencil, Power, Save, ShieldCheck, Trash2, UserPlus, X } from "lucide-react";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { useAuth } from "@/hooks/useAuth";
import useCreateShortcut from "@/hooks/useCreateShortcut";
import { useDomainData } from "@/hooks/useDomainData";
import ConfirmModal from "@/common/components/ConfirmModal";
import type { DeleteImpact } from "@/common/components/DeleteImpactModal";
import { buildDomainDeletionImpact } from "@/common/utils/deletionImpact";
import { createUsernameFromName, hashPassword, isSystemTiUser, normalizeUsername, permissionActions, systemScreens } from "@/services/accessControl";
import type {
  AppScreen,
  Employee,
  PermissionAction,
  PermissionProfile,
  PermissionProfileTarget,
  PermissionProfileTargetType,
} from "@/types/domain";

type PermissionMatrix = Record<AppScreen, PermissionAction[]>;
type PermissionProfilePayload = Omit<PermissionProfile, "id"> & { id?: string };
type WizardTargetType = Exclude<PermissionProfileTargetType, "company">;
type SelectOption = { value: string; label: string };

const targetLabels: Record<PermissionProfileTargetType, string> = {
  employee: "Funcionário",
  company: "Empresa",
  department: "Departamento",
  sector: "Setor",
  subsector: "Subsetor",
  position: "Cargo",
  role: "Função",
};

const wizardTargetLabels: Record<WizardTargetType, string> = {
  department: "Departamento",
  sector: "Setor",
  subsector: "Subsetor",
  position: "Cargo",
  role: "Função",
  employee: "Funcionário específico",
};

function emptyMatrix(): PermissionMatrix {
  return systemScreens.reduce((matrix, screen) => {
    matrix[screen.key] = [];
    return matrix;
  }, {} as PermissionMatrix);
}

function fullMatrix(): PermissionMatrix {
  const allActions = permissionActions.map((action) => action.key);

  return systemScreens.reduce((matrix, screen) => {
    matrix[screen.key] = allActions;
    return matrix;
  }, {} as PermissionMatrix);
}

function profileToMatrix(profile?: PermissionProfile): PermissionMatrix {
  return { ...emptyMatrix(), ...(profile?.permissions || {}) };
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isLeadershipRole(role: string) {
  const normalized = normalizeText(role);
  return normalized.includes("gerente")
    || normalized.includes("coordenador")
    || normalized.includes("lider");
}

function targetMatches(employee: Employee, target: PermissionProfileTarget) {
  if (target.type === "employee") return employee.id === target.value;
  if (target.type === "company") return employee.companyId === target.value;
  if (target.type === "department") return employee.departmentId === target.value;
  if (target.type === "sector") return employee.sectorId === target.value;
  if (target.type === "subsector") return employee.subsectorId === target.value;
  if (target.type === "position") return employee.position === target.value;
  if (target.type === "role") return employee.role === target.value;
  return false;
}

function employeeMatchesProfile(employee: Employee, targets: PermissionProfileTarget[]) {
  const companyTargets = targets.filter((target) => target.type === "company");
  const relationTargets = targets.filter((target) => target.type !== "company");
  const companyMatches = !companyTargets.length || companyTargets.some((target) => targetMatches(employee, target));
  const relationMatches = !relationTargets.length || relationTargets.some((target) => targetMatches(employee, target));

  return companyMatches && relationMatches;
}

function toggleMatrixValue(matrix: PermissionMatrix, screen: AppScreen, action: PermissionAction): PermissionMatrix {
  const actions = new Set(matrix[screen] || []);

  if (actions.has(action)) {
    actions.delete(action);
    if (action === "view") actions.clear();
  } else {
    actions.add(action);
    if (action !== "view") actions.add("view");
  }

  return { ...matrix, [screen]: Array.from(actions) };
}

function PermissionMatrixTable({
  canToggle,
  disabled,
  matrix,
  onToggle,
}: {
  canToggle?: (screen: AppScreen, action: PermissionAction) => boolean;
  disabled: boolean;
  matrix: PermissionMatrix;
  onToggle: (screen: AppScreen, action: PermissionAction) => void;
}) {
  return (
    <div className="permission-table-wrap">
      <table className="data-table permission-table">
        <thead>
          <tr>
            <th>Tela</th>
            {permissionActions.map((action) => (
              <th key={action.key}>{action.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {systemScreens.map((screen) => (
            <tr key={screen.key}>
              <td className="strong-cell">{screen.label}</td>
              {permissionActions.map((action) => {
                const checked = (matrix[screen.key] || []).includes(action.key);

                return (
                  <td key={action.key}>
                    <button
                      aria-label={`${action.label} ${screen.label}`}
                      className={`permission-check ${checked ? "is-checked" : ""}`}
                      disabled={disabled || !(canToggle?.(screen.key, action.key) ?? true)}
                      type="button"
                      onClick={() => onToggle(screen.key, action.key)}
                    >
                      {checked ? "✓" : ""}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Permissions() {
  const data = useDomainData();
  const { can, user } = useAuth();
  const canManage = can("permissions", "manage");
  const canUseTiTools = isSystemTiUser(user);
  const canCreateProfiles = can("permissions", "create");
  const canEditProfiles = can("permissions", "edit");
  const canDeleteProfiles = can("permissions", "delete");
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [matrix, setMatrix] = useState<PermissionMatrix>(() => emptyMatrix());
  const [message, setMessage] = useState("");
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; confirmLabel: string; impact?: DeleteImpact; onConfirm: () => Promise<void> } | null>(null);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [adminStep, setAdminStep] = useState<"key" | "form">("key");
  const [adminAccessKey, setAdminAccessKey] = useState("");
  const [validatedAccessKeyId, setValidatedAccessKeyId] = useState("");
  const [adminForm, setAdminForm] = useState({ name: "", username: "", password: "" });
  const [adminError, setAdminError] = useState("");
  const [adminSaving, setAdminSaving] = useState(false);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [editingProfileId, setEditingProfileId] = useState("");
  const [wizardName, setWizardName] = useState("");
  const [wizardCompanyId, setWizardCompanyId] = useState("");
  const [wizardDescription, setWizardDescription] = useState("");
  const [wizardActive, setWizardActive] = useState(true);
  const [wizardTargetType, setWizardTargetType] = useState<WizardTargetType>("department");
  const [wizardTargetValue, setWizardTargetValue] = useState("");
  const [wizardMatrix, setWizardMatrix] = useState<PermissionMatrix>(() => emptyMatrix());

  const delegatedScope = useMemo(() => {
    const employeeIds = new Set<string>();
    const companyIds = new Set<string>();
    const departmentIds = new Set<string>();
    const sectorIds = new Set<string>();
    const subsectorIds = new Set<string>();
    const teamIds = new Set<string>();
    const currentEmployeeId = user?.employeeId || "";
    const currentEmployee = currentEmployeeId ? data.employees.find((employee) => employee.id === currentEmployeeId) : undefined;

    function addEmployee(employee: Employee | undefined) {
      if (!employee || employee.id === currentEmployeeId) return;
      employeeIds.add(employee.id);
      if (employee.companyId) companyIds.add(employee.companyId);
      if (employee.departmentId) departmentIds.add(employee.departmentId);
      if (employee.sectorId) sectorIds.add(employee.sectorId);
      if (employee.subsectorId) subsectorIds.add(employee.subsectorId);
      if (employee.teamId) teamIds.add(employee.teamId);
    }

    function addEmployees(predicate: (employee: Employee) => boolean) {
      data.employees.filter(predicate).forEach(addEmployee);
    }

    function descendantNodeIds(nodeId: string) {
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

      return ids;
    }

    if (!currentEmployeeId) {
      return { employeeIds, companyIds, departmentIds, sectorIds, subsectorIds, teamIds };
    }

    data.departments.forEach((department) => {
      const leadershipAssignments = Array.isArray((department as any).leadershipAssignments)
        ? (department as any).leadershipAssignments
        : [];
      const isLeader = department.managerEmployeeId === currentEmployeeId
        || leadershipAssignments.some((assignment: any) => assignment.employeeId === currentEmployeeId && isLeadershipRole(String(assignment.role || "")));

      if (!isLeader) return;
      addEmployees((employee) => employee.departmentId === department.id);
    });

    data.sectors.forEach((sector) => {
      const leadershipAssignments = Array.isArray((sector as any).leadershipAssignments)
        ? (sector as any).leadershipAssignments
        : [];
      const isLeader = sector.coordinatorEmployeeId === currentEmployeeId
        || sector.leaderEmployeeId === currentEmployeeId
        || leadershipAssignments.some((assignment: any) => assignment.employeeId === currentEmployeeId && isLeadershipRole(String(assignment.role || "")));

      if (!isLeader) return;
      addEmployees((employee) => employee.sectorId === sector.id);
    });

    data.subsectors.forEach((subsector) => {
      const leadershipAssignments = Array.isArray((subsector as any).leadershipAssignments)
        ? (subsector as any).leadershipAssignments
        : [];
      const isLeader = subsector.leaderEmployeeId === currentEmployeeId
        || leadershipAssignments.some((assignment: any) => assignment.employeeId === currentEmployeeId && isLeadershipRole(String(assignment.role || "")));

      if (!isLeader) return;
      addEmployees((employee) => employee.subsectorId === subsector.id);
    });

    data.employee_assignments
      .filter((assignment) => assignment.employeeId === currentEmployeeId && isLeadershipRole(assignment.role))
      .forEach((assignment) => {
        const node = data.organizational_nodes.find((item) => item.id === assignment.nodeId);
        if (!node) return;

        const nodeIds = descendantNodeIds(node.id);
        data.employee_assignments
          .filter((item) => nodeIds.has(item.nodeId))
          .forEach((item) => addEmployee(data.employees.find((employee) => employee.id === item.employeeId)));

        if (node.tipo === "empresa") addEmployees((employee) => employee.companyId === node.companyId);
        if (node.tipo === "departamento") addEmployees((employee) => employee.departmentId === node.id);
        if (node.tipo === "setor") addEmployees((employee) => employee.sectorId === node.id);
        if (node.tipo === "subsetor") addEmployees((employee) => employee.subsectorId === node.id);
        if (node.tipo === "equipe") addEmployees((employee) => employee.teamId === node.id);
      });

    if (currentEmployee?.isTeamLead && currentEmployee.teamId) {
      addEmployees((employee) => employee.teamId === currentEmployee.teamId);
    }

    return { employeeIds, companyIds, departmentIds, sectorIds, subsectorIds, teamIds };
  }, [data.departments, data.employee_assignments, data.employees, data.organizational_nodes, data.sectors, data.subsectors, user?.employeeId]);

  const scopedEmployees = useMemo(() => (
    canUseTiTools
      ? data.employees
      : data.employees.filter((employee) => delegatedScope.employeeIds.has(employee.id))
  ), [canUseTiTools, data.employees, delegatedScope.employeeIds]);

  const allTargetOptions = useMemo<Record<PermissionProfileTargetType, SelectOption[]>>(() => {
    const employees = canUseTiTools ? data.employees : scopedEmployees;
    const companyIds = new Set(employees.map((employee) => employee.companyId));
    const departmentIds = new Set(employees.map((employee) => employee.departmentId));
    const sectorIds = new Set(employees.map((employee) => employee.sectorId));
    const subsectorIds = new Set(employees.map((employee) => employee.subsectorId).filter(Boolean));
    const roles = uniqueStrings(employees.map((employee) => employee.role));
    const positions = uniqueStrings(employees.map((employee) => employee.position));

    return {
      employee: employees.map((employee) => ({ value: employee.id, label: employee.name })),
      company: data.companies.filter((company) => companyIds.has(company.id)).map((company) => ({ value: company.id, label: company.name })),
      department: data.departments.filter((department) => departmentIds.has(department.id)).map((department) => ({ value: department.id, label: department.name })),
      sector: data.sectors.filter((sector) => sectorIds.has(sector.id)).map((sector) => ({ value: sector.id, label: sector.name })),
      subsector: data.subsectors.filter((subsector) => subsectorIds.has(subsector.id)).map((subsector) => ({ value: subsector.id, label: subsector.name })),
      position: positions.map((position) => ({ value: position, label: position })),
      role: roles.map((role) => ({ value: role, label: role })),
    };
  }, [canUseTiTools, data.companies, data.departments, data.employees, data.sectors, data.subsectors, scopedEmployees]);

  const wizardTargetOptions = useMemo<Record<WizardTargetType, SelectOption[]>>(() => {
    const employees = canUseTiTools ? data.employees : scopedEmployees;
    const companyEmployees = employees.filter((employee) => !wizardCompanyId || employee.companyId === wizardCompanyId);
    const departmentIds = new Set(companyEmployees.map((employee) => employee.departmentId));
    const sectorIds = new Set(companyEmployees.map((employee) => employee.sectorId));
    const subsectorIds = new Set(companyEmployees.map((employee) => employee.subsectorId).filter(Boolean));
    const roles = uniqueStrings(companyEmployees.map((employee) => employee.role));
    const positions = uniqueStrings(companyEmployees.map((employee) => employee.position));

    return {
      department: data.departments
        .filter((department) => departmentIds.has(department.id) && (!wizardCompanyId || department.companyId === wizardCompanyId))
        .map((department) => ({ value: department.id, label: department.name })),
      sector: data.sectors
        .filter((sector) => sectorIds.has(sector.id) && (!wizardCompanyId || sector.companyId === wizardCompanyId))
        .map((sector) => ({ value: sector.id, label: sector.name })),
      subsector: data.subsectors
        .filter((subsector) => subsectorIds.has(subsector.id) && (!wizardCompanyId || subsector.companyId === wizardCompanyId))
        .map((subsector) => ({ value: subsector.id, label: subsector.name })),
      position: positions.map((position) => ({ value: position, label: position })),
      role: roles.map((role) => ({ value: role, label: role })),
      employee: companyEmployees.map((employee) => ({ value: employee.id, label: employee.name })),
    };
  }, [canUseTiTools, data.departments, data.employees, data.sectors, data.subsectors, scopedEmployees, wizardCompanyId]);

  function canGrantAction(screen: AppScreen, action: PermissionAction) {
    return canUseTiTools || can(screen, action);
  }

  function grantableMatrix(): PermissionMatrix {
    return systemScreens.reduce((nextMatrix, screen) => {
      nextMatrix[screen.key] = permissionActions
        .map((action) => action.key)
        .filter((action) => canGrantAction(screen.key, action));
      return nextMatrix;
    }, {} as PermissionMatrix);
  }

  function sanitizeMatrix(candidate: PermissionMatrix): PermissionMatrix {
    if (canUseTiTools) return candidate;

    return systemScreens.reduce((nextMatrix, screen) => {
      nextMatrix[screen.key] = (candidate[screen.key] || []).filter((action) => canGrantAction(screen.key, action));
      return nextMatrix;
    }, {} as PermissionMatrix);
  }

  function getProfileCreatorId(profile: PermissionProfile) {
    return (profile as PermissionProfile & { createdByUserId?: string }).createdByUserId;
  }

  function getMatchedEmployees(targets: PermissionProfileTarget[], scopedOnly: boolean) {
    if (!targets.length) return [];

    const matched = data.employees.filter((employee) => employeeMatchesProfile(employee, targets));
    if (canUseTiTools || !scopedOnly) return matched;

    return matched.filter((employee) => delegatedScope.employeeIds.has(employee.id));
  }

  function targetIsInsideScope(target: PermissionProfileTarget, companyId: string) {
    if (canUseTiTools) return true;
    const employees = scopedEmployees.filter((employee) => !companyId || employee.companyId === companyId);

    if (target.type === "company") return delegatedScope.companyIds.has(target.value);
    if (target.type === "employee") return employees.some((employee) => employee.id === target.value);
    if (target.type === "department") return employees.some((employee) => employee.departmentId === target.value);
    if (target.type === "sector") return employees.some((employee) => employee.sectorId === target.value);
    if (target.type === "subsector") return employees.some((employee) => employee.subsectorId === target.value);
    if (target.type === "position") return employees.some((employee) => employee.position === target.value);
    if (target.type === "role") return employees.some((employee) => employee.role === target.value);

    return false;
  }

  function profileTargetsAreInsideScope(targets: PermissionProfileTarget[]) {
    if (canUseTiTools) return true;

    const companyTarget = targets.find((target) => target.type === "company");
    const relationTargets = targets.filter((target) => target.type !== "company");

    if (!companyTarget || !targetIsInsideScope(companyTarget, companyTarget.value)) return false;
    if (!relationTargets.length) return false;
    if (!relationTargets.every((target) => targetIsInsideScope(target, companyTarget.value))) return false;

    return getMatchedEmployees(targets, true).length > 0;
  }

  function profileIsVisible(profile: PermissionProfile) {
    if (canUseTiTools) return true;
    if (getProfileCreatorId(profile) === user?.id) return true;

    const matchedEmployees = getMatchedEmployees(profile.targets, false);
    return matchedEmployees.length > 0 && matchedEmployees.every((employee) => delegatedScope.employeeIds.has(employee.id));
  }

  function profilePermissionsAreGrantable(profile: PermissionProfile) {
    if (canUseTiTools) return true;

    return systemScreens.every((screen) => (
      (profile.permissions[screen.key] || []).every((action) => canGrantAction(screen.key, action))
    ));
  }

  const visibleProfiles = useMemo(
    () => data.permissionProfiles.filter((profile) => profileIsVisible(profile)),
    [canUseTiTools, data.employees, data.permissionProfiles, delegatedScope.employeeIds, scopedEmployees, user?.id],
  );
  const selectedProfile = visibleProfiles.find((profile) => profile.id === selectedProfileId);

  useEffect(() => {
    const current = visibleProfiles.find((profile) => profile.id === selectedProfileId);
    if (current) return;

    const firstProfile = visibleProfiles[0];
    setSelectedProfileId(firstProfile?.id || "");
    setMatrix(profileToMatrix(firstProfile));
  }, [selectedProfileId, visibleProfiles]);

  function selectProfile(profile: PermissionProfile) {
    setSelectedProfileId(profile.id);
    setMatrix(profileToMatrix(profile));
    setMessage("");
  }

  function handleCardKeyDown(event: KeyboardEvent<HTMLDivElement>, profile: PermissionProfile) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    selectProfile(profile);
  }

  function describeTarget(target: PermissionProfileTarget) {
    const option = allTargetOptions[target.type].find((item) => item.value === target.value);
    return `${targetLabels[target.type]}: ${option?.label || target.value}`;
  }

  function profileInitials(profile: PermissionProfile) {
    return profile.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  }
  function canCreateScopedProfile(): boolean {
    return canManage && canCreateProfiles && (canUseTiTools || scopedEmployees.length > 0);
  }

  function canEditProfile(profile: PermissionProfile | undefined): boolean {
    if (!profile) return canCreateScopedProfile();
    if (!canManage || !canEditProfiles) return false;
    return canUseTiTools || (profileIsVisible(profile) && profilePermissionsAreGrantable(profile));
  }

  function canRemoveProfile(profile: PermissionProfile | undefined): boolean {
    if (!profile || !canDeleteProfiles) return false;
    return canUseTiTools || (profileIsVisible(profile) && getProfileCreatorId(profile) === user?.id);
  }

  function showProtectedTiProfileMessage() {
    setMessage("Você não tem permissão para alterar este acesso.");
  }

  function showScopedProfileMessage() {
    setMessage("Acesso fora do seu escopo de liderança.");
  }

  async function saveAndApplyProfile(profile: PermissionProfilePayload) {
    const isEditingProfile = Boolean(profile.id);
    if (!canManage) throw new Error("Você precisa da ação Gerenciar em permissões para aplicar acessos a usuários.");
    if (isEditingProfile && !canEditProfiles) throw new Error("Você não tem permissão para editar acessos.");
    if (!isEditingProfile && !canCreateScopedProfile()) throw new Error("Você não tem permissão para criar acessos neste escopo.");
    if (!profileTargetsAreInsideScope(profile.targets)) {
      throw new Error("Selecione apenas funcionários, cargos, setores ou vínculos dentro do seu escopo de liderança.");
    }

    const sanitizedProfile = {
      ...profile,
      permissions: sanitizeMatrix(profile.permissions as PermissionMatrix),
      createdByUserId: getProfileCreatorId(profile as PermissionProfile) || user?.id,
      updatedByUserId: user?.id,
    };
    const saved = await data.upsertPermissionProfile(sanitizedProfile);
    const matchedEmployees = getMatchedEmployees(saved.targets, true);
    const matchedUsers = data.systemUsers.filter((systemUser) => (
      !systemUser.isAdmin
      && systemUser.id !== user?.id
      && matchedEmployees.some((employee) => employee.id === systemUser.employeeId)
    ));

    await Promise.all(matchedUsers.map((matchedUser) => data.replaceUserPermissions(matchedUser.id, saved.permissions)));

    return { saved, appliedCount: matchedUsers.length };
  }

  function openCreateWizard() {
    if (!canCreateScopedProfile()) {
      showScopedProfileMessage();
      return;
    }

    setEditingProfileId("");
    setWizardName("");
    setWizardCompanyId(allTargetOptions.company[0]?.value || "");
    setWizardDescription("");
    setWizardActive(true);
    setWizardTargetType("department");
    setWizardTargetValue("");
    setWizardMatrix(emptyMatrix());
    setWizardStep(1);
    setMessage("");
    setWizardOpen(true);
  }

  function openEditWizard(profile: PermissionProfile) {
    if (!canEditProfile(profile)) {
      showProtectedTiProfileMessage();
      return;
    }

    const companyTarget = profile.targets.find((target) => target.type === "company");
    const relationTarget = profile.targets.find((target) => target.type !== "company");

    setEditingProfileId(profile.id);
    setWizardName(profile.name);
    setWizardCompanyId(companyTarget?.value || allTargetOptions.company[0]?.value || "");
    setWizardDescription(profile.description || "");
    setWizardActive(profile.active);
    setWizardTargetType((relationTarget?.type as WizardTargetType | undefined) || "department");
    setWizardTargetValue(relationTarget?.value || "");
    setWizardMatrix(profileToMatrix(profile));
    setWizardStep(1);
    setMessage("");
    setWizardOpen(true);
  }

  async function saveWizardProfile() {
    if (!wizardName.trim() || !wizardCompanyId) return;

    const now = new Date().toISOString();
    const existingProfile = data.permissionProfiles.find((profile) => profile.id === editingProfileId);
    const targets: PermissionProfileTarget[] = [
      { type: "company", value: wizardCompanyId },
    ];
    if (wizardTargetValue) targets.push({ type: wizardTargetType, value: wizardTargetValue });
    try {
      const { saved, appliedCount } = await saveAndApplyProfile({
        id: editingProfileId || undefined,
        name: wizardName.trim(),
        description: wizardDescription,
        permissions: wizardMatrix,
        targets,
        active: wizardActive,
        createdByUserId: existingProfile ? getProfileCreatorId(existingProfile) : user?.id,
        createdAt: existingProfile?.createdAt || now,
        updatedAt: now,
      });

      setSelectedProfileId(saved.id);
      setMatrix(profileToMatrix(saved));
      setWizardOpen(false);
      setMessage(appliedCount ? `Acesso salvo e aplicado a ${appliedCount} login(s).` : "Acesso salvo.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar o acesso.");
    }
  }

  async function saveSelectedMatrix() {
    if (!selectedProfile) return;
    if (!canEditProfile(selectedProfile)) {
      showProtectedTiProfileMessage();
      return;
    }

    try {
      const { saved, appliedCount } = await saveAndApplyProfile({
        ...selectedProfile,
        permissions: matrix,
        updatedByUserId: user?.id,
        updatedAt: new Date().toISOString(),
      });

      setSelectedProfileId(saved.id);
      setMessage(appliedCount ? `Acessos atualizados e aplicados a ${appliedCount} login(s).` : "Acessos atualizados.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar as alterações.");
    }
  }

  function toggleProfile(profile: PermissionProfile) {
    if (!canEditProfile(profile)) {
      showProtectedTiProfileMessage();
      return;
    }

    setConfirmState({
      title: profile.active ? "Desativar acesso" : "Ativar acesso",
      description: `Deseja ${profile.active ? "desativar" : "ativar"} o acesso ${profile.name}?`,
      confirmLabel: profile.active ? "Desativar" : "Ativar",
      onConfirm: async () => {
        await data.upsertPermissionProfile({ ...profile, active: !profile.active, updatedAt: new Date().toISOString() });
        if (selectedProfileId === profile.id) setMessage(profile.active ? "Acesso desativado." : "Acesso ativado.");
      },
    });
  }

  function deleteProfile(profile: PermissionProfile) {
    if (!canRemoveProfile(profile)) {
      showProtectedTiProfileMessage();
      return;
    }

    setConfirmState({
      title: "Excluir acesso",
      description: `Deseja excluir o acesso ${profile.name}?`,
      confirmLabel: "Excluir",
      impact: buildDomainDeletionImpact(data, "permissionProfiles", profile.id, profile.name),
      onConfirm: async () => {
        const deleted = await data.removeItem("permissionProfiles", profile.id);
        if (!deleted) return;

        if (selectedProfileId === profile.id) {
          const nextProfile = visibleProfiles.find((item) => item.id !== profile.id);
          setSelectedProfileId(nextProfile?.id || "");
          setMatrix(profileToMatrix(nextProfile));
        }
      },
    });
  }

  async function confirmAction() {
    const action = confirmState;
    setConfirmState(null);
    try {
      if (action) await action.onConfirm();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível concluir a ação.");
    }
  }

  function openAdminModal() {
    if (!canUseTiTools || !canManage) return;
    setAdminModalOpen(true);
    setAdminStep("key");
    setAdminAccessKey("");
    setValidatedAccessKeyId("");
    setAdminForm({ name: "", username: "", password: "" });
    setAdminError("");
  }

  async function validateAdminAccessKey() {
    if (!adminAccessKey.trim()) {
      setAdminError("Informe a chave de acesso.");
      return;
    }

    const keyHash = await hashPassword(adminAccessKey.trim());
    const match = data.accessKeys.find((key) => key.active !== false && key.purpose === "admin" && key.keyHash === keyHash);

    if (!match) {
      setAdminError("Chave de acesso inválida ou inativa.");
      return;
    }

    setValidatedAccessKeyId(match.id);
    setAdminForm((current) => ({ ...current, password: adminAccessKey.trim() }));
    setAdminStep("form");
    setAdminError("");
  }

  async function saveAdministrator() {
    if (adminSaving) return;
    const name = adminForm.name.trim();
    const username = normalizeUsername(adminForm.username);
    const password = adminForm.password.trim();

    if (!name || !username || !password) {
      setAdminError("Preencha nome completo, usuário e senha/chave.");
      return;
    }

    if (data.systemUsers.some((entry) => normalizeUsername(entry.username) === username)) {
      setAdminError("Já existe um usuário cadastrado com esse login.");
      return;
    }

    setAdminSaving(true);
    try {
      const now = new Date().toISOString();
      const savedUser = await data.upsertSystemUser({
        username,
        name,
        role: "Administrador",
        position: "TI",
        password,
        active: true,
        isAdmin: true,
      });
      await data.replaceUserPermissions(savedUser.id, fullMatrix());

      const keyHash = await hashPassword(password);
      await data.upsertAccessKey({
        name: `Chave de acesso - ${name}`,
        keyHash,
        purpose: "admin",
        active: true,
        createdByUserId: user?.id,
        createdAt: now,
        updatedAt: now,
      });

      const usedKey = data.accessKeys.find((key) => key.id === validatedAccessKeyId);
      if (usedKey) await data.upsertAccessKey({ ...usedKey, usedAt: now, updatedAt: now });

      setAdminModalOpen(false);
      setMessage("Administrador cadastrado no banco de dados com sucesso.");
    } catch (error) {
      console.error(error);
      setAdminError(error instanceof Error ? error.message : "Não foi possível cadastrar o administrador.");
    } finally {
      setAdminSaving(false);
    }
  }

  const canUseWizardFields = editingProfileId ? canManage && canEditProfiles : canCreateScopedProfile();
  const canGoToWizardAccess = Boolean(wizardName.trim() && wizardCompanyId);
  const canSaveWizard = canUseWizardFields && canGoToWizardAccess && (canUseTiTools || Boolean(wizardTargetValue));
  const selectedTargets = selectedProfile?.targets || [];

  useCreateShortcut(() => {
    if (!canCreateScopedProfile()) return;
    openCreateWizard();
  });

  return (
    <section className="page permissions-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Permissões do sistema</h1>
          <p className="page-subtitle">Acessos salvos por empresa e vínculo para reutilizar no login dos funcionários.</p>
        </div>
        <div className="form-actions">
          {canUseTiTools && canManage ? (
            <button className="btn btn-secondary" type="button" onClick={openAdminModal}>
              <KeyRound size={17} />
              Administrador
            </button>
          ) : null}
          {canCreateScopedProfile() ? (
            <button className="btn btn-primary" type="button" onClick={openCreateWizard}>
              <Save size={17} />
              Cadastrar acesso
            </button>
          ) : null}
        </div>
      </div>

      <div className="permissions-layout permissions-simple-layout">
        <aside className="panel permission-users">
          <div className="panel-header">
            <h2 className="panel-title"><Layers3 size={18} /> Acessos salvos</h2>
          </div>
          <div className="permission-user-list saved-access-list">
            {visibleProfiles.map((profile) => (
              <div
                className={`permission-access-card ${profile.id === selectedProfileId ? "is-selected" : ""}`}
                key={profile.id}
                role="button"
                tabIndex={0}
                onClick={() => selectProfile(profile)}
                onKeyDown={(event) => handleCardKeyDown(event, profile)}
              >
                <span>{profileInitials(profile)}</span>
                <strong>{profile.name}</strong>
                <small>{profile.active ? "Ativo" : "Inativo"} · {profile.targets.filter((target) => target.type !== "company").length || 1} vínculo(s)</small>
                <div className="profile-actions">
                  {canEditProfile(profile) ? (
                    <button type="button" onClick={(event) => { event.stopPropagation(); openEditWizard(profile); }}>
                      <Pencil size={14} /> Editar
                    </button>
                  ) : null}
                  {canEditProfile(profile) ? (
                    <button type="button" onClick={(event) => { event.stopPropagation(); toggleProfile(profile); }}>
                      <Power size={14} /> {profile.active ? "Desativar" : "Ativar"}
                    </button>
                  ) : null}
                  {canRemoveProfile(profile) ? (
                    <button type="button" onClick={(event) => { event.stopPropagation(); deleteProfile(profile); }}>
                      <Trash2 size={14} /> Excluir
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
            {!visibleProfiles.length ? <p className="muted padded">Nenhum acesso salvo ainda.</p> : null}
          </div>
        </aside>

        <article className="panel permission-matrix-panel permission-viewer">
          {selectedProfile ? (
            <>
                <div className="panel-header">
                <div>
                  <h2 className="panel-title"><ShieldCheck size={18} /> {selectedProfile.name}</h2>
                  <p className="panel-subtitle">{selectedProfile.active ? "Ativo" : "Inativo"}</p>
                </div>
                <div className="action-row">
                  {canEditProfile(selectedProfile) ? (
                    <>
                      <button className="btn btn-ghost" type="button" onClick={() => setMatrix(canUseTiTools ? fullMatrix() : grantableMatrix())}>Marcar tudo</button>
                      <button className="btn btn-primary" type="button" onClick={saveSelectedMatrix}>
                        <Save size={16} />
                        Salvar alterações
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="profile-targets">
                {selectedTargets.map((target) => (
                  <span className="module-pill" key={`${target.type}-${target.value}`}>{describeTarget(target)}</span>
                ))}
              </div>

              <PermissionMatrixTable
                canToggle={canGrantAction}
                disabled={!canEditProfile(selectedProfile)}
                matrix={matrix}
                onToggle={(screen, action) => setMatrix((current) => toggleMatrixValue(current, screen, action))}
              />
              {message ? <span className="form-success">{message}</span> : null}
            </>
          ) : (
            <div className="permission-viewer-empty">
              <ShieldCheck size={34} />
              <strong>Nenhum acesso selecionado</strong>
              <span>Crie um acesso de tela ou selecione um card salvo.</span>
            </div>
          )}
        </article>
      </div>

      {wizardOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-panel wizard-card permission-wizard" role="dialog" aria-modal="true" aria-labelledby="permission-wizard-title">
            <div className="modal-header">
              <h2 id="permission-wizard-title">{editingProfileId ? "Editar acesso" : "Cadastrar acesso"}</h2>
              <button className="icon-button" type="button" onClick={() => setWizardOpen(false)} aria-label="Fechar">
                <X size={20} />
              </button>
            </div>

            <div className="wizard-steps">
              <span className={wizardStep === 1 ? "is-active" : ""}>1. Nome e empresa</span>
              <span className={wizardStep === 2 ? "is-active" : ""}>2. Vínculo</span>
              <span className={wizardStep === 3 ? "is-active" : ""}>3. Acessos</span>
            </div>

            {wizardStep === 1 ? (
              <div className="form-grid">
                <label className="field">
                  Nome da permissão
                  <input value={wizardName} onChange={(event) => setWizardName(event.target.value)} placeholder="Ex.: Setor de TI" disabled={!canUseWizardFields} />
                </label>
                <label className="field">
                  Empresa
                  <select
                    value={wizardCompanyId}
                    onChange={(event) => {
                      setWizardCompanyId(event.target.value);
                      setWizardTargetValue("");
                    }}
                    disabled={!canUseWizardFields}
                  >
                    <option value="">Selecione</option>
                    {allTargetOptions.company.map((company) => (
                      <option value={company.value} key={company.value}>{company.label}</option>
                    ))}
                  </select>
                </label>
                <label className="field is-wide-field">
                  Descrição
                  <textarea value={wizardDescription} onChange={(event) => setWizardDescription(event.target.value)} disabled={!canUseWizardFields} />
                </label>
                <label className="field">
                  Situação
                  <select value={wizardActive ? "active" : "inactive"} onChange={(event) => setWizardActive(event.target.value === "active")} disabled={!canUseWizardFields}>
                    <option value="active">Ativo</option>
                    <option value="inactive">Inativo</option>
                  </select>
                </label>
              </div>
            ) : null}

            {wizardStep === 2 ? (
              <div className="permission-wizard-targets">
                <p className="muted">
                  O vínculo é opcional. Use quando quiser aplicar este acesso automaticamente por funcionário, departamento, setor, subsetor, cargo ou função; ou pule e selecione o acesso manualmente no cadastro do funcionário.
                </p>
                <div className="permission-choice-grid">
                  {Object.entries(wizardTargetLabels).map(([type, label]) => (
                    <button
                      className={`permission-choice ${wizardTargetType === type ? "is-active" : ""}`}
                      type="button"
                      key={type}
                      onClick={() => {
                        setWizardTargetType(type as WizardTargetType);
                        setWizardTargetValue("");
                      }}
                      disabled={!canUseWizardFields}
                    >
                      <strong>{label}</strong>
                    </button>
                  ))}
                </div>

                <label className="field">
                  {wizardTargetLabels[wizardTargetType]}
                  <select value={wizardTargetValue} onChange={(event) => setWizardTargetValue(event.target.value)} disabled={!canUseWizardFields}>
                    <option value="">Selecione</option>
                    {wizardTargetOptions[wizardTargetType].map((option) => (
                      <option value={option.value} key={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                {!wizardTargetOptions[wizardTargetType].length ? <p className="muted">Nenhum item cadastrado para essa empresa.</p> : null}

                {canUseWizardFields && canUseTiTools ? (
                  <button className="btn btn-ghost" type="button" onClick={() => setWizardStep(3)}>
                    Pular vínculo
                  </button>
                ) : null}
              </div>
            ) : null}

            {wizardStep === 3 ? (
              <div className="permission-wizard-access">
                <div className="panel-header is-flat">
                  <h3 className="panel-title">Acessos por tela</h3>
                  {canUseWizardFields ? (
                    <button className="btn btn-ghost" type="button" onClick={() => setWizardMatrix(canUseTiTools ? fullMatrix() : grantableMatrix())}>Marcar tudo</button>
                  ) : null}
                </div>
                <PermissionMatrixTable
                  canToggle={canGrantAction}
                  disabled={!canUseWizardFields}
                  matrix={wizardMatrix}
                  onToggle={(screen, action) => setWizardMatrix((current) => toggleMatrixValue(current, screen, action))}
                />
              </div>
            ) : null}

            <div className="form-actions wizard-actions">
              <button className="btn btn-ghost" type="button" onClick={() => setWizardOpen(false)}>Cancelar</button>
              {wizardStep > 1 ? (
                <button className="btn btn-secondary" type="button" onClick={() => setWizardStep((step) => step - 1)}>
                  <ChevronLeft size={16} />
                  Voltar
                </button>
              ) : null}
              {wizardStep < 3 ? (
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => setWizardStep((step) => step + 1)}
                  disabled={wizardStep === 1 ? !canGoToWizardAccess : (!canUseTiTools && !wizardTargetValue)}
                >
                  Avançar
                  <ChevronRight size={16} />
                </button>
              ) : (
                canSaveWizard ? (
                  <button className="btn btn-primary" type="button" onClick={saveWizardProfile}>
                    <Save size={16} />
                    Salvar permissão
                  </button>
                ) : null
              )}
            </div>
          </div>
        </div>
      ) : null}

      {adminModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-panel wizard-card" role="dialog" aria-modal="true" aria-labelledby="admin-modal-title">
            <div className="modal-header">
              <h2 id="admin-modal-title">{adminStep === "key" ? "Chave de acesso" : "Cadastrar Administrador"}</h2>
              <button className="icon-button" type="button" onClick={() => setAdminModalOpen(false)} aria-label="Fechar" disabled={adminSaving}>
                <X size={20} />
              </button>
            </div>

            {adminStep === "key" ? (
              <div className="form-grid">
                <p className="muted is-wide-field">Informe uma chave de acesso cadastrada na coleção accessKeys do Firestore. Essa etapa libera o cadastro de usuários de TI sem vínculo obrigatório com funcionário.</p>
                <label className="field is-wide-field">
                  Chave de acesso
                  <input type="password" value={adminAccessKey} onChange={(event) => setAdminAccessKey(event.target.value)} disabled={adminSaving} />
                </label>
              </div>
            ) : (
              <div className="form-grid">
                <label className="field">
                  Nome completo
                  <input value={adminForm.name} onChange={(event) => setAdminForm((current) => ({ ...current, name: event.target.value, username: current.username || createUsernameFromName(event.target.value) }))} disabled={adminSaving} />
                </label>
                <label className="field">
                  Usuário
                  <input maxLength={7} value={adminForm.username} onChange={(event) => setAdminForm({ ...adminForm, username: normalizeUsername(event.target.value) })} disabled={adminSaving} />
                </label>
                <label className="field is-wide-field">
                  Senha / chave de acesso do administrador
                  <input type="password" value={adminForm.password} onChange={(event) => setAdminForm({ ...adminForm, password: event.target.value })} disabled={adminSaving} />
                </label>
                <p className="muted is-wide-field">O administrador será salvo em systemUsers com isAdmin=true. A senha também será registrada como chave de acesso em accessKeys, sempre em hash.</p>
              </div>
            )}

            {adminError ? <span className="login-error">{adminError}</span> : null}

            <div className="form-actions wizard-actions">
              <button className="btn btn-ghost" type="button" onClick={() => setAdminModalOpen(false)} disabled={adminSaving}>Cancelar</button>
              {adminStep === "form" ? <button className="btn btn-secondary" type="button" onClick={() => setAdminStep("key")} disabled={adminSaving}>Voltar</button> : null}
              {adminStep === "key" ? (
                <button className="btn btn-primary" type="button" onClick={validateAdminAccessKey} disabled={adminSaving}>
                  <KeyRound size={16} /> Validar chave
                </button>
              ) : (
                <button className="btn btn-primary" type="button" onClick={saveAdministrator} disabled={adminSaving}>
                  <UserPlus size={16} /> {adminSaving ? "Salvando..." : "Cadastrar Administrador"}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {confirmState ? (
        <ConfirmModal
          title={confirmState.title}
          description={confirmState.description}
          confirmLabel={confirmState.confirmLabel}
          destructive={Boolean(confirmState.impact)}
          impact={confirmState.impact}
          onCancel={() => setConfirmState(null)}
          onConfirm={confirmAction}
        />
      ) : null}
    </section>
  );
}

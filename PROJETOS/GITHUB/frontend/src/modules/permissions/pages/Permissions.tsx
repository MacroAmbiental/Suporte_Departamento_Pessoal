import ModalPortal from "@/modules/shared/ModalPortal";
import { Copy, KeyRound, Layers3, Plus, Power, Save, ShieldCheck, Trash2, UserPlus, X } from "lucide-react";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { useAuth } from "@/hooks/useAuth";
import useCreateShortcut from "@/hooks/useCreateShortcut";
import { useDomainData } from "@/hooks/useDomainData";
import ConfirmModal from "@/common/components/ConfirmModal";
import type { DeleteImpact } from "@/common/components/DeleteImpactModal";
import { buildDomainDeletionImpact } from "@/common/utils/deletionImpact";
import { createUsernameFromName, hashPassword, isSystemTiUser, normalizeUsername, systemScreens, withInheritedScreens } from "@/services/accessControl";
import { effectivePermissions, employeeMatchesProfile } from "@/services/permissionProfiles";
import PeopleTab from "../components/PeopleTab";
import ScreenTab from "../components/ScreenTab";
import ProfileEditor, { type ProfileDraft } from "../components/ProfileEditor";

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
type SelectOption = { value: string; label: string };

const NEW_PROFILE = "__novo__";

const targetLabels: Record<PermissionProfileTargetType, string> = {
  employee: "Funcionário",
  group: "Grupo",
  company: "Empresa",
  department: "Departamento",
  sector: "Setor",
  subsector: "Subsetor",
  position: "Cargo",
  role: "Função",
};


function emptyMatrix(): PermissionMatrix {
  return systemScreens.reduce((matrix, screen) => {
    matrix[screen.key] = [];
    return matrix;
  }, {} as PermissionMatrix);
}

function fullMatrix(): PermissionMatrix {
  // Só as ações que cada tela usa (Gerenciar incluso onde existe).
  return systemScreens.reduce((matrix, screen) => {
    matrix[screen.key] = [...screen.actions];
    return matrix;
  }, {} as PermissionMatrix);
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

export default function Permissions() {
  const data = useDomainData();
  const { can, user } = useAuth();
  const canManage = can("permissions", "manage");
  const canUseTiTools = isSystemTiUser(user);
  const canCreateProfiles = can("permissions", "create");
  const canEditProfiles = can("permissions", "edit");
  const canDeleteProfiles = can("permissions", "delete");
  const [tab, setTab] = useState<"profiles" | "people" | "screens">("profiles");
  const [peopleUserId, setPeopleUserId] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [savedDraftJson, setSavedDraftJson] = useState("");
  const [profileSearch, setProfileSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessageState] = useState<{ text: string; kind: "ok" | "error" } | null>(null);
  const setMessage = (text: string, kind: "ok" | "error" = "ok") => setMessageState(text ? { text, kind } : null);
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; confirmLabel: string; impact?: DeleteImpact; onConfirm: () => Promise<void> } | null>(null);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [adminStep, setAdminStep] = useState<"key" | "form">("key");
  const [adminAccessKey, setAdminAccessKey] = useState("");
  const [validatedAccessKeyId, setValidatedAccessKeyId] = useState("");
  const [adminForm, setAdminForm] = useState({ name: "", username: "", password: "" });
  const [adminError, setAdminError] = useState("");
  const [adminSaving, setAdminSaving] = useState(false);

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
      group: data.companyGroups.filter((group) => group.active !== false).map((group) => ({ value: group.id, label: group.name })),
      company: data.companies.filter((company) => companyIds.has(company.id)).map((company) => ({ value: company.id, label: company.name })),
      department: data.departments.filter((department) => departmentIds.has(department.id)).map((department) => ({ value: department.id, label: department.name })),
      sector: data.sectors.filter((sector) => sectorIds.has(sector.id)).map((sector) => ({ value: sector.id, label: sector.name })),
      subsector: data.subsectors.filter((subsector) => subsectorIds.has(subsector.id)).map((subsector) => ({ value: subsector.id, label: subsector.name })),
      position: positions.map((position) => ({ value: position, label: position })),
      role: roles.map((role) => ({ value: role, label: role })),
    };
  }, [canUseTiTools, data.companies, data.companyGroups, data.departments, data.employees, data.sectors, data.subsectors, scopedEmployees]);

  function canGrantAction(screen: AppScreen, action: PermissionAction) {
    return canUseTiTools || can(screen, action);
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
    if (target.type === "group") return employees.some((employee) => employee.groupId === target.value);
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

  // Abre o primeiro perfil quando a lista carrega (ou quando o aberto some).
  useEffect(() => {
    if (selectedProfileId === NEW_PROFILE) return;
    if (visibleProfiles.some((profile) => profile.id === selectedProfileId)) return;
    const firstProfile = visibleProfiles[0];
    loadDraft(firstProfile ? draftFromProfile(firstProfile) : null, firstProfile?.id || "");
  }, [selectedProfileId, visibleProfiles]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setMessage("Você não tem permissão para alterar este perfil.", "error");
  }

  function showScopedProfileMessage() {
    setMessage("Perfil fora do seu escopo de liderança.", "error");
  }

  // Usuários que um perfil atinge: os do público (vínculos) e os que recebem o perfil
  // pelo cadastro do login. Quem não é TI só mexe em quem está no seu escopo.
  function affectedUsers(profile: Pick<PermissionProfile, "id" | "targets">) {
    const matchedIds = new Set(getMatchedEmployees(profile.targets, true).map((employee) => employee.id));
    return data.systemUsers.filter((systemUser) => {
      if (systemUser.isAdmin || systemUser.id === user?.id) return false;
      if (systemUser.employeeId && matchedIds.has(systemUser.employeeId)) return true;
      if (profile.id && systemUser.permissionProfileId === profile.id) {
        return canUseTiTools || Boolean(systemUser.employeeId && delegatedScope.employeeIds.has(systemUser.employeeId));
      }
      return false;
    });
  }

  // Cada pessoa fica com a soma de todos os perfis que valem para ela, não só com este:
  // mexer num perfil não pode tirar o que vem de outro.
  async function applyProfileChange(profile: PermissionProfile, users = affectedUsers(profile)) {
    if (!canManage) return 0;
    await Promise.all(users.map((matchedUser) => data.replaceUserPermissions(
      matchedUser.id,
      effectivePermissions(matchedUser, data.employees.find((employee) => employee.id === matchedUser.employeeId), data.permissionProfiles, [profile]),
    )));
    return users.length;
  }

  async function saveAndApplyProfile(profile: PermissionProfilePayload) {
    const isEditingProfile = Boolean(profile.id);
    if (!canManage) throw new Error("Você precisa da ação Gerenciar em permissões para aplicar acessos a usuários.");
    if (isEditingProfile && !canEditProfiles) throw new Error("Você não tem permissão para editar perfis.");
    if (!isEditingProfile && !canCreateScopedProfile()) throw new Error("Você não tem permissão para criar perfis neste escopo.");
    if (!profileTargetsAreInsideScope(profile.targets)) {
      throw new Error("Selecione uma empresa e vínculos (funcionários, cargos, setores...) dentro do seu escopo de liderança.");
    }

    const sanitizedProfile = {
      ...profile,
      permissions: sanitizeMatrix(profile.permissions as PermissionMatrix),
      createdByUserId: getProfileCreatorId(profile as PermissionProfile) || user?.id,
      updatedByUserId: user?.id,
    };
    const saved = await data.upsertPermissionProfile(sanitizedProfile);
    const appliedCount = await applyProfileChange(saved);
    return { saved, appliedCount };
  }

  function draftFromProfile(profile: PermissionProfile): ProfileDraft {
    return {
      id: profile.id,
      name: profile.name,
      description: profile.description || "",
      active: profile.active,
      targets: [...(profile.targets || [])],
      // Abas novas que o perfil ainda não tem aparecem com o que ele tem em Funcionários.
      permissions: withInheritedScreens(profile.permissions),
    };
  }

  function loadDraft(next: ProfileDraft | null, id: string) {
    setSelectedProfileId(id);
    setDraft(next);
    setSavedDraftJson(next ? JSON.stringify(next) : "");
    setMessage("");
  }

  const dirty = Boolean(draft) && JSON.stringify(draft) !== savedDraftJson;

  function guardDirty(action: () => void) {
    if (!dirty) {
      action();
      return;
    }
    setConfirmState({
      title: "Descartar alterações",
      description: "Há alterações não salvas neste perfil. Deseja descartá-las?",
      confirmLabel: "Descartar",
      onConfirm: async () => action(),
    });
  }

  function selectProfile(profile: PermissionProfile) {
    if (profile.id === selectedProfileId) return;
    guardDirty(() => loadDraft(draftFromProfile(profile), profile.id));
  }

  function handleCardKeyDown(event: KeyboardEvent<HTMLDivElement>, profile: PermissionProfile) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    selectProfile(profile);
  }

  function startNewProfile() {
    if (!canCreateScopedProfile()) {
      showScopedProfileMessage();
      return;
    }
    guardDirty(() => loadDraft({ name: "", description: "", active: true, targets: [], permissions: {} }, NEW_PROFILE));
  }

  function duplicateProfile() {
    if (!draft || !canCreateScopedProfile()) return;
    const copy: ProfileDraft = { ...draft, id: undefined, name: `Cópia de ${draft.name}`, targets: [...draft.targets], permissions: { ...draft.permissions } };
    guardDirty(() => {
      setSelectedProfileId(NEW_PROFILE);
      setDraft(copy);
      setSavedDraftJson("");
      setMessage("Cópia criada. Ajuste e salve.");
    });
  }

  async function saveDraft() {
    if (!draft || saving) return;
    if (!draft.name.trim()) {
      setMessage("Dê um nome ao perfil.", "error");
      return;
    }
    const existingProfile = draft.id ? data.permissionProfiles.find((profile) => profile.id === draft.id) : undefined;
    if (existingProfile && !canEditProfile(existingProfile)) {
      showProtectedTiProfileMessage();
      return;
    }
    const now = new Date().toISOString();
    setSaving(true);
    try {
      const { saved, appliedCount } = await saveAndApplyProfile({
        id: draft.id,
        name: draft.name.trim(),
        description: draft.description,
        active: draft.active,
        targets: draft.targets,
        // Grava todas as telas (inclusive as abas novas) para não depender de herança.
        permissions: { ...emptyMatrix(), ...draft.permissions },
        createdByUserId: existingProfile ? getProfileCreatorId(existingProfile) : user?.id,
        createdAt: existingProfile?.createdAt || now,
        updatedAt: now,
      });
      loadDraft(draftFromProfile(saved), saved.id);
      setMessage(appliedCount ? `Perfil salvo e aplicado a ${appliedCount} login(s).` : "Perfil salvo.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar o perfil.", "error");
    } finally {
      setSaving(false);
    }
  }

  function toggleProfile(profile: PermissionProfile) {
    if (!canEditProfile(profile)) {
      showProtectedTiProfileMessage();
      return;
    }

    setConfirmState({
      title: profile.active ? "Desativar perfil" : "Ativar perfil",
      description: `Deseja ${profile.active ? "desativar" : "ativar"} o perfil ${profile.name}? Os acessos das pessoas que o recebem são atualizados na hora.`,
      confirmLabel: profile.active ? "Desativar" : "Ativar",
      onConfirm: async () => {
        const updated = await data.upsertPermissionProfile({ ...profile, active: !profile.active, updatedByUserId: user?.id, updatedAt: new Date().toISOString() });
        const count = await applyProfileChange(updated);
        if (selectedProfileId === profile.id) loadDraft(draftFromProfile(updated), updated.id);
        setMessage(`${profile.active ? "Perfil desativado" : "Perfil ativado"}${count ? ` e acessos atualizados de ${count} login(s)` : ""}.`);
      },
    });
  }

  function deleteProfile(profile: PermissionProfile) {
    if (!canRemoveProfile(profile)) {
      showProtectedTiProfileMessage();
      return;
    }

    setConfirmState({
      title: "Excluir perfil",
      description: `Deseja excluir o perfil ${profile.name}? Os acessos das pessoas que o recebem são atualizados na hora.`,
      confirmLabel: "Excluir",
      impact: buildDomainDeletionImpact(data, "permissionProfiles", profile.id, profile.name),
      onConfirm: async () => {
        const users = affectedUsers(profile);
        const deleted = await data.removeItem("permissionProfiles", profile.id);
        if (!deleted) return;
        // Recalcula como se o perfil estivesse desligado (ele já não vale para ninguém).
        const count = await applyProfileChange({ ...profile, active: false }, users);
        if (selectedProfileId === profile.id) loadDraft(null, "");
        setMessage(`Perfil excluído${count ? ` e acessos atualizados de ${count} login(s)` : ""}.`);
      },
    });
  }

  async function confirmAction() {
    const action = confirmState;
    setConfirmState(null);
    try {
      if (action) await action.onConfirm();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível concluir a ação.", "error");
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

  const editingProfile = draft?.id ? data.permissionProfiles.find((profile) => profile.id === draft.id) : undefined;
  const editorDisabled = !draft || (editingProfile ? !canEditProfile(editingProfile) : !canCreateScopedProfile());
  const loginEmployeeIds = useMemo(() => new Set(data.systemUsers.filter((systemUser) => !systemUser.isAdmin && systemUser.active !== false && systemUser.employeeId).map((systemUser) => systemUser.employeeId as string)), [data.systemUsers]);
  const draftMatched = useMemo(() => (
    draft?.targets.length ? data.employees.filter((employee) => employee.status !== "terminated" && employeeMatchesProfile(employee, draft.targets)) : []
  ), [data.employees, draft?.targets]);
  const draftLoginLinked = draft?.id
    ? data.systemUsers.filter((systemUser) => systemUser.permissionProfileId === draft.id && !draftMatched.some((employee) => employee.id === systemUser.employeeId)).length
    : 0;
  const profileTerm = normalizeText(profileSearch);
  const listedProfiles = visibleProfiles
    .filter((profile) => !profileTerm || normalizeText(`${profile.name} ${profile.description || ""}`).includes(profileTerm))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "pt-BR"));
  const peopleCount = (profile: PermissionProfile) => (
    data.employees.filter((employee) => employee.status !== "terminated" && profile.targets?.length && employeeMatchesProfile(employee, profile.targets)).length
    + data.systemUsers.filter((systemUser) => systemUser.permissionProfileId === profile.id).length
  );

  useCreateShortcut(() => {
    if (tab !== "profiles" || !canCreateScopedProfile()) return;
    startNewProfile();
  });

  return (
    <section className="page permissions-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Permissões do sistema</h1>
          <p className="page-subtitle">Perfis de acesso: o que cada perfil pode fazer e quem recebe. A pessoa fica com a soma dos perfis que valem para ela.</p>
        </div>
        <div className="form-actions">
          {canUseTiTools && canManage ? (
            <button className="btn btn-secondary" type="button" onClick={openAdminModal}>
              <KeyRound size={17} />
              Administrador
            </button>
          ) : null}
        </div>
      </div>

      <div className="permission-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "profiles"} className={tab === "profiles" ? "is-active" : ""} onClick={() => setTab("profiles")}>Perfis</button>
        <button type="button" role="tab" aria-selected={tab === "people"} className={tab === "people" ? "is-active" : ""} onClick={() => guardDirty(() => { setPeopleUserId(""); setTab("people"); })}>Pessoas</button>
        <button type="button" role="tab" aria-selected={tab === "screens"} className={tab === "screens" ? "is-active" : ""} onClick={() => guardDirty(() => setTab("screens"))}>Por tela</button>
      </div>

      {tab === "screens" ? (
        <ScreenTab onOpenPerson={(userId) => { setPeopleUserId(userId); setTab("people"); }} />
      ) : tab === "people" ? (
        <PeopleTab
          key={peopleUserId}
          initialUserId={peopleUserId}
          canManage={canManage}
          describeTarget={describeTarget}
          onOpenProfile={(profileId) => {
            const profile = visibleProfiles.find((item) => item.id === profileId);
            setTab("profiles");
            if (profile) loadDraft(draftFromProfile(profile), profile.id);
            else setMessage("Este perfil está fora do seu escopo; só o TI consegue abri-lo.", "error");
          }}
        />
      ) : (
        <div className="permissions-layout permissions-simple-layout">
          <aside className="panel permission-users">
            <div className="panel-header">
              <h2 className="panel-title"><Layers3 size={18} /> Perfis</h2>
              {canCreateScopedProfile() ? (
                <button className="btn btn-primary btn-small" type="button" onClick={startNewProfile}><Plus size={15} /> Novo</button>
              ) : null}
            </div>
            <input className="permission-filter profile-list-search" type="search" placeholder="Buscar perfil" value={profileSearch} onChange={(event) => setProfileSearch(event.target.value)} aria-label="Buscar perfil" />
            <div className="permission-user-list saved-access-list">
              {selectedProfileId === NEW_PROFILE ? (
                <div className="permission-access-card is-selected">
                  <span>+</span>
                  <strong>{draft?.name || "Novo perfil"}</strong>
                  <small>Ainda não salvo</small>
                </div>
              ) : null}
              {listedProfiles.map((profile) => (
                <div
                  className={`permission-access-card ${profile.id === selectedProfileId ? "is-selected" : ""}${profile.active ? "" : " is-inactive"}`}
                  key={profile.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => selectProfile(profile)}
                  onKeyDown={(event) => handleCardKeyDown(event, profile)}
                >
                  <span>{profileInitials(profile)}</span>
                  <strong>{profile.name}</strong>
                  <small>{profile.active ? "Ativo" : "Inativo"} · {peopleCount(profile)} pessoa(s)</small>
                </div>
              ))}
              {!listedProfiles.length ? <p className="muted padded">{profileSearch ? "Nenhum perfil encontrado." : "Nenhum perfil ainda."}</p> : null}
            </div>
          </aside>

          <article className="panel permission-matrix-panel permission-viewer">
            {draft ? (
              <>
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title"><ShieldCheck size={18} /> {draft.name || "Novo perfil"}</h2>
                    <p className="panel-subtitle">
                      {editingProfile ? (editingProfile.active ? "Ativo" : "Inativo") : "Novo — ainda não salvo"}
                      {dirty ? " · alterações não salvas" : ""}
                    </p>
                  </div>
                  <div className="action-row">
                    {editingProfile && canCreateScopedProfile() ? (
                      <button className="btn btn-ghost" type="button" onClick={duplicateProfile}><Copy size={15} /> Duplicar</button>
                    ) : null}
                    {editingProfile && canEditProfile(editingProfile) ? (
                      <button className="btn btn-ghost" type="button" onClick={() => toggleProfile(editingProfile)}><Power size={15} /> {editingProfile.active ? "Desativar" : "Ativar"}</button>
                    ) : null}
                    {editingProfile && canRemoveProfile(editingProfile) ? (
                      <button className="btn btn-ghost" type="button" onClick={() => deleteProfile(editingProfile)}><Trash2 size={15} /> Excluir</button>
                    ) : null}
                    {dirty ? (
                      <button className="btn btn-secondary" type="button" onClick={() => (editingProfile ? loadDraft(draftFromProfile(editingProfile), editingProfile.id) : loadDraft(null, ""))}>Descartar</button>
                    ) : null}
                    {!editorDisabled ? (
                      <button className="btn btn-primary" type="button" disabled={saving || !dirty} onClick={saveDraft}>
                        <Save size={16} />
                        {saving ? "Salvando..." : "Salvar"}
                      </button>
                    ) : null}
                  </div>
                </div>

                {message ? <p className={message.kind === "error" ? "permission-message is-error" : "permission-message"}>{message.text}</p> : null}

                <ProfileEditor
                  draft={draft}
                  onChange={setDraft}
                  disabled={editorDisabled}
                  canGrant={canGrantAction}
                  targetOptions={allTargetOptions}
                  describeTarget={describeTarget}
                  matchedEmployees={draftMatched}
                  loginEmployeeIds={loginEmployeeIds}
                  loginLinkedCount={draftLoginLinked}
                  requireCompany={!canUseTiTools}
                />
              </>
            ) : (
              <div className="permission-viewer-empty">
                <ShieldCheck size={34} />
                <strong>Nenhum perfil selecionado</strong>
                <span>Escolha um perfil na lista ou crie um novo.</span>
                {message ? <p className={message.kind === "error" ? "permission-message is-error" : "permission-message"}>{message.text}</p> : null}
              </div>
            )}
          </article>
        </div>
      )}

      {adminModalOpen ? (
        <ModalPortal className="modal-backdrop" role="presentation">
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
        </ModalPortal>
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

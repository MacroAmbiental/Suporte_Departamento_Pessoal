import {
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Power,
  RotateCcw,
  Save,
  Search,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { where } from "firebase/firestore";
import { loadCollection } from "@/core/firestore/domainRepository";
import useCreateShortcut from "@/hooks/useCreateShortcut";
import { useDomainData } from "@/hooks/useDomainData";
import ClearFiltersButton from "../../../common/components/ClearFiltersButton";
import ConfirmModal from "@/common/components/ConfirmModal";
import type { DeleteImpact } from "@/common/components/DeleteImpactModal";
import { buildDomainDeletionImpact } from "@/common/utils/deletionImpact";
import EmployeesPagination from "../components/EmployeesPagination";
import MultiSelect from "../../../common/components/MultiSelect";
import { employeeStandardDocumentNames } from "@/modules/records/utils/recordsDocuments";
import { createUsernameFromName, hashPassword, normalizeUsername, systemScreens } from "@/services/accessControl";
import { uploadEmployeeDocumentFile } from "@/services/documentStorage";
import type {
  AppScreen,
  CompanyGroupEmployeeAssignment,
  CompanyGroupUnit,
  CompanyGroupUnitLink,
  CompanyGroupUnitType,
  Employee,
  EmployeeComplement,
  EmployeeDocument,
  EmployeeDraft,
  EmployeeStatus,
  PermissionAction,
  PermissionProfile,
  SystemPermission,
  SystemUser,
  WorkScheduleDay,
} from "@/types/domain";
import { badgeClass, formatCurrency, formatDate, labelStatus, todayISO } from "@/utils/format";
import { parseEmployeePdf } from "@/utils/pdfEmployeeImport";

type UndoState = { message: string; undo: () => Promise<void> } | null;
type EmployeeKind = "contract" | "company" | "diarist";
type StatusScheduleAction = "deactivate" | "reactivate";
type BirthdayFilterMode = "month" | "year" | "full";

interface EmployeeWizardForm extends Partial<Employee> {
  employeeKind: EmployeeKind;
  createLogin: boolean;
  username: string;
  password: string;
  permissionProfileId: string;
  diaristUseStructure: boolean;
  diaristDailyRate: number;
  diaristBankDetails: string;
  diaristResponsible: string;
  diaristWorkplace: string;
}

type EmployeeGroupUnitSelection = {
  departmentUnitId: string;
  sectorUnitId: string;
  subsectorUnitId: string;
  teamUnitId: string;
};

type EmployeeFormGroupUnit = Pick<CompanyGroupUnit, "id" | "name" | "type" | "active"> & {
  parentUnitId: string;
  links: Array<Pick<CompanyGroupUnitLink, "companyId" | "sourceId" | "sourceType">>;
};

type EmployeeFormGroup = {
  id: string;
  name: string;
  active: boolean;
  companyIds: string[];
  units: EmployeeFormGroupUnit[];
  employeeAssignments: CompanyGroupEmployeeAssignment[];
};

const emptyComplement: EmployeeComplement = {
  email: "",
  emergencyContact: "",
  transportVoucher: false,
  mealVoucher: false,
  foodVoucher: false,
  healthPlan: false,
  dentalPlan: false,
  customBenefits: {},
  notes: "",
};

const emptyGroupUnitSelection: EmployeeGroupUnitSelection = {
  departmentUnitId: "",
  sectorUnitId: "",
  subsectorUnitId: "",
  teamUnitId: "",
};

const scheduleTemplate: WorkScheduleDay[] = [
  { day: "Segunda", enabled: true, start: "07:00", breakStart: "12:00", breakEnd: "13:00", end: "17:00" },
  { day: "Terça", enabled: true, start: "07:00", breakStart: "12:00", breakEnd: "13:00", end: "17:00" },
  { day: "Quarta", enabled: true, start: "07:00", breakStart: "12:00", breakEnd: "13:00", end: "17:00" },
  { day: "Quinta", enabled: true, start: "07:00", breakStart: "12:00", breakEnd: "13:00", end: "17:00" },
  { day: "Sexta", enabled: true, start: "07:00", breakStart: "12:00", breakEnd: "13:00", end: "17:00" },
  { day: "Sábado", enabled: false, start: "", breakStart: "", breakEnd: "", end: "" },
  { day: "Domingo", enabled: false, start: "", breakStart: "", breakEnd: "", end: "" },
];

const blankScheduleTemplate: WorkScheduleDay[] = scheduleTemplate.map((day) => ({
  ...day,
  enabled: false,
  start: "",
  breakStart: "",
  breakEnd: "",
  end: "",
}));
const SCREEN_WRITE_EFFECTS_ENABLED = import.meta.env.VITE_ENABLE_SCREEN_WRITE_EFFECTS === "true";

const defaultStandardDocumentNames = [
  "PGR",
  "PCMSO",
  "Ficha de EPI",
  "DDS",
  "Ordem de Serviço",
  "ASO",
  "CNH",
  "Contratos",
  "Certificados",
  "Treinamentos NR",
];

function normalizeDocumentName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function getCompanyStandardDocumentNames(
  company?: { standardDocumentNames?: string[]; standardDocumentNamesByRole?: Record<string, string[]> },
  employee?: Pick<Employee, "role">,
) {
  if (employee) return employeeStandardDocumentNames(company, employee);

  const names = company?.standardDocumentNames?.map((name) => name.trim()).filter(Boolean) || [];
  return names.length ? names : defaultStandardDocumentNames;
}

const employeeImportFields = [
  { key: "registration", label: "Matrícula eSocial", aliases: ["registration", "matricula", "matrícula", "matricula esocial"] },
  { key: "employeeNumber", label: "Nº", aliases: ["registro", "registro nº", "numero registro", "nº", "numero"] },
  { key: "company", label: "Empregador", aliases: ["company", "empresa", "empregador", "razão social", "razao social"] },
  { key: "companyDocument", label: "CNPJ", aliases: ["cnpj", "cnpj empresa"] },
  { key: "companyAddress", label: "Endereço", aliases: ["endereco empresa", "endereço empresa", "endereço"] },
  { key: "department", label: "Departamento", aliases: ["department", "departamento"] },
  { key: "sector", label: "Setor", aliases: ["sector", "setor"] },
  { key: "subsector", label: "Subsetor", aliases: ["subsector", "subsetor", "sub-setor"] },
  { key: "name", label: "Empregado", aliases: ["name", "nome", "empregado", "funcionario", "funcionário"] },
  { key: "beneficiaries", label: "Beneficiários", aliases: ["beneficiarios", "beneficiários"] },
  { key: "residence", label: "Residência", aliases: ["residencia", "residência", "endereco", "endereço"] },
  { key: "birthDate", label: "Data de nascimento", aliases: ["data de nascimento", "nascimento", "birthdate"] },
  { key: "birthPlace", label: "Local do nascimento", aliases: ["local nascimento", "local do nascimento", "naturalidade"] },
  { key: "nationality", label: "País da nacionalidade", aliases: ["pais nacionalidade", "país da nacionalidade", "nacionalidade"] },
  { key: "maritalStatus", label: "Estado civil", aliases: ["estado civil"] },
  { key: "fatherName", label: "Pai", aliases: ["pai", "nome do pai"] },
  { key: "motherName", label: "Mãe", aliases: ["mae", "mãe", "nome da mae", "nome da mãe"] },
  { key: "color", label: "Cor", aliases: ["cor"] },
  { key: "sex", label: "Sexo", aliases: ["sexo"] },
  { key: "educationLevel", label: "Grau de instrução", aliases: ["grau de instrucao", "grau de instrução", "escolaridade"] },
  { key: "homePhone", label: "Telefone Residencial", aliases: ["telefone residencial"] },
  { key: "mobilePhone", label: "Telefone Celular", aliases: ["phone", "telefone", "celular", "telefone celular"] },
  { key: "disability", label: "Deficiência", aliases: ["deficiencia", "deficiência", "pcd"] },
  { key: "rg", label: "Cédula de Identidade", aliases: ["rg", "identidade", "cedula de identidade", "cédula de identidade"] },
  { key: "rgIssueDate", label: "Data de emissão", aliases: ["data emissao", "data de emissão", "emissao rg"] },
  { key: "rgIssuer", label: "Órgão/UF emissor", aliases: ["orgao emissor", "órgão emissor", "orgao uf emissor"] },
  { key: "voterTitle", label: "Título Eleitoral", aliases: ["titulo eleitoral", "título eleitoral"] },
  { key: "voterZone", label: "Zona", aliases: ["zona", "zona eleitoral"] },
  { key: "voterSection", label: "Seção", aliases: ["secao", "seção", "seção eleitoral"] },
  { key: "professionalCouncil", label: "Inscr. Órgão de Classe", aliases: ["inscr orgao de classe", "órgão de classe"] },
  { key: "ctpsNumber", label: "CTPS", aliases: ["ctps"] },
  { key: "ctpsSeries", label: "Série", aliases: ["serie", "série", "serie ctps"] },
  { key: "ctpsIssueDate", label: "Data de expedição da CTPS", aliases: ["data expedicao ctps", "data de expedição da ctps"] },
  { key: "ctpsUf", label: "UF CTPS", aliases: ["uf ctps"] },
  { key: "cpf", label: "CPF", aliases: ["cpf"] },
  { key: "driversLicense", label: "Cart. Nac. Habilitação", aliases: ["cnh", "cart nac habilitacao", "habilitação"] },
  { key: "employeeCategory", label: "Categoria", aliases: ["categoria"] },
  { key: "militaryDocument", label: "Doc. militar", aliases: ["doc militar", "documento militar"] },
  { key: "militaryCategory", label: "Categoria", aliases: ["categoria militar"] },
  { key: "position", label: "Cargo", aliases: ["position", "cargo"] },
  { key: "role", label: "Função", aliases: ["role", "função", "funcao"] },
  { key: "cbo", label: "C.B.O", aliases: ["cbo", "c.b.o"] },
  { key: "admissionDate", label: "Data de Admissão", aliases: ["admissiondate", "admissao", "admissão", "data de admissão"] },
  { key: "salary", label: "Salário", aliases: ["salario", "salário"] },
  { key: "salaryPeriod", label: "Por", aliases: ["salario por", "por"] },
  { key: "workHours", label: "Horário de Trabalho", aliases: ["horario de trabalho", "horário de trabalho"] },
  { key: "breakHours", label: "Horário de Intervalo", aliases: ["horario de intervalo", "intervalo"] },
  { key: "fgts", label: "FGTS", aliases: ["fgts"] },
  { key: "fgtsDate", label: "Opção em", aliases: ["fgts", "opcao fgts", "opção em"] },
  { key: "bankAccount", label: "Conta vinculada no banco", aliases: ["conta vinculada", "conta bancaria", "conta bancária"] },
  { key: "rectificationDate", label: "Data da Retificação", aliases: ["data da retificacao", "retificação"] },
  { key: "pisNumber", label: "PIS", aliases: ["pis", "sob nº", "sob n", "numero pis"] },
  { key: "pisRegisteredAt", label: "Cadastrado em", aliases: ["pis cadastrado em", "cadastrado em"] },
  { key: "bankDomicile", label: "Domicílio bancário", aliases: ["domicilio bancario", "domicílio bancário"] },
  { key: "bankNumber", label: "Nº banco", aliases: ["nº banco", "numero banco", "banco"] },
  { key: "bankAgencyCode", label: "Agência código", aliases: ["agencia codigo", "agência código", "agencia"] },
  { key: "bankAgencyAddress", label: "End. da agência", aliases: ["end da agencia", "endereço agência"] },
  { key: "salaryRoleChanges", label: "alterações de salário/cargo", aliases: ["alterações de salário", "alteracoes cargo"] },
  { key: "vacationHistory", label: "férias", aliases: ["férias", "ferias"] },
  { key: "annotations", label: "anotações", aliases: ["anotações", "anotacoes", "obs"] },
  { key: "workAccidents", label: "acidentes de trabalho", aliases: ["acidentes de trabalho", "doenças profissionais"] },
  { key: "termination", label: "rescisão", aliases: ["rescisão", "rescisao"] },
  { key: "resignationDate", label: "Data da saída", aliases: ["data da saida", "data de saída"] },
  { key: "noticeDate", label: "Data aviso ind.", aliases: ["data aviso", "aviso indenizado"] },
  { key: "projectionDate", label: "Data projeção", aliases: ["data projecao", "data projeção"] },
  { key: "terminationType", label: "Tipo do desligamento", aliases: ["tipo desligamento", "tipo do desligamento"] },
  { key: "unionContribution", label: "contribuição sindical", aliases: ["contribuição sindical", "contribuicao sindical"] },
  { key: "notes", label: "observações", aliases: ["observacoes", "observações", "obs"] },
  { key: "email", label: "E-mail", aliases: ["email", "e-mail"] },
  { key: "emergencyContact", label: "Contato de emergência", aliases: ["emergencycontact", "contato emergencia", "contato emergencial"] },
] as const;

type EmployeeImportField = typeof employeeImportFields[number]["key"];
type EmployeeImportMapping = Partial<Record<EmployeeImportField, string>>;

type EmployeeRegistrationSection = {
  title: string;
  subtitle?: string;
  fields: EmployeeImportField[];
};

const employeeRegistrationSections: EmployeeRegistrationSection[] = [
  { title: "REGISTRO DE EMPREGADO", fields: ["registration", "employeeNumber", "company", "companyDocument", "companyAddress"] },
  { title: "Empregado e beneficiários", fields: ["name", "residence", "beneficiaries"] },
  { title: "Dados pessoais e filiação", fields: ["birthDate", "birthPlace", "nationality", "maritalStatus", "fatherName", "motherName"] },
  { title: "Documentos e qualificação", fields: ["rg", "rgIssueDate", "rgIssuer", "voterTitle", "voterZone", "voterSection", "professionalCouncil", "ctpsNumber", "ctpsSeries", "ctpsIssueDate", "ctpsUf", "cpf", "driversLicense", "employeeCategory", "militaryDocument", "militaryCategory", "color", "sex", "educationLevel", "homePhone", "mobilePhone", "disability", "position", "role", "cbo"] },
  { title: "Admissão", fields: ["admissionDate", "salary", "salaryPeriod", "workHours", "breakHours"] },
  { title: "FGTS", fields: ["fgts", "fgtsDate", "bankAccount", "rectificationDate"] },
  { title: "Programa de Integração Social - PIS", fields: ["pisRegisteredAt", "pisNumber", "bankDomicile", "bankNumber", "bankAgencyCode", "bankAgencyAddress"] },
  { title: "Alterações de salário, cargo e/ou função", fields: ["salaryRoleChanges"] },
  { title: "Férias e observações", fields: ["vacationHistory", "annotations"] },
  { title: "Acidentes de trabalho, doenças ou doenças profissionais", fields: ["workAccidents"] },
  { title: "Rescisão de contrato de trabalho", fields: ["termination", "resignationDate", "noticeDate", "projectionDate", "terminationType"] },
  { title: "Contribuição sindical", fields: ["unionContribution"] },
  { title: "Observações e informações complementares", fields: ["notes", "email", "emergencyContact"] },
];

const dateRegistrationFields = new Set<EmployeeImportField>([
  "birthDate",
  "rgIssueDate",
  "ctpsIssueDate",
  "admissionDate",
  "fgtsDate",
  "rectificationDate",
  "pisRegisteredAt",
  "resignationDate",
  "noticeDate",
  "projectionDate",
]);

const multilineRegistrationFields = new Set<EmployeeImportField>([
  "companyAddress",
  "residence",
  "beneficiaries",
  "salaryRoleChanges",
  "vacationHistory",
  "annotations",
  "workAccidents",
  "termination",
  "unionContribution",
  "notes",
]);

interface EmployeeImportRow {
  id: string;
  row: Record<string, string>;
  file?: File;
}


const emptyEmployee: EmployeeWizardForm = {
  employeeKind: "contract",
  companyId: "",
  departmentId: "",
  sectorId: "",
  subsectorId: "",
  teamId: "",
  isTeamLead: false,
  registration: "",
  name: "",
  cpf: "",
  phone: "",
  role: "",
  position: "",
  workSchedule: "Segunda a sexta, 07:00 às 17:00",
  workScheduleDays: scheduleTemplate,
  weeklyHours: 44,
  salary: 0,
  admissionDate: todayISO(),
  status: "active",
  complement: emptyComplement,
  createLogin: false,
  username: "",
  password: "",
  permissionProfileId: "",
  diaristUseStructure: false,
  diaristDailyRate: 0,
  diaristBankDetails: "",
  diaristResponsible: "",
  diaristWorkplace: "",
};

function normalizeKey(key: string) {
  return key
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function normalizeFilterValue(value?: string) {
  return String(value || "").trim().toLocaleLowerCase("pt-BR");
}

const emptyImportedStructureValues = new Set([
  "",
  "null",
  "undefined",
  "none",
  "nenhum",
  "nenhuma",
  "sem",
  "na",
  "naoinformado",
  "naoinformada",
  "indefinido",
  "indefinida",
  "adefinir",
  "semdepartamento",
  "semsetor",
  "semsubsetor",
]);

function normalizeOptionalStructureName(value?: string) {
  const text = String(value || "").trim();
  const normalized = normalizeKey(text);
  // Mudanca: valores importados como "null" agora viram vazio e nao criam setor/departamento falso.
  return emptyImportedStructureValues.has(normalized) ? "" : text;
}

function getImportedValue(row: Record<string, string>, field: EmployeeImportField, mapping: EmployeeImportMapping) {
  const mappedColumn = mapping[field];
  if (mappedColumn && row[mappedColumn] != null) return row[mappedColumn];

  const normalizedRow = Object.keys(row).reduce<Record<string, string>>((acc, key) => {
    acc[normalizeKey(key)] = row[key];
    return acc;
  }, {});

  const fieldConfig = employeeImportFields.find((item) => item.key === field);
  for (const candidate of fieldConfig?.aliases || []) {
    const normalized = normalizeKey(candidate);
    if (normalizedRow[normalized]) return normalizedRow[normalized];
  }

  return "";
}

function getRowMissingFields(row: Record<string, string>, mapping: EmployeeImportMapping) {
  const requiredFields: EmployeeImportField[] = ["company", "name"];
  return requiredFields.filter((field) => !getImportedValue(row, field, mapping).trim());
}

function toNumber(value: string) {
  const normalized = String(value || "")
    .replace(/[^0-9,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function registrationDataFromRow(row: Record<string, string>, mapping: EmployeeImportMapping) {
  return employeeImportFields.reduce<Record<string, string>>((acc, field) => {
    const value = getImportedValue(row, field.key, mapping).trim();
    if (value) acc[field.key] = value;
    return acc;
  }, {});
}

function minutes(value?: string) {
  if (!value) return 0;
  const [hour, minute] = value.split(":").map(Number);
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : 0;
}

function calculateWeeklyHours(days: WorkScheduleDay[]) {
  const totalMinutes = days.reduce((total, day) => {
    if (!day.enabled || !day.start || !day.end) return total;
    const breakMinutes = day.breakStart && day.breakEnd ? Math.max(0, minutes(day.breakEnd) - minutes(day.breakStart)) : 0;
    return total + Math.max(0, minutes(day.end) - minutes(day.start) - breakMinutes);
  }, 0);

  return Math.round((totalMinutes / 60) * 100) / 100;
}

function scheduleSummary(days: WorkScheduleDay[]) {
  const active = days.filter((day) => day.enabled);
  if (!active.length) return "";
  return active.map((day) => `${day.day}: ${day.start || "--:--"} às ${day.end || "--:--"}`).join(" | ");
}

function normalizedPermissionActions(actions: PermissionAction[] | undefined) {
  return Array.from(new Set(actions || [])).sort().join("|");
}

function permissionsMatchProfile(userPermissions: SystemPermission[], profile: PermissionProfile) {
  return systemScreens.every((screen) => (
    normalizedPermissionActions(userPermissions.find((permission) => permission.screen === screen.key)?.actions)
    === normalizedPermissionActions(profile.permissions[screen.key as AppScreen])
  ));
}

function currentPermissionProfileId(
  login: SystemUser | undefined,
  permissions: SystemPermission[],
  profiles: PermissionProfile[],
) {
  if (!login) return "";

  if (login.permissionProfileId && profiles.some((profile) => profile.id === login.permissionProfileId)) {
    return login.permissionProfileId;
  }

  const userPermissions = permissions.filter((permission) => permission.userId === login.id);
  const matchingProfile = profiles.find((profile) => permissionsMatchProfile(userPermissions, profile));
  return matchingProfile?.id || "";
}


function parseBirthdayParts(value?: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const brMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  const [, year = "", month = "", day = ""] = isoMatch
    ? isoMatch
    : brMatch
      ? ["", brMatch[3], brMatch[2], brMatch[1]]
      : [];

  const numericYear = Number(year);
  const numericMonth = Number(month);
  const numericDay = Number(day);
  if (
    !Number.isInteger(numericYear)
    || !Number.isInteger(numericMonth)
    || !Number.isInteger(numericDay)
    || numericMonth < 1
    || numericMonth > 12
    || numericDay < 1
    || numericDay > 31
  ) {
    return null;
  }

  const paddedMonth = String(numericMonth).padStart(2, "0");
  const paddedDay = String(numericDay).padStart(2, "0");
  const paddedYear = String(numericYear).padStart(4, "0");

  return {
    year: paddedYear,
    month: paddedMonth,
    day: paddedDay,
    iso: `${paddedYear}-${paddedMonth}-${paddedDay}`,
  };
}

function matchesBirthdayFilter(
  birthDate: string | undefined,
  mode: BirthdayFilterMode,
  month: string,
  year: string,
  fullDate: string,
) {
  if (mode === "month" && !month) return true;
  if (mode === "year" && !year) return true;
  if (mode === "full" && !fullDate) return true;

  const birthday = parseBirthdayParts(birthDate);
  if (!birthday) return false;
  const selectedMonth = month.length >= 7 ? month.slice(5, 7) : month;

  if (mode === "month") return birthday.month === selectedMonth;
  if (mode === "year") return birthday.year === year;
  return birthday.iso === fullDate;
}

function getEmployeeKind(employee: Employee): EmployeeKind {
  const employeeKind = employee.registrationData?.employeeKind;
  if (employeeKind === "company" || employeeKind === "diarist") return employeeKind;
  return "contract";
}

function makeClientId(prefix: string) {
  const randomId = globalThis.crypto?.randomUUID?.();
  if (randomId) return `${prefix}-${randomId}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function groupUnitSelectionKey(type: CompanyGroupUnitType): keyof EmployeeGroupUnitSelection {
  if (type === "department") return "departmentUnitId";
  if (type === "sector") return "sectorUnitId";
  if (type === "subsector") return "subsectorUnitId";
  return "teamUnitId";
}

function employeeSourceId(employee: Partial<Employee>, type: CompanyGroupUnitType) {
  if (type === "department") return employee.departmentId || "";
  if (type === "sector") return employee.sectorId || "";
  if (type === "subsector") return employee.subsectorId || "";
  return employee.teamId || "";
}

function groupUnitExists(group: EmployeeFormGroup | undefined, unitId: string | undefined, type: CompanyGroupUnitType) {
  return Boolean(unitId && group?.units.some((unit) => unit.id === unitId && unit.type === type));
}

function inferGroupUnitId(group: EmployeeFormGroup | undefined, employee: Partial<Employee>, type: CompanyGroupUnitType) {
  const sourceId = employeeSourceId(employee, type);
  if (!group || !sourceId) return "";
  return group.units.find((unit) => unit.type === type && unit.links.some((link) => (
    link.companyId === employee.companyId && link.sourceId === sourceId
  )))?.id || "";
}

function employeeGroupUnitSelection(group: EmployeeFormGroup | undefined, employee: Partial<Employee> | undefined): EmployeeGroupUnitSelection {
  if (!group || !employee?.companyId) return { ...emptyGroupUnitSelection };
  const assignment = employee.id
    ? group.employeeAssignments.find((item) => item.employeeId === employee.id)
    : undefined;
  const unitIdFor = (type: CompanyGroupUnitType) => {
    const key = groupUnitSelectionKey(type);
    const explicit = assignment?.[key];
    return groupUnitExists(group, explicit, type) ? explicit || "" : inferGroupUnitId(group, employee, type);
  };

  return {
    departmentUnitId: unitIdFor("department"),
    sectorUnitId: unitIdFor("sector"),
    subsectorUnitId: unitIdFor("subsector"),
    teamUnitId: unitIdFor("team"),
  };
}

function sourceIdForGroupUnit(group: EmployeeFormGroup | undefined, type: CompanyGroupUnitType, unitId: string, companyId: string) {
  const unit = group?.units.find((item) => item.id === unitId && item.type === type);
  return unit?.links.find((link) => link.companyId === companyId)?.sourceId || "";
}

function suggestUsername(name: string) {
  return createUsernameFromName(name);
}

export default function Employees() {
  const data = useDomainData();
  const { can, user } = useAuth();
  const canCreateEmployees = can("employees", "create");
  const canEditEmployees = can("employees", "edit");
  const canDeleteEmployees = can("employees", "delete");
  const canManageEmployeeScreen = can("employees", "manage");
  const undoTimer = useRef<number | undefined>(undefined);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [employeeImportOpen, setEmployeeImportOpen] = useState(false);
  const [employeeImportRows, setEmployeeImportRows] = useState<EmployeeImportRow[]>([]);
  const [employeeImportFileName, setEmployeeImportFileName] = useState("");
  const [registrationPdfFile, setRegistrationPdfFile] = useState<File | null>(null);
  const [isImportDragActive, setImportDragActive] = useState(false);
  const [employeeImportMapping, setEmployeeImportMapping] = useState<EmployeeImportMapping>({});
  const [employeeImportReport, setEmployeeImportReport] = useState<Array<{ index: number; status: string; message: string }>>([]);
  const [employeeImporting, setEmployeeImporting] = useState(false);
  const [pdfImporting, setPdfImporting] = useState(false);
  const [wizardSaving, setWizardSaving] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [confirmingAction, setConfirmingAction] = useState(false);
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; confirmLabel: string; impact?: DeleteImpact; onConfirm: () => Promise<void> } | null>(null);
  const [formError, setFormError] = useState("");
  const [undoState, setUndoState] = useState<UndoState>(null);
  const [step, setStep] = useState(1);
  const [draftId, setDraftId] = useState<string | undefined>();
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | undefined>();
  const [promotionMode, setPromotionMode] = useState(false);
  const [form, setForm] = useState<EmployeeWizardForm>(emptyEmployee);
  const [groupUnitSelection, setGroupUnitSelection] = useState<EmployeeGroupUnitSelection>(emptyGroupUnitSelection);
  const initialEmployeeFilters = {
    companyIds: [] as string[],
    departmentIds: [] as string[],
    sectorIds: [] as string[],
    subsectorIds: [] as string[],
    teamIds: [] as string[],
    roleValues: [] as string[],
    employeeIds: [] as string[],
    cpfValues: [] as string[],
    usernameValues: [] as string[],
    statuses: [] as string[],
    employeeKinds: [] as EmployeeKind[],
    birthdayMode: "month" as BirthdayFilterMode,
    birthdayMonth: "",
    birthdayYear: "",
    birthdayDate: "",
    search: "",
  };
  const [filters, setFilters] = useState(initialEmployeeFilters);
  const [sensitiveDataVisible, setSensitiveDataVisible] = useState(false);
  const [sensitivePasswordModalOpen, setSensitivePasswordModalOpen] = useState(false);
  const [sensitivePassword, setSensitivePassword] = useState("");
  const [sensitivePasswordError, setSensitivePasswordError] = useState("");
  const [sensitivePasswordChecking, setSensitivePasswordChecking] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportPassword, setExportPassword] = useState("");
  const [exportPasswordError, setExportPasswordError] = useState("");
  const [exportChecking, setExportChecking] = useState(false);
  const [noticeEmployee, setNoticeEmployee] = useState<Employee | null>(null);
  const [noticeStartDate, setNoticeStartDate] = useState("");
  const [noticeEndDate, setNoticeEndDate] = useState("");
  const [noticeSaving, setNoticeSaving] = useState(false);
  const [statusScheduleEmployee, setStatusScheduleEmployee] =
    useState<Employee | null>(null);
  const [statusScheduleAction, setStatusScheduleAction] =
    useState<StatusScheduleAction>("deactivate");
  const [statusScheduleDate, setStatusScheduleDate] = useState("");
  const [statusScheduleSaving, setStatusScheduleSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const automaticGroupSyncRef = useRef(false);
  const noticeTerminationSyncRef = useRef(false);
  const pageSize = 10;

  const storedCompanyGroups = useMemo<EmployeeFormGroup[]>(() => data.companyGroups.map((group) => {
    const companyIds = data.companyGroupCompanies
      .filter((item) => item.groupId === group.id)
      .map((item) => item.companyId);
    const units = data.companyGroupUnits
      .filter((item) => item.groupId === group.id && item.active !== false)
      .map<EmployeeFormGroupUnit>((unit) => ({
        id: unit.id,
        name: unit.name,
        type: unit.type,
        parentUnitId: unit.parentUnitId || "",
        active: unit.active,
        links: data.companyGroupUnitLinks
          .filter((link) => link.groupId === group.id && link.groupUnitId === unit.id)
          .map((link) => ({
            companyId: link.companyId,
            sourceId: link.sourceId,
            sourceType: link.sourceType,
          })),
      }));

    return {
      id: group.id,
      name: group.name,
      active: group.active,
      companyIds,
      units,
      employeeAssignments: data.companyGroupEmployeeAssignments.filter((item) => item.groupId === group.id),
    };
  }), [
    data.companyGroups,
    data.companyGroupCompanies,
    data.companyGroupUnits,
    data.companyGroupUnitLinks,
    data.companyGroupEmployeeAssignments,
  ]);

  useEffect(() => {
    if (!SCREEN_WRITE_EFFECTS_ENABLED) return;
    if (data.loading || !data.companies.length || automaticGroupSyncRef.current) return;
    if (window.localStorage.getItem("companies.company-groups.v1") && data.companyGroups.length === 0) return;
    const assignedCompanyIds = new Set(data.companyGroupCompanies.map((item) => item.companyId));
    const missingCompanies = data.companies.filter((company) => !assignedCompanyIds.has(company.id));
    if (!missingCompanies.length) return;

    automaticGroupSyncRef.current = true;
    void (async () => {
      // Processa um grupo por vez: evita várias gravações concorrentes usando
      // snapshots antigos e impede repetição do efeito enquanto a sincronização roda.
      for (const company of missingCompanies) {
        const now = new Date().toISOString();
        await data.saveCompanyGroupGraph({
          group: {
            id: `group-company-${company.id}`,
            name: company.name ? `Grupo ${company.name}` : "Grupo da empresa",
            active: true,
            autoSyncStructure: true,
            divergenceMode: "keep_existing",
            divergenceSourceCompanyId: "",
            divergenceTypes: [],
            createdAt: now,
            updatedAt: now,
          },
          companyIds: [company.id],
          units: [],
          employeeAssignments: data.employees
            .filter((employee) => employee.companyId === company.id)
            .map((employee) => ({
              employeeId: employee.id,
              departmentUnitId: "",
              sectorUnitId: "",
              subsectorUnitId: "",
              teamUnitId: "",
              createdAt: now,
              updatedAt: now,
            })),
          leadershipAssignments: [],
        });
      }
    })()
      .catch((error) => console.error("Não foi possível criar os grupos obrigatórios das empresas.", error))
      .finally(() => {
        automaticGroupSyncRef.current = false;
      });
  }, [data.loading, data.companies, data.companyGroups.length, data.companyGroupCompanies, data.employees, data.saveCompanyGroupGraph]);

  const companyById = useMemo(() => new Map(data.companies.map((company) => [company.id, company])), [data.companies]);
  const teamById = useMemo(() => new Map(data.teams.map((team) => [team.id, team])), [data.teams]);
  const groupByCompanyId = useMemo(() => {
    const map = new Map<string, EmployeeFormGroup>();
    storedCompanyGroups.forEach((group) => {
      group.companyIds.forEach((companyId) => map.set(companyId, group));
    });
    return map;
  }, [storedCompanyGroups]);
  const groupForCompany = (companyId: string) => groupByCompanyId.get(companyId);
  const selectedFormGroup = form.companyId ? groupForCompany(form.companyId) : undefined;
  const selectedFormUsesGroupStructure = Boolean(selectedFormGroup?.units.length);
  const structureFieldsDisabled = form.employeeKind === "diarist" && !form.diaristUseStructure;

  function groupUnitNameForEmployee(employee: Employee, type: CompanyGroupUnitType) {
    const group = groupForCompany(employee.companyId);
    if (!group?.units.length) return "";
    const selection = employeeGroupUnitSelection(group, employee);
    const unitId = selection[groupUnitSelectionKey(type)];
    return group.units.find((unit) => unit.id === unitId && unit.type === type)?.name || "";
  }

  const employeeTeamFilterOption = useCallback((employee: Employee) => {
    const group = groupByCompanyId.get(employee.companyId);
    if (group?.units.length) {
      const selection = employeeGroupUnitSelection(group, employee);
      const unitId = selection.teamUnitId;
      const unit = group.units.find((item) => item.id === unitId && item.type === "team");
      if (unit) {
        return {
          value: `group:${group.id}:${unit.id}`,
          label: `${unit.name} · ${group.name}`,
        };
      }
    }

    const team = employee.teamId ? teamById.get(employee.teamId) : undefined;
    if (!team) return null;
    const company = companyById.get(team.companyId || employee.companyId);
    return {
      value: `team:${team.id}`,
      label: company?.name ? `${team.name} · ${company.name}` : team.name,
    };
  }, [companyById, groupByCompanyId, teamById]);

  const selectedDepartmentId = selectedFormUsesGroupStructure ? groupUnitSelection.departmentUnitId : form.departmentId || "";
  const selectedSectorId = selectedFormUsesGroupStructure ? groupUnitSelection.sectorUnitId : form.sectorId || "";
  const departmentSelectValue = selectedFormUsesGroupStructure ? groupUnitSelection.departmentUnitId : form.departmentId || "";
  const sectorSelectValue = selectedFormUsesGroupStructure ? groupUnitSelection.sectorUnitId : form.sectorId || "";
  const subsectorSelectValue = selectedFormUsesGroupStructure ? groupUnitSelection.subsectorUnitId : form.subsectorId || "";
  const teamSelectValue = selectedFormUsesGroupStructure ? groupUnitSelection.teamUnitId : form.teamId || "";

  const departments = selectedFormUsesGroupStructure
    ? selectedFormGroup?.units.filter((item) => item.type === "department") || []
    : data.departments.filter((item) => !form.companyId || item.companyId === form.companyId);
  const sectors = selectedFormUsesGroupStructure
    ? selectedFormGroup?.units.filter((item) => (
      item.type === "sector" && (!selectedDepartmentId || !item.parentUnitId || item.parentUnitId === selectedDepartmentId)
    )) || []
    : data.sectors.filter((item) => !form.departmentId || item.departmentId === form.departmentId);
  const subsectors = selectedFormUsesGroupStructure
    ? selectedFormGroup?.units.filter((item) => (
      item.type === "subsector" && (!selectedSectorId || !item.parentUnitId || item.parentUnitId === selectedSectorId)
    )) || []
    : data.subsectors.filter((item) => !form.sectorId || item.sectorId === form.sectorId);
  const teams = selectedFormUsesGroupStructure
    ? selectedFormGroup?.units.filter((item) => item.type === "team") || []
    : data.teams.filter((item) => !form.companyId || item.companyId === form.companyId);

  function handleCompanyChange(companyId: string) {
    setGroupUnitSelection({ ...emptyGroupUnitSelection });
    setForm({ ...form, companyId, departmentId: "", sectorId: "", subsectorId: "", teamId: "", isTeamLead: false });
  }

  function handleDepartmentChange(departmentId: string) {
    if (selectedFormUsesGroupStructure) {
      setGroupUnitSelection((current) => ({ ...current, departmentUnitId: departmentId, sectorUnitId: "", subsectorUnitId: "" }));
      return;
    }
    setForm({ ...form, departmentId, sectorId: "", subsectorId: "" });
  }

  function handleSectorChange(sectorId: string) {
    if (selectedFormUsesGroupStructure) {
      setGroupUnitSelection((current) => ({ ...current, sectorUnitId: sectorId, subsectorUnitId: "" }));
      return;
    }
    setForm({ ...form, sectorId, subsectorId: "" });
  }

  function handleSubsectorChange(subsectorId: string) {
    if (selectedFormUsesGroupStructure) {
      setGroupUnitSelection((current) => ({ ...current, subsectorUnitId: subsectorId }));
      return;
    }
    setForm({ ...form, subsectorId });
  }

  function handleTeamChange(teamId: string) {
    if (selectedFormUsesGroupStructure) {
      setGroupUnitSelection((current) => ({ ...current, teamUnitId: teamId }));
      setForm({ ...form, isTeamLead: teamId ? Boolean(form.isTeamLead) : false });
      return;
    }
    setForm({ ...form, teamId, isTeamLead: teamId ? Boolean(form.isTeamLead) : false });
  }

  const employeeOptions = useMemo(() => (
    data.employees.map((item) => ({ value: item.id, label: item.name }))
  ), [data.employees]);

  const teamOptions = useMemo(() => {
    const options = new Map<string, { value: string; label: string }>();
    data.employees.forEach((employee) => {
      const option = employeeTeamFilterOption(employee);
      if (option && !options.has(option.value)) options.set(option.value, option);
    });
    return Array.from(options.values());
  }, [data.employees, employeeTeamFilterOption]);

  const roleOptions = useMemo(() => {
    const options = new Map<string, { value: string; label: string }>();
    data.employees.forEach((employee) => {
      const label = employee.role?.trim();
      if (!label) return;
      const value = normalizeFilterValue(label);
      if (!options.has(value)) options.set(value, { value, label });
    });
    return Array.from(options.values());
  }, [data.employees]);

  const cpfOptions = useMemo(() => (
    Array.from(new Set(data.employees.map((item) => item.cpf?.trim() || ""))).filter(Boolean).map((cpf) => ({ value: cpf, label: cpf }))
  ), [data.employees]);

  const systemUserByEmployeeId = useMemo(() => new Map(
    data.systemUsers.filter((systemUser) => systemUser.employeeId).map((systemUser) => [systemUser.employeeId as string, systemUser]),
  ), [data.systemUsers]);

  const usernameOptions = useMemo(() => data.systemUsers
    .map((systemUser) => ({ value: systemUser.username, label: systemUser.username }))
    .sort((left, right) => left.label.localeCompare(right.label, "pt-BR")), [data.systemUsers]);

  const birthdayYearOptions = useMemo(() => {
    const years = new Set<string>();
    data.employees.forEach((employee) => {
      const year = parseBirthdayParts(employee.registrationData?.birthDate)?.year;
      if (year) years.add(year);
    });
    return Array.from(years)
      .sort((left, right) => right.localeCompare(left))
      .map((year) => ({ value: year, label: year }));
  }, [data.employees]);

  function getEmployeeDisplayStatus(employee: Employee) {
    const today = todayISO();
    const scheduledReactivationDate =
      employee.registrationData?.scheduledReactivationDate ||
      employee.registrationData?.reactivationEffectiveDate ||
      "";
    if (
      employee.status === "terminated" &&
      scheduledReactivationDate &&
      today >= scheduledReactivationDate
    ) {
      return "active";
    }

    const scheduledDeactivationDate =
      employee.registrationData?.scheduledDeactivationDate ||
      employee.registrationData?.deactivationEffectiveDate ||
      "";
    if (scheduledDeactivationDate && today >= scheduledDeactivationDate)
      return "terminated";

    if (employee.status === "terminated") return "terminated";
    const noticeStartDate = employee.registrationData?.noticeStartDate || "";
    const noticeEndDate = employee.registrationData?.noticeEndDate || employee.registrationData?.noticeDate || "";
    if (noticeStartDate && noticeEndDate && today >= noticeStartDate && today < noticeEndDate) return "notice";
    return employee.status;
  }

  function employeeStatusScheduleText(employee: Employee) {
    const registrationData = employee.registrationData || {};
    const today = todayISO();
    const reactivationDate =
      registrationData.scheduledReactivationDate ||
      registrationData.reactivationEffectiveDate ||
      "";
    if (employee.status === "terminated" && reactivationDate && today < reactivationDate) {
      return `Volta ao ponto em: ${formatDate(reactivationDate)}`;
    }

    const deactivationDate =
      registrationData.scheduledDeactivationDate ||
      registrationData.deactivationEffectiveDate ||
      "";
    const noticeEndDate = registrationData.noticeEndDate || registrationData.noticeDate || "";
    if (
      employee.status !== "terminated" &&
      deactivationDate &&
      today < deactivationDate &&
      deactivationDate !== noticeEndDate
    ) {
      return `Sai do ponto em: ${formatDate(deactivationDate)}`;
    }

    return "";
  }

  const filteredEmployees = useMemo(() => data.employees.filter((employee) => {
    const login = systemUserByEmployeeId.get(employee.id);
    const teamOption = employeeTeamFilterOption(employee);
    const search = `${employee.name} ${employee.registration} ${employee.cpf} ${employee.role} ${employee.position} ${teamOption?.label || ""} ${login?.username || ""}`.toLowerCase();
    const displayStatus = getEmployeeDisplayStatus(employee);
    const employeeKind = getEmployeeKind(employee);
    return (
      (!filters.companyIds.length || filters.companyIds.includes(employee.companyId))
      && (!filters.departmentIds.length || filters.departmentIds.includes(employee.departmentId))
      && (!filters.sectorIds.length || filters.sectorIds.includes(employee.sectorId))
      && (!filters.subsectorIds.length || filters.subsectorIds.includes(employee.subsectorId ?? ""))
      && (!filters.teamIds.length || filters.teamIds.includes(teamOption?.value || ""))
      && (!filters.roleValues.length || filters.roleValues.includes(normalizeFilterValue(employee.role)))
      && (!filters.employeeIds.length || filters.employeeIds.includes(employee.id))
      && (!filters.cpfValues.length || filters.cpfValues.includes(employee.cpf?.trim() || ""))
      && (!filters.usernameValues.length || filters.usernameValues.includes(login?.username || ""))
      && (!filters.statuses.length || filters.statuses.includes(displayStatus))
      && (!filters.employeeKinds.length || filters.employeeKinds.includes(employeeKind))
      && matchesBirthdayFilter(
        employee.registrationData?.birthDate,
        filters.birthdayMode,
        filters.birthdayMonth,
        filters.birthdayYear,
        filters.birthdayDate,
      )
      && (!filters.search || search.includes(filters.search.toLowerCase()))
    );
  }), [data.employees, employeeTeamFilterOption, filters, systemUserByEmployeeId]);

  const totalPages = Math.max(1, Math.ceil(filteredEmployees.length / pageSize));
  const paginatedEmployees = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredEmployees.slice(start, start + pageSize);
  }, [currentPage, filteredEmployees]);
  const pageStart = filteredEmployees.length ? (currentPage - 1) * pageSize + 1 : 0;
  const pageEnd = Math.min(currentPage * pageSize, filteredEmployees.length);

  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (!wizardOpen || !editingEmployeeId || !selectedFormUsesGroupStructure || !selectedFormGroup) return;
    const employee = data.employees.find((item) => item.id === editingEmployeeId);
    if (!employee) return;

    const inferred = employeeGroupUnitSelection(selectedFormGroup, employee);
    setGroupUnitSelection((current) => {
      const next = { ...current };
      let changed = false;
      const keepValidOrReplace = (key: keyof EmployeeGroupUnitSelection, type: CompanyGroupUnitType) => {
        if (groupUnitExists(selectedFormGroup, current[key], type)) return;
        if (current[key] === inferred[key]) return;
        next[key] = inferred[key];
        changed = true;
      };

      keepValidOrReplace("departmentUnitId", "department");
      keepValidOrReplace("sectorUnitId", "sector");
      keepValidOrReplace("subsectorUnitId", "subsector");
      keepValidOrReplace("teamUnitId", "team");
      return changed ? next : current;
    });
  }, [wizardOpen, editingEmployeeId, selectedFormUsesGroupStructure, selectedFormGroup, data.employees]);

  useEffect(() => {
    if (!SCREEN_WRITE_EFFECTS_ENABLED) return;
    if (noticeTerminationSyncRef.current) return;
    const today = todayISO();
    const dueDeactivations = data.employees.filter((employee) => {
      const deactivationDate =
        employee.registrationData?.scheduledDeactivationDate ||
        employee.registrationData?.deactivationEffectiveDate ||
        employee.registrationData?.noticeEndDate ||
        employee.registrationData?.noticeDate ||
        "";
      return employee.status !== "terminated" && Boolean(deactivationDate) && deactivationDate <= today;
    });
    const dueReactivations = data.employees.filter((employee) => {
      const reactivationDate =
        employee.registrationData?.scheduledReactivationDate ||
        employee.registrationData?.reactivationEffectiveDate ||
        "";
      return employee.status === "terminated" && Boolean(reactivationDate) && reactivationDate <= today;
    });
    if (!dueDeactivations.length && !dueReactivations.length) return;

    noticeTerminationSyncRef.current = true;
    void (async () => {
      for (const employee of dueDeactivations) {
        await data.upsertEmployee({
          ...employee,
          status: "terminated",
          registrationData: {
            ...(employee.registrationData || {}),
            noticeCompletedDate: today,
            deactivationCompletedDate: today,
            noticeDate: "",
          },
          updatedAt: new Date().toISOString(),
        });
      }

      for (const employee of dueReactivations) {
        await data.upsertEmployee({
          ...employee,
          status: "active",
          registrationData: {
            ...(employee.registrationData || {}),
            scheduledReactivationDate: "",
            reactivationEffectiveDate: "",
            reactivationCompletedDate: today,
            noticeDate: "",
            noticeStartDate: "",
            noticeEndDate: "",
            noticeScheduledAt: "",
            noticeCompletedDate: "",
          },
          updatedAt: new Date().toISOString(),
        });
      }
    })()
      .catch((error) => console.error("Não foi possível concluir automaticamente os avisos vencidos.", error))
      .finally(() => {
        noticeTerminationSyncRef.current = false;
      });
  }, [data.employees, data.upsertEmployee]);
  const hasActiveFilters = Boolean(
    filters.companyIds.length
    || filters.departmentIds.length
    || filters.sectorIds.length
    || filters.subsectorIds.length
    || filters.teamIds.length
    || filters.roleValues.length
    || filters.employeeIds.length
    || filters.cpfValues.length
    || filters.usernameValues.length
    || filters.statuses.length
    || filters.employeeKinds.length
    || filters.birthdayMonth
    || filters.birthdayYear
    || filters.birthdayDate
    || filters.search,
  );

  async function validateCurrentUserPassword(password: string) {
    const systemUser = data.systemUsers.find((entry) => entry.id === user?.id && entry.active !== false);
    const typedPasswordHash = password ? await hashPassword(password) : "";

    return Boolean(
      password
      && systemUser
      && (
        (systemUser.passwordHash && systemUser.passwordHash === typedPasswordHash)
        || (systemUser.password && systemUser.password === password)
      ),
    );
  }

  async function exportFilteredEmployeesToExcel(includeSalary: boolean) {
    if (!filteredEmployees.length) {
      window.alert("Nenhum funcionário encontrado para exportar.");
      return;
    }

    const rows = filteredEmployees.map((employee) => {
      const company = data.companies.find((item) => item.id === employee.companyId);
      const department = data.departments.find((item) => item.id === employee.departmentId);
      const sector = data.sectors.find((item) => item.id === employee.sectorId);
      const subsector = data.subsectors.find((item) => item.id === employee.subsectorId);
      const team = data.teams.find((item) => item.id === employee.teamId);
      const login = data.systemUsers.find((systemUser) => systemUser.employeeId === employee.id);
      const groupDepartmentName = groupUnitNameForEmployee(employee, "department");
      const groupSectorName = groupUnitNameForEmployee(employee, "sector");
      const groupSubsectorName = groupUnitNameForEmployee(employee, "subsector");
      const groupTeamName = groupUnitNameForEmployee(employee, "team");

      return {
        "Funcionário": employee.name || "",
        "Matrícula": employee.registration || "",
        "Usuário/Login": login?.username || "",
        "CPF": employee.cpf || "",
        "Telefone": employee.phone || "",
        "Empresa": company?.name || "",
        "Departamento": groupDepartmentName || department?.name || "",
        "Setor": groupSectorName || sector?.name || "",
        "Subsetor": groupSubsectorName || subsector?.name || "",
        "Equipe": groupTeamName || team?.name || "",
        "Encarregado": employee.isTeamLead ? "Sim" : "Não",
        "Função": employee.role || "",
        "Cargo": employee.position || "",
        "Jornada": employee.workSchedule || "",
        "Carga semanal": Number(employee.weeklyHours || 0),
        ...(includeSalary ? { "Salário": Number(employee.salary || 0) } : {}),
        "Admissão": employee.admissionDate || "",
        "Situação": labelStatus(employee.status),
        "E-mail": employee.complement?.email || "",
        "Contato de emergência": employee.complement?.emergencyContact || "",
        "Observações": employee.complement?.notes || "",
      };
    });

    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);

    worksheet["!cols"] = [
      { wch: 28 },
      { wch: 16 },
      { wch: 18 },
      { wch: 16 },
      { wch: 18 },
      { wch: 28 },
      { wch: 24 },
      { wch: 24 },
      { wch: 24 },
      { wch: 22 },
      { wch: 14 },
      { wch: 24 },
      { wch: 24 },
      { wch: 34 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 28 },
      { wch: 26 },
      { wch: 40 },
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, "Funcionários");

    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `funcionarios_filtrados_${date}.xlsx`);
  }

  const employeeRegistrationTemplate = new URL("../../../assets/Modelos/ficha_registro_modelo_em_branco_corrigido_final.pdf", import.meta.url).href;

  function closeSensitivePasswordModal() {
    if (sensitivePasswordChecking) return;
    setSensitivePasswordModalOpen(false);
    setSensitivePassword("");
    setSensitivePasswordError("");
  }

  function openExportModal() {
    if (!filteredEmployees.length) return;
    setExportModalOpen(true);
    setExportPassword("");
    setExportPasswordError("");
  }

  function closeExportModal() {
    if (exportChecking) return;
    setExportModalOpen(false);
    setExportPassword("");
    setExportPasswordError("");
  }

  async function exportWithoutSalary() {
    await exportFilteredEmployeesToExcel(false);
    closeExportModal();
  }

  async function submitExportWithSalary(event: FormEvent) {
    event.preventDefault();
    if (exportChecking) return;

    setExportChecking(true);
    try {
      const passwordMatches = await validateCurrentUserPassword(exportPassword);

      if (!canManageEmployeeScreen || !passwordMatches) {
        setExportPasswordError("Senha invalida.");
        return;
      }

      await exportFilteredEmployeesToExcel(true);
      setExportModalOpen(false);
      setExportPassword("");
      setExportPasswordError("");
    } finally {
      setExportChecking(false);
    }
  }

  function toggleSensitiveData() {
    if (sensitiveDataVisible) {
      setSensitiveDataVisible(false);
      return;
    }

    setSensitivePassword("");
    setSensitivePasswordError("");
    setSensitivePasswordModalOpen(true);
  }

  async function submitSensitivePassword(event: FormEvent) {
    event.preventDefault();
    if (sensitivePasswordChecking) return;

    setSensitivePasswordChecking(true);
    try {
      const passwordMatches = await validateCurrentUserPassword(sensitivePassword);

      if (!canManageEmployeeScreen || !passwordMatches) {
        setSensitivePasswordError("Senha invalida.");
        return;
      }

      setSensitiveDataVisible(true);
      setSensitivePasswordModalOpen(false);
      setSensitivePassword("");
      setSensitivePasswordError("");
    } finally {
      setSensitivePasswordChecking(false);
    }
  }

  function renderSensitiveColumnHeader(label: string) {
    return (
      <span className="protected-column-header">
        <span>{label}</span>
        <button
          aria-label={sensitiveDataVisible ? "Ocultar jornada e salário" : "Mostrar jornada e salário"}
          aria-pressed={sensitiveDataVisible}
          className="protected-toggle"
          title={sensitiveDataVisible ? "Ocultar jornada e salário" : "Mostrar jornada e salário"}
          type="button"
          onClick={toggleSensitiveData}
        >
          {sensitiveDataVisible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </span>
    );
  }

  function renderSensitiveValue(value: ReactNode, label: string) {
    if (sensitiveDataVisible) return value;
    return <span aria-label={`${label} oculto`} className="protected-value">••••••</span>;
  }

  function handleEmployeeImportDragEnter(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setImportDragActive(true);
  }

  function handleEmployeeImportDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setImportDragActive(true);
  }

  function handleEmployeeImportDragLeave(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setImportDragActive(false);
  }

  async function handleEmployeeImportDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setImportDragActive(false);

    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    await handleEmployeeImportFile(file);
  }

  async function handleEmployeeImportFile(file?: File) {
    if (!file || pdfImporting) return;

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      window.alert("A importação de funcionário deve ser feita por PDF.");
      return;
    }

    setPdfImporting(true);
    try {
      const parsed = await parseEmployeePdf(file);
      const registry = employeeImportFields.reduce<Record<string, string>>((acc, field) => {
        const value = parsed[field.key];
        if (typeof value === "string") acc[field.key] = value;
        return acc;
      }, { employeeKind: "company" });
      const parsedScheduleDays = Array.isArray(parsed.scheduleDays) ? parsed.scheduleDays : undefined;
      const phone = String(parsed.mobilePhone || parsed.phone || parsed.homePhone || "");
      const salary = toNumber(String(parsed.salary || ""));

      setRegistrationPdfFile(file);
      setEmployeeImportFileName(file.name);
      setEmployeeImportRows([{ id: makeClientId("pdf"), row: registry, file }]);
      setEmployeeImportMapping(
        employeeImportFields.reduce<EmployeeImportMapping>((acc, field) => {
          acc[field.key] = field.key;
          return acc;
        }, {}),
      );
      setEmployeeImportReport([]);
      setForm((current) => {
        const nextDays = parsedScheduleDays?.length ? parsedScheduleDays : blankScheduleTemplate;
        return {
          ...current,
          employeeKind: "company",
          registration: String(parsed.registration || parsed.employeeNumber || current.registration || ""),
          name: String(parsed.name || current.name || ""),
          cpf: String(parsed.cpf || current.cpf || ""),
          phone: phone || current.phone || "",
          role: String(parsed.role || current.role || ""),
          position: String(parsed.position || current.position || ""),
          admissionDate: String(parsed.admissionDate || current.admissionDate || todayISO()),
          salary: salary || Number(current.salary || 0),
          workScheduleDays: nextDays,
          workSchedule: scheduleSummary(nextDays),
          weeklyHours: calculateWeeklyHours(nextDays),
          complement: {
            ...emptyComplement,
            ...current.complement,
            email: String(parsed.email || current.complement?.email || ""),
            emergencyContact: String(parsed.emergencyContact || current.complement?.emergencyContact || ""),
            notes: String(parsed.notes || current.complement?.notes || ""),
          },
          registrationData: { ...(current.registrationData || {}), ...registry },
          username: current.username || suggestUsername(String(parsed.name || current.name || "")),
        };
      });
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : "Verifique se o backend Python está aberto e se o arquivo é um PDF do modelo de Registro de Empregado.";
      window.alert(`Não foi possível importar os dados do PDF. ${detail}`);
    } finally {
      setPdfImporting(false);
    }
  }


  function closeEmployeeImport() {
    setEmployeeImportOpen(false);
    setEmployeeImportFileName("");
    setEmployeeImportRows([]);
    setEmployeeImportMapping({});
    setEmployeeImportReport([]);
    setEmployeeImporting(false);
  }

  function updateEmployeeImportMapping(field: EmployeeImportField, column: string) {
    setEmployeeImportMapping((current) => ({ ...current, [field]: column }));
  }

  function getEmployeeImportColumns() {
    return employeeImportRows.length ? Object.keys(employeeImportRows[0].row) : [];
  }

  async function findOrCreateCompany(name: string) {
    const normalized = name.trim().toLowerCase();
    let company = data.companies.find((item) => item.name.trim().toLowerCase() === normalized);
    if (company) return company;

    const now = new Date().toISOString();
    return data.upsertCompany({
      id: `company-${normalizeKey(name)}`,
      name,
      legalName: name,
      document: "",
      location: "",
      active: true,
      createdAt: now,
    });
  }

  async function findOrCreateDepartment(companyId: string, name: string) {
    const normalized = name.trim().toLowerCase();
    let department = data.departments.find(
      (item) => item.companyId === companyId && item.name.trim().toLowerCase() === normalized,
    );
    if (department) return department;

    const now = new Date().toISOString();
    return data.upsertDepartment({
      id: `department-${companyId}-${normalizeKey(name)}`,
      companyId,
      name,
      managerName: "",
      description: `Departamento ${name}.`,
      active: true,
      createdAt: now,
    });
  }

  async function findOrCreateSector(companyId: string, departmentId: string, name: string) {
    const normalized = name.trim().toLowerCase();
    let sector = data.sectors.find(
      (item) =>
        item.companyId === companyId
        && item.departmentId === departmentId
        && item.name.trim().toLowerCase() === normalized,
    );
    if (sector) return sector;

    const now = new Date().toISOString();
    return data.upsertSector({
      id: `sector-${departmentId}-${normalizeKey(name)}`,
      companyId,
      departmentId,
      name,
      leaderName: "",
      costCenter: name,
      active: true,
      createdAt: now,
    });
  }

  async function findOrCreateSubsector(
    companyId: string,
    departmentId: string,
    sectorId: string,
    name: string,
  ) {
    const normalized = name.trim().toLowerCase();
    let subsector = data.subsectors.find(
      (item) =>
        item.companyId === companyId
        && item.departmentId === departmentId
        && item.sectorId === sectorId
        && item.name.trim().toLowerCase() === normalized,
    );
    if (subsector) return subsector;

    const now = new Date().toISOString();
    return data.upsertSubsector({
      id: `subsector-${sectorId}-${normalizeKey(name)}`,
      companyId,
      departmentId,
      sectorId,
      name,
      leaderName: "",
      active: true,
      createdAt: now,
    });
  }

  async function submitEmployeeImport() {
    if (!employeeImportRows.length || employeeImporting) return;

    setEmployeeImporting(true);
    const report: Array<{ index: number; status: string; message: string }> = [];
    const seenCpfs = new Set(
      data.employees
        .map((employee) => normalizeCpf(employee.cpf))
        .filter(Boolean),
    );

    for (const [index, row] of employeeImportRows.entries()) {
      const missingFields = getRowMissingFields(row.row, employeeImportMapping);
      if (missingFields.length) {
        report.push({
          index: index + 1,
          status: "Ignorado",
          message: `Campos obrigatórios ausentes: ${missingFields.join(", ")}`,
        });
        continue;
      }

      const registry = registrationDataFromRow(row.row, employeeImportMapping);
      const companyName = normalizeOptionalStructureName(getImportedValue(row.row, "company", employeeImportMapping)) || "Macro Ambiental";
      // Mudanca: estrutura importada e opcional; campos vazios nao criam mais "A definir".
      const departmentName = normalizeOptionalStructureName(getImportedValue(row.row, "department", employeeImportMapping));
      const sectorName = normalizeOptionalStructureName(getImportedValue(row.row, "sector", employeeImportMapping));
      const subsectorName = normalizeOptionalStructureName(getImportedValue(row.row, "subsector", employeeImportMapping));
      const registration = getImportedValue(row.row, "registration", employeeImportMapping).trim() || getImportedValue(row.row, "employeeNumber", employeeImportMapping).trim();
      const name = getImportedValue(row.row, "name", employeeImportMapping).trim();
      const cpf = getImportedValue(row.row, "cpf", employeeImportMapping).trim();
      const normalizedCpf = normalizeCpf(cpf);
      const phone = getImportedValue(row.row, "mobilePhone", employeeImportMapping).trim() || getImportedValue(row.row, "homePhone", employeeImportMapping).trim();
      const role = getImportedValue(row.row, "role", employeeImportMapping).trim() || getImportedValue(row.row, "position", employeeImportMapping).trim();
      const position = getImportedValue(row.row, "position", employeeImportMapping).trim();
      const admissionDate = getImportedValue(row.row, "admissionDate", employeeImportMapping).trim() || todayISO();
      const email = getImportedValue(row.row, "email", employeeImportMapping).trim();
      const emergencyContact = getImportedValue(row.row, "emergencyContact", employeeImportMapping).trim();
      const salary = toNumber(getImportedValue(row.row, "salary", employeeImportMapping).trim());
      const workHours = getImportedValue(row.row, "workHours", employeeImportMapping).trim();
      const breakHours = getImportedValue(row.row, "breakHours", employeeImportMapping).trim();

      if (normalizedCpf && seenCpfs.has(normalizedCpf)) {
        report.push({
          index: index + 1,
          status: "Ignorado",
          message: `CPF ja cadastrado para ${name || "funcionario existente"}.`,
        });
        continue;
      }

      try {
        const company = await findOrCreateCompany(companyName);
        const department = departmentName ? await findOrCreateDepartment(company.id, departmentName) : undefined;
        const sector = department && sectorName ? await findOrCreateSector(company.id, department.id, sectorName) : undefined;
        const subsector = department && sector && subsectorName
          ? await findOrCreateSubsector(company.id, department.id, sector.id, subsectorName)
          : undefined;

        const now = new Date().toISOString();
        const savedEmployee = await data.upsertEmployee({
          id: makeClientId("employee"),
          companyId: company.id,
          departmentId: department?.id || "",
          sectorId: sector?.id || "",
          subsectorId: subsector?.id || "",
          registration: registration || `IMP-${Date.now().toString().slice(-5)}`,
          name,
          cpf,
          phone,
          role,
          position,
          workSchedule: [workHours, breakHours ? `Intervalo ${breakHours}` : ""].filter(Boolean).join(" · "),
          workScheduleDays: scheduleTemplate,
          weeklyHours: calculateWeeklyHours(scheduleTemplate),
          salary,
          admissionDate,
          status: "active",
          complement: {
            ...emptyComplement,
            email,
            emergencyContact,
            notes: "Importação de funcionário realizada pelo sistema. A ficha PDF original foi anexada em Registros.",
          },
          registrationData: registry,
          createdAt: now,
          updatedAt: now,
        });

        const folderPath = [company.name, department?.name, sector?.name, subsector?.name, savedEmployee.name]
          .filter(Boolean)
          .join(" / ");

        const importedDocumentUrl = row.file
          ? await uploadEmployeeDocumentFile(savedEmployee.id, row.file)
          : employeeRegistrationTemplate;

        await data.upsertEmployeeDocument({
          id: makeClientId("document"),
          companyId: company.id,
          departmentId: department?.id || "",
          sectorId: sector?.id || "",
          subsectorId: subsector?.id || "",
          employeeId: savedEmployee.id,
          name: row.file?.name || "Ficha de registro",
          kind: "pdf",
          folderPath,
          fileUrl: importedDocumentUrl,
          size: row.file ? `${Math.max(1, Math.round(row.file.size / 1024))} KB` : "-",
          expirationDate: "",
          active: true,
          createdAt: now,
          updatedAt: now,
        });

        await ensureStandardEmployeeDocuments(savedEmployee, now);
        if (normalizedCpf) seenCpfs.add(normalizedCpf);

        report.push({ index: index + 1, status: "Importado", message: `Funcionário ${name} criado com sucesso.` });
      } catch (error) {
        report.push({
          index: index + 1,
          status: "Erro",
          message: error instanceof Error ? error.message : "Falha ao importar este funcionário.",
        });
      }
    }

    setEmployeeImportReport(report);
    setEmployeeImporting(false);
  }

  function showUndo(message: string, undo: () => Promise<void>) {
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    setUndoState({ message, undo });
    undoTimer.current = window.setTimeout(() => setUndoState(null), 5000);
  }

  async function runUndo() {
    if (!undoState) return;
    await undoState.undo();
    setUndoState(null);
  }

  function startDraft(draftPayload?: Partial<Employee>, id?: string, currentStep = 1, asPromotion = false) {
    if (draftPayload?.id) {
      if (!canEditEmployees) return;
    } else if (!canCreateEmployees) {
      return;
    }

    setDraftId(id);
    setEditingEmployeeId(draftPayload?.id);
    setPromotionMode(asPromotion);
    setRegistrationPdfFile(null);
    setEmployeeImportFileName("");
    const login = data.systemUsers.find((user) => user.employeeId === draftPayload?.id);
    const registrationData = draftPayload?.registrationData || {};
    const draftGroup = draftPayload?.companyId ? groupForCompany(draftPayload.companyId) : undefined;
    setGroupUnitSelection(employeeGroupUnitSelection(draftGroup, draftPayload));
    setForm({
      ...emptyEmployee,
      ...draftPayload,
      employeeKind: asPromotion ? "company" : registrationData.employeeKind === "company" ? "company" : registrationData.employeeKind === "diarist" ? "diarist" : "contract",
      diaristUseStructure: registrationData.diaristUseStructure === "true",
      diaristDailyRate: Number(registrationData.diaristDailyRate || 0),
      diaristBankDetails: registrationData.diaristBankDetails || "",
      diaristResponsible: registrationData.diaristResponsible || "",
      diaristWorkplace: registrationData.diaristWorkplace || "",
      workScheduleDays: draftPayload?.workScheduleDays?.length ? draftPayload.workScheduleDays : scheduleTemplate,
      complement: { ...emptyComplement, ...draftPayload?.complement },
      createLogin: draftPayload?.id ? Boolean(login) : false,
      username: draftPayload?.id && login?.username 
        ? normalizeUsername(login.username) 
        : suggestUsername(draftPayload?.name || ""),
      password: draftPayload?.id ? login?.password || "" : "",
      permissionProfileId: draftPayload?.id ? currentPermissionProfileId(login, data.systemPermissions, data.permissionProfiles) : "",
      registrationData: asPromotion ? { ...(draftPayload?.registrationData || {}), employeeKind: "company" } : draftPayload?.registrationData,
    });
    setStep(currentStep);
    setWizardOpen(true);
  }

  function startEdit(employee: Employee) {
    if (!canEditEmployees) return;
    startDraft(employee, undefined, 1, false);
  }

  function startPromotion(employee: Employee) {
    if (!canEditEmployees) return;
    startDraft(employee, undefined, 2, true);
  }

  useCreateShortcut(() => {
    if (wizardOpen || wizardSaving || draftSaving) return;
    startDraft();
  });

  function closeWizard() {
    setWizardSaving(false);
    setDraftSaving(false);
    setPdfImporting(false);
    setWizardOpen(false);
    setDraftId(undefined);
    setEditingEmployeeId(undefined);
    setPromotionMode(false);
    setForm(emptyEmployee);
    setGroupUnitSelection({ ...emptyGroupUnitSelection });
    setRegistrationPdfFile(null);
    setEmployeeImportFileName("");
    setStep(1);
  }

  async function saveDraft(nextStep = step) {
    if (draftSaving || wizardSaving) return;
    setDraftSaving(true);
    try {
      const draft = await data.upsertEmployeeDraft({
        id: draftId,
        employeeId: editingEmployeeId,
        companyId: form.employeeKind === "diarist" && !form.diaristUseStructure ? "" : form.companyId || "",
        departmentId: form.employeeKind === "diarist" && !form.diaristUseStructure ? "" : form.departmentId || "",
        sectorId: form.employeeKind === "diarist" && !form.diaristUseStructure ? "" : form.sectorId || "",
        subsectorId: form.subsectorId || "",
        step: nextStep,
        status: "draft",
        payload: form,
        updatedAt: new Date().toISOString(),
      });
      setDraftId(draft.id);
      closeWizard();
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : "Não foi possível salvar o rascunho.");
    } finally {
      setDraftSaving(false);
    }
  }

  async function deleteDraft(draft: EmployeeDraft) {
    setConfirmState({
      title: "Apagar rascunho",
      description: `Deseja apagar o rascunho de ${draft.payload.name || "funcionário sem nome"}?`,
      confirmLabel: "Apagar",
      impact: buildDomainDeletionImpact(data, "employeeDrafts", draft.id, draft.payload.name || "Rascunho sem nome"),
      onConfirm: async () => {
        await data.removeItem("employeeDrafts", draft.id);
        showUndo("Rascunho apagado.", async () => {
          await data.upsertEmployeeDraft(draft);
        });
      },
    });
  }

  function isRegistrationDocumentName(name: string) {
    const normalized = normalizeKey(name);
    return normalized.includes("ficharegistro") || normalized.includes("registrodeempregado") || normalized.includes("fichaderegistro");
  }

  async function loadEmployeeDocuments(employeeId: string) {
    const loaded = await loadCollection<EmployeeDocument>("employeeDocuments", [where("employeeId", "==", employeeId)]);
    return loaded;
  }

  async function saveRegistrationPdfDocument(employee: Employee, now: string) {
    if (form.employeeKind !== "company") return;

    const employeeDocuments = await loadEmployeeDocuments(employee.id);
    const hasDocument = employeeDocuments.some((document) => isRegistrationDocumentName(document.name));
    if (hasDocument) return;

    const company = data.companies.find((item) => item.id === employee.companyId);
    const department = data.departments.find((item) => item.id === employee.departmentId);
    const sector = data.sectors.find((item) => item.id === employee.sectorId);
    const subsector = data.subsectors.find((item) => item.id === employee.subsectorId);
    const folderPath = [company?.name, department?.name, sector?.name, subsector?.name, employee.name]
      .filter(Boolean)
      .join(" / ");
    const fileUrl = registrationPdfFile
      ? await uploadEmployeeDocumentFile(employee.id, registrationPdfFile)
      : employeeRegistrationTemplate;

    await data.upsertEmployeeDocument({
      id: makeClientId("document"),
      companyId: employee.companyId,
      departmentId: employee.departmentId,
      sectorId: employee.sectorId,
      subsectorId: employee.subsectorId || "",
      employeeId: employee.id,
      name: registrationPdfFile?.name || "Ficha de registro de empregado.pdf",
      kind: "pdf",
      folderPath,
      fileUrl,
      size: registrationPdfFile ? `${Math.max(1, Math.round(registrationPdfFile.size / 1024))} KB` : "-",
      expirationDate: "",
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  }


  async function savePromotionRegistrationPdfDocument(employee: Employee, now: string) {
    if (!promotionMode || !registrationPdfFile) return;

    const company = data.companies.find((item) => item.id === employee.companyId);
    const department = data.departments.find((item) => item.id === employee.departmentId);
    const sector = data.sectors.find((item) => item.id === employee.sectorId);
    const subsector = data.subsectors.find((item) => item.id === employee.subsectorId);
    const folderPath = [company?.name, department?.name, sector?.name, subsector?.name, employee.name, "Promoções"]
      .filter(Boolean)
      .join(" / ");
    const fileUrl = await uploadEmployeeDocumentFile(employee.id, registrationPdfFile);

    await data.upsertEmployeeDocument({
      id: makeClientId("document"),
      companyId: employee.companyId,
      departmentId: employee.departmentId,
      sectorId: employee.sectorId,
      subsectorId: employee.subsectorId || "",
      employeeId: employee.id,
      name: `Promoção - ${registrationPdfFile.name}`,
      kind: "pdf",
      folderPath,
      fileUrl,
      size: `${Math.max(1, Math.round(registrationPdfFile.size / 1024))} KB`,
      expirationDate: "",
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  }


  async function ensureStandardEmployeeDocuments(employee: Employee, now: string) {
    const company = data.companies.find((item) => item.id === employee.companyId);
    const department = data.departments.find((item) => item.id === employee.departmentId);
    const sector = data.sectors.find((item) => item.id === employee.sectorId);
    const subsector = data.subsectors.find((item) => item.id === employee.subsectorId);
    const folderPath = [company?.name, department?.name, sector?.name, subsector?.name, employee.name]
      .filter(Boolean)
      .join(" / ");
    const employeeDocuments = await loadEmployeeDocuments(employee.id);
    const existingNames = new Set(employeeDocuments.map((document) => normalizeDocumentName(document.name)));
    const standardNames = getCompanyStandardDocumentNames(company, employee);

    await Promise.all(
      standardNames
        .filter((name) => !existingNames.has(normalizeDocumentName(name)))
        .map((name) => data.upsertEmployeeDocument({
          id: makeClientId("document"),
          companyId: employee.companyId,
          departmentId: employee.departmentId,
          sectorId: employee.sectorId,
          subsectorId: employee.subsectorId || "",
          employeeId: employee.id,
          name,
          kind: "file",
          folderPath,
          fileUrl: "",
          size: "-",
          expirationDate: "",
          active: true,
          createdAt: now,
          updatedAt: now,
        })),
    );
  }

  async function ensureLogin(employee: Employee) {
    if (!form.createLogin) return;
    const existingUser = data.systemUsers.find((user) => user.employeeId === employee.id);
    const nextPassword = form.password;

    if (!form.username.trim() || !form.permissionProfileId || (!nextPassword && !existingUser?.passwordHash && !existingUser?.password)) {
      throw new Error("Para criar login agora, informe username, acesso salvo e senha quando o usuário ainda não tiver uma senha cadastrada.");
    }

    const savedUser = await data.upsertSystemUser({
      id: existingUser?.id,
      employeeId: employee.id,
      username: form.username,
      name: employee.name,
      role: employee.role,
      position: employee.position,
      password: nextPassword || undefined,
      passwordHash: nextPassword ? undefined : existingUser?.passwordHash,
      permissionProfileId: form.permissionProfileId,
      active: true,
      isAdmin: false,
    });
    await data.applyPermissionProfileToUser(savedUser.id, form.permissionProfileId);
  }

  function normalizeCpf(value?: string) {
    return String(value || "").replace(/\D/g, "").trim();
  }

  function findCpfDuplicate(cpf?: string) {
    const normalizedCpf = normalizeCpf(cpf);
    if (!normalizedCpf) return undefined;
    return data.employees.find((employee) => (
      employee.id !== editingEmployeeId
      && normalizeCpf(employee.cpf) === normalizedCpf
    ));
  }

  function validateCpfDuplicate() {
    const duplicate = findCpfDuplicate(form.cpf);
    if (!duplicate) {
      setFormError("");
      return true;
    }

    setFormError(`CPF já cadastrado para ${duplicate.name || "funcionário existente"}.`);
    return false;
  }

  const wizardSteps = form.employeeKind === "diarist" ? ["Dados", "Estrutura"] : ["Dados", "Estrutura", "Jornada", "Login", "Revisão"];
  const finalWizardStep = wizardSteps.length;
  const permissionProfileOptions = useMemo(() => data.permissionProfiles
    .filter((profile) => profile.active !== false || profile.id === form.permissionProfileId)
    .sort((left, right) => left.name.localeCompare(right.name, "pt-BR", { sensitivity: "base", numeric: true })), [data.permissionProfiles, form.permissionProfileId]);

  function handleStepNavigation(targetStep: number) {
    if (wizardSaving || draftSaving || pdfImporting || targetStep > finalWizardStep) return;
    if (step === 1 && targetStep > step && !validateCpfDuplicate()) return;
    setStep(targetStep);
  }

  function handleAdvanceStep() {
    if (wizardSaving || draftSaving || pdfImporting) return;
    if (step === 1 && !validateCpfDuplicate()) return;
    setStep((current) => Math.min(finalWizardStep, current + 1));
  }

  useEffect(() => {
    if (form.employeeKind === "diarist" && step > 2) setStep(2);
  }, [form.employeeKind, step]);

  useEffect(() => {
    if (step !== 1) setFormError("");
  }, [step]);

  useEffect(() => {
    if (step !== 1) return;
    validateCpfDuplicate();
  }, [data.employees, editingEmployeeId, form.cpf, step]);

  function employeeStructureForSave() {
    const detachedDiarist = form.employeeKind === "diarist" && !form.diaristUseStructure;
    if (detachedDiarist) {
      return { companyId: "", departmentId: "", sectorId: "", subsectorId: "", teamId: "" };
    }

    const companyId = form.companyId || "";
    if (!selectedFormUsesGroupStructure || !selectedFormGroup) {
      return {
        companyId,
        departmentId: form.departmentId || "",
        sectorId: form.sectorId || "",
        subsectorId: form.subsectorId || "",
        teamId: form.teamId || "",
      };
    }

    return {
      companyId,
      // Mudanca: ao limpar a estrutura de grupo, salva vazio em vez de voltar para o vinculo antigo.
      departmentId: sourceIdForGroupUnit(selectedFormGroup, "department", groupUnitSelection.departmentUnitId, companyId) || "",
      sectorId: sourceIdForGroupUnit(selectedFormGroup, "sector", groupUnitSelection.sectorUnitId, companyId) || "",
      subsectorId: sourceIdForGroupUnit(selectedFormGroup, "subsector", groupUnitSelection.subsectorUnitId, companyId) || "",
      teamId: sourceIdForGroupUnit(selectedFormGroup, "team", groupUnitSelection.teamUnitId, companyId) || "",
    };
  }

  async function syncEmployeeGroupStructureAssignment(employee: Employee, now: string) {
    const group = employee.companyId ? groupForCompany(employee.companyId) : undefined;
    if (!group?.units.length) return;

    const unitIdFor = (type: CompanyGroupUnitType) => {
      const key = groupUnitSelectionKey(type);
      const selectedUnitId = groupUnitSelection[key];
      // Mudanca: selecao vazia no grupo tambem remove o vinculo salvo no grupo empresarial.
      return groupUnitExists(group, selectedUnitId, type) ? selectedUnitId : "";
    };
    const existing = group.employeeAssignments.find((item) => item.employeeId === employee.id);

    await data.upsertCompanyGroupEmployeeAssignment({
      id: existing?.id,
      groupId: group.id,
      employeeId: employee.id,
      departmentUnitId: unitIdFor("department"),
      sectorUnitId: unitIdFor("sector"),
      subsectorUnitId: unitIdFor("subsector"),
      teamUnitId: unitIdFor("team"),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    });
  }

  async function submitEmployee(event: FormEvent) {
    event.preventDefault();
    if (step < finalWizardStep) {
      handleAdvanceStep();
      return;
    }
    if (wizardSaving || !validateCpfDuplicate()) return;

    setWizardSaving(true);
    try {
      const now = new Date().toISOString();
      const previous = editingEmployeeId ? data.employees.find((employee) => employee.id === editingEmployeeId) : undefined;
      const structure = employeeStructureForSave();
      const saved = await data.upsertEmployee({
        id: editingEmployeeId,
        companyId: structure.companyId,
        departmentId: structure.departmentId,
        sectorId: structure.sectorId,
        subsectorId: structure.subsectorId,
        teamId: structure.teamId,
        isTeamLead: Boolean(form.isTeamLead),
        registration: form.registration || `MAC-${Date.now().toString().slice(-5)}`,
        name: form.name || "",
        cpf: form.cpf || "",
        phone: form.phone || "",
        role: form.role || "",
        position: form.position || "",
        workSchedule: scheduleSummary(form.workScheduleDays || []),
        workScheduleDays: form.workScheduleDays || scheduleTemplate,
        weeklyHours: calculateWeeklyHours(form.workScheduleDays || []),
        salary: form.employeeKind === "diarist" ? Number(form.diaristDailyRate || 0) : Number(form.salary || 0),
        admissionDate: form.admissionDate || todayISO(),
        status: (form.status || "active") as EmployeeStatus,
        complement: { ...emptyComplement, ...form.complement },
        registrationData: {
          ...(previous?.registrationData || {}),
          ...(form.registrationData || {}),
          employeeKind: form.employeeKind,
          diaristUseStructure: String(Boolean(form.diaristUseStructure)),
          diaristDailyRate: String(Number(form.diaristDailyRate || 0)),
          diaristBankDetails: form.diaristBankDetails || "",
          diaristResponsible: form.diaristResponsible || "",
          diaristWorkplace: form.diaristWorkplace || "",
        },
        createdAt: previous?.createdAt || now,
        updatedAt: now,
      });
      await syncEmployeeGroupStructureAssignment(saved, now);

      if (form.employeeKind !== "diarist") {
        await saveRegistrationPdfDocument(saved, now);
        await savePromotionRegistrationPdfDocument(saved, now);
        await ensureStandardEmployeeDocuments(saved, now);
      }

      const roleOrPositionChanged = Boolean(previous && (
        previous.role !== saved.role ||
        previous.position !== saved.position
      ));

      if (previous && roleOrPositionChanged) {
        await data.upsertEmployeePromotion({
          employeeId: saved.id,
          effectiveDate: todayISO(),
          previousRole: previous.role || "",
          newRole: saved.role || "",
          previousPosition: previous.position || "",
          newPosition: saved.position || "",
          previousSalary: Number(previous.salary || 0),
          newSalary: Number(saved.salary || 0),
          previousWeeklyHours: Number(previous.weeklyHours || 0),
          newWeeklyHours: Number(saved.weeklyHours || 0),
          notes: promotionMode ? "Promoção registrada pelo fluxo de promoção." : "Alteração registrada pelo wizard de funcionários.",
          createdAt: now,
        });
      }

      if (form.employeeKind !== "diarist") await ensureLogin(saved);
      if (draftId) await data.removeItem("employeeDrafts", draftId);
      if (previous) {
        showUndo("Funcionário editado.", async () => {
          await data.upsertEmployee(previous);
        });
      }
      closeWizard();
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : "Não foi possível salvar o funcionário.");
    } finally {
      setWizardSaving(false);
    }
  }

  function setComplement(key: keyof EmployeeComplement, value: EmployeeComplement[keyof EmployeeComplement]) {
    setForm((current) => ({ ...current, complement: { ...emptyComplement, ...current.complement, [key]: value } }));
  }

  function setRegistrationField(field: EmployeeImportField, value: string) {
    setForm((current) => {
      const nextRegistrationData = { ...(current.registrationData || {}), employeeKind: "company", [field]: value };
      const patch: Partial<EmployeeWizardForm> = {};

      if (field === "registration") patch.registration = value;
      if (field === "employeeNumber" && !current.registration) patch.registration = value;
      if (field === "name") {
        patch.name = value;
        patch.username = current.username || suggestUsername(value);
      }
      if (field === "cpf") patch.cpf = value;
      if (field === "mobilePhone" || field === "homePhone") patch.phone = value;
      if (field === "role") patch.role = value;
      if (field === "position") patch.position = value;
      if (field === "admissionDate") patch.admissionDate = value;
      if (field === "salary") patch.salary = toNumber(value);
      if (field === "email") patch.complement = { ...emptyComplement, ...current.complement, email: value };
      if (field === "emergencyContact") patch.complement = { ...emptyComplement, ...current.complement, emergencyContact: value };
      if (field === "notes") patch.complement = { ...emptyComplement, ...current.complement, notes: value };

      return { ...current, ...patch, registrationData: nextRegistrationData };
    });
  }

  function getRegistrationFieldValue(field: EmployeeImportField) {
    const value = form.registrationData?.[field];
    if (value) return value;
    if (field === "registration") return form.registration || "";
    if (field === "name") return form.name || "";
    if (field === "cpf") return form.cpf || "";
    if (field === "mobilePhone" || field === "homePhone") return form.phone || "";
    if (field === "role") return form.role || "";
    if (field === "position") return form.position || "";
    if (field === "admissionDate") return form.admissionDate || "";
    if (field === "salary") return form.salary ? String(form.salary) : "";
    if (field === "email") return form.complement?.email || "";
    if (field === "emergencyContact") return form.complement?.emergencyContact || "";
    if (field === "notes") return form.complement?.notes || "";
    return "";
  }

  function renderRegistrationField(field: EmployeeImportField) {
    const config = employeeImportFields.find((item) => item.key === field);
    if (!config) return null;
    const value = getRegistrationFieldValue(field);
    const commonProps = {
      value,
      onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setRegistrationField(field, event.target.value),
      required: field === "name",
    };

    return (
      <label className={`field ${multilineRegistrationFields.has(field) ? "is-wide-field" : ""}`} key={field}>
        {config.label}
        {multilineRegistrationFields.has(field) ? (
          <textarea {...commonProps} />
        ) : (
          <input type={dateRegistrationFields.has(field) ? "date" : "text"} {...commonProps} />
        )}
      </label>
    );
  }

  function renderCompanyRegistrationSection(section: EmployeeRegistrationSection) {
    return (
      <fieldset className="employee-registration-section" key={section.title}>
        <legend>{section.title}</legend>
        {section.subtitle ? <p className="muted">{section.subtitle}</p> : null}
        <div className="employee-registration-grid">
          {section.fields.map((field) => renderRegistrationField(field))}
        </div>
      </fieldset>
    );
  }

  function updateScheduleDay(index: number, patch: Partial<WorkScheduleDay>) {
    setForm((current) => {
      const nextDays = (current.workScheduleDays || scheduleTemplate).map((day, dayIndex) => (
        dayIndex === index ? { ...day, ...patch } : day
      ));

      return {
        ...current,
        workScheduleDays: nextDays,
        workSchedule: scheduleSummary(nextDays),
        weeklyHours: calculateWeeklyHours(nextDays),
      };
    });
  }

  function openNoticeModal(employee: Employee) {
    if (!canEditEmployees) return;
    const savedStart = employee.registrationData?.noticeStartDate || todayISO();
    const savedEnd = employee.registrationData?.noticeEndDate || employee.registrationData?.noticeDate || savedStart;
    setNoticeEmployee(employee);
    setNoticeStartDate(savedStart);
    setNoticeEndDate(savedEnd);
  }

  function closeNoticeModal() {
    if (noticeSaving) return;
    setNoticeEmployee(null);
    setNoticeStartDate("");
    setNoticeEndDate("");
  }

  async function saveNoticeDate(event: FormEvent) {
    event.preventDefault();
    if (!noticeEmployee || !noticeStartDate || !noticeEndDate || noticeSaving) return;
    if (noticeEndDate < noticeStartDate) {
      window.alert("A data final do aviso prévio não pode ser anterior à data inicial.");
      return;
    }
    setNoticeSaving(true);
    try {
      const today = todayISO();
      const shouldDeactivateNow = noticeEndDate <= today;
      await data.upsertEmployee({
        ...noticeEmployee,
        status: shouldDeactivateNow ? "terminated" : "active",
        registrationData: {
          ...(noticeEmployee.registrationData || {}),
          noticeStartDate,
          noticeEndDate,
          noticeDate: noticeEndDate,
          scheduledDeactivationDate: noticeEndDate,
          deactivationEffectiveDate: noticeEndDate,
          noticeScheduledAt: new Date().toISOString(),
          noticeCompletedDate: shouldDeactivateNow ? today : "",
          deactivationCompletedDate: shouldDeactivateNow ? today : "",
        },
        updatedAt: new Date().toISOString(),
      });
      closeNoticeModal();
    } finally {
      setNoticeSaving(false);
    }
  }

  function openStatusScheduleModal(
    employee: Employee,
    action: StatusScheduleAction,
  ) {
    if (!canEditEmployees) return;
    const registrationData = employee.registrationData || {};
    const savedDate =
      action === "deactivate"
        ? registrationData.scheduledDeactivationDate ||
          registrationData.deactivationEffectiveDate ||
          registrationData.noticeEndDate ||
          registrationData.noticeDate ||
          todayISO()
        : registrationData.scheduledReactivationDate ||
          registrationData.reactivationEffectiveDate ||
          todayISO();

    setStatusScheduleEmployee(employee);
    setStatusScheduleAction(action);
    setStatusScheduleDate(savedDate);
  }

  function closeStatusScheduleModal() {
    if (statusScheduleSaving) return;
    setStatusScheduleEmployee(null);
    setStatusScheduleDate("");
  }

  async function saveStatusSchedule(event: FormEvent) {
    event.preventDefault();
    if (!statusScheduleEmployee || !statusScheduleDate || statusScheduleSaving) return;

    setStatusScheduleSaving(true);
    try {
      const today = todayISO();
      const now = new Date().toISOString();
      const isDueNow = statusScheduleDate <= today;
      const previousEmployee = statusScheduleEmployee;

      if (statusScheduleAction === "reactivate") {
        await data.upsertEmployee({
          ...statusScheduleEmployee,
          status: isDueNow ? "active" : "terminated",
          registrationData: {
            ...(statusScheduleEmployee.registrationData || {}),
            noticeDate: "",
            noticeStartDate: "",
            noticeEndDate: "",
            noticeScheduledAt: "",
            noticeCompletedDate: "",
            scheduledDeactivationDate: "",
            deactivationEffectiveDate: "",
            deactivationScheduledAt: "",
            deactivationCompletedDate: "",
            scheduledReactivationDate: isDueNow ? "" : statusScheduleDate,
            reactivationEffectiveDate: isDueNow ? "" : statusScheduleDate,
            reactivationScheduledAt: now,
            reactivationCompletedDate: isDueNow ? today : "",
          },
          updatedAt: new Date().toISOString(),
        });

        showUndo(
          isDueNow ? "Funcionário reativado." : "Reativação agendada.",
          async () => {
            await data.upsertEmployee(previousEmployee);
          },
        );
        closeStatusScheduleModal();
        return;
      }

      await data.upsertEmployee({
        ...statusScheduleEmployee,
        status: isDueNow
          ? "terminated"
          : statusScheduleEmployee.status === "terminated"
            ? "active"
            : statusScheduleEmployee.status,
        registrationData: {
          ...(statusScheduleEmployee.registrationData || {}),
          scheduledDeactivationDate: statusScheduleDate,
          deactivationEffectiveDate: statusScheduleDate,
          deactivationScheduledAt: now,
          deactivationCompletedDate: isDueNow ? today : "",
          scheduledReactivationDate: "",
          reactivationEffectiveDate: "",
          reactivationScheduledAt: "",
          reactivationCompletedDate: "",
        },
        updatedAt: new Date().toISOString(),
      });

      showUndo(
        isDueNow ? "Funcionário desativado." : "Desativação agendada.",
        async () => {
          await data.upsertEmployee(previousEmployee);
        },
      );
      closeStatusScheduleModal();
    } finally {
      setStatusScheduleSaving(false);
    }
  }

  function reactivateEmployee(employee: Employee) {
    openStatusScheduleModal(employee, "reactivate");
  }

  function deactivateEmployee(employee: Employee) {
    openStatusScheduleModal(employee, "deactivate");
  }

  function deleteEmployee(employee: Employee) {
    if (!canDeleteEmployees) return;
    setConfirmState({
      title: "Excluir funcionário",
      description: `Deseja excluir ${employee.name}?`,
      confirmLabel: "Excluir",
      impact: buildDomainDeletionImpact(data, "employees", employee.id, employee.name),
      onConfirm: async () => {
        const deleted = await data.deleteEmployee(employee.id);
        if (!deleted) return;
        // A exclusão em cascata registra um desfazer global com todos os vínculos,
        // evitando restaurar somente o cadastro e deixar o histórico incompleto.
      },
    });
  }

  async function confirmAction() {
    if (confirmingAction) return;
    const action = confirmState;
    setConfirmingAction(true);
    try {
      if (action) await action.onConfirm();
      setConfirmState(null);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível concluir a ação.");
    } finally {
      setConfirmingAction(false);
    }
  }

  const selectedPromotions = editingEmployeeId
    ? data.employeePromotions.filter((promotion) => promotion.employeeId === editingEmployeeId)
    : [];

  function isRoleOrPositionRise(promotion: (typeof data.employeePromotions)[number]) {
    const previousRole = (promotion.previousRole || "").trim();
    const newRole = (promotion.newRole || "").trim();
    const previousPosition = (promotion.previousPosition || "").trim();
    const newPosition = (promotion.newPosition || "").trim();
    const hasPreviousFunctionOrPosition = Boolean(previousRole || previousPosition);
    const changedRole = Boolean(previousRole && newRole && previousRole !== newRole);
    const changedPosition = Boolean(previousPosition && newPosition && previousPosition !== newPosition);

    return hasPreviousFunctionOrPosition && (changedRole || changedPosition);
  }

  function getEmployeeTrajectory(employeeId: string) {
    return data.employeePromotions
      .filter((promotion) => promotion.employeeId === employeeId && isRoleOrPositionRise(promotion))
      .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  }

  function getTrajectoryRiseCount(employeeId: string) {
    return getEmployeeTrajectory(employeeId).length;
  }

  function renderTrajectoryRiseIndicator(employeeId: string) {
    const totalRises = getTrajectoryRiseCount(employeeId);
    if (!totalRises) return null;
    const label = `${totalRises} ${totalRises === 1 ? "Promoção" : "Promoções"}`;

    return (
      <div
        className="trajectory-rise-indicator"
        title={`Cargo/função subiu ${totalRises} ${totalRises === 1 ? "vez" : "vezes"}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px",
          borderRadius: 999,
          background: "rgba(16, 185, 129, 0.14)",
          border: "1px solid rgba(16, 185, 129, 0.28)",
          color: "#047857",
          fontWeight: 700,
          whiteSpace: "nowrap",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: "inline-block",
            fontSize: 18,
            lineHeight: 1,
            animation: "trajectoryRiseArrow 1s ease-in-out infinite",
          }}
        >
          ↑
        </span>
        <span>{label}</span>
      </div>
    );
  }

  return (
    <section className="page">
      <style>{`
        @keyframes trajectoryRiseArrow {
          0% { transform: translateY(0); opacity: 0.72; }
          50% { transform: translateY(-5px); opacity: 1; }
          100% { transform: translateY(0); opacity: 0.72; }
        }

        .page-header-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        @media (max-width: 720px) {
          .page-header-actions {
            width: 100%;
          }

          .page-header-actions .btn {
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>
      <div className="page-header">
        <div>
          <h1 className="page-title">Funcionários</h1>
          <p className="page-subtitle">Cadastro completo com rascunho, login, jornada, salário e trajetória na empresa.</p>
        </div>
        <div className="page-header-actions">
          <button
            className="btn btn-secondary"
            type="button"
            disabled={!filteredEmployees.length}
            title="Exportar funcionários conforme o filtro aplicado"
            onClick={openExportModal}
          >
            <Save size={17} />
            Exportar Excel
          </button>
          {canCreateEmployees ? (
            <button className="btn btn-primary" type="button" disabled={wizardOpen || wizardSaving || draftSaving} onClick={() => startDraft()}>
              <Plus size={17} />
              Novo funcionário
            </button>
          ) : null}
        </div>
      </div>

      <div className="filters-panel">
        <Search size={18} />
        <MultiSelect
          label="Empresas"
          placeholder="Empresas"
          value={filters.companyIds}
          onChange={(companyIds) => setFilters({ ...filters, companyIds, departmentIds: [], sectorIds: [], subsectorIds: [], teamIds: [] })}
          options={data.companies.map((item) => ({ value: item.id, label: item.name }))}
        />
        <MultiSelect
          label="Departamentos"
          placeholder="Departamentos"
          value={filters.departmentIds}
          onChange={(departmentIds) => setFilters({ ...filters, departmentIds, sectorIds: [], subsectorIds: [] })}
          options={data.departments
            .filter((item) => !filters.companyIds.length || filters.companyIds.includes(item.companyId))
            .map((item) => ({ value: item.id, label: item.name }))}
        />
        <MultiSelect
          label="Setores"
          placeholder="Setores"
          value={filters.sectorIds}
          onChange={(sectorIds) => setFilters({ ...filters, sectorIds, subsectorIds: [] })}
          options={data.sectors
            .filter((item) => !filters.departmentIds.length || filters.departmentIds.includes(item.departmentId))
            .map((item) => ({ value: item.id, label: item.name }))}
        />
        <MultiSelect
          label="Subsetores"
          placeholder="Subsetores"
          value={filters.subsectorIds}
          onChange={(subsectorIds) => setFilters({ ...filters, subsectorIds })}
          options={data.subsectors
            .filter((item) => !filters.sectorIds.length || filters.sectorIds.includes(item.sectorId))
            .map((item) => ({ value: item.id, label: item.name }))}
        />
        <MultiSelect
          label="Equipes"
          placeholder="Equipes"
          value={filters.teamIds}
          onChange={(teamIds) => setFilters({ ...filters, teamIds })}
          options={teamOptions}
        />
        <MultiSelect
          label="Funções"
          placeholder="Funções"
          value={filters.roleValues}
          onChange={(roleValues) => setFilters({ ...filters, roleValues })}
          options={roleOptions}
        />
        <MultiSelect
          label="Funcionários"
          placeholder="Funcionários"
          value={filters.employeeIds}
          onChange={(employeeIds) => setFilters({ ...filters, employeeIds })}
          options={employeeOptions}
        />
        <MultiSelect
          label="CPF"
          placeholder="CPF"
          value={filters.cpfValues}
          onChange={(cpfValues) => setFilters({ ...filters, cpfValues })}
          options={cpfOptions}
        />
        <MultiSelect
          label="Username"
          placeholder="Username"
          value={filters.usernameValues}
          onChange={(usernameValues) => setFilters({ ...filters, usernameValues })}
          options={usernameOptions}
        />
        <MultiSelect
          label="Status"
          placeholder="Status"
          value={filters.statuses}
          onChange={(statuses) => setFilters({ ...filters, statuses })}
          options={[
            { value: "active", label: "Ativo" },
            { value: "leave", label: "Afastado" },
            { value: "notice", label: "Aviso prévio" },
            { value: "terminated", label: "Desativado" },
          ]}
        />
        <MultiSelect
          label="Tipo de contrato"
          placeholder="Tipo de contrato"
          value={filters.employeeKinds}
          onChange={(employeeKinds) => setFilters({ ...filters, employeeKinds: employeeKinds as EmployeeKind[] })}
          options={[
            { value: "contract", label: "Funcionario de contrato" },
            { value: "company", label: "Funcionario da empresa" },
            { value: "diarist", label: "Diarista" },
          ]}
        />
        <label className="field">
          Aniversario
          <select
            value={filters.birthdayMode}
            onChange={(event) => setFilters({
              ...filters,
              birthdayMode: event.target.value as BirthdayFilterMode,
              birthdayMonth: "",
              birthdayYear: "",
              birthdayDate: "",
            })}
          >
            <option value="month">Filtrar por mes</option>
            <option value="year">Filtrar por ano</option>
            <option value="full">Filtrar por data completa</option>
          </select>
        </label>
        {filters.birthdayMode === "month" ? (
          <label className="field">
            Mes do aniversario
            <input
              type="month"
              value={filters.birthdayMonth}
              onChange={(event) => setFilters({ ...filters, birthdayMonth: event.target.value })}
            />
          </label>
        ) : null}
        {filters.birthdayMode === "year" ? (
          <label className="field">
            Ano de nascimento
            <input
              type="number"
              min="1900"
              max="2100"
              list="employee-birthday-year-options"
              placeholder="Ex.: 1990"
              value={filters.birthdayYear}
              onChange={(event) => setFilters({ ...filters, birthdayYear: event.target.value })}
            />
            <datalist id="employee-birthday-year-options">
              {birthdayYearOptions.map((year) => (
                <option key={year.value} value={year.value}>{year.label}</option>
              ))}
            </datalist>
          </label>
        ) : null}
        {filters.birthdayMode === "full" ? (
          <label className="field">
            Data completa
            <input
              type="date"
              value={filters.birthdayDate}
              onChange={(event) => setFilters({ ...filters, birthdayDate: event.target.value })}
            />
          </label>
        ) : null}
        <ClearFiltersButton active={hasActiveFilters} onClear={() => setFilters(initialEmployeeFilters)} />
      </div>

      <div className="table-panel">
        <table className="data-table">
          <thead>
            <tr>
              <th>Funcionário</th>
              <th>Estrutura</th>
              <th>Função / Cargo</th>
              <th>{renderSensitiveColumnHeader("Jornada")}</th>
              <th>{renderSensitiveColumnHeader("Salário")}</th>
              <th>Situação</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {paginatedEmployees.map((employee) => {
              const company = data.companies.find((item) => item.id === employee.companyId);
              const sector = data.sectors.find((item) => item.id === employee.sectorId);
              const team = data.teams.find((item) => item.id === employee.teamId);
              const login = data.systemUsers.find((user) => user.employeeId === employee.id);
              const scheduledStatusText = employeeStatusScheduleText(employee);
              const displayStatus = getEmployeeDisplayStatus(employee);
              const group = groupForCompany(employee.companyId);
              const groupSectorName = groupUnitNameForEmployee(employee, "sector");
              const groupTeamName = groupUnitNameForEmployee(employee, "team");

              return (
                <tr key={employee.id} style={displayStatus === "terminated" ? { background: "rgba(220, 38, 38, 0.09)" } : undefined}>
                  <td><strong>{employee.name}</strong><br /><span className="muted">{employee.registration} {login ? `· ${login.username}` : ""}</span></td>
                  <td>{company?.name ?? "-"}<br /><span className="muted">Grupo: {group?.name || (employee.companyId ? "Grupo individual automático" : "-")}</span><br /><span className="muted">{groupSectorName || sector?.name || "-"}</span><br /><span className="muted">Equipe: {groupTeamName || team?.name || "-"}{employee.isTeamLead ? " · Encarregado" : ""}</span></td>
                  <td>{employee.role || "-"}<br /><span className="muted">{employee.position || "-"}</span></td>
                  <td>{renderSensitiveValue(<>{employee.workSchedule || "-"}<br /><span className="muted">{employee.weeklyHours || 0}h semanais</span></>, "Jornada")}</td>
                  <td>{renderSensitiveValue(formatCurrency(Number(employee.salary || 0)), "Salário")}</td>
                  <td>
                    {displayStatus === "notice" ? (
                      <span className="badge badge-warning">Aviso prévio</span>
                    ) : (
                      <span className={`badge ${badgeClass(displayStatus as EmployeeStatus)}`}>{labelStatus(displayStatus as EmployeeStatus)}</span>
                    )}
                    {employee.registrationData?.noticeStartDate && (employee.registrationData?.noticeEndDate || employee.registrationData?.noticeDate) ? (
                      <><br /><span className="muted">Aviso: {formatDate(employee.registrationData.noticeStartDate)} a {formatDate(employee.registrationData.noticeEndDate || employee.registrationData.noticeDate)}</span></>
                    ) : null}
                    {scheduledStatusText ? (
                      <><br /><span className="muted">{scheduledStatusText}</span></>
                    ) : null}
                  </td>
                  <td>
                    <div className="table-actions" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "nowrap", whiteSpace: "nowrap" }}>
                      {canEditEmployees ? (
                        <>
                          <button type="button" title="Editar funcionário" disabled={wizardOpen || confirmingAction} onClick={() => startEdit(employee)}><Pencil size={14} /></button>
                          <button type="button" title="Registrar alteração de cargo" disabled={wizardOpen || confirmingAction} onClick={() => startPromotion(employee)}><Plus size={14} /></button>
                          <button type="button" title="Determinar aviso prévio" disabled={confirmingAction} onClick={() => openNoticeModal(employee)}><CalendarClock size={14} /></button>
                          <button
                            type="button"
                            title={
                              displayStatus === "terminated"
                                ? "Agendar reativação do funcionário"
                                : "Agendar desativação do funcionário"
                            }
                            disabled={confirmingAction}
                            onClick={() => displayStatus === "terminated" ? reactivateEmployee(employee) : deactivateEmployee(employee)}
                          ><Power size={14} /></button>
                        </>
                      ) : null}
                      {canDeleteEmployees ? (
                        <button type="button" title="Excluir funcionário" disabled={confirmingAction} onClick={() => deleteEmployee(employee)}><Trash2 size={14} /></button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!filteredEmployees.length ? <tr><td colSpan={7}>Nenhum funcionário encontrado.</td></tr> : null}
          </tbody>
        </table>
      </div>

      <EmployeesPagination
        totalItems={filteredEmployees.length}
        pageStart={pageStart}
        pageEnd={pageEnd}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
      />

      <div className="dashboard-grid">
        <article className="panel">
          <div className="panel-header"><h2 className="panel-title">Rascunhos</h2></div>
          <div className="module-list padded">
            {data.employeeDrafts.map((draft) => (
              <span className="module-pill" key={draft.id}>
                <button className="table-action" type="button" disabled={wizardOpen || draftSaving} onClick={() => startDraft(draft.payload, draft.id, draft.step)}>
                  {draft.payload.name || "Rascunho sem nome"} · etapa {draft.step}
                </button>
                <button className="table-action" type="button" disabled={confirmingAction} onClick={() => deleteDraft(draft)}><Trash2 size={14} /> Apagar</button>
              </span>
            ))}
            {!data.employeeDrafts.length ? <p className="muted">Nenhum rascunho salvo.</p> : null}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header"><h2 className="panel-title">Trajetória na empresa</h2></div>
          <div className="table-panel is-flat">
            <table className="data-table">
              <thead><tr><th>Data</th><th>Funcionário</th><th>Função / Cargo</th><th>{renderSensitiveColumnHeader("Salário")}</th><th>{renderSensitiveColumnHeader("Carga")}</th></tr></thead>
              <tbody>
                {data.employeePromotions.filter(isRoleOrPositionRise).slice(0, 6).map((promotion) => {
                  const employee = data.employees.find((item) => item.id === promotion.employeeId);
                  return (
                    <tr key={promotion.id}>
                      <td>{formatDate(promotion.effectiveDate)}</td>
                      <td className="strong-cell">{employee?.name ?? "-"}</td>
                      <td>{renderTrajectoryRiseIndicator(promotion.employeeId)}</td>
                      <td>{renderSensitiveValue(`${formatCurrency(promotion.previousSalary)} → ${formatCurrency(promotion.newSalary)}`, "Salário")}</td>
                      <td>{renderSensitiveValue(`${promotion.previousWeeklyHours}h → ${promotion.newWeeklyHours}h`, "Carga")}</td>
                    </tr>
                  );
                })}
                {!data.employeePromotions.filter(isRoleOrPositionRise).length ? <tr><td colSpan={5}>Nenhuma evolução de cargo/função registrada.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </article>
      </div>

      {exportModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <form className="confirm-modal protected-password-modal" role="dialog" aria-modal="true" aria-labelledby="export-employees-title" onSubmit={submitExportWithSalary}>
            <div className="modal-header">
              <h2 id="export-employees-title">Exportar funcionarios</h2>
              <button className="icon-button" type="button" disabled={exportChecking} onClick={closeExportModal} aria-label="Fechar"><X size={18} /></button>
            </div>
            <p className="muted">Escolha se o Excel deve sair com a coluna de salario.</p>
            <div className="form-actions" style={{ justifyContent: "stretch" }}>
              <button className="btn btn-secondary" type="button" disabled={exportChecking} onClick={exportWithoutSalary}>
                Exportar sem salario
              </button>
            </div>
            <label className="field">
              Senha para exportar com salario
              <input
                autoComplete="current-password"
                disabled={exportChecking}
                type="password"
                value={exportPassword}
                onChange={(event) => {
                  setExportPassword(event.target.value);
                  setExportPasswordError("");
                }}
              />
            </label>
            {exportPasswordError ? <p className="form-error" role="alert">{exportPasswordError}</p> : null}
            <div className="form-actions">
              <button className="btn btn-ghost" type="button" disabled={exportChecking} onClick={closeExportModal}>Cancelar</button>
              <button className="btn btn-primary" type="submit" disabled={exportChecking}>{exportChecking ? "Conferindo..." : "Exportar com salario"}</button>
            </div>
          </form>
        </div>
      ) : null}

      {sensitivePasswordModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <form className="confirm-modal protected-password-modal" role="dialog" aria-modal="true" aria-labelledby="protected-password-title" onSubmit={submitSensitivePassword}>
            <div className="modal-header">
              <h2 id="protected-password-title">Confirmar senha</h2>
              <button className="icon-button" type="button" disabled={sensitivePasswordChecking} onClick={closeSensitivePasswordModal} aria-label="Fechar"><X size={18} /></button>
            </div>
            <label className="field">
              Senha do usuário
              <input
                autoComplete="current-password"
                autoFocus
                disabled={sensitivePasswordChecking}
                type="password"
                value={sensitivePassword}
                onChange={(event) => {
                  setSensitivePassword(event.target.value);
                  setSensitivePasswordError("");
                }}
              />
            </label>
            {sensitivePasswordError ? <p className="form-error" role="alert">{sensitivePasswordError}</p> : null}
            <div className="form-actions">
              <button className="btn btn-ghost" type="button" disabled={sensitivePasswordChecking} onClick={closeSensitivePasswordModal}>Cancelar</button>
              <button className="btn btn-primary" type="submit" disabled={sensitivePasswordChecking}>{sensitivePasswordChecking ? "Conferindo..." : "Confirmar"}</button>
            </div>
          </form>
        </div>
      ) : null}

      {noticeEmployee ? (
        <div className="modal-backdrop" role="presentation" style={{ zIndex: 10000, padding: 24, overflowY: "auto" }}>
          <form
            className="modal-panel notice-period-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notice-period-title"
            onSubmit={saveNoticeDate}
            style={{ width: "min(680px, calc(100vw - 48px))", maxHeight: "none", overflow: "visible", margin: "40px auto", background: "#fff" }}
          >
            <div className="modal-header" style={{ padding: "24px 28px" }}>
              <div>
                <h2 id="notice-period-title">Determinar aviso prévio</h2>
                <p className="muted" style={{ marginTop: 4 }}>{noticeEmployee.name}</p>
              </div>
              <button type="button" className="icon-button" disabled={noticeSaving} onClick={closeNoticeModal} aria-label="Fechar"><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ padding: "28px", overflow: "visible" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}>
                <label className="field">
                  Início do aviso prévio
                  <input
                    type="date"
                    value={noticeStartDate}
                    onChange={(event) => {
                      const value = event.target.value;
                      setNoticeStartDate(value);
                      if (noticeEndDate && noticeEndDate < value) setNoticeEndDate(value);
                    }}
                    required
                  />
                </label>
                <label className="field">
                  Fim do aviso prévio / desativação
                  <input
                    type="date"
                    min={noticeStartDate || undefined}
                    value={noticeEndDate}
                    onChange={(event) => setNoticeEndDate(event.target.value)}
                    required
                  />
                </label>
              </div>
              <div style={{ marginTop: 20, padding: 16, borderRadius: 12, background: "#f4f7fb", lineHeight: 1.5 }}>
                O status <strong>Aviso prévio</strong> começa na data inicial. Ao chegar à data final, o funcionário é desativado automaticamente e deixa de aparecer na folha de ponto.
              </div>
            </div>
            <div className="modal-footer" style={{ padding: "20px 28px", display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <button type="button" className="btn btn-secondary" disabled={noticeSaving} onClick={closeNoticeModal}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={noticeSaving || !noticeStartDate || !noticeEndDate}>
                <Save size={16} /> {noticeSaving ? "Salvando..." : "Confirmar período"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {statusScheduleEmployee ? (
        <div className="modal-backdrop" role="presentation" style={{ zIndex: 10000, padding: 24, overflowY: "auto" }}>
          <form
            className="modal-panel notice-period-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="employee-status-schedule-title"
            onSubmit={saveStatusSchedule}
            style={{ width: "min(620px, calc(100vw - 48px))", maxHeight: "none", overflow: "visible", margin: "40px auto", background: "#fff" }}
          >
            <div className="modal-header" style={{ padding: "24px 28px" }}>
              <div>
                <h2 id="employee-status-schedule-title">
                  {statusScheduleAction === "deactivate"
                    ? "Agendar desativação"
                    : "Agendar reativação"}
                </h2>
                <p className="muted" style={{ marginTop: 4 }}>
                  {statusScheduleEmployee.name}
                </p>
              </div>
              <button
                type="button"
                className="icon-button"
                disabled={statusScheduleSaving}
                onClick={closeStatusScheduleModal}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ padding: "28px", overflow: "visible" }}>
              <label className="field">
                {statusScheduleAction === "deactivate"
                  ? "Data de vencimento / saída do controle de ponto"
                  : "Data de reativação / retorno ao controle de ponto"}
                <input
                  type="date"
                  value={statusScheduleDate}
                  onChange={(event) => setStatusScheduleDate(event.target.value)}
                  required
                />
              </label>
              <div style={{ marginTop: 20, padding: 16, borderRadius: 12, background: "#f4f7fb", lineHeight: 1.5 }}>
                {statusScheduleAction === "deactivate" ? (
                  <>
                    O funcionário continua aparecendo no controle de ponto até
                    essa data. A partir dela, ele sai da tabela do ponto e fica
                    desativado.
                  </>
                ) : (
                  <>
                    O funcionário volta a aparecer no controle de ponto a partir
                    dessa data. Se a data for hoje ou anterior, a reativação é
                    aplicada agora.
                  </>
                )}
              </div>
            </div>
            <div className="modal-footer" style={{ padding: "20px 28px", display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={statusScheduleSaving}
                onClick={closeStatusScheduleModal}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={statusScheduleSaving || !statusScheduleDate}
              >
                <Save size={16} /> {statusScheduleSaving ? "Salvando..." : "Confirmar data"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {wizardOpen ? (
        <div className="modal-backdrop" role="presentation">
          <form className="modal-panel wizard-card" onSubmit={submitEmployee}>
            <div className="modal-header">
              <h2>{promotionMode ? "Promover funcionário" : editingEmployeeId ? "Editar funcionário" : "Novo funcionário"}</h2>
              <button className="icon-button" type="button" disabled={wizardSaving || draftSaving || pdfImporting} onClick={closeWizard} aria-label="Fechar"><X size={18} /></button>
            </div>

            <div className="wizard-steps">
              {wizardSteps.map((label, index) => {
                const targetStep = index + 1;
                return (
                  <button
                    key={label}
                    type="button"
                    className={step === targetStep ? "is-active" : ""}
                    disabled={wizardSaving || draftSaving || pdfImporting}
                    onClick={() => handleStepNavigation(targetStep)}
                  >
                    {targetStep}. {label}
                  </button>
                );
              })}
            </div>

            {step === 2 ? (
              <div className="form-grid">
                {form.employeeKind === "diarist" ? (
                  <label className="check-field is-wide-field"><input type="checkbox" checked={form.diaristUseStructure} onChange={(e) => setForm({ ...form, diaristUseStructure: e.target.checked, companyId: e.target.checked ? form.companyId : "", departmentId: e.target.checked ? form.departmentId : "", sectorId: e.target.checked ? form.sectorId : "", subsectorId: e.target.checked ? form.subsectorId : "", teamId: e.target.checked ? form.teamId : "" })} /> Vincular este diarista à estrutura da empresa</label>
                ) : null}
                {/* Mudanca: estes selects nao usam required; "Selecione" agora salva a estrutura em branco. */}
                <label className="field">Empresa<select disabled={structureFieldsDisabled} value={form.companyId} onChange={(e) => handleCompanyChange(e.target.value)}><option value="">Selecione</option>{data.companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="field">Grupo empresarial<input readOnly value={selectedFormGroup?.name || (form.companyId ? "Grupo individual automático" : "Selecione a empresa")} /><small>{selectedFormUsesGroupStructure ? "Os campos abaixo usam a estrutura unificada deste grupo." : "Vínculo automático pelo CNPJ. O grupo não altera a estrutura da empresa."}</small></label>
                <label className="field">Departamento<select disabled={structureFieldsDisabled} value={departmentSelectValue} onChange={(e) => handleDepartmentChange(e.target.value)}><option value="">Selecione</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                <label className="field">Setor<select disabled={structureFieldsDisabled} value={sectorSelectValue} onChange={(e) => handleSectorChange(e.target.value)}><option value="">Selecione</option>{sectors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                <label className="field">Subsetor<select disabled={structureFieldsDisabled} value={subsectorSelectValue} onChange={(e) => handleSubsectorChange(e.target.value)}><option value="">Nenhum</option>{subsectors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                <label className="field">Equipe<select disabled={structureFieldsDisabled} value={teamSelectValue} onChange={(e) => handleTeamChange(e.target.value)}><option value="">Sem equipe</option>{teams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                <label className="check-field"><input type="checkbox" checked={Boolean(form.isTeamLead)} disabled={!teamSelectValue} onChange={(e) => setForm({ ...form, isTeamLead: e.target.checked })} /> Encarregado da equipe</label>
              </div>
            ) : null}

            {step === 1 ? (
              <div className="employee-data-step">
                <div className="employee-kind-panel is-wide-field">
                  <span>Tipo de funcionário</span>
                  <label><input type="radio" checked={form.employeeKind === "contract"} onChange={() => setForm({ ...form, employeeKind: "contract", registrationData: { ...(form.registrationData || {}), employeeKind: "contract" } })} /> Funcionário de contrato</label>
                  <label><input type="radio" checked={form.employeeKind === "company"} onChange={() => setForm({ ...form, employeeKind: "company", registrationData: { ...(form.registrationData || {}), employeeKind: "company" } })} /> Funcionário da empresa</label>
                  <label><input type="radio" checked={form.employeeKind === "diarist"} onChange={() => setForm({ ...form, employeeKind: "diarist", createLogin: false, workScheduleDays: blankScheduleTemplate, registrationData: { ...(form.registrationData || {}), employeeKind: "diarist" } })} /> Diarista</label>
                </div>
                {formError ? <p className="field-error">{formError}</p> : null}

                {form.employeeKind === "contract" ? (
                  <div className="form-grid">
                    <label className="field">Matrícula<input value={form.registration ?? ""} onChange={(e) => setForm({ ...form, registration: e.target.value })} /></label>
                    <label className="field">Nome<input required value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value, username: form.username || suggestUsername(e.target.value) })} /></label>
                    <label className={`field${findCpfDuplicate(form.cpf) ? " is-invalid" : ""}`}>CPF<input value={form.cpf ?? ""} onChange={(e) => setForm({ ...form, cpf: e.target.value })} /></label>
                    <label className="field">Telefone<input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
                    <label className="field">Data de nascimento<input type="date" value={form.registrationData?.birthDate ?? ""} onChange={(e) => setForm({ ...form, registrationData: { ...(form.registrationData || {}), employeeKind: "contract", birthDate: e.target.value } })} /></label>
                    <label className="field">Função<input value={form.role ?? ""} onChange={(e) => setForm({ ...form, role: e.target.value })} /></label>
                    <label className="field">Cargo<input value={form.position ?? ""} onChange={(e) => setForm({ ...form, position: e.target.value })} /></label>
                    <label className="field">Admissão<input type="date" value={form.admissionDate ?? todayISO()} onChange={(e) => setForm({ ...form, admissionDate: e.target.value })} /></label>
                  </div>
                ) : form.employeeKind === "diarist" ? (
                  <div className="form-grid">
                    <label className="field">Nome completo<input required value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
                    <label className={`field${findCpfDuplicate(form.cpf) ? " is-invalid" : ""}`}>CPF<input required value={form.cpf ?? ""} onChange={(e) => setForm({ ...form, cpf: e.target.value })} /></label>
                    <label className="field">Telefone<input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
                    <label className="field">Função exercida<input required value={form.role ?? ""} onChange={(e) => setForm({ ...form, role: e.target.value, position: e.target.value })} /></label>
                    <label className="field">Chave Pix ou dados bancários<input value={form.diaristBankDetails} onChange={(e) => setForm({ ...form, diaristBankDetails: e.target.value })} /></label>
                    <label className="field">Empresa ou equipe responsável<input value={form.diaristResponsible} onChange={(e) => setForm({ ...form, diaristResponsible: e.target.value })} /></label>
                    <label className="field">Obra, setor ou local de trabalho<input value={form.diaristWorkplace} onChange={(e) => setForm({ ...form, diaristWorkplace: e.target.value })} /></label>
                    <label className="field">Valor padrão da diária<input type="number" min="0" step="0.01" value={form.diaristDailyRate} onChange={(e) => setForm({ ...form, diaristDailyRate: Number(e.target.value) })} /></label>
                    <label className="field">Status<select value={form.status || "active"} onChange={(e) => setForm({ ...form, status: e.target.value as EmployeeStatus })}><option value="active">Ativo</option><option value="inactive">Inativo</option></select></label>
                    <label className="field is-wide-field">Observações<textarea rows={3} value={form.complement?.notes ?? ""} onChange={(e) => setComplement("notes", e.target.value)} /></label>
                  </div>
                ) : (
                  <>
                    <div
                      className={`employee-registration-import-box${isImportDragActive ? " is-drag-over" : ""}`}
                      onDragEnter={handleEmployeeImportDragEnter}
                      onDragOver={handleEmployeeImportDragOver}
                      onDragLeave={handleEmployeeImportDragLeave}
                      onDrop={handleEmployeeImportDrop}
                    >
                      <UserPlus size={22} />
                      <div>
                        <strong>{promotionMode ? "Anexe o novo registro de empregado" : "Importe o registro de empregado"}</strong>
                        <p>{promotionMode ? "Selecione o novo PDF do registro. O sistema faz a leitura, preenche os campos e guarda o documento no funcionário." : "Selecione o PDF do registro. Os campos abaixo serão preenchidos automaticamente e continuarão editáveis."}</p>
                        {employeeImportFileName ? (
                          <span>Arquivo importado: {employeeImportFileName}</span>
                        ) : isImportDragActive ? (
                          <span>Solte o arquivo PDF aqui.</span>
                        ) : (
                          <span>Nenhum arquivo importado. Arraste um PDF ou clique em Escolher PDF.</span>
                        )}
                      </div>
                      <label className="btn btn-secondary">
                        {pdfImporting ? "Importando..." : "Escolher PDF"}
                        <input disabled={pdfImporting || wizardSaving} type="file" accept=".pdf,application/pdf" onChange={(event) => handleEmployeeImportFile(event.target.files?.[0])} />
                      </label>
                      <a className="btn btn-ghost" aria-disabled={pdfImporting || wizardSaving} href={employeeRegistrationTemplate} target="_blank" rel="noreferrer">Modelo</a>
                    </div>
                    {employeeRegistrationSections.map((section) => renderCompanyRegistrationSection(section))}
                  </>
                )}
              </div>
            ) : null}

            {step === 3 ? (
              <div className="form-grid">
                <div className="schedule-table-wrap is-wide-field">
                  <table className="schedule-table">
                    <thead>
                      <tr>
                        <th>Dia</th>
                        <th>Trabalha</th>
                        <th>Entrada</th>
                        <th>Início intervalo</th>
                        <th>Fim intervalo</th>
                        <th>Saída</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(form.workScheduleDays || scheduleTemplate).map((day, index) => (
                        <tr key={day.day}>
                          <td className="strong-cell">{day.day}</td>
                          <td><input type="checkbox" checked={day.enabled} onChange={(e) => updateScheduleDay(index, { enabled: e.target.checked })} /></td>
                          <td><input type="time" value={day.start} disabled={!day.enabled} onChange={(e) => updateScheduleDay(index, { start: e.target.value })} /></td>
                          <td><input type="time" value={day.breakStart} disabled={!day.enabled} onChange={(e) => updateScheduleDay(index, { breakStart: e.target.value })} /></td>
                          <td><input type="time" value={day.breakEnd} disabled={!day.enabled} onChange={(e) => updateScheduleDay(index, { breakEnd: e.target.value })} /></td>
                          <td><input type="time" value={day.end} disabled={!day.enabled} onChange={(e) => updateScheduleDay(index, { end: e.target.value })} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <label className="field">Carga horária semanal<input type="number" value={form.weeklyHours ?? calculateWeeklyHours(form.workScheduleDays || [])} readOnly /></label>
                <label className="field">Salário<input type="number" step="0.01" value={form.salary ?? 0} onChange={(e) => setForm({ ...form, salary: Number(e.target.value) })} /></label>
                <label className="field">E-mail<input value={form.complement?.email ?? ""} onChange={(e) => setComplement("email", e.target.value)} /></label>
                <label className="field">Contato de emergência<input value={form.complement?.emergencyContact ?? ""} onChange={(e) => setComplement("emergencyContact", e.target.value)} /></label>
                <label className="field is-wide-field">Observações<textarea value={form.complement?.notes ?? ""} onChange={(e) => setComplement("notes", e.target.value)} /></label>
              </div>
            ) : null}

            {step === 4 ? (
              <div className="form-grid">
                <label className="check-field is-wide-field"><input type="checkbox" checked={form.createLogin} onChange={(e) => setForm({ ...form, createLogin: e.target.checked })} /> Criar login do funcionário agora</label>
                <label className="field">Username<input disabled={!form.createLogin} maxLength={7} value={form.username} onChange={(e) => setForm({ ...form, username: normalizeUsername(e.target.value) })} /></label>
                <label className="field">Senha<input disabled={!form.createLogin} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
                <label className="field is-wide-field">Acesso salvo<select disabled={!form.createLogin} value={form.permissionProfileId} onChange={(e) => setForm({ ...form, permissionProfileId: e.target.value })}><option value="">Selecione um acesso salvo</option>{permissionProfileOptions.map((profile) => <option value={profile.id} key={profile.id}>{profile.active === false ? `${profile.name} (inativo)` : profile.name}</option>)}</select></label>
                {!data.permissionProfiles.length ? <p className="muted is-wide-field">Crie um acesso salvo na tela de permissões antes de vincular login a funcionários.</p> : null}
              </div>
            ) : null}

            {step === 5 ? (
              <div className="review-box">
                <strong>{form.name}</strong>
                <span>{form.role || "-"} · {form.position || "-"}</span>
                <span>{form.workSchedule || "-"} · {form.weeklyHours || 0}h · {formatCurrency(Number(form.salary || 0))}</span>
                <span>{form.createLogin ? `Login: ${form.username}` : "Login pode ser criado depois"}</span>
                {selectedPromotions.length ? <span>{selectedPromotions.length} alteração(ões) de trajetória já registrada(s).</span> : null}
                {promotionMode ? <span>Fluxo de promoção: a trajetória só será registrada se houver mudança de função ou cargo.</span> : null}
              </div>
            ) : null}

            <div className="form-actions">
              <button className="btn btn-ghost" type="button" disabled={wizardSaving || draftSaving || pdfImporting} onClick={() => saveDraft(step)}><Save size={16} /> {draftSaving ? "Salvando..." : "Salvar rascunho"}</button>
              {step > 1 ? <button className="btn btn-ghost" type="button" disabled={wizardSaving || draftSaving || pdfImporting} onClick={() => setStep(step - 1)}><ChevronLeft size={16} /> Voltar</button> : null}
              {step < finalWizardStep ? <button className="btn btn-primary" type="button" disabled={wizardSaving || draftSaving || pdfImporting} onClick={handleAdvanceStep}>Avançar <ChevronRight size={16} /></button> : <button className="btn btn-primary" type="submit" disabled={wizardSaving || draftSaving || pdfImporting}><Check size={16} /> {wizardSaving ? "Finalizando..." : form.employeeKind === "diarist" ? "Salvar diarista" : promotionMode ? "Finalizar promoção" : "Finalizar"}</button>}
            </div>
          </form>
        </div>
      ) : null}


      {confirmState ? (
        <ConfirmModal
          title={confirmState.title}
          description={confirmState.description}
          confirmLabel={confirmState.confirmLabel}
          destructive={Boolean(confirmState.impact)}
          disabled={confirmingAction}
          impact={confirmState.impact}
          onCancel={() => setConfirmState(null)}
          onConfirm={confirmAction}
        />
      ) : null}

      {undoState ? (
        <div className="undo-toast">
          <span>{undoState.message}</span>
          <button type="button" onClick={runUndo}><RotateCcw size={15} /> Desfazer alteração</button>
        </div>
      ) : null}
    </section>
  );
}

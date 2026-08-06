import type { DeleteImpact } from "@/common/components/DeleteImpactModal";
import type { DomainSnapshot } from "@/types/domain";

export type DeletableDomainCollection = keyof DomainSnapshot;

function link(label: string, count: number, description?: string) {
  return { label, count, description };
}

function labelOf(item: unknown, fallback: string) {
  if (!item || typeof item !== "object") return fallback;
  const record = item as Record<string, unknown>;
  return String(record.name || record.fullName || record.label || record.title || record.username || record.id || fallback);
}

export function buildDomainDeletionImpact(
  data: DomainSnapshot,
  collection: DeletableDomainCollection,
  id: string,
  fallbackLabel = "Registro selecionado",
): DeleteImpact {
  const items = data[collection] as Array<{ id: string }>;
  const entity = items.find((item) => item.id === id);
  const entityLabel = labelOf(entity, fallbackLabel);

  if (collection === "companies") {
    const departments = data.departments.filter((item) => item.companyId === id).length;
    const sectors = data.sectors.filter((item) => item.companyId === id).length;
    const subsectors = data.subsectors.filter((item) => item.companyId === id).length;
    const employees = data.employees.filter((item) => item.companyId === id).length;
    const teams = data.teams.filter((item) => item.companyId === id).length;
    const benefits = data.benefitContracts.filter((item) => item.companyId === id).length;
    const documents = data.employeeDocuments.filter((item) => item.companyId === id).length;
    const points = data.timeRecords.filter((item) => item.companyId === id).length;
    const groupLinks = data.companyGroupCompanies.filter((item) => item.companyId === id).length;
    return {
      entityType: "empresa",
      entityLabel,
      reasons: [
        "A empresa é o nível principal da estrutura e possui dados dependentes.",
        "A exclusão em cascata pode retirar funcionários, documentos e benefícios das consultas integradas.",
      ],
      links: [
        link("Departamentos", departments), link("Setores", sectors), link("Subsetores", subsectors),
        link("Funcionários", employees), link("Equipes", teams), link("Benefícios", benefits),
        link("Documentos", documents), link("Registros de ponto preservados", points), link("Vínculos com grupos", groupLinks),
      ],
      consequences: [
        "A estrutura organizacional desta empresa será excluída em cascata.",
        "Funcionários vinculados e os dados dependentes deles poderão ser removidos.",
        "Registros de ponto já salvos não serão apagados por esta exclusão.",
        "A empresa deixará de participar dos grupos empresariais atuais.",
      ],
      note: "O histórico do Controle de Ponto só deve ser alterado dentro do próprio módulo de ponto.",
    };
  }

  if (collection === "departments") {
    const sectors = data.sectors.filter((item) => item.departmentId === id).length;
    const subsectors = data.subsectors.filter((item) => item.departmentId === id).length;
    const employees = data.employees.filter((item) => item.departmentId === id).length;
    const documents = data.employeeDocuments.filter((item) => item.departmentId === id).length;
    return {
      entityType: "departamento",
      entityLabel,
      reasons: ["O departamento ainda organiza setores, subsetores e funcionários."],
      links: [link("Setores", sectors), link("Subsetores", subsectors), link("Funcionários", employees), link("Documentos", documents)],
      consequences: ["Os setores e subsetores dependentes serão removidos.", "Funcionários vinculados poderão ser excluídos com seus dados dependentes."],
      note: "Realocar os funcionários antes da exclusão preserva os cadastros e o histórico.",
    };
  }

  if (collection === "sectors") {
    const subsectors = data.subsectors.filter((item) => item.sectorId === id).length;
    const employees = data.employees.filter((item) => item.sectorId === id).length;
    const documents = data.employeeDocuments.filter((item) => item.sectorId === id).length;
    return {
      entityType: "setor",
      entityLabel,
      reasons: ["O setor ainda possui pessoas ou estruturas dependentes."],
      links: [link("Subsetores", subsectors), link("Funcionários", employees), link("Documentos", documents)],
      consequences: ["Os subsetores vinculados serão removidos.", "Funcionários do setor poderão ser excluídos com os dados dependentes."],
      note: "Realocar os funcionários antes da exclusão é a opção mais segura.",
    };
  }

  if (collection === "subsectors") {
    const employees = data.employees.filter((item) => item.subsectorId === id).length;
    const documents = data.employeeDocuments.filter((item) => item.subsectorId === id).length;
    return {
      entityType: "subsetor",
      entityLabel,
      reasons: ["O subsetor ainda é usado para classificar funcionários e documentos."],
      links: [link("Funcionários", employees), link("Documentos", documents)],
      consequences: ["Funcionários do subsetor poderão ser excluídos com seus dados dependentes."],
      note: "Realocar os funcionários evita perda de cadastro e histórico.",
    };
  }

  if (collection === "teams") {
    const employees = data.employees.filter((item) => item.teamId === id).length;
    const pointRecords = data.timeRecords.filter((item) => item.realTeamId === id || item.dayTeamId === id).length;
    return {
      entityType: "equipe",
      entityLabel,
      reasons: [
        employees > 0 ? "Há funcionários cadastrados nesta equipe." : "A equipe pode aparecer em registros históricos de ponto.",
      ],
      links: [link("Funcionários vinculados", employees), link("Registros de ponto que citam a equipe", pointRecords)],
      consequences: [
        "Os funcionários permanecerão cadastrados, mas ficarão sem equipe definida.",
        "Os registros históricos já salvos continuarão com o nome da equipe registrado no dia.",
      ],
    };
  }

  if (collection === "employees") {
    const promotions = data.employeePromotions.filter((item) => item.employeeId === id).length;
    const drafts = data.employeeDrafts.filter((item) => item.employeeId === id).length;
    const documents = data.employeeDocuments.filter((item) => item.employeeId === id).length;
    const documentIds = new Set(data.employeeDocuments.filter((item) => item.employeeId === id).map((item) => item.id));
    const alerts = data.documentAlerts.filter((item) => item.employeeId === id || documentIds.has(item.documentId)).length;
    const points = data.timeRecords.filter((item) => item.employeeId === id).length;
    const benefits = data.employeeBenefits.filter((item) => item.employeeId === id).length;
    const assignments = data.employee_assignments.filter((item) => item.employeeId === id).length;
    const groupAssignments = data.companyGroupEmployeeAssignments.filter((item) => item.employeeId === id).length;
    const leadership = data.companyGroupLeadershipAssignments.filter((item) => item.employeeId === id).length;
    const users = data.systemUsers.filter((item) => item.employeeId === id).length;
    return {
      entityType: "funcionário",
      entityLabel,
      reasons: [
        "O funcionário possui histórico e vínculos usados por outros módulos.",
        "Excluir o cadastro pode retirar documentos, benefícios e permissões das consultas integradas.",
      ],
      links: [
        link("Promoções", promotions), link("Rascunhos", drafts), link("Documentos", documents), link("Alertas", alerts),
        link("Registros de ponto preservados", points), link("Benefícios", benefits), link("Vínculos de estrutura", assignments),
        link("Vínculos em grupos", groupAssignments), link("Responsabilidades em grupos", leadership), link("Usuários de acesso", users),
      ],
      consequences: [
        "Os dados dependentes do funcionário serão removidos em cascata.",
        "O login associado e as permissões correspondentes também poderão ser excluídos.",
        "Registros de ponto já salvos continuarão aparecendo no Controle de Ponto pelo histórico gravado.",
      ],
      note: "O histórico do Controle de Ponto só deve ser alterado dentro do próprio módulo de ponto.",
    };
  }

  if (collection === "benefitContracts") {
    const plans = data.benefitPlans.filter((item) => item.contractId === id).length;
    const employeeBenefits = data.employeeBenefits.filter((item) => item.contractId === id).length;
    const fields = data.benefitCustomFields.filter((item) => item.benefitContractId === id).length;
    return {
      entityType: "benefício",
      entityLabel,
      reasons: ["O benefício possui estrutura própria e pode estar vinculado a funcionários."],
      links: [link("Planos", plans), link("Funcionários vinculados", employeeBenefits), link("Campos personalizados", fields)],
      consequences: ["Os planos, vínculos de funcionários e campos personalizados serão excluídos.", "A tabela e as configurações armazenadas no benefício deixarão de aparecer."],
    };
  }

  if (collection === "benefitPlans") {
    const employeeBenefits = data.employeeBenefits.filter((item) => item.planId === id).length;
    return {
      entityType: "plano de benefício",
      entityLabel,
      reasons: ["O plano pode estar atribuído a funcionários."],
      links: [link("Funcionários vinculados", employeeBenefits)],
      consequences: ["Os vínculos dos funcionários com este plano serão removidos."],
    };
  }

  if (collection === "employeeDocuments") {
    const alerts = data.documentAlerts.filter((item) => item.documentId === id && item.status !== "completed").length;
    return {
      entityType: "documento",
      entityLabel,
      reasons: [alerts > 0 ? "O documento possui alertas ativos." : "O arquivo faz parte do histórico documental do funcionário."],
      links: [link("Alertas ativos", alerts)],
      consequences: ["O documento deixará de aparecer na pasta do funcionário.", alerts > 0 ? "Os alertas ativos serão concluídos e preservados no histórico." : "Nenhum alerta ativo será alterado."],
    };
  }

  if (collection === "permissionProfiles") {
    const profile = data.permissionProfiles.find((item) => item.id === id);
    const targets = profile?.targets?.length || 0;
    const screens = profile ? Object.values(profile.permissions || {}).filter((actions) => Boolean(actions?.length)).length : 0;
    return {
      entityType: "perfil de acesso",
      entityLabel,
      reasons: ["O perfil define permissões que podem ser reutilizadas no cadastro de usuários."],
      links: [link("Alvos configurados", targets), link("Telas com permissões", screens)],
      consequences: ["O perfil não poderá mais ser aplicado a novos usuários.", "As permissões já gravadas diretamente nos usuários permanecerão até serem alteradas."],
    };
  }

  if (collection === "timekeepingColumns") {
    const column = data.timekeepingColumns.find((item) => item.id === id);
    const key = column?.key || "";
    const records = key ? data.timeRecords.filter((item) => Object.prototype.hasOwnProperty.call(item.customFields || {}, key)).length : 0;
    return {
      entityType: "coluna do ponto",
      entityLabel,
      reasons: ["A coluna pode conter valores preenchidos em dias já salvos."],
      links: [link("Registros de ponto com valor nesta coluna", records)],
      consequences: ["A coluna deixará de aparecer na tabela.", "Os valores históricos associados à chave da coluna poderão permanecer no banco, mas ficarão ocultos na interface."],
    };
  }

  if (collection === "organizational_nodes") {
    const children = data.organizational_nodes.filter((item) => item.parentId === id).length;
    const assignments = data.employee_assignments.filter((item) => item.nodeId === id).length;
    return {
      entityType: "item da estrutura",
      entityLabel,
      reasons: ["O item pode possuir filhos e vínculos de funcionários."],
      links: [link("Itens filhos diretos", children), link("Vínculos de funcionários", assignments)],
      consequences: ["Todos os itens descendentes serão excluídos.", "Os vínculos de funcionários com os itens removidos serão apagados."],
    };
  }

  if (collection === "employee_assignments") {
    const assignment = data.employee_assignments.find((item) => item.id === id);
    const employee = assignment ? data.employees.find((item) => item.id === assignment.employeeId) : undefined;
    const node = assignment ? data.organizational_nodes.find((item) => item.id === assignment.nodeId) : undefined;
    return {
      entityType: "vínculo",
      entityLabel: `${employee?.name || entityLabel}${node ? ` → ${node.nome}` : ""}`,
      reasons: ["Este vínculo define o papel do funcionário na estrutura organizacional."],
      links: [link("Funcionário afetado", employee ? 1 : 0), link("Item da estrutura", node ? 1 : 0)],
      consequences: ["O funcionário deixará de exercer este papel na estrutura."],
    };
  }

  if (collection === "companyGroups") {
    const companies = data.companyGroupCompanies.filter((item) => item.groupId === id).length;
    const units = data.companyGroupUnits.filter((item) => item.groupId === id).length;
    const links = data.companyGroupUnitLinks.filter((item) => item.groupId === id).length;
    const assignments = data.companyGroupEmployeeAssignments.filter((item) => item.groupId === id).length;
    const leadership = data.companyGroupLeadershipAssignments.filter((item) => item.groupId === id).length;
    return {
      entityType: "grupo empresarial",
      entityLabel,
      reasons: ["O grupo unifica estruturas e responsabilidades de várias empresas."],
      links: [link("Empresas", companies), link("Unidades unificadas", units), link("Mapeamentos de estrutura", links), link("Funcionários no grupo", assignments), link("Lideranças", leadership)],
      consequences: ["A configuração unificada do grupo será removida.", "As empresas e funcionários originais continuarão cadastrados individualmente."],
    };
  }

  if (collection === "companyGroupUnits") {
    const children = data.companyGroupUnits.filter((item) => item.parentUnitId === id).length;
    const links = data.companyGroupUnitLinks.filter((item) => item.groupUnitId === id).length;
    const employees = data.companyGroupEmployeeAssignments.filter((item) => [item.departmentUnitId, item.sectorUnitId, item.subsectorUnitId, item.teamUnitId].includes(id)).length;
    const leadership = data.companyGroupLeadershipAssignments.filter((item) => item.unitId === id).length;
    return {
      entityType: "unidade do grupo",
      entityLabel,
      reasons: ["A unidade está ligada à estrutura de empresas e pode receber funcionários e lideranças."],
      links: [link("Unidades filhas", children), link("Mapeamentos de origem", links), link("Funcionários", employees), link("Lideranças", leadership)],
      consequences: ["Os vínculos desta unidade serão removidos do grupo.", "Funcionários e lideranças deixarão de aparecer nesta unidade unificada."],
    };
  }

  if (collection === "companyGroupLeadershipAssignments") {
    const assignment = data.companyGroupLeadershipAssignments.find((item) => item.id === id);
    const employee = assignment ? data.employees.find((item) => item.id === assignment.employeeId) : undefined;
    const unit = assignment ? data.companyGroupUnits.find((item) => item.id === assignment.unitId) : undefined;
    return {
      entityType: "responsabilidade do grupo",
      entityLabel: `${employee?.name || entityLabel}${unit ? ` → ${unit.name}` : ""}`,
      reasons: ["O vínculo define um responsável na estrutura unificada do grupo."],
      links: [link("Funcionário", employee ? 1 : 0), link("Unidade do grupo", unit ? 1 : 0)],
      consequences: ["O funcionário deixará de ser reconhecido como responsável por esta unidade."],
    };
  }

  if (collection === "talentCandidates") {
    const candidate = data.talentCandidates.find((item) => item.id === id);
    return {
      entityType: "candidato",
      entityLabel: candidate?.fullName || entityLabel,
      reasons: ["O registro faz parte do histórico do banco de talentos."],
      links: [link("Rascunho de funcionário associado", candidate?.employeeDraftId ? 1 : 0)],
      consequences: ["A linha do candidato será removida do banco de talentos.", "O rascunho de funcionário associado não será apagado automaticamente."],
    };
  }

  if (collection === "employeeDrafts") {
    const draft = data.employeeDrafts.find((item) => item.id === id);
    return {
      entityType: "rascunho",
      entityLabel: draft?.payload?.name || entityLabel,
      reasons: ["O rascunho contém informações ainda não finalizadas do cadastro."],
      links: [link("Funcionário já associado", draft?.employeeId ? 1 : 0)],
      consequences: ["As informações não finalizadas deste rascunho serão perdidas."],
    };
  }

  return {
    entityType: "registro",
    entityLabel,
    reasons: ["O registro será removido permanentemente do sistema."],
    links: [],
    consequences: ["O item deixará de aparecer nas telas e consultas relacionadas."],
  };
}

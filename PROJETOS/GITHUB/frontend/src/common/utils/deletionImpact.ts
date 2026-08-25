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
    const employees = data.employees.filter((item) => item.companyId === id).length;
    const benefits = data.benefitContracts.filter((item) => item.companyId === id).length;
    const documents = data.employeeDocuments.filter((item) => item.companyId === id).length;
    const points = data.timeRecords.filter((item) => item.companyId === id).length;
    const groupLinks = data.companyGroupCompanies.filter((item) => item.companyId === id).length;
    return {
      entityType: "empresa",
      entityLabel,
      reasons: [
        "A empresa representa o CNPJ/vinculo legal usado nos funcionarios.",
        "A estrutura organizacional pertence ao grupo e nao deve ser removida junto com a empresa.",
      ],
      links: [
        link("Funcionarios", employees),
        link("Beneficios", benefits),
        link("Documentos", documents),
        link("Registros de ponto preservados", points),
        link("Vinculos com grupos", groupLinks),
      ],
      consequences: [
        "A exclusao sera bloqueada se ainda houver funcionarios vinculados a este CNPJ.",
        "Departamentos, setores, subsetores e equipes do grupo serao preservados.",
        "Registros de ponto ja salvos nao serao apagados por esta exclusao.",
        "A empresa deixara de participar dos grupos empresariais atuais.",
      ],
      note: "O historico do Controle de Ponto so deve ser alterado dentro do proprio modulo de ponto.",
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
      reasons: ["O departamento ainda organiza setores, subsetores e funcionarios."],
      links: [link("Setores", sectors), link("Subsetores", subsectors), link("Funcionarios", employees), link("Documentos", documents)],
      consequences: ["Os setores e subsetores dependentes serao removidos.", "Funcionarios vinculados poderao ser excluidos com seus dados dependentes."],
      note: "Realocar os funcionarios antes da exclusao preserva os cadastros e o historico.",
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
      links: [link("Subsetores", subsectors), link("Funcionarios", employees), link("Documentos", documents)],
      consequences: ["Os subsetores vinculados serao removidos.", "Funcionarios do setor poderao ser excluidos com os dados dependentes."],
      note: "Realocar os funcionarios antes da exclusao e a opcao mais segura.",
    };
  }

  if (collection === "subsectors") {
    const employees = data.employees.filter((item) => item.subsectorId === id).length;
    const documents = data.employeeDocuments.filter((item) => item.subsectorId === id).length;
    return {
      entityType: "subsetor",
      entityLabel,
      reasons: ["O subsetor ainda e usado para classificar funcionarios e documentos."],
      links: [link("Funcionarios", employees), link("Documentos", documents)],
      consequences: ["Funcionarios do subsetor poderao ser excluidos com seus dados dependentes."],
      note: "Realocar os funcionarios evita perda de cadastro e historico.",
    };
  }

  if (collection === "teams") {
    const employees = data.employees.filter((item) => item.teamId === id).length;
    const pointRecords = data.timeRecords.filter((item) => item.realTeamId === id || item.dayTeamId === id).length;
    return {
      entityType: "equipe",
      entityLabel,
      reasons: [
        employees > 0 ? "Ha funcionarios cadastrados nesta equipe." : "A equipe pode aparecer em registros historicos de ponto.",
      ],
      links: [link("Funcionarios vinculados", employees), link("Registros de ponto que citam a equipe", pointRecords)],
      consequences: [
        "Os funcionarios permanecerao cadastrados, mas ficarao sem equipe definida.",
        "Os registros historicos ja salvos continuarao com o nome da equipe registrado no dia.",
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
      entityType: "funcionario",
      entityLabel,
      reasons: [
        "O funcionario possui historico e vinculos usados por outros modulos.",
        "Excluir o cadastro pode retirar documentos, beneficios e permissoes das consultas integradas.",
      ],
      links: [
        link("Promocoes", promotions), link("Rascunhos", drafts), link("Documentos", documents), link("Alertas", alerts),
        link("Registros de ponto preservados", points), link("Beneficios", benefits), link("Vinculos de estrutura", assignments),
        link("Vinculos em grupos", groupAssignments), link("Responsabilidades em grupos", leadership), link("Usuarios de acesso", users),
      ],
      consequences: [
        "Os dados dependentes do funcionario serao removidos em cascata.",
        "O login associado e as permissoes correspondentes tambem poderao ser excluidos.",
        "Registros de ponto ja salvos continuarao aparecendo no Controle de Ponto pelo historico gravado.",
      ],
      note: "O historico do Controle de Ponto so deve ser alterado dentro do proprio modulo de ponto.",
    };
  }

  if (collection === "benefitContracts") {
    const plans = data.benefitPlans.filter((item) => item.contractId === id).length;
    const employeeBenefits = data.employeeBenefits.filter((item) => item.contractId === id).length;
    const fields = data.benefitCustomFields.filter((item) => item.benefitContractId === id).length;
    return {
      entityType: "beneficio",
      entityLabel,
      reasons: ["O beneficio possui estrutura propria e pode estar vinculado a funcionarios."],
      links: [link("Planos", plans), link("Funcionarios vinculados", employeeBenefits), link("Campos personalizados", fields)],
      consequences: ["Os planos, vinculos de funcionarios e campos personalizados serao excluidos.", "A tabela e as configuracoes armazenadas no beneficio deixarao de aparecer."],
    };
  }

  if (collection === "benefitPlans") {
    const employeeBenefits = data.employeeBenefits.filter((item) => item.planId === id).length;
    return {
      entityType: "plano de beneficio",
      entityLabel,
      reasons: ["O plano pode estar atribuido a funcionarios."],
      links: [link("Funcionarios vinculados", employeeBenefits)],
      consequences: ["Os vinculos dos funcionarios com este plano serao removidos."],
    };
  }

  if (collection === "employeeDocuments") {
    const alerts = data.documentAlerts.filter((item) => item.documentId === id && item.status !== "completed").length;
    return {
      entityType: "documento",
      entityLabel,
      reasons: [alerts > 0 ? "O documento possui alertas ativos." : "O arquivo faz parte do historico documental do funcionario."],
      links: [link("Alertas ativos", alerts)],
      consequences: ["O documento deixara de aparecer na pasta do funcionario.", alerts > 0 ? "Os alertas ativos serao concluidos e preservados no historico." : "Nenhum alerta ativo sera alterado."],
    };
  }

  if (collection === "permissionProfiles") {
    const profile = data.permissionProfiles.find((item) => item.id === id);
    const targets = profile?.targets?.length || 0;
    const screens = profile ? Object.values(profile.permissions || {}).filter((actions) => Boolean(actions?.length)).length : 0;
    return {
      entityType: "perfil de acesso",
      entityLabel,
      reasons: ["O perfil define permissoes que podem ser reutilizadas no cadastro de usuarios."],
      links: [link("Alvos configurados", targets), link("Telas com permissoes", screens)],
      consequences: ["O perfil nao podera mais ser aplicado a novos usuarios.", "As permissoes ja gravadas diretamente nos usuarios permanecerao ate serem alteradas."],
    };
  }

  if (collection === "timekeepingColumns") {
    const column = data.timekeepingColumns.find((item) => item.id === id);
    const key = column?.key || "";
    const records = key ? data.timeRecords.filter((item) => Object.prototype.hasOwnProperty.call(item.customFields || {}, key)).length : 0;
    return {
      entityType: "coluna do ponto",
      entityLabel,
      reasons: ["A coluna pode conter valores preenchidos em dias ja salvos."],
      links: [link("Registros de ponto com valor nesta coluna", records)],
      consequences: ["A coluna deixara de aparecer na tabela.", "Os valores historicos associados a chave da coluna poderao permanecer no banco, mas ficarao ocultos na interface."],
    };
  }

  if (collection === "organizational_nodes") {
    const children = data.organizational_nodes.filter((item) => item.parentId === id).length;
    const assignments = data.employee_assignments.filter((item) => item.nodeId === id).length;
    return {
      entityType: "item da estrutura",
      entityLabel,
      reasons: ["O item pode possuir filhos e vinculos de funcionarios."],
      links: [link("Itens filhos diretos", children), link("Vinculos de funcionarios", assignments)],
      consequences: ["Todos os itens descendentes serao excluidos.", "Os vinculos de funcionarios com os itens removidos serao apagados."],
    };
  }

  if (collection === "employee_assignments") {
    const assignment = data.employee_assignments.find((item) => item.id === id);
    const employee = assignment ? data.employees.find((item) => item.id === assignment.employeeId) : undefined;
    const node = assignment ? data.organizational_nodes.find((item) => item.id === assignment.nodeId) : undefined;
    return {
      entityType: "vinculo",
      entityLabel: `${employee?.name || entityLabel}${node ? ` -> ${node.nome}` : ""}`,
      reasons: ["Este vinculo define o papel do funcionario na estrutura organizacional."],
      links: [link("Funcionario afetado", employee ? 1 : 0), link("Item da estrutura", node ? 1 : 0)],
      consequences: ["O funcionario deixara de exercer este papel na estrutura."],
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
      reasons: ["O grupo unifica estruturas e responsabilidades de varias empresas."],
      links: [link("Empresas", companies), link("Unidades unificadas", units), link("Mapeamentos de estrutura", links), link("Funcionarios no grupo", assignments), link("Liderancas", leadership)],
      consequences: ["A configuracao unificada do grupo sera removida.", "As empresas e funcionarios originais continuarao cadastrados individualmente."],
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
      reasons: ["A unidade esta ligada a estrutura de empresas e pode receber funcionarios e liderancas."],
      links: [link("Unidades filhas", children), link("Mapeamentos de origem", links), link("Funcionarios", employees), link("Liderancas", leadership)],
      consequences: ["Os vinculos desta unidade serao removidos do grupo.", "Funcionarios e liderancas deixarao de aparecer nesta unidade unificada."],
    };
  }

  if (collection === "companyGroupLeadershipAssignments") {
    const assignment = data.companyGroupLeadershipAssignments.find((item) => item.id === id);
    const employee = assignment ? data.employees.find((item) => item.id === assignment.employeeId) : undefined;
    const unit = assignment ? data.companyGroupUnits.find((item) => item.id === assignment.unitId) : undefined;
    return {
      entityType: "responsabilidade do grupo",
      entityLabel: `${employee?.name || entityLabel}${unit ? ` -> ${unit.name}` : ""}`,
      reasons: ["O vinculo define um responsavel na estrutura unificada do grupo."],
      links: [link("Funcionario", employee ? 1 : 0), link("Unidade do grupo", unit ? 1 : 0)],
      consequences: ["O funcionario deixara de ser reconhecido como responsavel por esta unidade."],
    };
  }

  if (collection === "talentCandidates") {
    const candidate = data.talentCandidates.find((item) => item.id === id);
    return {
      entityType: "candidato",
      entityLabel: candidate?.fullName || entityLabel,
      reasons: ["O registro faz parte do historico do banco de talentos."],
      links: [link("Rascunho de funcionario associado", candidate?.employeeDraftId ? 1 : 0)],
      consequences: ["A linha do candidato sera removida do banco de talentos.", "O rascunho de funcionario associado nao sera apagado automaticamente."],
    };
  }

  if (collection === "employeeDrafts") {
    const draft = data.employeeDrafts.find((item) => item.id === id);
    return {
      entityType: "rascunho",
      entityLabel: draft?.payload?.name || entityLabel,
      reasons: ["O rascunho contem informacoes ainda nao finalizadas do cadastro."],
      links: [link("Funcionario ja associado", draft?.employeeId ? 1 : 0)],
      consequences: ["As informacoes nao finalizadas deste rascunho serao perdidas."],
    };
  }

  return {
    entityType: "registro",
    entityLabel,
    reasons: ["O registro sera removido permanentemente do sistema."],
    links: [],
    consequences: ["O item deixara de aparecer nas telas e consultas relacionadas."],
  };
}

import { useMemo, useState } from "react";
import { BadgeCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useDomainData } from "@/hooks/useDomainData";
import { uploadEmployeeDocumentFile } from "@/services/documentStorage";
import { formatDate, todayISO } from "@/utils/format";
import { timekeepingTeamStructure } from "@/modules/timekeeping/utils/teamStructure";
import {
  CLASSIFICATION_MAX_FILE_BYTES,
  CLASSIFICATION_SLA_DAYS,
  classificationStages,
  daysSince,
  sameRoleKey,
  signalLabels,
  type ClassificationCase,
} from "./classificationModel";
import { useClassificationCases } from "./useClassificationCases";
import ClassificationCaseModal, { type EffectInput } from "./ClassificationCaseModal";
import ClassificationCodeBox from "./ClassificationCodeBox";
// Mesmo visual de quadro do Processo de Abandono / ASO.
import "@/modules/hrControl/abandonment/abandonment.css";
import "./classification.css";

const normalize = (value: string) => value.normalize("NFD").replace(/[^\x20-\x7e]/g, "").toLowerCase();

export default function ClassificationPage() {
  const data = useDomainData();
  const { user, can } = useAuth();
  const canEdit = can("classification", "edit");
  const today = todayISO();
  const { cases, ready, loadError, save, advance } = useClassificationCases(user);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const employeeById = useMemo(() => new Map(data.employees.map((employee) => [employee.id, employee])), [data.employees]);
  const recentLimit = new Date(Date.now() - 30 * 86400000).toISOString();
  const visible = cases.filter((item) => item.status === "open" || (item.closedAt || "") >= recentLimit)
    .filter((item) => !search.trim() || normalize(`${item.employeeName} ${item.request?.solicitante} ${item.request?.funcaoSolicitada}`).includes(normalize(search.trim())));

  // Indicadores do POP: pedidos no mês e tempo médio de resposta (concluídos em 90 dias).
  const monthKey = today.slice(0, 7);
  const requestsThisMonth = cases.filter((item) => item.requestedAt?.slice(0, 7) === monthKey).length;
  const closedRecent = cases.filter((item) => item.closedAt && item.closedAt >= new Date(Date.now() - 90 * 86400000).toISOString());
  const averageDays = closedRecent.length
    ? Math.round(closedRecent.reduce((sum, item) => sum + daysSince(item.requestedAt, item.closedAt!.slice(0, 10)), 0) / closedRecent.length)
    : null;
  const lateOpen = cases.filter((item) => item.status === "open" && item.dueDate < today).length;
  const selected = cases.find((item) => item.id === selectedId);
  const teamNameById = useMemo(() => new Map<string, string>([
    ...data.teams.map((team) => [team.id, team.name] as [string, string]),
    ...data.companyGroupUnits.filter((unit) => unit.type === "team").map((unit) => [unit.id, unit.name] as [string, string]),
  ]), [data.companyGroupUnits, data.teams]);
  // Equipe atual pela estrutura de grupos (o teamId do cadastro pode estar desatualizado).
  const { employeeTeamId } = useMemo(() => timekeepingTeamStructure(data), [data]);
  const selectedEmployee = selected ? employeeById.get(selected.employeeId) : undefined;
  const selectedTeamId = selectedEmployee ? employeeTeamId(selectedEmployee) : "";
  // Pessoas da mesma equipe que já exercem a função pedida (função ou cargo).
  const sameRoleInTeam = selected && selectedEmployee && selectedTeamId
    ? data.employees.filter((employee) => employee.status !== "terminated" && employeeTeamId(employee) === selectedTeamId && employee.id !== selectedEmployee.id
      && [employee.role, employee.position].some((value) => value && sameRoleKey(value) === sameRoleKey(selected.request.funcaoSolicitada))).length
    : 0;

  // Etapa 5, aprovado: o cadastro recebe a nova função/cargo/salário e a mudança
  // entra na trajetória (o mesmo registro que a edição do cadastro faz).
  async function effect(item: ClassificationCase, input: EffectInput) {
    if (input.effectiveDate > today) throw new Error(`A mudança vale a partir de ${formatDate(input.effectiveDate)}. Efetive nesse dia.`);
    if (input.termFile && input.termFile.size > CLASSIFICATION_MAX_FILE_BYTES) throw new Error("O termo passa de 10 MB. Envie um arquivo menor.");
    const current = data.employees.find((employee) => employee.id === item.employeeId);
    if (!current) throw new Error("Funcionário não encontrado.");
    if (current.status === "terminated") throw new Error("O funcionário foi desligado; a mudança não pode ser efetivada.");
    const now = new Date().toISOString();
    const termFileUrl = input.termFile ? await uploadEmployeeDocumentFile(current.id, input.termFile) : "";
    await data.upsertEmployee({ ...current, role: input.newRole, position: input.newPosition, salary: input.newSalary, updatedAt: now });
    await data.upsertEmployeePromotion({
      employeeId: current.id,
      effectiveDate: input.effectiveDate,
      previousRole: current.role || "",
      newRole: input.newRole,
      previousPosition: current.position || "",
      newPosition: input.newPosition,
      previousSalary: Number(current.salary || 0),
      newSalary: input.newSalary,
      previousWeeklyHours: Number(current.weeklyHours || 0),
      newWeeklyHours: Number(current.weeklyHours || 0),
      notes: `Processo de Classificação (pedido de ${item.request.solicitante}), aprovado pela diretoria.`,
      createdAt: now,
    });
    await save(item, {
      newRole: input.newRole,
      newPosition: input.newPosition,
      newSalary: input.newSalary,
      effectiveDate: input.effectiveDate,
      effectedAt: now,
      ...(termFileUrl ? { termFileUrl, termFileName: input.termFile!.name } : {}),
    });
  }

  return (
    <section className="page classification-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Processo de Classificação</h1>
          <p className="page-subtitle">Mudança de função conforme o POP-RH-06. O pedido chega pelo link; cada etapa só avança com os requisitos preenchidos. Prazo: {CLASSIFICATION_SLA_DAYS} dias.</p>
        </div>
        {canEdit ? <ClassificationCodeBox /> : null}
      </div>

      <div className="classification-indicators">
        <div><small>Pedidos neste mês</small><strong>{ready ? requestsThisMonth : "—"}</strong></div>
        <div><small>Tempo médio de resposta (90 dias)</small><strong>{averageDays === null ? "—" : `${averageDays} dia(s)`}</strong></div>
        <div className={lateOpen ? "is-late" : ""}><small>Fora do prazo de {CLASSIFICATION_SLA_DAYS} dias</small><strong>{ready ? lateOpen : "—"}</strong></div>
        <input className="classification-search" type="search" placeholder="Buscar colaborador, solicitante ou função" value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>

      {loadError ? <p className="abandonment-error">Não foi possível carregar os pedidos. Recarregue a página.</p> : null}

      <div className="abandonment-columns classification-columns">
        {classificationStages.map((stage) => {
          const items = visible.filter((item) => item.stage === stage.id).sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
          return (
            <div className={`abandonment-column${stage.id === "closed" ? " is-closed" : ""}`} key={stage.id}>
              <h3>{stage.label} <b>{items.length}</b></h3>
              <small>{stage.hint}</small>
              {items.map((item) => {
                const days = daysSince(item.requestedAt, item.closedAt?.slice(0, 10) || today);
                const late = item.status === "open" && item.dueDate < today;
                return (
                  <article key={item.id} className={`abandonment-card is-case${late ? " classification-card-late" : ""}`} role="button" tabIndex={0}
                    onClick={() => setSelectedId(item.id)} onKeyDown={(event) => { if (event.key === "Enter") setSelectedId(item.id); }}>
                    <strong>{item.employeeName}</strong>
                    <span>{item.currentRole || "—"} → <b>{item.request.funcaoSolicitada}</b></span>
                    <span>Pedido por {item.request.solicitante}</span>
                    {item.status === "open"
                      ? <em className={late ? "classification-late-text" : ""}>Dia {days} de {CLASSIFICATION_SLA_DAYS}{late ? " · fora do prazo" : ""}</em>
                      : <em>{item.decision === "approved" ? "Aprovado" : "Reprovado"} em {days} dia(s)</em>}
                    {item.opinion?.signal ? <span className={`classification-signal-dot is-${item.opinion.signal}`}>{signalLabels[item.opinion.signal]}</span> : null}
                    {item.effectedAt ? <span className="classification-effected"><BadgeCheck size={13} /> Cadastro atualizado</span> : null}
                  </article>
                );
              })}
            </div>
          );
        })}
      </div>

      {selected ? (
        <ClassificationCaseModal
          key={selected.id}
          item={selected}
          employee={selectedEmployee}
          promotions={data.employeePromotions}
          teamName={teamNameById.get(selectedTeamId) || selected.request.equipe}
          sameRoleInTeam={sameRoleInTeam}
          canEdit={canEdit}
          onClose={() => setSelectedId(null)}
          save={save}
          advance={advance}
          effect={effect}
        />
      ) : null}
    </section>
  );
}

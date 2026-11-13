import { useMemo, useState } from "react";
import { Eye, Plus, Stethoscope } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useDomainData } from "@/hooks/useDomainData";
import { openEmployeeDocumentFile, uploadEmployeeDocumentFile } from "@/services/documentStorage";
import { buildEmployeeFolderPath, documentKindFromFileName, formatDocumentFileSize } from "@/modules/records/utils/recordsDocuments";
import { subtractDaysFromISODate } from "@/utils/date";
import { useEmployeeSituationTags, type SituationTag } from "@/modules/notifications/hooks/useEmployeeSituationTags";
import {
  ASO_CLINIC_DAYS,
  ASO_LEAD_DAYS,
  ASO_MAX_FILE_BYTES,
  asoCandidates,
  asoManualReasonLabels,
  asoRecipientLabels,
  currentAsoDocument,
  asoStages,
  clinicLate,
  daysBetween,
  firstGuideDate,
  secondGuideDue,
  secondGuideDueDate,
  type AsoCase,
  type AsoManualReason,
  type AsoStage,
} from "@/modules/aso/asoModel";
import AsoAddEmployeeModal, { type AsoAddOption } from "@/modules/aso/AsoAddEmployeeModal";
import { addDaysISO } from "@/modules/vacation/data/vacationsRepository";
import { useAsoCases } from "@/modules/aso/useAsoCases";
import AsoCaseModal from "@/modules/aso/AsoCaseModal";
import { formatDate, getAlertStatus, todayISO } from "@/utils/format";
import { timekeepingTeamStructure } from "@/modules/timekeeping/utils/teamStructure";
import type { DocumentAlert, EmployeeDocument } from "@/types/domain";
// Mesmo visual de quadro do Processo de Abandono.
import "@/modules/hrControl/abandonment/abandonment.css";
import "./aso.css";

type BoardCard = {
  key: string;
  employeeId: string;
  employeeName: string;
  companyId: string;
  companyName: string;
  documentId: string;
  dueDate: string;
  document?: EmployeeDocument;
  asoCase?: AsoCase;
};

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function dueLabel(dueDate: string, today: string) {
  if (!dueDate) return "Sem ASO em Registros";
  const days = daysBetween(today, dueDate);
  if (days < 0) return `ASO venceu há ${-days} dia(s) (${formatDate(dueDate)})`;
  if (days === 0) return `ASO vence hoje (${formatDate(dueDate)})`;
  return `ASO vence em ${days} dia(s) (${formatDate(dueDate)})`;
}

export default function AsoPage() {
  const data = useDomainData();
  const today = todayISO();
  const { user, can } = useAuth();
  const canEdit = can("aso", "edit");
  const { cases, recentlyClosed, ready, loadError, saveGuide, addManualCase, cancelManualCase, linkCaseDocument, markGuideSent, markSecondGuideSent, markExamDone, markAsoReceived, markSentToSertras } = useAsoCases(user);
  const [selectedKey, setSelectedKey] = useState("");
  const situationTags = useEmployeeSituationTags(data.employees, today);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const companyNameById = useMemo(() => new Map(data.companies.map((company) => [company.id, company.name])), [data.companies]);
  const documentById = useMemo(() => new Map(data.employeeDocuments.map((document) => [document.id, document])), [data.employeeDocuments]);
  // Equipe real: estrutura de grupos (mesma regra do Controle de ponto e da Classificação).
  const teamNameById = useMemo(() => new Map<string, string>([
    ...data.teams.map((team) => [team.id, team.name] as [string, string]),
    ...data.companyGroupUnits.filter((unit) => unit.type === "team").map((unit) => [unit.id, unit.name] as [string, string]),
  ]), [data.companyGroupUnits, data.teams]);
  const { employeeTeamId } = useMemo(() => timekeepingTeamStructure(data), [data]);
  const employeeById = useMemo(() => new Map(data.employees.map((employee) => [employee.id, employee])), [data.employees]);
  const teamNameFor = (employeeId: string) => {
    const employee = employeeById.get(employeeId);
    return employee ? teamNameById.get(employeeTeamId(employee)) || "" : "";
  };

  // ASO vigente de cada funcionário (para o caso manual).
  const currentAsoByEmployee = useMemo(() => {
    const byEmployee = new Map<string, EmployeeDocument[]>();
    data.employeeDocuments.forEach((document) => {
      const list = byEmployee.get(document.employeeId) || [];
      list.push(document);
      byEmployee.set(document.employeeId, list);
    });
    return new Map(Array.from(byEmployee, ([employeeId, list]) => [employeeId, currentAsoDocument(list)] as const));
  }, [data.employeeDocuments]);

  // Quem pode ser adicionado à mão: ativo e sem caso aberto.
  const addOptions = useMemo<AsoAddOption[]>(() => {
    if (!addOpen) return [];
    const withOpenCase = new Set(cases.map((asoCase) => asoCase.employeeId));
    return data.employees
      .filter((employee) => employee.status !== "terminated" && !withOpenCase.has(employee.id))
      .map((employee) => ({
        id: employee.id,
        name: employee.name,
        companyName: companyNameById.get(employee.companyId) || "",
        teamName: teamNameById.get(employeeTeamId(employee)) || "",
        dueDate: currentAsoByEmployee.get(employee.id)?.expirationDate || "",
      }))
      .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
  }, [addOpen, cases, companyNameById, currentAsoByEmployee, data.employees, employeeTeamId, teamNameById]);

  async function addEmployee(employeeId: string, reason: AsoManualReason, notes: string) {
    const employee = employeeById.get(employeeId);
    if (!employee) throw new Error("Funcionário não encontrado.");
    if (cases.some((asoCase) => asoCase.employeeId === employeeId)) throw new Error("Esse funcionário já está no processo.");
    const document = currentAsoByEmployee.get(employeeId);
    await addManualCase({
      employeeId,
      employeeName: employee.name,
      companyId: employee.companyId,
      companyName: companyNameById.get(employee.companyId) || "",
      documentId: document?.id || "",
      dueDate: document?.expirationDate || "",
    }, reason, asoManualReasonLabels[reason], notes);
  }

  // ASO novo de quem não tinha ASO em Registros: cria o documento lá (mesma
  // pasta que a tela de Registros monta).
  async function createAsoDocument(employeeId: string) {
    const employee = employeeById.get(employeeId);
    if (!employee) throw new Error("Funcionário não encontrado no cadastro.");
    const now = new Date().toISOString();
    const folderPath = buildEmployeeFolderPath([
      companyNameById.get(employee.companyId),
      data.departments.find((item) => item.id === employee.departmentId)?.name,
      data.sectors.find((item) => item.id === employee.sectorId)?.name,
      employee.subsectorId ? data.subsectors.find((item) => item.id === employee.subsectorId)?.name : undefined,
      employee.name,
    ]);
    return data.upsertEmployeeDocument({
      companyId: employee.companyId,
      groupId: employee.groupId || "",
      departmentId: employee.departmentId,
      sectorId: employee.sectorId,
      subsectorId: employee.subsectorId,
      employeeId: employee.id,
      name: "ASO",
      kind: "file",
      folderPath,
      fileUrl: "",
      size: "-",
      expirationDate: "",
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  const cardsByStage = useMemo(() => {
    const term = normalize(search.trim());
    const byStage = new Map<AsoStage, BoardCard[]>(asoStages.map((stage) => [stage.id, []]));
    const candidates = asoCandidates(data.employees, data.employeeDocuments, cases, today);
    const cards: Array<[AsoStage, BoardCard]> = [
      ...candidates.map((candidate): [AsoStage, BoardCard] => ["notified", {
        key: `candidate-${candidate.employee.id}`,
        employeeId: candidate.employee.id,
        employeeName: candidate.employee.name,
        companyId: candidate.employee.companyId,
        companyName: companyNameById.get(candidate.employee.companyId) || "",
        documentId: candidate.document.id,
        dueDate: candidate.dueDate,
        document: candidate.document,
      }]),
      ...[...cases, ...recentlyClosed].map((asoCase): [AsoStage, BoardCard] => [asoCase.stage, {
        key: asoCase.id,
        employeeId: asoCase.employeeId,
        employeeName: asoCase.employeeName,
        companyId: asoCase.companyId,
        companyName: asoCase.companyName,
        documentId: asoCase.documentId,
        dueDate: asoCase.dueDate,
        document: documentById.get(asoCase.documentId),
        asoCase,
      }]),
    ];
    cards
      .filter(([, card]) => !term || normalize(`${card.employeeName} ${card.companyName} ${teamNameFor(card.employeeId)}`).includes(term))
      .forEach(([stage, card]) => byStage.get(stage)?.push(card));
    byStage.forEach((list) => list.sort((left, right) => left.dueDate.localeCompare(right.dueDate)));
    return byStage;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- teamNameFor depende de employeeById/employeeTeamId/teamNameById
  }, [cases, companyNameById, data.employeeDocuments, data.employees, documentById, recentlyClosed, search, today, employeeById, employeeTeamId, teamNameById]);

  // Observações do ASO = campo "Observações" do alerta em Notificações (mesmo
  // registro: editar aqui ou lá dá no mesmo). Alerta do ciclo do card: mesmo
  // documento e mesmo vencimento, o aberto primeiro; antes de receber o ASO
  // novo, vale também o alerta aberto do documento.
  function alertForCard(card: BoardCard): DocumentAlert | undefined {
    if (!card.documentId) return undefined;
    const alerts = data.documentAlerts.filter((alert) => alert.documentId === card.documentId);
    const sameCycle = alerts.filter((alert) => alert.dueDate === card.dueDate);
    const received = card.asoCase && (card.asoCase.stage === "aso_received" || card.asoCase.stage === "closed");
    return sameCycle.find((alert) => alert.status !== "completed")
      || sameCycle.sort((left, right) => (right.updatedAt || "").localeCompare(left.updatedAt || ""))[0]
      || (received ? undefined : alerts.find((alert) => alert.status !== "completed"));
  }

  async function saveObservation(alert: DocumentAlert, value: string) {
    const description = value.trim();
    if (description === (alert.description || "")) return;
    await data.upsertDocumentAlert({ ...alert, description, updatedAt: new Date().toISOString() });
  }

  // Etapa 5: o ASO novo entra em Registros no lugar do atual e o alerta é
  // concluído, com o do próximo vencimento criado (mesma regra do "Realizado /
  // concluir" das Notificações).
  async function receiveAso(asoCase: AsoCase, file: File, newDueDate: string) {
    if (file.size > ASO_MAX_FILE_BYTES) throw new Error("O ASO passa de 10 MB. Envie um arquivo menor.");
    const now = new Date().toISOString();
    const fileUrl = await uploadEmployeeDocumentFile(asoCase.employeeId, file);
    // Caso manual de quem não tinha ASO em Registros: o documento nasce agora.
    const document = asoCase.documentId ? documentById.get(asoCase.documentId) : await createAsoDocument(asoCase.employeeId);
    if (!document) throw new Error("O ASO atual não foi encontrado em Registros.");
    const openAlerts = data.documentAlerts.filter((alert) => alert.documentId === document.id && alert.status !== "completed");
    // Conclui antes de trocar o vencimento: a troca no documento moveria o alerta aberto em vez de concluí-lo.
    await Promise.all(openAlerts.map((alert) => data.upsertDocumentAlert({
      ...alert, realized: "yes", status: "completed", completedAt: now, updatedAt: now,
    })));
    await data.upsertEmployeeDocument({
      ...document,
      fileUrl,
      kind: documentKindFromFileName(file.name),
      size: formatDocumentFileSize(file),
      realizedDate: asoCase.examDate || todayISO(),
      attachmentDate: todayISO(),
      expirationDate: newDueDate,
      updatedAt: now,
    });
    const base = openAlerts[0];
    const advanceDays = Number(base?.advanceDays ?? base?.notifyBeforeDays ?? ASO_LEAD_DAYS) || ASO_LEAD_DAYS;
    const notifyDate = subtractDaysFromISODate(newDueDate, advanceDays);
    const renewed: Omit<DocumentAlert, "id"> = {
      documentId: document.id,
      employeeId: asoCase.employeeId,
      companyId: asoCase.companyId,
      title: base?.title || `Alerta - ${document.name}`,
      dueDate: newDueDate,
      advanceDays,
      notifyBeforeDays: advanceDays,
      notifyDate,
      priority: base?.priority || "medium",
      status: getAlertStatus(notifyDate),
      recurrence: base?.recurrence || "Anual",
      notifyBy: base?.notifyBy || ["system"],
      description: "",
      completedAt: "",
      createdAt: now,
      updatedAt: now,
      ...(base ? { renewedFromAlertId: base.id, previousDueDate: base.dueDate } : {}),
    };
    await data.upsertDocumentAlert(renewed);
    if (!asoCase.documentId) await linkCaseDocument(asoCase, document.id);
    await markAsoReceived(asoCase, newDueDate, file.name, `ASO novo anexado em Registros (vence em ${formatDate(newDueDate)}).`);
  }

  // Linha da etapa no cartão: o que já foi feito e o próximo prazo.
  function stageLine(asoCase: AsoCase | undefined) {
    if (!asoCase) return null;
    if (asoCase.stage === "guide_issued") return { text: "Guia anexada, falta encaminhar", late: false };
    if (asoCase.stage === "guide_sent") {
      const sentLabel = formatDate(firstGuideDate(asoCase));
      return secondGuideDue(asoCase, today)
        ? { text: `1ª guia em ${sentLabel}. Encaminhar a 2ª guia (prazo ${formatDate(secondGuideDueDate(asoCase))})`, late: true }
        : { text: `1ª guia com o ${asoRecipientLabels[asoCase.guideSentTo || "supervisor"].toLowerCase()} em ${sentLabel}. 2ª guia em ${formatDate(secondGuideDueDate(asoCase))}`, late: false };
    }
    if (asoCase.stage === "guide_resent") {
      const sentLabel = asoCase.secondGuideSentAt ? ` em ${formatDate(asoCase.secondGuideSentAt)}` : "";
      return { text: `2ª guia com o ${asoRecipientLabels[asoCase.secondGuideSentTo || "supervisor"].toLowerCase()}${sentLabel}, aguardando exame`, late: false };
    }
    if (asoCase.stage === "exam_done" && asoCase.examDate) {
      const limit = addDaysISO(asoCase.examDate, ASO_CLINIC_DAYS);
      return clinicLate(asoCase, today)
        ? { text: `Clínica atrasada: entrega era até ${formatDate(limit)}`, late: true }
        : { text: `Exame em ${formatDate(asoCase.examDate)}, clínica entrega até ${formatDate(limit)}`, late: false };
    }
    if (asoCase.stage === "aso_received") return { text: `Novo ASO vence em ${formatDate(asoCase.newDueDate || "")}, falta enviar à SERTRAS`, late: false };
    if (asoCase.stage === "closed") return { text: `Enviado à SERTRAS em ${formatDate(asoCase.sertrasSentAt || "")}`, late: false };
    return null;
  }

  const selectedCard = useMemo(() => {
    if (!selectedKey) return undefined;
    for (const list of cardsByStage.values()) {
      const found = list.find((card) => card.key === selectedKey);
      if (found) return found;
    }
    return undefined;
  }, [cardsByStage, selectedKey]);

  function renderTags(tags: SituationTag[] | undefined) {
    if (!tags?.length) return null;
    return (
      <span className="aso-card-tags">
        {tags.map((tag) => <span key={tag.label} className={`badge badge-${tag.tone}`}>{tag.label}</span>)}
      </span>
    );
  }

  return (
    <section className="page aso-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Processo de ASO</h1>
          <p className="page-subtitle">
            O ASO entra sozinho em "Avisado" {ASO_LEAD_DAYS} dias antes de vencer. Funcionário em aviso ou com desligamento marcado não entra (faz o demissional).
          </p>
        </div>
        <div className="aso-header-actions">
        {canEdit ? (
          <button className="btn btn-primary" type="button" onClick={() => setAddOpen(true)}>
            <Plus size={16} /> Adicionar funcionário
          </button>
        ) : null}
        <input
          className="aso-search"
          type="search"
          placeholder="Buscar funcionário ou empresa"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        </div>
      </div>

      {loadError ? <p className="abandonment-error">Não foi possível carregar os processos de ASO. Recarregue a página.</p> : null}
      {error ? <p className="abandonment-error">{error}</p> : null}
      {!ready && !loadError ? <p className="abandonment-muted">Carregando processos…</p> : null}

      <div className="abandonment-columns">
        {asoStages.map((stage) => {
          const cards = cardsByStage.get(stage.id) || [];
          return (
            <div className={`abandonment-column ${stage.id === "closed" ? "is-closed" : ""}`} key={stage.id}>
              <h3>{stage.label} <b>{cards.length}</b></h3>
              {stage.id === "guide_sent" && cards.some((card) => card.asoCase && secondGuideDue(card.asoCase, today)) ? (
                <span className="aso-column-alert">
                  {cards.filter((card) => card.asoCase && secondGuideDue(card.asoCase, today)).length} com a 2ª guia no prazo de envio
                </span>
              ) : null}
              <small>{stage.hint}</small>
              {cards.map((card) => {
                // Depois do ASO novo, o vencimento antigo não é mais problema.
                const renewed = card.asoCase?.stage === "aso_received" || card.asoCase?.stage === "closed";
                const line = stageLine(card.asoCase);
                const overdue = (!renewed && card.dueDate < today) || Boolean(line?.late);
                return (
                  <article
                    className={`abandonment-card is-case ${overdue ? "aso-card-overdue" : ""}`}
                    key={card.key}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedKey(card.key)}
                    onKeyDown={(event) => { if (event.key === "Enter") setSelectedKey(card.key); }}
                  >
                    <strong><Stethoscope size={14} /> {card.employeeName}</strong>
                    <span>{card.companyName}</span>
                    <span className="aso-card-team">Equipe: {teamNameFor(card.employeeId) || "sem equipe"}</span>
                    {card.asoCase?.origin === "manual" ? (
                      <span className="aso-card-tags">
                        <span className="badge badge-info">Manual · {asoManualReasonLabels[card.asoCase.manualReason || "other"]}</span>
                      </span>
                    ) : null}
                    {!renewed ? <em className={card.dueDate < today ? "aso-overdue-text" : ""}>{dueLabel(card.dueDate, today)}</em> : null}
                    {line ? <span className={`aso-stage-line ${line.late ? "aso-overdue-text" : ""}`}>{line.text}</span> : null}
                    {renderTags(situationTags.get(card.employeeId))}
                    {card.document?.fileUrl ? (
                      <button
                        className="btn btn-soft"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setError("");
                          openEmployeeDocumentFile(card.document!.fileUrl, card.document!.name).catch((openError) => {
                            setError(openError instanceof Error ? openError.message : "Não foi possível abrir o ASO.");
                          });
                        }}
                      >
                        <Eye size={14} /> Ver ASO atual
                      </button>
                    ) : null}
                  </article>
                );
              })}
            </div>
          );
        })}
      </div>
      {selectedCard ? (
        <AsoCaseModal
          key={selectedCard.key}
          seed={{
            employeeId: selectedCard.employeeId,
            employeeName: selectedCard.employeeName,
            companyId: selectedCard.companyId,
            companyName: selectedCard.companyName,
            documentId: selectedCard.documentId,
            dueDate: selectedCard.dueDate,
          }}
          teamName={teamNameFor(selectedCard.employeeId)}
          asoCase={selectedCard.asoCase}
          currentAsoUrl={selectedCard.document?.fileUrl}
          currentAsoName={selectedCard.document?.name}
          canEdit={canEdit}
          alert={alertForCard(selectedCard)}
          canEditObservation={can("notifications", "edit")}
          saveObservation={saveObservation}
          onClose={() => setSelectedKey("")}
          saveGuide={(seed, file) => saveGuide(seed, file, selectedCard.asoCase)}
          cancelManualCase={cancelManualCase}
          markGuideSent={markGuideSent}
          markSecondGuideSent={markSecondGuideSent}
          markExamDone={markExamDone}
          receiveAso={receiveAso}
          markSentToSertras={markSentToSertras}
        />
      ) : null}
      {addOpen ? <AsoAddEmployeeModal options={addOptions} onClose={() => setAddOpen(false)} onSave={addEmployee} /> : null}
    </section>
  );
}

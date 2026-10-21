import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";
import { desligamentoAEfetivar, hojeEmSaoPaulo, type EmployeeDoc } from "./desligamentos";

initializeApp();

// Todo dia 00:30 (Brasília): quem terminou o aviso/desligamento ontem e continua
// ativo vira "terminated", com a data efetiva = fim do processo. Cancelar o aviso
// limpa as datas, então quem teve o aviso cancelado não entra aqui.
export const efetivarDesligamentos = onSchedule(
  { schedule: "30 0 * * *", timeZone: "America/Sao_Paulo", region: "southamerica-east1" },
  async () => {
    const db = getFirestore();
    const hoje = hojeEmSaoPaulo();
    const agora = new Date().toISOString();
    const ativos = await db.collection("employees").where("status", "in", ["active", "leave"]).get();

    let efetivados = 0;
    for (const doc of ativos.docs) {
      const employee = { id: doc.id, ...doc.data() } as EmployeeDoc;
      const fim = desligamentoAEfetivar(employee, hoje);
      if (!fim) continue;

      const r = employee.registrationData || {};
      const temAviso = Boolean(r.noticeStartDate || r.noticeEndDate);
      const registrationData = {
        ...r,
        deactivationCompletedDate: fim,
        ...(temAviso ? { noticeCompletedDate: fim } : {}),
        autoDeactivatedAt: agora,
        autoDeactivatedBy: "rotina-efetivar-desligamentos",
      };
      const atualizado = { ...employee, status: "terminated", registrationData, updatedAt: agora };

      const batch = db.batch();
      batch.set(doc.ref, { status: "terminated", registrationData, updatedAt: agora }, { merge: true });
      // Mesma cópia que a tela grava ao desligar (aba Demitidos).
      batch.set(db.collection("dismissedEmployees").doc(doc.id), atualizado, { merge: true });
      batch.set(db.collection("auditLogs").doc(`audit-${randomUUID()}`), {
        action: "deactivate",
        entityType: "employees",
        entityId: doc.id,
        entityLabel: employee.name || doc.id,
        description: `Desligamento efetivado automaticamente ao fim do processo (${fim}).`,
        changedFields: ["status", "registrationData.deactivationCompletedDate"],
        actorUserId: "system",
        actorUsername: "rotina",
        actorName: "Rotina automática de desligamento",
        createdAt: agora,
        metadata: { dataDesligamento: fim },
      });
      await batch.commit();
      efetivados += 1;
      logger.info("Desligamento efetivado", { employeeId: doc.id, fim });
    }

    logger.info("Rotina de desligamentos concluída", { hoje, analisados: ativos.size, efetivados });
  },
);

import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useDomainData } from "@/hooks/useDomainData";
import { firestore } from "@/services/firebase";
import { buildHrTimekeepingSettingsByCompanyId, recordOrgUnit, type OrgUnitNames } from "@/modules/hrControl/domain/hrControlModel";
import { AbandonmentBoard } from "@/modules/hrControl/abandonment/AbandonmentBoard";
import { ABANDONMENT_LOOKBACK_DAYS } from "@/modules/hrControl/abandonment/abandonmentModel";
import type { Employee, TimekeepingDayTable, TimeRecord } from "@/types/domain";
// Modal e botões do quadro usam as classes do Controle RH.
import "@/modules/hrControl/components/HrControlView.css";

// Tela própria do DP (grupo Funcionários). O Monitoramento do Controle RH continua com o painel de faltas consecutivas.
export default function AbandonmentPage() {
  const data = useDomainData();
  const { user } = useAuth();
  const [savedDayTables, setSavedDayTables] = useState<TimekeepingDayTable[]>([]);
  const [savedDaysError, setSavedDaysError] = useState(false);

  useEffect(() => {
    if (!firestore) return undefined;
    // Só a janela que o quadro usa para achar a sequência de faltas.
    const from = new Date();
    from.setDate(from.getDate() - ABANDONMENT_LOOKBACK_DAYS - 1);
    return onSnapshot(query(collection(firestore, "timekeepingDayTables"), where("date", ">=", from.toISOString().slice(0, 10)), orderBy("date", "desc")),
      (snapshot) => {
        setSavedDayTables(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as TimekeepingDayTable));
        setSavedDaysError(false);
      },
      (error) => {
        console.warn("Não foi possível acompanhar os dias de ponto salvos para o processo de abandono.", error);
        setSavedDaysError(true);
      });
  }, []);

  const settingsByCompanyId = useMemo(() => buildHrTimekeepingSettingsByCompanyId(data.timekeepingColumns), [data.timekeepingColumns]);
  const employeeById = useMemo(() => new Map(data.employees.map((employee) => [employee.id, employee])), [data.employees]);
  const teamById = useMemo(() => new Map<string, { name: string }>([
    ...data.teams.map((team) => [team.id, team] as const),
    ...data.companyGroupUnits.filter((unit) => unit.type === "team").map((unit) => [unit.id, unit] as const),
  ]), [data.companyGroupUnits, data.teams]);
  const orgUnitNames = useMemo<OrgUnitNames>(() => {
    const byType = (type: "department" | "sector" | "subsector", items: Array<{ id: string; name: string }>) => new Map([
      ...items.map((item) => [item.id, item.name?.trim() || ""] as const),
      ...data.companyGroupUnits.filter((unit) => unit.type === type).map((unit) => [unit.id, unit.name?.trim() || ""] as const),
    ]);
    return {
      departments: byType("department", data.departments),
      sectors: byType("sector", data.sectors),
      subsectors: byType("subsector", data.subsectors),
    };
  }, [data.companyGroupUnits, data.departments, data.sectors, data.subsectors]);
  // Equipe do cadastro; sem equipe, o subsetor/setor/departamento (mesma regra do Controle RH).
  const teamGroupFor = useCallback((_record: TimeRecord | undefined, employee: Employee | undefined) => {
    const teamName = teamById.get(employee?.teamId || "")?.name;
    if (teamName) return { label: teamName };
    const unit = recordOrgUnit(undefined, employee, orgUnitNames);
    return unit ? { label: unit.name, detail: `Sem equipe · ${unit.level}` } : { label: "Sem equipe" };
  }, [orgUnitNames, teamById]);

  return (
    <section className="page hr-control-page abandonment-page">
      {savedDaysError ? <p className="abandonment-error">Não foi possível carregar os dias de ponto salvos. Recarregue a página.</p> : null}
      <AbandonmentBoard
        employees={data.employees}
        employeeById={employeeById}
        companies={data.companies}
        savedDayTables={savedDayTables}
        settingsByCompanyId={settingsByCompanyId}
        teamGroupFor={teamGroupFor}
        user={user}
      />
    </section>
  );
}

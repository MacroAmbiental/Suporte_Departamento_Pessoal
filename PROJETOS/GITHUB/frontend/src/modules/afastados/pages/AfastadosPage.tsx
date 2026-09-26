import { useMemo, useState } from "react";
import { useDomainData } from "@/hooks/useDomainData";
import { employeeLeaveEntries } from "@/modules/employeeProcesses/utils/leavePeriods";
import { formatDate, todayISO } from "@/utils/format";

type CloseLeaveEditor = {
  date: string;
};

export default function AfastadosPage() {
  const data = useDomainData();
  const today = todayISO();
  const [selectedGroup, setSelectedGroup] = useState("all");
  const [closingLeaveByKey, setClosingLeaveByKey] = useState<Record<string, CloseLeaveEditor>>({});
  const [closingBusyByKey, setClosingBusyByKey] = useState<Record<string, boolean>>({});

  const employeesWithLeaves = useMemo(() => {
    return data.employees
      .filter((employee) => employeeLeaveEntries(employee).length > 0)
      .map((employee) => ({
        ...employee,
        leaveEntries: employeeLeaveEntries(employee),
      }))
      .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
  }, [data.employees]);

  const groups = useMemo(() => [
    { value: "all", label: "Todos" },
    ...Array.from(new Set(data.companies.map((company) => company.name))).map((name) => ({ value: name, label: name })),
  ], [data.companies]);

  const filtered = useMemo(() => {
    if (selectedGroup === "all") return employeesWithLeaves;
    return employeesWithLeaves.filter((employee) => data.companies.find((company) => company.id === employee.companyId)?.name === selectedGroup);
  }, [employeesWithLeaves, data.companies, selectedGroup]);

  const closeLeaveForEntry = async (employee: (typeof employeesWithLeaves)[number], entry: (typeof employee.leaveEntries)[number]) => {
    const key = `${employee.id}:${entry.kind}:${entry.start}:${entry.end}`;
    const nextDate = closingLeaveByKey[key]?.date || today;

    if (nextDate < entry.start) return;
    if (nextDate > entry.end) return;

    setClosingBusyByKey((current) => ({ ...current, [key]: true }));

    try {
      const registrationData = { ...(employee.registrationData || {}) };

      if (entry.kind === "suspension") {
        registrationData.suspensionEndDate = nextDate;
      }
      if (entry.kind === "leave") {
        registrationData.leaveEndDate = nextDate;
      }
      if (entry.kind === "license") {
        registrationData.licenseEndDate = nextDate;
      }

      await data.upsertEmployee({
        ...employee,
        registrationData,
        updatedAt: new Date().toISOString(),
      });

      setClosingLeaveByKey((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    } finally {
      setClosingBusyByKey((current) => ({ ...current, [key]: false }));
    }
  };

  return (
    <section className="page" style={{ padding: 24 }}>
      <div className="panel padded" style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32, color: "#17263a" }}>Afastados</h1>
            <p style={{ margin: "8px 0 0", color: "#5f7286" }}>Centralize afastamentos e licenças, incluindo suspensões.</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <label style={{ fontWeight: 600, color: "#2d4560" }}>Empresa</label>
            <select value={selectedGroup} onChange={(event) => setSelectedGroup(event.target.value)} style={{ minWidth: 200, padding: "10px 12px", borderRadius: 10, border: "1px solid #d7e1ea", background: "white" }}>
              {groups.map((group) => (
                <option key={group.value} value={group.value}>{group.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 32, border: "1px solid #dfeaf2", borderRadius: 14, background: "#f9fbfd", color: "#536b7e" }}>
              Nenhum afastamento ou licença cadastrada no período atual.
            </div>
          ) : filtered.map((employee) => (
            <div key={employee.id} style={{ border: "1px solid #dfeaf2", borderRadius: 16, background: "#fff", padding: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                <div>
                  <strong style={{ fontSize: 18, color: "#15314d" }}>{employee.name}</strong>
                  <div style={{ color: "#5d7283", fontSize: 13 }}>
                    {employee.role || "—"} · {data.companies.find((company) => company.id === employee.companyId)?.name || "Empresa"}
                  </div>
                </div>
                <div style={{ padding: "7px 10px", borderRadius: 999, background: "#edf7f2", color: "#126c54", fontWeight: 700, fontSize: 12 }}>
                  {employee.leaveEntries.length} registro(s)
                </div>
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                {employee.leaveEntries.map((entry, index: number) => {
                  const key = `${employee.id}:${entry.kind}:${entry.start}:${entry.end}`;
                  const activeEditor = closingLeaveByKey[key];
                  const busy = closingBusyByKey[key];

                  return (
                    <div key={`${employee.id}-${index}`} style={{ border: "1px solid #ebf0f5", borderRadius: 12, background: "#f9fbfd", padding: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <strong style={{ color: "#1a2f45" }}>{entry.label}</strong>
                        <span style={{ fontSize: 12, fontWeight: 700, color: entry.kind === "license" ? "#0e7b66" : "#6b4d23", background: entry.kind === "license" ? "#ebfaf5" : "#fff6e7", borderRadius: 999, padding: "5px 8px" }}>
                          {entry.kind === "license" ? "Licença" : "Afastamento"}
                        </span>
                      </div>
                      <div style={{ marginTop: 8, color: "#49657d", fontSize: 13 }}>
                        {formatDate(entry.start)} até {formatDate(entry.end)}
                      </div>
                      <div style={{ marginTop: 4, color: "#5d7283", fontSize: 13 }}>
                        Motivo: {entry.reason}
                      </div>

                      <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        {activeEditor ? (
                          <>
                            <input
                              type="date"
                              value={activeEditor.date}
                              min={entry.start}
                              max={entry.end}
                              onChange={(event) => setClosingLeaveByKey((current) => ({ ...current, [key]: { date: event.target.value } }))}
                              style={{ minWidth: 150, padding: "8px 10px", borderRadius: 8, border: "1px solid #d7e1ea", background: "white" }}
                            />
                            <button
                              type="button"
                              onClick={() => void closeLeaveForEntry(employee, entry)}
                              disabled={busy || activeEditor.date < entry.start || activeEditor.date > entry.end}
                              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #0e7b66", background: busy ? "#9ccfc2" : "#0e7b66", color: "white", fontWeight: 700, cursor: busy ? "not-allowed" : "pointer" }}
                            >
                              {busy ? "Salvando..." : "Salvar"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setClosingLeaveByKey((current) => {
                                const next = { ...current };
                                delete next[key];
                                return next;
                              })}
                              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ccd9e5", background: "white", color: "#2d4560", fontWeight: 700 }}
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setClosingLeaveByKey((current) => ({ ...current, [key]: { date: today } }))}
                            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #b9d8d0", background: "#edf9f5", color: "#115a4a", fontWeight: 700 }}
                          >
                            Encerrar afastamento
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

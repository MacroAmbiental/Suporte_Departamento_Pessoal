import { useEffect, useMemo, useState } from "react";
import { loadDocumentsByIds } from "@/services/domainRepository";
import { loadDashboardMetrics, type DashboardMetrics } from "@/modules/dashboard/data/dashboardRepository";
import type { DocumentAlert, Employee } from "@/types/domain";

const initialMetrics: DashboardMetrics = {
  companies: 0,
  employees: 0,
  employeeDocuments: 0,
  benefitPlans: 0,
  talentCandidates: 0,
  absences: 0,
};

export function useDashboardMetrics(alerts: DocumentAlert[]) {
  const [metrics, setMetrics] = useState<DashboardMetrics>(initialMetrics);
  const [employeeNames, setEmployeeNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const employeeIds = useMemo(
    () => Array.from(new Set(alerts.slice(0, 6).map((alert) => alert.employeeId).filter(Boolean))),
    [alerts],
  );
  const employeeIdsKey = employeeIds.join("|");

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadDashboardMetrics()
      .then((value) => {
        if (active) setMetrics(value);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!employeeIds.length) {
      setEmployeeNames({});
      return undefined;
    }

    loadDocumentsByIds<Employee>("employees", employeeIds).then((employees) => {
      if (!active) return;
      setEmployeeNames(employees.reduce<Record<string, string>>((names, employee) => {
        names[employee.id] = employee.name;
        return names;
      }, {}));
    });

    return () => {
      active = false;
    };
  }, [employeeIdsKey]);

  return { metrics, employeeNames, loading };
}

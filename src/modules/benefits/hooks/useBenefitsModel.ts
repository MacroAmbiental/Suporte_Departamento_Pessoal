import { useMemo, useState } from "react";
import { useDomainData } from "@/hooks/useDomainData";
import { useAuth } from "@/hooks/useAuth";

export function useBenefitsModel() {
  const data = useDomainData();
  const { can } = useAuth();

  const canCreateBenefits = can("benefits", "create");
  const canEditBenefits = can("benefits", "edit");
  const canDeleteBenefits = can("benefits", "delete");

  const [filters, setFilters] = useState({
    companyIds: [] as string[],
    employeeIds: [] as string[],
    statusIds: [] as string[],
    search: "",
  });

  const employeeById = useMemo(
    () => new Map(data.employees.map((item) => [item.id, item])),
    [data.employees],
  );
  const contractById = useMemo(
    () => new Map(data.benefitContracts.map((item) => [item.id, item])),
    [data.benefitContracts],
  );
  const planById = useMemo(
    () => new Map(data.benefitPlans.map((item) => [item.id, item])),
    [data.benefitPlans],
  );
  const normalizedSearch = filters.search.trim().toLowerCase();

  const filteredBenefits = useMemo(() => {
    return data.employeeBenefits.filter((benefit) => {
      const employee = employeeById.get(benefit.employeeId);
      const contract = contractById.get(benefit.contractId);
      const plan = planById.get(benefit.planId);
      const status = benefit.active === false ? "inactive" : "active";
      const searchText = `${employee?.name || ""} ${contract?.name || ""} ${plan?.name || ""}`.toLowerCase();
      return (
        (!filters.companyIds.length || filters.companyIds.includes(benefit.companyId))
        && (!filters.employeeIds.length || filters.employeeIds.includes(benefit.employeeId))
        && (!filters.statusIds.length || filters.statusIds.includes(status))
        && (!normalizedSearch || searchText.includes(normalizedSearch))
      );
    });
  }, [contractById, data.employeeBenefits, employeeById, filters.companyIds, filters.employeeIds, filters.statusIds, normalizedSearch, planById]);

  return {
    data,
    canCreateBenefits,
    canEditBenefits,
    canDeleteBenefits,
    filters,
    setFilters,
    filteredBenefits,
  };
}

export type BenefitsModel = ReturnType<typeof useBenefitsModel>;

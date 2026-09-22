import { useMemo, useState } from "react";
import { useDomainData } from "@/hooks/useDomainData";
import { useAuth } from "@/hooks/useAuth";

export function useCompaniesModel() {
  const data = useDomainData();
  const { can } = useAuth();

  const canCreateCompanies = can("companies", "create");
  const canEditCompanies = can("companies", "edit");
  const canDeleteCompanies = can("companies", "delete");

  const [filters, setFilters] = useState({
    search: "",
    companyIds: [] as string[],
  });

  const filteredCompanies = useMemo(() => {
    return data.companies.filter((company) => {
      const searchText = `${company.name} ${company.legalName} ${company.document}`.toLowerCase();
      return (
        (!filters.search || searchText.includes(filters.search.toLowerCase()))
        && (!filters.companyIds.length || filters.companyIds.includes(company.id))
      );
    });
  }, [data.companies, filters]);

  return {
    data,
    canCreateCompanies,
    canEditCompanies,
    canDeleteCompanies,
    filters,
    setFilters,
    filteredCompanies,
  };
}

export type CompaniesModel = ReturnType<typeof useCompaniesModel>;

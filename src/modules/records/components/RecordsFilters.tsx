import { Search } from "lucide-react";
import ClearFiltersButton from "@/common/components/ClearFiltersButton";
import MultiSelect from "@/common/components/MultiSelect";
import { useRecordsContext } from "@/modules/records/context/RecordsContext";

export default function RecordsFilters() {
  const { recordsFilters } = useRecordsContext();

  return (
    <div className="filters-panel">
      <Search size={18} />
      <MultiSelect
        label="Grupos"
        placeholder="Grupos"
        value={recordsFilters.filters.groupIds}
        onChange={recordsFilters.setGroupIds}
        options={recordsFilters.groupOptions}
      />
      <MultiSelect
        label="Empresas"
        placeholder="Empresas"
        value={recordsFilters.filters.companyIds}
        onChange={recordsFilters.setCompanyIds}
        options={recordsFilters.companyOptions}
      />
      <MultiSelect
        label="Departamentos"
        placeholder="Departamentos"
        value={recordsFilters.filters.departmentIds}
        onChange={recordsFilters.setDepartmentIds}
        options={recordsFilters.departmentOptions}
      />
      <MultiSelect
        label="Setores"
        placeholder="Setores"
        value={recordsFilters.filters.sectorIds}
        onChange={recordsFilters.setSectorIds}
        options={recordsFilters.sectorOptions}
      />
      <MultiSelect
        label="Subsetores"
        placeholder="Subsetores"
        value={recordsFilters.filters.subsectorIds}
        onChange={recordsFilters.setSubsectorIds}
        options={recordsFilters.subsectorOptions}
      />
      <MultiSelect
        label="Funcionários"
        placeholder="Funcionários"
        value={recordsFilters.filters.employeeIds}
        onChange={recordsFilters.setEmployeeIds}
        options={recordsFilters.employeeOptions}
      />
      <MultiSelect
        label="CPF"
        placeholder="CPF"
        value={recordsFilters.filters.cpfValues}
        onChange={recordsFilters.setCpfValues}
        options={recordsFilters.cpfOptions}
      />
      <ClearFiltersButton active={recordsFilters.hasActiveFilters} onClear={recordsFilters.resetFilters} />
    </div>
  );
}

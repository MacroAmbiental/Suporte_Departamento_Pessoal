import type { DiaristsModel } from "../hooks/useDiarists";
import { Search } from "lucide-react";
import type { DiaristStatus } from "../types";
export default function DiaristsFilters({ model }: { model: DiaristsModel }) {
 const { search, setSearch, statusFilter, setStatusFilter } = model;
 return (<>
      <div className="filters-panel">
        <Search size={18} />
        <label className="field">
          Buscar
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, CPF, telefone, função ou PIX" />
        </label>
        <label className="field">
          Status
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | DiaristStatus)}>
            <option value="all">Todas</option>
            <option value="active">Ativas</option>
            <option value="inactive">Inativas</option>
          </select>
        </label>
      </div>
</>);
}

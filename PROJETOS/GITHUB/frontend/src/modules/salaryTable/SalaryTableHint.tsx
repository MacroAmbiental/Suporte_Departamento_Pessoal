import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { firestore } from "@/services/firebase";
import { formatCurrency } from "@/utils/format";
import { SALARY_TABLE_COLLECTION, computeLevels, matchSalaryRole, type SalaryTableRole } from "./salaryTableModel";
import "./salaryTable.css";

// Uma escuta só para todos os campos da tela que mostram a sugestão.
let cache: SalaryTableRole[] | null = null;
const listeners = new Set<(roles: SalaryTableRole[]) => void>();
let unsubscribe: (() => void) | null = null;

function useSalaryRoles() {
  const [roles, setRoles] = useState<SalaryTableRole[]>(cache || []);
  useEffect(() => {
    listeners.add(setRoles);
    if (!unsubscribe && firestore) {
      unsubscribe = onSnapshot(
        collection(firestore, SALARY_TABLE_COLLECTION),
        (snapshot) => {
          cache = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as SalaryTableRole);
          listeners.forEach((listener) => listener(cache!));
        },
        (error) => console.warn("Não foi possível carregar a tabela salarial.", error),
      );
    }
    return () => {
      listeners.delete(setRoles);
      if (!listeners.size && unsubscribe) { unsubscribe(); unsubscribe = null; }
    };
  }, []);
  return roles;
}

// Sugestão da Tabela Salarial embaixo de um campo de salário: procura a função
// (ex.: "MOTORISTA III") e oferece o valor do nível com um botão "Usar". Se o
// nível não vier no nome, mostra todos os níveis da função para escolher.
export default function SalaryTableHint({ functionNames, currentValue, onUse, disabled }: {
  functionNames: (string | undefined)[];
  currentValue?: number | null;
  onUse: (value: number) => void;
  disabled?: boolean;
}) {
  const roles = useSalaryRoles();
  if (!roles.length) return null;
  const name = functionNames.find((value) => value && matchSalaryRole(roles, value));
  const match = name ? matchSalaryRole(roles, name) : null;
  if (!match) {
    return functionNames.some((value) => value?.trim())
      ? <small className="salary-hint is-missing">Função não encontrada na Tabela Salarial.</small>
      : null;
  }

  const levels = computeLevels(match.role);
  const options = match.levelIndex === null ? levels.map((value, index) => ({ value, index })) : [{ value: levels[match.levelIndex], index: match.levelIndex }];
  const max = levels[levels.length - 1];
  const current = Number(currentValue || 0);

  return (
    <span className="salary-hint">
      <small>Tabela Salarial · {match.role.name}{match.levelIndex === null ? "" : ` ${match.role.levelLabels[match.levelIndex]}`}:</small>
      {options.map(({ value, index }) => (
        <button
          key={index}
          type="button"
          className={`salary-hint-option${current && Math.abs(current - value) < 0.005 ? " is-current" : ""}`}
          disabled={disabled}
          title="Usar este valor no campo"
          onClick={() => onUse(value)}
        >
          {match.levelIndex === null ? <b>{match.role.levelLabels[index]}</b> : null} {formatCurrency(value)}
        </button>
      ))}
      {current > max + 0.005 ? <small className="salary-hint-warning">Acima do último nível da função ({formatCurrency(max)}).</small> : null}
    </span>
  );
}

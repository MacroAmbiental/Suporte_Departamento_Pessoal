import type { ReactNode } from "react";

type Props = {
  onClear: () => void;
  ariaLabel?: string;
  icon?: ReactNode;
  className?: string;
  active?: boolean;
};

function FilterClearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 5h18v2l-7 7v5l-4 2v-7L3 7V5Z" />
      <circle cx="18" cy="16" r="4" />
      <path d="m16.6 14.6 2.8 2.8" />
      <path d="m19.4 14.6-2.8 2.8" />
    </svg>
  );
}

export default function ClearFiltersButton({
  onClear,
  ariaLabel = "Limpar filtros",
  icon = <FilterClearIcon />,
  className = "clear-filters-btn",
  active = true,
}: Props) {
  return (
    <button
      type="button"
      className={`btn btn-ghost ${className} ${active ? "is-active" : "is-idle"}`.trim()}
      aria-label={ariaLabel}
      onClick={onClear}
      disabled={!active}
      title={active ? ariaLabel : "Nenhum filtro aplicado"}
    >
      {icon}
    </button>
  );
}

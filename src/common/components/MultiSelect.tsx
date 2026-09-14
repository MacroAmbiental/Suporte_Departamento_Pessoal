import { Check, ChevronDown, Search, X } from "lucide-react";
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { sortByLabel } from "@/utils/sort";

export type MultiSelectOption = {
  value: string;
  label: string;
};

type MultiSelectProps = {
  label: string;
  options: MultiSelectOption[];
  value: string[];
  onChange: (nextValue: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
};

export default function MultiSelect({
  label,
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder = "Buscar",
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const sortedOptions = useMemo(() => sortByLabel(options), [options]);

  const filteredOptions = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return sortedOptions;
    return sortedOptions.filter((option) => `${option.label} ${option.value}`.toLowerCase().includes(needle));
  }, [search, sortedOptions]);

  const selectedOptions = useMemo(() => sortedOptions.filter((option) => value.includes(option.value)), [sortedOptions, value]);
  const visibleSelectedOptions = selectedOptions.slice(0, 1);
  const hiddenSelectedCount = Math.max(0, selectedOptions.length - visibleSelectedOptions.length);

  function toggleOption(optionValue: string) {
    if (value.includes(optionValue)) {
      onChange(value.filter((item) => item !== optionValue));
      return;
    }

    onChange([...value, optionValue]);
  }

  function handleControlKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      return;
    }

    if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="multi-select-dropdown" ref={containerRef}>
      <div
        className="multi-select-control"
        role="button"
        tabIndex={0}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleControlKeyDown}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <div className="multi-select-chips">
          {selectedOptions.length ? (
            <>
              {visibleSelectedOptions.map((option) => (
                <span className="multi-select-chip" key={option.value}>
                  <span className="multi-select-chip-label" title={option.label}>{option.label}</span>
                  <button type="button" aria-label={`Remover ${option.label}`} onClick={(event) => {
                    event.stopPropagation();
                    toggleOption(option.value);
                  }}>
                    <X size={11} />
                  </button>
                </span>
              ))}
              {hiddenSelectedCount ? <span className="multi-select-chip multi-select-chip-count">+{hiddenSelectedCount}</span> : null}
            </>
          ) : (
            <span className="multi-select-placeholder">{placeholder || label}</span>
          )}
        </div>
        <ChevronDown size={16} />
      </div>

      {open ? (
        <div className="multi-select-panel" role="listbox">
          <div className="multi-select-search-wrap">
            <Search size={15} />
            <input
              className="multi-select-search"
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={searchPlaceholder}
              autoFocus
            />
          </div>
          <div className="multi-select-options">
            {filteredOptions.length ? filteredOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`multi-select-option ${value.includes(option.value) ? "selected" : ""}`.trim()}
                onClick={() => toggleOption(option.value)}
              >
                <span>{option.label}</span>
                {value.includes(option.value) ? <Check size={15} /> : null}
              </button>
            )) : (
              <div className="multi-select-empty">Nenhuma opção encontrada.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

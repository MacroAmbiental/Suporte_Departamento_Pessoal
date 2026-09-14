export type SortDirection = "asc" | "desc";

const textCollator = new Intl.Collator("pt-BR", {
  numeric: true,
  sensitivity: "base",
});

export function compareText(left: unknown, right: unknown) {
  return textCollator.compare(String(left ?? "").trim(), String(right ?? "").trim());
}

export function sortByLabel<T extends { label?: string }>(options: readonly T[]) {
  return options
    .map((option, index) => ({ option, index }))
    .sort((left, right) => {
      const result = compareText(left.option.label, right.option.label);
      return result || left.index - right.index;
    })
    .map(({ option }) => option);
}

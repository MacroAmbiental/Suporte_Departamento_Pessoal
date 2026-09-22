import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

type TimekeepingPaginationProps = {
  totalItems: number;
  pageStart: number;
  pageEnd: number;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number | ((currentPage: number) => number)) => void;
};

export default function TimekeepingPagination({
  totalItems,
  pageStart,
  pageEnd,
  currentPage,
  totalPages,
  onPageChange,
}: TimekeepingPaginationProps) {
  if (!totalItems) return null;

  return (
    <div
      className="pagination-bar"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "12px 16px",
        flexWrap: "wrap",
      }}
    >
      <span className="muted">
        Mostrando {pageStart} a {pageEnd} de {totalItems} funcionário(s) filtrado(s)
      </span>

      <div className="pagination" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button
          className="btn btn-secondary"
          type="button"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(1)}
          title="Primeira página"
        >
          <ChevronsLeft size={16} />
        </button>

        <button
          className="btn btn-secondary"
          type="button"
          disabled={currentPage <= 1}
          onClick={() => onPageChange((page) => Math.max(1, page - 1))}
          title="Página anterior"
        >
          <ChevronLeft size={16} />
        </button>

        <span className="muted">
          Página {currentPage} de {totalPages}
        </span>

        <button
          className="btn btn-secondary"
          type="button"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange((page) => Math.min(totalPages, page + 1))}
          title="Próxima página"
        >
          <ChevronRight size={16} />
        </button>

        <button
          className="btn btn-secondary"
          type="button"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(totalPages)}
          title="Última página"
        >
          <ChevronsRight size={16} />
        </button>
      </div>
    </div>
  );
}
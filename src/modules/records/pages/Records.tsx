import CompanyFolderSidebar from "@/modules/records/components/CompanyFolderSidebar";
import EmployeeDocumentTable from "@/modules/records/components/EmployeeDocumentTable";
import RecordsFilters from "@/modules/records/components/RecordsFilters";
import RecordsHeader from "@/modules/records/components/RecordsHeader";
import RecordsModals from "@/modules/records/components/RecordsModals";
import SelectedEmployeePanel from "@/modules/records/components/SelectedEmployeePanel";
import { RecordsProvider } from "@/modules/records/context/RecordsContext";

export default function Records() {
  return (
    <RecordsProvider>
      <section className="page records-page">
        <RecordsHeader />
        <RecordsFilters />

        <div className="records-split">
          <CompanyFolderSidebar />

          <main className="records-main">
            <SelectedEmployeePanel />
            <EmployeeDocumentTable />
          </main>
        </div>

        <RecordsModals />
      </section>
    </RecordsProvider>
  );
}

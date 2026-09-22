import { CompaniesProvider } from "@/modules/companies/context/CompaniesContext";
import Companies from "./Companies";

export default function CompaniesPage() {
  return (
    <CompaniesProvider>
      <Companies />
    </CompaniesProvider>
  );
}

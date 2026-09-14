import { BenefitsProvider } from "@/modules/benefits/context/BenefitsContext";
import Benefits from "./Benefits";

export default function BenefitsPage() {
  return (
    <BenefitsProvider>
      <Benefits />
    </BenefitsProvider>
  );
}

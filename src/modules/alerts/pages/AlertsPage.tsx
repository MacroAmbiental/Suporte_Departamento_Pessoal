import { AlertsProvider } from "@/modules/alerts/context/AlertsContext";
import Alerts from "./Alerts";

export default function AlertsPage() {
  return (
    <AlertsProvider>
      <Alerts />
    </AlertsProvider>
  );
}

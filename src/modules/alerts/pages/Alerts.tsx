import { useAlertsContext } from "@/modules/alerts/context/AlertsContext";

export default function Alerts() {
  const { filteredAlerts } = useAlertsContext();

  return (
    <section className="page alerts-page">
      <h1>Alertas</h1>
      <p>{filteredAlerts.length} alertas carregados</p>
    </section>
  );
}

import { useHrControl } from "@/modules/hrControl/hooks/useHrControl";
import { HrControlView } from "@/modules/hrControl/components/HrControlView";

export default function HrControl() {
  const controller = useHrControl();
  return <HrControlView {...controller} />;
}

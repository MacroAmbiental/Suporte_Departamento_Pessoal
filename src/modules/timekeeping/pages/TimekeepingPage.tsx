import { TimekeepingProvider } from "@/modules/timekeeping/context/TimekeepingContext";
import Timekeeping from "./Timekeeping";

export default function TimekeepingPage() {
  return (
    <TimekeepingProvider>
      <Timekeeping />
    </TimekeepingProvider>
  );
}

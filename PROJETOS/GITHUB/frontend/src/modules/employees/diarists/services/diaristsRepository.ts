import type { Diarist, DiaristWorkDay } from "../types";
import { DIARISTS_KEY, WORK_DAYS_KEY, readStorage, writeStorage } from "../storage";

export const diaristsRepository = {
 loadDiarists: () => readStorage<Diarist[]>(DIARISTS_KEY, []),
 loadWorkDays: () => readStorage<DiaristWorkDay[]>(WORK_DAYS_KEY, []),
 saveDiarists: (value: Diarist[]) => writeStorage(DIARISTS_KEY, value),
 saveWorkDays: (value: DiaristWorkDay[]) => writeStorage(WORK_DAYS_KEY, value),
};

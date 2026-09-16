import { addDays } from "./experience";
export function noticeSpecialty(mode: string, reduction: string, start: string, end: string) {
  return {
    noticeReduction: ["employee", "employer", "indemnified"].includes(mode) ? reduction : "",
    noticeDailyReductionHours: ["employee", "employer", "indemnified"].includes(mode) && reduction === "hours" ? "2" : "",
    noticeLeaveStartDate: ["employee", "employer", "indemnified"].includes(mode) && reduction === "days" ? addDays(end, -7) : "",
    noticeLeaveEndDate: ["employee", "employer", "indemnified"].includes(mode) && reduction === "days" ? addDays(end, -1) : "",
    noticeStartDate: ["employee", "employer", "indemnified"].includes(mode) ? start : "",
  };
}
export function validNoticeReduction(mode: string, reduction: string, start: string, end: string) {
  return !["employee", "employer", "indemnified"].includes(mode) || ((reduction === "none" || reduction === "hours" || reduction === "days") && Boolean(start && end) && (reduction !== "days" || addDays(end, -7) >= start));
}

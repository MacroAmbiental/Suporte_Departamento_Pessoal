import { addDays } from "./experience";
export function noticeSpecialty(mode: string, reduction: string, start: string, end: string) {
  const isWorkedNotice = ["employee", "employer"].includes(mode);
  return {
    noticeReduction: isWorkedNotice ? reduction : "",
    noticeDailyReductionHours: isWorkedNotice && reduction === "hours" ? "2" : "",
    noticeLeaveStartDate: isWorkedNotice && reduction === "days" ? addDays(end, -7) : "",
    noticeLeaveEndDate: isWorkedNotice && reduction === "days" ? addDays(end, -1) : "",
    noticeStartDate: ["employee", "employer", "indemnified"].includes(mode) ? start : "",
  };
}
export function validNoticeReduction(mode: string, reduction: string, start: string, end: string) {
  return !["employee", "employer"].includes(mode) || ((reduction === "none" || reduction === "hours" || reduction === "days") && Boolean(start && end) && (reduction !== "days" || addDays(end, -7) >= start));
}

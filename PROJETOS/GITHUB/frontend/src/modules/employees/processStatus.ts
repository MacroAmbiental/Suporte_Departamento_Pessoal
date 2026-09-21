export function isEmployeeProcessCompleted(employee: { status?: string; registrationData?: Record<string, any> }, today = '') {
  const fields = employee.registrationData || {};
  const end = fields.scheduledDeactivationDate || fields.deactivationEffectiveDate || fields.noticeEndDate || fields.noticeDate || '';
  return employee.status === 'terminated' || Boolean(end && end <= today);
}

export function getEmployeeProcessStatus(employee: { status?: string; registrationData?: Record<string, any> }, today = '') {
  return isEmployeeProcessCompleted(employee, today) ? 'Concluído' : 'Em andamento';
}

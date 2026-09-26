import test from 'node:test';
import assert from 'node:assert/strict';
import { employeeLeaveEntryForDate, isEmployeeLeaveOnDate } from './leavePeriods.ts';

const employee = {
  status: 'active',
  admissionDate: '2025-01-01',
  registrationData: {
    suspensionStartDate: '2025-02-10',
    suspensionEndDate: '2025-02-14',
    suspensionReason: 'Atraso no cumprimento de política',
    leaveStartDate: '2025-03-01',
    leaveEndDate: '2025-03-05',
    leaveType: 'Incapacidade Temporária',
    licenseStartDate: '2025-04-10',
    licenseEndDate: '2025-04-15',
    licenseType: 'Licença-maternidade',
  },
};

test('detecta afastamento por suspensão e afastamento por licença', () => {
  assert.equal(isEmployeeLeaveOnDate(employee, '2025-02-12'), true);
  assert.equal(isEmployeeLeaveOnDate(employee, '2025-03-03'), true);
  assert.equal(isEmployeeLeaveOnDate(employee, '2025-04-12'), true);
  assert.equal(isEmployeeLeaveOnDate(employee, '2025-05-01'), false);
});

test('retorna o tipo do afastamento correspondente ao dia consultado', () => {
  assert.equal(employeeLeaveEntryForDate(employee, '2025-02-12')?.kind, 'suspension');
  assert.equal(employeeLeaveEntryForDate(employee, '2025-03-03')?.kind, 'leave');
  assert.equal(employeeLeaveEntryForDate(employee, '2025-04-12')?.kind, 'license');
});

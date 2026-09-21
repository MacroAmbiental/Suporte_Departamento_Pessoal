import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const compile = (file) => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const url = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const source = compile('./processStatus.ts');
const { getEmployeeProcessStatus, isEmployeeProcessCompleted } = await import(url(source));

test('funcionario desligado continua concluido mesmo com pendencia de pagamento da rescisao', () => {
  const employee = {
    status: 'terminated',
    registrationData: {
      scheduledDeactivationDate: '2026-08-26',
      terminationSettlementDueDate: '2026-09-05',
      terminationSettlementPaid: 'false',
    },
  };

  assert.equal(isEmployeeProcessCompleted(employee, '2026-09-18'), true);
  assert.equal(getEmployeeProcessStatus(employee, '2026-09-18'), 'Concluído');
});

test('processo ativo sem demissao continua em andamento', () => {
  const employee = {
    status: 'active',
    registrationData: {
      terminationMode: 'employee',
      noticeStartDate: '2026-09-20',
      noticeEndDate: '2026-09-28',
    },
  };

  assert.equal(isEmployeeProcessCompleted(employee, '2026-09-18'), false);
  assert.equal(getEmployeeProcessStatus(employee, '2026-09-18'), 'Em andamento');
});

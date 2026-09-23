import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
const js = ts.transpileModule(readFileSync(new URL('./terminationPermissions.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { canUseTerminationMode } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const modes = ['suspension', 'contract_end', 'without_cause', 'for_cause', 'resignation', 'abandonment', 'quick', 'experience'];
test('contrato permite somente suspensão e término de contrato', () => {
  const employee = { registrationData: { employeeKind: 'contract' } };
  for (const mode of modes) assert.equal(canUseTerminationMode(employee, mode), ['suspension', 'contract_end'].includes(mode), mode);
});
test('cadastros antigos sem tipo seguem classificação da listagem como contrato', () => {
  for (const employee of [{}, { registrationData: {} }]) {
    assert.equal(canUseTerminationMode(employee, 'resignation'), false);
    assert.equal(canUseTerminationMode(employee, 'contract_end'), true);
  }
});
test('funcionários da empresa e diaristas preservam as opções anteriores', () => {
  for (const employeeKind of ['company', 'diarist']) for (const mode of modes) {
    assert.equal(canUseTerminationMode({ registrationData: { employeeKind } }, mode), true);
  }
});

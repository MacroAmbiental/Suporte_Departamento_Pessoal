import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
const code = ts.transpileModule(readFileSync(new URL('./noticeWorkAdjustment.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { noticeAdjustedMinutes, noticeWorkAdjustment } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const fields = { terminationMode: 'employer', noticeStartDate: '2026-09-01', noticeEndDate: '2026-10-01', noticeReduction: 'hours' };
test('reduz duas horas somente dentro do aviso e sem carga negativa', () => {
  const employee = { registrationData: fields };
  assert.equal(noticeAdjustedMinutes(employee, '2026-09-10', 480), 360);
  assert.equal(noticeAdjustedMinutes(employee, '2026-09-10', 60), 0);
  assert.equal(noticeAdjustedMinutes(employee, '2026-09-10', 0), 0);
  assert.equal(noticeAdjustedMinutes(employee, '2026-08-31', 480), 480);
  assert.equal(noticeAdjustedMinutes(employee, '2026-10-01', 480), 480);
});
test('dispensa sete dias corridos sem reduzir os dias anteriores', () => {
  const employee = { registrationData: { ...fields, noticeReduction: 'days', noticeLeaveStartDate: '2026-09-24', noticeLeaveEndDate: '2026-09-30' } };
  assert.equal(noticeAdjustedMinutes(employee, '2026-09-23', 480), 480);
  for (let day = 24; day <= 30; day++) {
    assert.equal(noticeWorkAdjustment(employee, `2026-09-${day}`), 'leave');
    assert.equal(noticeAdjustedMinutes(employee, `2026-09-${day}`, 480), 0);
  }
});
test('nao aplica reducao ao empregado ou indenizado nem a cadastro sem aviso', () => {
  for (const mode of ['employee', 'indemnified', 'quick']) assert.equal(noticeAdjustedMinutes({ registrationData: { ...fields, terminationMode: mode } }, '2026-09-10', 480), 480);
  assert.equal(noticeAdjustedMinutes(undefined, '2026-09-10', 480), 480);
});

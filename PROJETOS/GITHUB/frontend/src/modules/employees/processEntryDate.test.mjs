import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
const source = readFileSync(new URL('./processEntryDate.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { processEntryDate } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
test('preserva entrada original ao reagendar', () => {
  assert.equal(processEntryDate({ registrationData: { processStartedAt: '2026-09-01', deactivationScheduledAt: '2026-09-15' } }, false), '2026-09-01');
});
test('historico usa agendamento e nao inicio do aviso', () => {
  assert.equal(processEntryDate({ registrationData: { noticeScheduledAt: '2026-09-02', noticeStartDate: '2026-09-10' } }, false), '2026-09-02');
  assert.equal(processEntryDate({ registrationData: { noticeStartDate: '2026-09-10' } }, false), '');
});
test('experiencia historica considera cadastro e admissao', () => {
  assert.equal(processEntryDate({ admissionDate: '2026-09-01', createdAt: '2026-09-03T15:00:00Z' }, true), '2026-09-03');
});

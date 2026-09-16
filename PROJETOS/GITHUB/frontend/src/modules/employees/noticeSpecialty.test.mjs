import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
const compile = (file) => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const url = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const source = compile('./noticeSpecialty.ts').replace('"./experience"', JSON.stringify(url(compile('./experience.ts'))));
const { noticeSpecialty, validNoticeReduction } = await import(url(source));
test('sete dias corridos anteriores a desativacao', () => {
  const fields = noticeSpecialty('employer', 'days', '2026-09-01', '2026-10-01');
  assert.equal(fields.noticeLeaveStartDate, '2026-09-24');
  assert.equal(fields.noticeLeaveEndDate, '2026-09-30');
  assert.equal(fields.noticeDailyReductionHours, '');
});
test('duas horas e sete dias sao alternativas exclusivas', () => {
  const fields = noticeSpecialty('employer', 'hours', '2026-09-01', '2026-10-01');
  assert.equal(fields.noticeDailyReductionHours, '2');
  assert.equal(fields.noticeLeaveStartDate, '');
  assert.equal(validNoticeReduction('employer', '', '2026-09-01', '2026-10-01'), false);
});
test('indenizado guarda inicio e opcao de reducao', () => {
  const fields = noticeSpecialty('indemnified', 'hours', '2026-09-01', '2026-10-01');
  assert.equal(fields.noticeStartDate, '2026-09-01');
  assert.equal(fields.noticeReduction, 'hours');
});
test('dispensa nao pode comecar antes do aviso', () => {
  assert.equal(validNoticeReduction('employer', 'days', '2026-09-28', '2026-10-01'), false);
});


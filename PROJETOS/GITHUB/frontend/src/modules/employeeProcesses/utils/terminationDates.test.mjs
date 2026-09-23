import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
const compile = (file) => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const url = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const experience = url(compile('./experience.ts'));
const { resignationNoticeOptions: options } = await import(experience);
const { terminationDates, completedServiceYears } = await import(url(compile('./terminationDates.ts').replace('"./experience"', JSON.stringify(experience))));

test('dois anos completos geram 36 dias de aviso indenizado', () => {
  const d = terminationDates('without_cause', 'Aviso prévio indenizado', '2026-09-23', '', '2024-09-23');
  assert.equal(d.serviceYears, 2);
  assert.equal(d.additionalDays, 6);
  assert.equal(d.noticeDays, 36);
  assert.equal(d.indemnifiedDays, 36);
  assert.equal(d.projectionEndDate, '2026-10-29');
  assert.equal(d.calculationDate, '2026-09-23');
});
test('conta aniversários completos, e não dias divididos por 365', () => {
  assert.equal(completedServiceYears('2024-09-23', '2026-09-22'), 1);
  assert.equal(completedServiceYears('2024-09-23', '2026-09-23'), 2);
  assert.equal(completedServiceYears('2024-09-23', '2026-09-24'), 2);
});
test('menos de um ano dá 30 dias; primeiro ano completo dá 33', () => {
  assert.equal(terminationDates('without_cause', 'Aviso prévio indenizado', '2026-09-22', '', '2025-09-23').noticeDays, 30);
  assert.equal(terminationDates('without_cause', 'Aviso prévio indenizado', '2026-09-23', '', '2025-09-23').noticeDays, 33);
});
test('limite do aviso é 90 dias', () => {
  for (const admission of ['2006-09-23', '1990-01-01']) {
    const d = terminationDates('without_cause', 'Aviso prévio indenizado', '2026-09-23', '', admission);
    assert.equal(d.noticeDays, 90);
    assert.equal(d.additionalDays, 60);
  }
});
test('aviso da empresa separa trinta dias trabalhados do acréscimo indenizado', () => {
  const d = terminationDates('without_cause', 'Aviso prévio trabalhado', '', '2026-09-01', '2024-09-30');
  assert.equal(d.effectiveDate, '2026-09-30');
  assert.equal(d.noticeDays, 36);
  assert.equal(d.indemnifiedDays, 6);
  assert.equal(d.projectionEndDate, '2026-10-06');
  assert.equal(d.calculationDate, '2026-09-30');
});
test('pedido de demissão permanece em trinta dias mesmo com muitos anos de empresa', () => {
  const d = terminationDates('resignation', options.worked, '', '2026-09-23', '2000-01-01');
  assert.equal(d.effectiveDate, '2026-10-22');
  assert.equal(d.noticeDays, 30);
  assert.equal(d.indemnifiedDays, 0);
  assert.equal(d.projectionEndDate, '');
  assert.equal(d.calculationDate, d.effectiveDate);
});
test('pedido de demissão com cumprimento dispensado não gera aviso proporcional', () => {
  const d = terminationDates('resignation', options.waived, '2026-09-23', '2026-08-01', '2000-01-01');
  assert.equal(d.noticeDays, 0);
  assert.equal(d.lastNoticeDate, '');
  assert.equal(d.calculationDate, '2026-09-23');
});
test('tipos sem aviso usam o próprio dia do desligamento, sem avançar a data', () => {
  for (const mode of ['for_cause', 'contract_end', 'abandonment', 'quick']) {
    const d = terminationDates(mode, '', '2026-12-31', '', '2000-01-01');
    assert.equal(d.calculationDate, '2026-12-31');
    assert.equal(d.noticeDays, 0);
  }
});
test('datas inválidas não produzem anos nem projeções inventadas', () => {
  assert.equal(completedServiceYears('2026-02-30', '2026-09-23'), null);
  assert.equal(completedServiceYears('2027-01-01', '2026-09-23'), null);
  assert.equal(completedServiceYears('', '2026-09-23'), null);
  assert.equal(terminationDates('without_cause', 'Aviso prévio indenizado', '2026-09-23', '', '').projectionEndDate, '');
});
test('ano bissexto e período atravessando fevereiro', () => {
  assert.equal(completedServiceYears('2024-02-29', '2025-02-28'), 0);
  assert.equal(completedServiceYears('2024-02-29', '2025-03-01'), 1);
  assert.equal(terminationDates('resignation', options.worked, '', '2028-02-01', '2020-01-01').effectiveDate, '2028-03-01');
});
test('opção antiga de pedido de demissão segue reconhecida', () => {
  assert.equal(terminationDates('resignation', 'Aviso trabalhado', '', '2026-09-01', '2020-01-01').noticeDays, 30);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
const source = readFileSync(new URL('./experience.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { addDays, experienceMilestones, isInExperience, experienceWindow, experienceAlerts, needsExperienceFollowup, experienceEndingToday, experienceTerminationAction } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const employee = { admissionDate: '2026-01-01', status: 'active', registrationData: {} };
test('marcos de 30 e 60 dias incluem o dia da admissao', () => {
  assert.deepEqual(experienceMilestones(employee).map((item) => item.date), ['2026-01-30', '2026-03-01']);
});
test('experiencia inclui o dia 60 e termina no dia seguinte', () => {
  assert.equal(isInExperience(employee, '2026-03-01'), true);
  assert.equal(isInExperience(employee, '2026-03-02'), false);
  assert.equal(isInExperience(employee, '2025-12-31'), false);
});
test('antecedencia personalizavel e troca de marco', () => {
  assert.equal(experienceWindow(employee, '2026-01-20', 5).start, '2026-01-25');
  assert.equal(experienceWindow(employee, '2026-01-31', 3).date, '2026-03-01');
  assert.equal(experienceWindow(employee, '2026-04-01'), null);
});
test('funcionarios desativados e diaristas nao entram no acompanhamento automatico', () => {
  assert.equal(isInExperience({ ...employee, status: 'terminated' }, '2026-01-20'), false);
  assert.equal(isInExperience({ ...employee, registrationData: { employeeKind: 'diarist' } }, '2026-01-20'), false);
});
test('datas vazias e ano bissexto', () => {
  assert.equal(addDays('', 30), '');
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(isInExperience({ ...employee, admissionDate: '' }, '2026-01-20'), false);
});

test('cada marco alerta sete dias antes e conta vencimento', () => {
  for (const milestone of experienceMilestones(employee)) {
    assert.equal(experienceAlerts(employee, addDays(milestone.date, -8)).find((item) => item.days === milestone.days).alert, false);
    assert.equal(experienceAlerts(employee, addDays(milestone.date, -7)).find((item) => item.days === milestone.days).remaining, 7);
    assert.equal(experienceAlerts(employee, addDays(milestone.date, -7)).find((item) => item.days === milestone.days).alert, true);
    assert.equal(experienceAlerts(employee, milestone.date).find((item) => item.days === milestone.days).remaining, 0);
    assert.equal(experienceAlerts(employee, addDays(milestone.date, 1)).find((item) => item.days === milestone.days).overdue, true);
  }
});
test('confirmacao silencia apenas o marco correspondente', () => {
  const continued = { ...employee, registrationData: { experienceContinued30At: '2026-01-29' } };
  const alerts = experienceAlerts(continued, '2026-02-25');
  assert.equal(alerts[0].alert, false);
  assert.equal(alerts[1].alert, true);
  assert.equal(alerts.length, 2);
});
test('vencido segue pendente ate contratacao definitiva', () => {
  const enrolled = { ...employee, registrationData: { processStartedAt: '2026-01-01' } };
  assert.equal(needsExperienceFollowup(enrolled, '2026-04-10'), true);
  assert.equal(needsExperienceFollowup({ ...enrolled, registrationData: { ...enrolled.registrationData, experienceConfirmedAt: '2026-04-10' } }, '2026-04-10'), false);
  assert.equal(needsExperienceFollowup(employee, '2026-04-10'), false);
});
test('antecedencia personalizada vale igualmente para os dois marcos', () => {
  const custom = { ...employee, registrationData: { experienceAlertDays: '3' } };
  for (const milestone of experienceMilestones(custom)) {
    assert.equal(experienceAlerts(custom, addDays(milestone.date, -4)).find((item) => item.days === milestone.days).alert, false);
    assert.equal(experienceAlerts(custom, addDays(milestone.date, -3)).find((item) => item.days === milestone.days).alert, true);
  }
});

test('funcionario com experiencia terminando hoje entra no filtro correspondente', () => {
  const enrolled = { ...employee, registrationData: { processStartedAt: '2026-01-01', experienceContinued30At: '', experienceContinued60At: '', experienceContinued90At: '' } };
  assert.equal(experienceEndingToday(employee, '2026-03-31'), false);
  assert.equal(experienceEndingToday(enrolled, '2026-03-01'), true);
  assert.equal(experienceEndingToday(enrolled, '2026-01-30'), false);
  assert.equal(experienceEndingToday(enrolled, '2026-03-31'), false);
});

test('confirmacao antiga do marco 60 exige decisao definitiva explicita', () => {
  const legacy = { ...employee, registrationData: { experienceContinued60At: '2026-02-28' } };
  assert.equal(experienceAlerts(legacy, '2026-03-02')[1].alert, true);
  const confirmed = { ...legacy, registrationData: { ...legacy.registrationData, experienceConfirmedAt: '2026-03-02' } };
  assert.equal(experienceAlerts(confirmed, '2026-03-02')[1].alert, false);
});

test('desligamento rapido no fim do marco e aviso de multa antes do fim', () => {
  assert.equal(experienceTerminationAction('2026-01-30', '2026-01-30'), 'quick');
  assert.equal(experienceTerminationAction('2026-02-01', '2026-01-30'), 'warning');
  assert.match(experienceTerminationAction('2026-02-01', '2026-01-30', true), /Art\. 477|multa/i);
});


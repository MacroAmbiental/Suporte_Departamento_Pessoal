import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const code = ts.transpileModule(readFileSync(new URL('./teamStructure.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { timekeepingTeamStructure, timekeepingTeamOptions } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const scopesCode = ts.transpileModule(readFileSync(new URL('../../../core/firestore/collectionScopes.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { collectionsForScreen } = await import(`data:text/javascript;base64,${Buffer.from(scopesCode).toString('base64')}`);
const employee = { id: 'employee', companyId: 'company', groupId: 'group', teamId: 'old' };
const fixture = () => ({
  teams: [{ id: 'old', companyId: 'company', name: 'Antiga', active: true }],
  companyGroupUnits: [{ id: 'new', groupId: 'group', type: 'team', name: 'Nova', active: true }],
  companyGroupCompanies: [{ companyId: 'company', groupId: 'group' }],
  companyGroupEmployeeAssignments: [{ employeeId: 'employee', groupId: 'group', teamUnitId: 'new' }],
  companyGroupUnitLinks: [],
});

test('prioriza o cadastro do grupo e disponibiliza a equipe sem alterar o funcionario', () => {
  const result = timekeepingTeamStructure(fixture());
  assert.equal(result.employeeTeamId(employee), 'new');
  assert.equal(result.employeeTeamId({ ...employee, teamId: '' }), 'new');
  assert.equal(result.teamsForCompany('company').find(team => team.id === 'new').name, 'Nova');
  assert.equal(employee.teamId, 'old');
  assert.deepEqual(result.teamsForCompany('other'), []);
});

test('respeita a remocao explicita da equipe no grupo', () => {
  const data = fixture();
  data.companyGroupEmployeeAssignments[0].teamUnitId = '';
  assert.equal(timekeepingTeamStructure(data).employeeTeamId(employee), '');
});

test('mantem compatibilidade com cadastros antigos e resolve vinculos de origem', () => {
  const data = fixture();
  data.companyGroupEmployeeAssignments = [];
  assert.equal(timekeepingTeamStructure(data).employeeTeamId(employee), 'old');
  data.companyGroupUnitLinks.push({ sourceType: 'team', sourceId: 'old', companyId: 'company', groupId: 'group', groupUnitId: 'new' });
  assert.equal(timekeepingTeamStructure(data).employeeTeamId(employee), 'new');
});

test('ignora vinculos de outro grupo e conserva equipes antigas para o historico', () => {
  const data = fixture();
  data.companyGroupEmployeeAssignments[0].groupId = 'other';
  const result = timekeepingTeamStructure(data);
  assert.equal(result.employeeTeamId(employee), 'old');
  assert.equal(result.teams.find(team => team.id === 'old').name, 'Antiga');
});

test('abrir o ponto diretamente carrega os dados necessarios para filtrar Calcamento', () => {
  const database = fixture();
  database.companyGroupUnits[0].name = 'Calçamento';
  const loaded = Object.fromEntries(Object.keys(database).map(collection => [
    collection, collectionsForScreen('timekeeping').includes(collection) ? database[collection] : [],
  ]));
  const result = timekeepingTeamStructure(loaded);
  const team = result.teams.find(item => item.id === result.employeeTeamId(employee));
  assert.equal(team?.name, 'Calçamento');
  assert.ok(team.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes('calcamento'));
});

test('filtro conta pessoas do escopo uma vez e omite equipes antigas sem membros', () => {
  const data = fixture();
  data.teams.push({ id: 'old-copy', name: 'Antiga', companyId: 'other' });
  const result = timekeepingTeamStructure(data);
  const scoped = [employee, employee];
  assert.deepEqual(timekeepingTeamOptions(result.teams, scoped, result.employeeTeamId), [
    { value: 'new', label: 'Nova (1)' },
  ]);
  assert.deepEqual(timekeepingTeamOptions(result.teams, [], result.employeeTeamId), []);
});

test('equipe do dia conta o lancamento preservado separadamente da equipe atual', () => {
  const result = timekeepingTeamStructure(fixture());
  assert.deepEqual(timekeepingTeamOptions(result.teams, [employee], () => 'old'), [
    { value: 'old', label: 'Antiga (1)' },
  ]);
  assert.deepEqual(timekeepingTeamOptions(result.teams, [employee], result.employeeTeamId), [
    { value: 'new', label: 'Nova (1)' },
  ]);
});

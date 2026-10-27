import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const code = ts.transpileModule(readFileSync(new URL('./teamNameHistory.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { teamNameOn, registerTeamRename, resolveTeamNameOn, teamsNamedOn } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('sem histórico vale o nome atual em qualquer data', () => {
  assert.equal(teamNameOn({ name: 'Asfalto II' }, '2026-01-01'), 'Asfalto II');
});

test('primeiro renome guarda o nome anterior desde sempre', () => {
  const history = registerTeamRename(undefined, 'Asfalto II', 'Asfalto Norte', '2026-11-01');
  assert.deepEqual(history, [{ name: 'Asfalto II', validFrom: '' }, { name: 'Asfalto Norte', validFrom: '2026-11-01' }]);
  const unit = { name: 'Asfalto Norte', nameHistory: history };
  assert.equal(teamNameOn(unit, '2026-10-31'), 'Asfalto II');
  assert.equal(teamNameOn(unit, '2026-11-01'), 'Asfalto Norte');
  assert.equal(teamNameOn(unit, '2026-12-15'), 'Asfalto Norte');
});

test('renome com data para trás vale desde a data escolhida', () => {
  const history = registerTeamRename(undefined, 'Asfalto II', 'Asfalto Norte', '2026-10-01');
  const unit = { name: 'Asfalto Norte', nameHistory: history };
  assert.equal(teamNameOn(unit, '2026-09-30'), 'Asfalto II');
  assert.equal(teamNameOn(unit, '2026-10-15'), 'Asfalto Norte');
});

test('novo renome substitui nomes que começariam na mesma data ou depois', () => {
  let history = registerTeamRename(undefined, 'A', 'B', '2026-11-01');
  history = registerTeamRename(history, 'B', 'C', '2026-10-20');
  assert.deepEqual(history, [{ name: 'A', validFrom: '' }, { name: 'C', validFrom: '2026-10-20' }]);
  history = registerTeamRename(history, 'C', 'D', '2026-12-01');
  assert.deepEqual(history.map((entry) => entry.name), ['A', 'C', 'D']);
  history = registerTeamRename(history, 'D', 'E', '2026-12-01');
  assert.deepEqual(history.map((entry) => entry.name), ['A', 'C', 'E']);
});

test('resolve pelo id da Estrutura e pelo id source-', () => {
  const unit = { name: 'Novo', nameHistory: [{ name: 'Velho', validFrom: '' }, { name: 'Novo', validFrom: '2026-11-01' }] };
  const units = new Map([['managed-team-x', unit]]);
  assert.equal(resolveTeamNameOn('managed-team-x', '2026-10-10', units, 'fallback'), 'Velho');
  assert.equal(resolveTeamNameOn('source-managed-team-x', '2026-10-10', units, 'fallback'), 'Velho');
  assert.equal(resolveTeamNameOn('outra', '2026-10-10', units, 'fallback'), 'fallback');
});

test('lista de equipes do dia só troca as renomeadas', () => {
  const units = [{ id: 'u1', name: 'Novo', nameHistory: [{ name: 'Velho', validFrom: '' }, { name: 'Novo', validFrom: '2026-11-01' }] }, { id: 'u2', name: 'Caixas' }];
  const teams = [{ id: 'u1', name: 'Novo' }, { id: 'source-u1', name: 'Velho antigo' }, { id: 'u2', name: 'Caixas' }];
  const result = teamsNamedOn(teams, units, '2026-10-27');
  assert.deepEqual(result.map((team) => team.name), ['Velho', 'Velho', 'Caixas']);
  assert.equal(result[2], teams[2]);
  assert.deepEqual(teamsNamedOn(teams, units, '2026-11-02').map((team) => team.name), ['Novo', 'Novo', 'Caixas']);
});

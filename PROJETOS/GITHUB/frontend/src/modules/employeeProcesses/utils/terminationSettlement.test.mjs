import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const compile = (file) => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const url = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const source = compile('./terminationSettlement.ts');
const { isLateTerminationSettlementPayment, terminationSettlementLateMessage } = await import(url(source));

test('pagamento em dia nao dispara alerta de multa', () => {
  assert.equal(isLateTerminationSettlementPayment('2026-09-09', '2026-09-10'), false);
});

test('pagamento depois do prazo dispara alerta com artigo da CLT', () => {
  assert.equal(isLateTerminationSettlementPayment('2026-09-11', '2026-09-10'), true);
  assert.match(terminationSettlementLateMessage(), /Art\. 477.*CLT|multa de 40%/i);
});

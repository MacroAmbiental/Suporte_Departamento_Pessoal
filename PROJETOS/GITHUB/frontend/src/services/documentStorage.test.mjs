import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const source = readFileSync(new URL('./documentStorage.ts', import.meta.url), 'utf8');
const start = source.indexOf('export async function openEmployeeDocumentFile(');
const end = source.indexOf('export async function deleteEmployeeDocumentFile(', start);
const code = ts.transpileModule(source.slice(start, end).replace('export async function', 'async function'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function setup() {
  const calls = { open: 0, click: 0, appended: 0, removed: 0 };
  let link;
  const context = vm.createContext({
    window: { open: () => { calls.open++; return null; }, setTimeout: () => {} },
    document: { createElement: () => (link = { click: () => calls.click++, remove: () => calls.removed++ }), body: { appendChild: () => calls.appended++ } },
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} },
    isFirestoreDocumentFileUrl: (url) => url.startsWith('firestore-file://'),
    readFileFromFirestore: async () => ({ dataUrl: 'data:application/pdf;base64,AA==' }),
    dataUrlToBlob: () => ({}),
  });
  vm.runInContext(code, context);
  return { calls, context, getLink: () => link };
}
test('URL externa dispara uma unica navegacao com nome e isolamento seguros', async () => {
  const { calls, context, getLink } = setup();
  await context.openEmployeeDocumentFile('https://example.org/model.docx', 'modelo.docx');
  assert.equal(calls.open + calls.click, 1);
  assert.equal(calls.appended, 1);
  assert.equal(calls.removed, 1);
  assert.equal(getLink().download, 'modelo.docx');
  assert.equal(getLink().rel, 'noopener noreferrer');
});
test('retorno nulo da abertura de arquivo local nao causa segundo download', async () => {
  for (const url of ['data:application/pdf;base64,AA==', 'firestore-file://test']) {
    const { calls, context } = setup();
    await context.openEmployeeDocumentFile(url);
    assert.equal(calls.open, 1);
    assert.equal(calls.click, 0);
  }
});
test('URL vazia nao dispara download', async () => {
  const { calls, context } = setup();
  await context.openEmployeeDocumentFile('');
  assert.equal(calls.open + calls.click, 0);
});

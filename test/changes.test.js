import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyChanges, PatchError } from '../lib/changes.js';
import { leanContext, restoredConversation } from '../lib/context.js';
import { helperFiles, includeHelpers } from '../lib/helpers.js';

const base = [{ path: 'index.html', content: '<h1>Original</h1><script src="main.js"></script>' }, { path: 'main.js', content: 'const n = 1;' }, { path: 'data.csv', content: 'x,y\n1,2' }];
const patch = extra => ({ title: 'Updated', summary: 'Changed heading', mode: 'patch', baseRevision: 'revision-a', files: [], edits: [], deletedFiles: [], ...extra });
test('exact edits preserve unchanged files; full replacements and explicit deletions work', () => {
  const result = applyChanges(patch({ edits: [{ path: 'index.html', find: 'Original', replace: 'New heading' }], files: [{ path: 'main.js', content: 'const n = 2;' }], deletedFiles: ['data.csv'] }), base, 'revision-a');
  assert.equal(result.files.length, 2);
  assert.match(result.files[0].content, /New heading/);
  assert.equal(base[0].content.includes('Original'), true);
  assert.equal(applyChanges(patch(), base, 'revision-a').files[2].content, base[2].content);
});
test('rejects stale, ambiguous, conflicting and unsafe patches without mutating the baseline', () => {
  const before = JSON.stringify(base);
  for (const result of [
    patch({ baseRevision: 'stale' }),
    patch({ edits: [{ path: 'index.html', find: 'missing', replace: 'x' }] }),
    patch({ edits: [{ path: 'index.html', find: '', replace: 'x' }] }),
    patch({ edits: [{ path: 'index.html', find: 'h1', replace: 'h2' }] }),
    patch({ files: [{ path: 'main.js', content: 'const n=2;' }], edits: [{ path: 'main.js', find: '2', replace: '3' }] }),
    patch({ deletedFiles: ['main.js', 'main.js'] }),
    patch({ files: [{ path: '../escape.js', content: '' }] })
  ]) assert.throws(() => applyChanges(result, base, 'revision-a'));
  assert.throws(() => applyChanges(patch({ deletedFiles: ['index.html'] }), base, 'revision-a'), /index.html/);
  assert.throws(() => applyChanges(patch({ edits: [{ path: 'main.js', find: '1', replace: ';' }] }), base, 'revision-a'), /syntax error/);
  assert.equal(JSON.stringify(base), before);
});
test('full-file responses remain available, with revision checking', () => {
  assert.equal(applyChanges({ ...patch(), mode: 'complete', files: base }, base, 'revision-a').files.length, 3);
  assert.throws(() => applyChanges({ ...patch(), mode: 'complete', baseRevision: 'stale', files: base }, base, 'revision-a'), PatchError);
});
test('lean resume context and restored history exclude redundant source payloads', () => {
  const project = { id: 'p', title: 'Plot', currentRevision: 'r', attachments: [], messages: [{ role: 'user', content: 'Draw a plot' }, { role: 'assistant', content: 'Created plot', rawText: 'BIG SOURCE', rawResponse: { files: base } }] };
  const context = leanContext(project, base);
  assert.equal(context.source.length, 3); assert.equal(context.messages, undefined);
  assert.ok(!JSON.stringify(context).includes('BIG SOURCE'));
  const restored = restoredConversation(project);
  assert.equal(restored.messages.length, 2);
  assert.ok(!JSON.stringify(restored).includes('BIG SOURCE'));
  assert.equal(project.messages[1].rawText, 'BIG SOURCE');
});

test('optional helpers are vendored once and survive a complete-source fallback', async () => {
  const first = await includeHelpers({ files: base, helpers: ['canvas', 'controls'] });
  assert.equal(first.files.length, base.length + 3);
  const recovered = await includeHelpers({ files: base, helpers: [] }, first.files, true);
  assert.equal(recovered.files.length, first.files.length);
  assert.deepEqual((await includeHelpers(first)).files, first.files);
  await assert.rejects(helperFiles(['not-a-helper']), /Unknown/);
});

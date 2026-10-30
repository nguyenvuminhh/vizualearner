import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validSource } from '../lib/storage.js';

test('rejects the KKT syntax error before a revision can be published', () => {
  assert.throws(() => validSource([{ path: 'index.html', content: '<script>function sanity() {} san ity;</script>' }]), /JavaScript syntax error/);
  assert.throws(() => validSource([{ path: 'index.html', content: '<script src="./plot.js"></script>' }, { path: 'plot.js', content: 'const value = ;' }]), /syntax error/);
  assert.throws(() => validSource([{ path: 'index.html', content: '<script src="plot.js"></script>' }, { path: 'plot.js', content: 'export const value = 1;' }]), /syntax error/);
});

test('accepts modern modules and data scripts without executing generated code', () => {
  assert.doesNotThrow(() => validSource([
    { path: 'index.html', content: '<script type="importmap">{"imports":{}}</script><script type="application/json">{"value":1}</script><script type="module" src="./plot.js"></script>' },
    { path: 'plot.js', content: 'export const value = await Promise.resolve(globalThis.missing?.value ?? 1);' }
  ]));
});

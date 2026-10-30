import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration, responseTiming, workedLabel } from '../public/timing.js';

test('formats elapsed generation time and local completion time', () => {
  assert.equal(formatDuration(179000), '2m 59s');
  assert.equal(formatDuration(10000), '10s');
  assert.equal(formatDuration(3723000), '1h 2m 3s');
  assert.equal(formatDuration(-1000), '0s');
  const m = { id: 'response', role: 'assistant', runId: 'run', durationMs: 179000, completedAt: new Date(2026, 9, 24, 0, 10).toISOString() };
  assert.equal(workedLabel(responseTiming(m)), 'Worked for 2m 59s • 00:10');
});

test('labels old response estimates and excludes progress and non-generation messages', () => {
  const messages = [{ id: 'user', role: 'user', createdAt: '2026-10-24T00:00:00Z' }, { id: 'reply', role: 'assistant', runId: 'run', createdAt: '2026-10-24T00:02:59Z' }];
  assert.equal(responseTiming(messages[1], messages).durationMs, 179000);
  assert.equal(responseTiming(messages[1], messages).estimated, true);
  assert.match(workedLabel(responseTiming(messages[1], messages)), /^Worked for ~2m 59s/);
  assert.equal(responseTiming({ ...messages[1], kind: 'progress' }, messages), null);
  assert.equal(responseTiming({ ...messages[1], status: 'interrupted' }, messages), null);
  assert.equal(responseTiming({ id: 'repair', role: 'assistant', origin: 'local-repair' }), null);
});

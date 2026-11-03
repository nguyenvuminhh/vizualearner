import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readCodexLimits } from '../lib/limits.js';
const fixture = fileURLToPath(new URL('./fake-codex.mjs', import.meta.url));
test('reads quota windows despite malformed RPC lines without starting a generation', async () => {
  const result = await readCodexLimits(fixture);
  assert.equal(result.rateLimits.primary.usedPercent, 25);
  assert.equal(result.rateLimits.secondary.windowDurationMins, 10080);
  assert.ok(Date.parse(result.fetchedAt));
});
test('missing CLI and hung app-server fail promptly', async () => {
  await assert.rejects(readCodexLimits('/no/such/codex'), /unavailable/);
  await assert.rejects(readCodexLimits(fixture, {timeout:1}), /timed out/);
});

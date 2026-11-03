import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { start } from '../server.js';
import { Generator } from '../lib/generator.js';

test('exact saved matches create independent projects; bypass, settings, attachments and runtime failures prevent reuse', async t => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), '.vizualearner-match-'));
  const fixture = fileURLToPath(new URL('./fake-codex.mjs', import.meta.url)); await fs.chmod(fixture, 0o755);
  const app = await start({ port: 0, artifactPort: 0, stateDir, seed: false, generator: new Generator({ bin: fixture }) });
  t.after(async () => { await app.close(); await fs.rm(stateDir, { recursive: true, force: true }); });
  const config = await fetch(app.url + '/api/config').then(r => r.json());
  async function api(url, body) {
    const response = await fetch(app.url + url, body ? { method: 'POST', headers: { 'X-Lab-Token': config.token, ...(!(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) }, body: body instanceof FormData ? body : JSON.stringify(body) } : {});
    assert.ok(response.ok, await response.clone().text()); return response.json();
  }
  async function done(pid) {
    for (let i = 0; i < 120; i++) { const p = await api('/api/projects/' + pid); if (p.status !== 'generating') return p; await new Promise(r => setTimeout(r, 50)); }
    throw new Error('Timed out');
  }
  const request = { message: 'Draw a unit circle.', model: 'fixture-model', effort: 'high', useSavedMatch: true };
  const original = await api('/api/projects', {});
  await api(`/api/projects/${original.id}/messages`, request); const first = await done(original.id);
  await api(`/api/projects/${first.id}/revisions/${first.currentRevision}/render`, { frameLoadMs: 20, runtimeError: null });
  const defaultProject = await api('/api/projects', {});
  assert.equal(defaultProject.useSavedMatch, false);
  const { useSavedMatch, ...withoutReuse } = request;
  await api(`/api/projects/${defaultProject.id}/messages`, withoutReuse);
  assert.equal((await done(defaultProject.id)).lastRunTiming.stats.cacheHit, false);
  const copy = await api('/api/projects', {});
  await api(`/api/projects/${copy.id}/messages`, request); const copied = await done(copy.id);
  assert.equal(copied.status, 'ready'); assert.equal(copied.lastRunTiming.stats.cacheHit, true);
  assert.equal(copied.lastRunTiming.stats.attempts, 0); assert.equal(copied.lastRunTiming.phases.codexMs, 0);
  assert.equal(copied.sessionId, null); assert.equal(copied.messages.length, 2);
  assert.equal(copied.messages[1].origin, 'saved-match'); assert.equal(copied.messages[1].reusedFrom.projectId, first.id);
  assert.notEqual(copied.currentRevision, first.currentRevision);
  assert.equal(await fetch(`${app.url}/api/projects/${copy.id}/source`).then(r => r.text()), await fetch(`${app.url}/api/projects/${first.id}/source`).then(r => r.text()));
  await api(`/api/projects/${copy.id}/messages`, { ...request, message: 'Modify this circle' }); const modified = await done(copy.id);
  assert.ok(modified.sessionId); assert.notEqual(modified.sessionId, first.sessionId);
  assert.equal(modified.lastRunTiming.stats.outputMode, 'patch');
  assert.equal((await api(`/api/projects/${first.id}`)).messages.length, 2);
  for (const changes of [{ model: 'other-model' }, { effort: 'low' }, { useSavedMatch: false }, { message: 'Draw a Unit circle.' }]) {
    const fresh = await api('/api/projects', {}); await api(`/api/projects/${fresh.id}/messages`, { ...request, ...changes });
    const saved = await done(fresh.id); assert.equal(saved.lastRunTiming.stats.cacheHit, false); assert.equal(saved.lastRunTiming.stats.attempts, 1);
  }
  const attached = await api('/api/projects', {}), form = new FormData();
  for (const [key, value] of Object.entries(request)) form.append(key, value);
  form.append('attachments', new Blob(['different reference']), 'reference.txt');
  await api(`/api/projects/${attached.id}/messages`, form); assert.equal((await done(attached.id)).lastRunTiming.stats.cacheHit, false);
  await api(`/api/projects/${first.id}/revisions/${first.currentRevision}/render`, { runtimeError: 'A runtime error occurred.' });
  const avoidBroken = await api('/api/projects', {}); await api(`/api/projects/${avoidBroken.id}/messages`, request);
  assert.equal((await done(avoidBroken.id)).lastRunTiming.stats.cacheHit, false);
});

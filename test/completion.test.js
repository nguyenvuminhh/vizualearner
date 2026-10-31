import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from '../server.js';
import { Generator } from '../lib/generator.js';
import { loadProject } from '../lib/storage.js';

test('completion is reported only after cleanup releases the generation slot', { timeout: 15000 }, async () => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vizualearner-completion-'));
  const generator = new Generator({ bin: fileURLToPath(new URL('./fake-codex.mjs', import.meta.url)), prewarm: false });
  const app = await start({ stateDir, port: 0, artifactPort: 0, seed: false, generator });
  const config = await fetch(app.url + '/api/config').then(r => r.json());
  const originalRm = fs.rm;
  let releaseCleanup, cleanupStarted;
  const cleanupGate = new Promise(resolve => { releaseCleanup = resolve; });
  const enteredCleanup = new Promise(resolve => { cleanupStarted = resolve; });
  // Pause real run-directory removal to make the completion race deterministic.
  fs.rm = async (file, options) => {
    if (path.basename(String(file)).startsWith('math-lab-run-')) { cleanupStarted(); await cleanupGate; }
    return originalRm(file, options);
  };
  const post = (route, body) => fetch(app.url + route, { method: 'POST', headers: { 'X-Lab-Token': config.token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const project = await (await post('/api/projects', {})).json();
    assert.equal((await post(`/api/projects/${project.id}/messages`, { message: 'Draw an interactive circle' })).status, 202);
    await enteredCleanup;
    assert.equal((await loadProject(config.workspace, project.id)).status, 'ready');
    const job = generator.jobs.get(generator.key(config.workspace, project.id));
    assert.ok(job, 'Cleanup still owns the generation slot');
    const pending = await fetch(app.url + `/api/projects/${project.id}`).then(r => r.json());
    assert.equal(pending.status, 'generating', 'Do not invite a follow-up while its slot is still busy');
    const list = await fetch(app.url + '/api/projects').then(r => r.json());
    assert.equal(list.find(p => p.id === project.id).status, 'generating');
    releaseCleanup(); await job.done;
    const ready = await fetch(app.url + `/api/projects/${project.id}`).then(r => r.json());
    assert.equal(ready.status, 'ready');
    assert.equal((await post(`/api/projects/${project.id}/messages`, { message: 'Add a slider label' })).status, 202);
  } finally {
    releaseCleanup(); fs.rm = originalRm;
    await app.close(); await originalRm(stateDir, { recursive: true, force: true });
  }
});

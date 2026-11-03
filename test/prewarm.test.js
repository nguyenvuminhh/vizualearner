import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SeedPool, minimalConfigArgs } from '../lib/prewarm.js';
import { executeCodex } from '../lib/codex.js';
import { Generator } from '../lib/generator.js';
import { createProject, id, now, projectDir } from '../lib/storage.js';
import { start } from '../server.js';

const bin = fileURLToPath(new URL('./fake-codex.mjs', import.meta.url));
test('minimal execution excludes global workflow catalogs while retaining account and model defaults', async () => {
    const args = await minimalConfigArgs();
    assert.ok(args.includes('skills.include_instructions=false'));
    assert.ok(args.includes('project_doc_max_bytes=0'));
    assert.ok(args.includes('plugins={_default={enabled=false}}'));
    assert.ok(args.includes('mcp_servers={}'));
    assert.ok(!args.some(arg => arg.includes('model=') || arg.includes('model_reasoning_effort=')));
    assert.ok(!args.includes('--ignore-user-config'));
});

test('generator forks a ready seed, resumes only its child, and recovers a missing seed', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vizualearner-prepared-workflow-'));
  const generator = new Generator({ bin, timeout: 10000, prewarm: true });
  try {
    await generator.initialize(dir);
    const seed = await generator.prepare();
    const submit = async (project, content) => {
      project.messages.push({ id: id(), role: 'user', content, attachments: [], createdAt: now() });
      project.status = 'generating';
      await generator.run(dir, project);
      assert.equal(project.status, 'ready', project.messages.at(-1).content);
      const run = path.join(projectDir(dir, project.id), 'runs', project.lastRunTiming.runId);
      return { args: JSON.parse(await fs.readFile(path.join(run, 'invocation.json'))), run };
    };
    const p = await createProject(dir);
    const first = await submit(p, 'First independent circle');
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(first.run, 'workspace-files.json'))).sort(), ['attachments', 'context.json', 'helper-docs.md']);
    assert.equal(first.args[first.args.indexOf('fork') + 1], seed.sessionId);
    assert.equal(p.lastRunTiming.stats.prewarmed, true);
    assert.notEqual(p.sessionId, seed.sessionId);
    const cwd = first.args[first.args.indexOf('-C') + 1];
    assert.ok(cwd.startsWith(os.tmpdir()));
    assert.ok(!cwd.startsWith(dir));
    await assert.rejects(fs.access(cwd)); // disposable input workspace is removed
    const childSession = p.sessionId;
    const second = await submit(p, 'Add a slider');
    assert.equal(second.args[second.args.indexOf('resume') + 1], childSession);
    assert.ok(!second.args.includes('fork'));
    assert.equal(p.lastRunTiming.stats.prewarmed, false);
    const other = await createProject(dir);
    await submit(other, 'Another independent circle');
    assert.notEqual(other.sessionId, childSession);
    const invalid = { ...seed, sessionId: '00000000-0000-0000-0000-000000000000' };
    generator.seeds.ready.set(generator.seeds.key({}), invalid);
    const fallback = await createProject(dir);
    const result = await submit(fallback, 'Cold fallback circle');
    assert.ok(!result.args.includes('fork'));
    assert.equal(fallback.lastRunTiming.stats.seedFallback, true);
    assert.equal(fallback.lastRunTiming.stats.attempts, 2);
    assert.equal(generator.seeds.get({}), null);
    generator.seeds.ready.set(generator.seeds.key({}), { ...seed, sessionId: '11111111-1111-1111-1111-111111111111' });
    const unsupported = await createProject(dir);
    await submit(unsupported, 'Older CLI fallback');
    assert.equal(unsupported.lastRunTiming.stats.seedFallback, true);
    assert.equal(unsupported.lastRunTiming.stats.attempts, 2);
    // Explicit settings must never borrow a seed prepared for different defaults.
    const custom = await createProject(dir);
    custom.generationSettings = { model: 'different-model', effort: 'high' };
    const cold = await submit(custom, 'Use the selected model');
    assert.ok(!cold.args.includes('fork'));
    assert.equal(cold.args[cold.args.indexOf('--model') + 1], 'different-model');
  } finally { await generator.close(); await fs.rm(dir, { recursive: true, force: true }); }
});

test('preparation recovers after signing in and refreshing connection health', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vizualearner-login-test-'));
  const marker = path.join(dir, 'signed-in');
  const wrapper = path.join(dir, 'codex-wrapper.mjs');
  await fs.writeFile(wrapper, `#!/usr/bin/env node
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const args=process.argv.slice(2);
if(args.includes('login')) process.exit(fs.existsSync(${JSON.stringify(marker)})?0:1);
const child=spawnSync(${JSON.stringify(bin)},args,{stdio:'inherit'});process.exit(child.status??1);
`, { mode: 0o755 });
  const app = await start({ port: 0, artifactPort: 0, stateDir: dir, seed: false, generator: new Generator({ bin: wrapper, prewarm: true }) });
  try {
    const config = await fetch(app.url + '/api/config').then(r => r.json());
    assert.equal(config.codex.authenticated, false);
    const post = (route, body = {}) => fetch(app.url + route, { method: 'POST', headers: { 'X-Lab-Token': config.token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await post('/api/prepare')).status, 503);
    await fs.writeFile(marker, 'yes');
    assert.equal((await (await post('/api/health')).json()).authenticated, true);
    assert.equal((await post('/api/prepare', { model: 'selected-model' })).status, 202);
    assert.ok(await app.generator.prepare({ model: 'selected-model' }));
  } finally { await app.close(); await fs.rm(dir, { recursive: true, force: true }); }
});

test('one task-free seed is persisted, forked into distinct sessions and never resumed directly', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vizualearner-seed-test-'));
  const pool = new SeedPool({ bin, stateDir: dir, configArgs: [] });
  try {
    const [seed, same] = await Promise.all([pool.prepare({}), pool.prepare({})]);
    assert.equal(seed.sessionId, same.sessionId);
    assert.equal(pool.get({}).sessionId, seed.sessionId);
    assert.equal(pool.get({ model: 'another-model' }), null);
    const persisted = new SeedPool({ bin, stateDir: dir, configArgs: [] });
    await persisted.prepare({});
    assert.equal(persisted.get({}).sessionId, seed.sessionId);
    const sessions = [];
    for (let i = 0; i < 2; i++) {
      const cwd = path.join(dir, 'fork-' + i); await fs.mkdir(cwd);
      await fs.writeFile(path.join(cwd, 'context.json'), JSON.stringify({ baseRevision: '', source: [] }));
      await fs.writeFile(path.join(cwd, 'schema.json'), '{}');
      await executeCodex({ bin, cwd, prompt: 'Current user instruction:\nDraw a circle', forkSessionId: seed.sessionId, settings: {}, images: [], job: {}, timeout: 5000,
        onEvent: async event => { if (event.type === 'thread.started') sessions.push(event.thread_id); } });
      const args = JSON.parse(await fs.readFile(path.join(cwd, 'invocation.json')));
      assert.equal(args[args.indexOf('fork') + 1], seed.sessionId);
      assert.ok(!args.includes('resume'));
    }
    assert.equal(new Set([seed.sessionId, ...sessions]).size, 3);
  } finally { await pool.close(); await fs.rm(dir, { recursive: true, force: true }); }
});

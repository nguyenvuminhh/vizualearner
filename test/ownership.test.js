import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { start } from '../server.js';
import { Generator } from '../lib/generator.js';
import { atomicJSON, createProject, loadProject, saveProject } from '../lib/storage.js';

const bin = fileURLToPath(new URL('./fake-codex.mjs', import.meta.url));
const makeGenerator = () => new Generator({ bin, prewarm: false });
const listen = () => new Promise(resolve => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => resolve(server)); });
const stop = server => new Promise(resolve => server.close(resolve));
const config = app => fetch(app.url + '/api/config').then(r => r.json());
const post = (app, cfg, route, body) => fetch(app.url + route, { method: 'POST', headers: { 'X-Lab-Token': cfg.token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('duplicate and aliased launches preserve an active generation and its cancellation path', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vizualearner-ownership-'));
  const stateDir = path.join(dir, 'state');
  const app = await start({ stateDir, port: 0, artifactPort: 0, seed: false, generator: makeGenerator() });
  try {
    const cfg = await config(app);
    const p = await (await post(app, cfg, '/api/projects', {})).json();
    await post(app, cfg, `/api/projects/${p.id}/messages`, { message: 'SLOW_TEST' });
    const before = await loadProject(cfg.workspace, p.id);
    for (const options of [{ stateDir }, { stateDir: path.join(dir, 'alias') }]) {
      if (options.stateDir.endsWith('alias')) await fs.symlink(stateDir, options.stateDir, 'dir');
      await assert.rejects(start({ ...options, port: 0, artifactPort: 0, generator: makeGenerator() }), { code: 'ELOCKED' });
    }
    const after = await loadProject(cfg.workspace, p.id);
    assert.equal(after.status, 'generating');
    assert.deepEqual(after.messages, before.messages);
    assert.equal(app.generator.busy(cfg.workspace, p.id), true);
    assert.equal((await post(app, cfg, `/api/projects/${p.id}/cancel`, {})).status, 200);
  } finally { await app.close(); await fs.rm(dir, { recursive: true, force: true }); }
});

test('port conflicts preserve persisted work, release the artifact port and allow retry', async () => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vizualearner-ports-'));
  const workspace = path.join(stateDir, 'workspace');
  await fs.mkdir(path.join(workspace, 'visualizations'), { recursive: true });
  const p = await createProject(workspace); p.status = 'generating'; await saveProject(workspace, p);
  const blocker = await listen(), reserved = await listen();
  const port = blocker.address().port, artifactPort = reserved.address().port;
  await stop(reserved);
  let app;
  try {
    await assert.rejects(start({ stateDir, port, artifactPort, generator: makeGenerator() }), error => error.code === 'EADDRINUSE' && /already in use/.test(error.message));
    assert.equal((await loadProject(workspace, p.id)).status, 'generating');
    const probe = net.createServer();
    await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(artifactPort, '127.0.0.1', resolve); });
    await stop(probe);
    app = await start({ stateDir, port: 0, artifactPort: 0, generator: makeGenerator() });
    assert.equal((await loadProject(workspace, p.id)).status, 'interrupted');
  } finally { await app?.close(); await stop(blocker); await fs.rm(stateDir, { recursive: true, force: true }); }
});

test('workspace ownership spans separate state directories and is transferred on switching', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vizualearner-workspace-'));
  const one = await start({ stateDir: path.join(dir, 'one'), port: 0, artifactPort: 0, generator: makeGenerator() });
  const two = await start({ stateDir: path.join(dir, 'two'), port: 0, artifactPort: 0, generator: makeGenerator() });
  let third;
  try {
    const a = await config(one), b = await config(two);
    await fs.mkdir(path.join(dir, 'three'));
    await atomicJSON(path.join(dir, 'three/config.json'), { workspace: a.workspace });
    await assert.rejects(start({ stateDir: path.join(dir, 'three'), port: 0, artifactPort: 0, generator: makeGenerator() }), { code: 'ELOCKED' });
    const response = await post(two, b, '/api/workspace', { path: a.workspace });
    assert.equal(response.status, 409);
    assert.equal((await config(two)).workspace, b.workspace);
    assert.equal((await post(one, a, '/api/workspace', { path: path.join(dir, 'new-workspace') })).status, 200);
    third = await start({ stateDir: path.join(dir, 'three'), port: 0, artifactPort: 0, generator: makeGenerator() });
    assert.equal((await config(third)).workspace, a.workspace);
  } finally { await third?.close(); await one.close(); await two.close(); await fs.rm(dir, { recursive: true, force: true }); }
});

test('expired leases from a killed process permit interrupted-work recovery', async () => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vizualearner-killed-'));
  const serverURL = new URL('../server.js', import.meta.url).href;
  const generatorURL = new URL('../lib/generator.js', import.meta.url).href;
  const code = `import {start} from ${JSON.stringify(serverURL)};import {Generator} from ${JSON.stringify(generatorURL)};const app=await start({stateDir:${JSON.stringify(stateDir)},port:0,artifactPort:0,seed:false,generator:new Generator({bin:${JSON.stringify(bin)},prewarm:false})});process.send({url:app.url});`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
  let app;
  try {
    const [message] = await once(child, 'message');
    const cfg = await fetch(message.url + '/api/config').then(r => r.json());
    const p = await createProject(cfg.workspace); p.status = 'generating'; await saveProject(cfg.workspace, p);
    const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
    // Age only the dead process's leases, avoiding a ten-second sleep in the test.
    const old = new Date(Date.now() - 11000);
    for (const lock of [path.join(stateDir, '.vizualearner-state.lock'), path.join(cfg.workspace, '.vizualearner-workspace.lock')]) await fs.utimes(lock, old, old);
    app = await start({ stateDir, port: 0, artifactPort: 0, seed: false, generator: makeGenerator() });
    const recovered = await loadProject(cfg.workspace, p.id);
    assert.equal(recovered.status, 'interrupted');
    assert.match(recovered.messages.at(-1).content, /interrupted/);
  } finally {
    if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited; }
    await app?.close(); await fs.rm(stateDir, { recursive: true, force: true });
  }
});

test('default startup does not prepare a paid Codex session', async () => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vizualearner-no-prewarm-'));
  const previous = process.env.MATH_LAB_PREWARM;
  delete process.env.MATH_LAB_PREWARM;
  const generator = new Generator({ bin });
  if (previous !== undefined) process.env.MATH_LAB_PREWARM = previous;
  const app = await start({ stateDir, port: 0, artifactPort: 0, generator });
  try {
    assert.equal((await config(app)).codex.authenticated, true);
    assert.equal(generator.prewarm, false);
    assert.equal(generator.seeds, undefined);
    await assert.rejects(fs.access(path.join(stateDir, 'prewarm')), { code: 'ENOENT' });
  } finally { await app.close(); await fs.rm(stateDir, { recursive: true, force: true }); }
});

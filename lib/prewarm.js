import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { executeCodex } from './codex.js';
import { seedPrompt, outputSchema } from './protocol.js';
import { atomicJSON } from './storage.js';

const exec = promisify(execFile);
export const codexHome = () => process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
async function userConfig(home) {
  try { return await fs.readFile(path.join(home, 'config.toml'), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return ''; throw error; }
}

// Invocation-only overrides. Keep the user's auth, provider, model, effort and service tier.
export async function minimalConfigArgs() {
  // Whole-table invocation overrides also handle arbitrary dotted plugin/server names.
  // Never copy connection secrets into process arguments just to disable a server.
  const values = ['skills.include_instructions=false', 'skills.bundled.enabled=false', 'project_doc_max_bytes=0', 'include_apps_instructions=false', 'plugins={_default={enabled=false}}', 'mcp_servers={}'];
  return values.flatMap(value => ['-c', value]);
}

export class SeedPool {
  constructor({ bin = 'codex', stateDir, configArgs, timeout = 120000 }) {
    this.bin = bin; this.stateDir = stateDir; this.configArgs = configArgs; this.timeout = timeout;
    this.ready = new Map(); this.pending = new Map(); this.jobs = new Set(); this.identity = ''; this.closed = false;
  }
  key(settings) { return JSON.stringify([settings.model || '', settings.effort || '']); }
  get(settings) { return this.ready.get(this.key(settings)) || null; }
  async initialize() {
    if (!this.initializing) this.initializing = (async () => {
      this.configArgs ??= await minimalConfigArgs();
      const { stdout } = await exec(this.bin, ['--version'], { timeout: 8000 });
      this.identity = createHash('sha256').update(JSON.stringify([this.bin, stdout, seedPrompt, outputSchema, this.configArgs, await userConfig(codexHome())])).digest('hex');
    })();
    return this.initializing;
  }
  prepare(settings = {}) {
    const key = this.key(settings);
    if (this.closed) return Promise.reject(new Error('Seed pool closed.'));
    if (this.pending.has(key)) return this.pending.get(key);
    const operation = this.build(settings).finally(() => this.pending.delete(key));
    this.pending.set(key, operation);
    return operation;
  }
  async build(settings) {
    await this.initialize();
    if (this.closed) throw new Error('Seed pool closed.');
    const fingerprint = createHash('sha256').update(this.identity + this.key(settings)).digest('hex');
    const dir = path.join(this.stateDir, 'prewarm', fingerprint);
    const seedFile = path.join(dir, 'seed.json');
    try {
      const saved = JSON.parse(await fs.readFile(seedFile, 'utf8'));
      if (saved.fingerprint === fingerprint && /^[a-f0-9-]{36}$/i.test(saved.sessionId)) { this.ready.set(this.key(settings), saved); return saved; }
    } catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
    await fs.mkdir(dir, { recursive: true });
    await atomicJSON(path.join(dir, 'schema.json'), { type: 'object', additionalProperties: false, required: ['ready'], properties: { ready: { type: 'boolean', enum: [true] } } });
    await fs.writeFile(path.join(dir, 'prompt.txt'), seedPrompt);
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'vizualearner-prewarm-'));
    const job = {}; this.jobs.add(job);
    let sessionId; const started = Date.now();
    try {
      await executeCodex({ bin: this.bin, cwd, runDir: dir, prompt: seedPrompt, settings, configArgs: this.configArgs, images: [], job, timeout: this.timeout,
        onEvent: async event => { if (event.type === 'thread.started') sessionId = event.thread_id; } });
      const response = JSON.parse(await fs.readFile(path.join(dir, 'output.json'), 'utf8'));
      if (!sessionId || response.ready !== true) throw new Error('Codex did not acknowledge preparation.');
      const seed = { fingerprint, sessionId, settings, createdAt: new Date().toISOString(), durationMs: Date.now() - started };
      await atomicJSON(seedFile, seed); this.ready.set(this.key(settings), seed); return seed;
    } finally { this.jobs.delete(job); await fs.rm(cwd, { recursive: true, force: true }); }
  }
  async invalidate(settings) {
    const seed = this.get(settings); this.ready.delete(this.key(settings));
    if (seed) await fs.rm(path.join(this.stateDir, 'prewarm', seed.fingerprint, 'seed.json'), { force: true });
  }
  async close() {
    this.closed = true;
    for (const job of this.jobs) { job.cancelled = true; job.stop?.(); }
    await Promise.allSettled([...this.pending.values()]);
  }
}

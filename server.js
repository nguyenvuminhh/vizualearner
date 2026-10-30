import express from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { Generator } from './lib/generator.js';
import { generationSettings, modelCatalog } from './lib/settings.js';
import { atomicJSON, commitRevision, createProject, id, json, listProjects, loadProject, now, projectDir, recover, safeFile, saveProject } from './lib/storage.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const exec = promisify(execFile);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 8, fields: 4, fieldSize: 40000 } });
const localHost = host => /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host || '');
// Raw model output stays on disk; the browser loads source separately on demand.
const presentProject = p => ({ ...p, messages: p.messages.map(({ rawResponse, rawText, ...message }) => message) });
const runtimeBridge = `<script>addEventListener('error',function(e){parent.postMessage({type:'math-lab-runtime-error',message:String(e.message||'A visualization resource could not load.').slice(0,400)},'*')},true);addEventListener('unhandledrejection',function(e){parent.postMessage({type:'math-lab-runtime-error',message:String(e.reason&&e.reason.message||e.reason||'An asynchronous operation failed.').slice(0,400)},'*')});addEventListener('load',function(){parent.postMessage({type:'math-lab-frame-loaded',href:location.href},'*')});</script>`;

export async function start({ port = Number(process.env.PORT) || 3210, artifactPort = Number(process.env.ARTIFACT_PORT) || 3211, stateDir = process.env.MATH_LAB_STATE || path.join(here, '.local'), generator = new Generator(), seed = true } = {}) {
  await fs.mkdir(stateDir, { recursive: true });
  await generator.initialize(stateDir);
  const configFile = path.join(stateDir, 'config.json');
  let config = await json(configFile, { workspace: path.join(stateDir, 'workspace') });
  config.workspace = path.resolve(config.workspace);
  await fs.mkdir(path.join(config.workspace, 'visualizations'), { recursive: true });
  await recover(config.workspace);
  await atomicJSON(configFile, config);
  if (seed && !(await listProjects(config.workspace)).length) {
    const p = await createProject(config.workspace);
    const content = await fs.readFile(path.join(here, 'examples/gradient-flow/index.html'), 'utf8');
    await commitRevision(config.workspace, p, { title: 'Gradient descent, in motion', files: [{ path: 'index.html', content }] }, 'bundled-example');
    p.messages = [
      { id: id(), role: 'user', content: 'Visualize gradient descent on a quadratic surface. Let me change the learning rate and curvature, drag the starting point, and watch convergence.', attachments: [], createdAt: now() },
      { id: id(), role: 'assistant', content: 'An interactive example with draggable starting points, live contours, and a convergence trace. Change a parameter to explore.', createdAt: now(), revision: p.currentRevision }
    ];
    p.status = 'ready'; await saveProject(config.workspace, p);
  }
  const token = randomBytes(32).toString('hex');
  const app = express(); const artifacts = express();
  const submitting = new Set();
  let health = { available: false, authenticated: false, version: '', detail: 'Checking Codex…' };
  async function checkHealth() {
    try {
      const [version, login] = await Promise.allSettled([
        exec(generator.bin, ['--version'], { timeout: 8000 }), exec(generator.bin, ['login', 'status'], { timeout: 8000 })
      ]);
      health = { available: version.status === 'fulfilled', authenticated: login.status === 'fulfilled', version: version.status === 'fulfilled' ? version.value.stdout.trim() : '', detail: login.status === 'fulfilled' ? (login.value.stderr || login.value.stdout).trim() : 'Run codex login once in a terminal to connect your account.' };
    } catch { health = { available: false, authenticated: false, version: '', detail: 'Install Codex CLI, then run codex login.' }; }
    return health;
  }
  const healthReady = checkHealth();
  // Prepare only shared instructions, never a user problem. Never delay app startup or a request.
  healthReady.then(health => { if (health.authenticated) generator.prepare(); });
  for (const server of [app, artifacts]) {
    server.disable('x-powered-by');
    server.use((req, res, next) => {
      if (!localHost(req.headers.host)) return res.status(403).send('Local requests only.');
      res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' });
      next();
    });
  }
  app.use((req, res, next) => {
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-src http://127.0.0.1:*; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    if (req.path.startsWith('/api/') && !['GET', 'HEAD'].includes(req.method)) {
      if (req.headers['x-lab-token'] !== token || (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)) return res.status(403).json({ error: 'Invalid local request. Reload the application.' });
    }
    next();
  });
  app.use(express.json({ limit: '100kb' }));
  app.get('/api/config', async (req, res) => { await healthReady; res.json({ workspace: config.workspace, token, codex: health, models: await modelCatalog(), artifactOrigin: `http://127.0.0.1:${artifactServer.address().port}`, home: os.homedir() }); });
  app.post('/api/health', async (req, res) => {
    const current = await checkHealth();
    if (current.authenticated) generator.prepare();
    res.json(current);
  });
  app.post('/api/prepare', async (req, res) => {
    const settings = generationSettings(req.body);
    if (generator.seeds?.get(settings)) return res.json({ status: 'ready' });
    if (!generator.seeds) return res.json({ status: 'disabled' });
    await healthReady;
    if (!health.authenticated) return res.status(503).json({ error: 'Codex login is required.' });
    generator.prepare(settings);
    res.status(202).json({ status: 'preparing' });
  });
  app.get('/api/directories', async (req, res) => {
    const dir = path.resolve(String(req.query.path || config.workspace).replace(/^~(?=$|\/)/, os.homedir()));
    const entries = await fs.readdir(dir, { withFileTypes: true });
    res.json({ path: dir, parent: path.dirname(dir), directories: entries.filter(e => e.isDirectory() && !e.name.startsWith('.')).map(e => e.name).sort((a, b) => a.localeCompare(b)) });
  });
  app.post('/api/workspace', async (req, res) => {
    if (generator.jobs.size || submitting.size) return res.status(409).json({ error: 'Wait for generation to finish or cancel it before switching workspaces.' });
    if (typeof req.body.path !== 'string' || !req.body.path.trim()) return res.status(400).json({ error: 'Enter a directory path.' });
    const dir = path.resolve(req.body.path.replace(/^~(?=$|\/)/, os.homedir()));
    await fs.mkdir(path.join(dir, 'visualizations'), { recursive: true });
    const real = await fs.realpath(dir);
    await fs.access(real, fs.constants.W_OK);
    await recover(real);
    config = { workspace: real };
    await atomicJSON(configFile, config);
    res.json(config);
  });
  app.get('/api/projects', async (req, res) => res.json(await listProjects(config.workspace)));
  app.post('/api/projects', async (req, res) => res.status(201).json(await createProject(config.workspace)));
  app.get('/api/projects/:id', async (req, res) => {
    const p = await loadProject(config.workspace, req.params.id);
    const job = generator.jobs.get(generator.key(config.workspace, p.id));
    const renderMetrics = p.currentRevision ? await json(path.join(projectDir(config.workspace, p.id), 'revisions', p.currentRevision, 'render.json'), null) : null;
    res.json({ ...presentProject(p), progress: job?.progress || null, renderMetrics });
  });
  app.post('/api/projects/:id/revisions/:revision/render', async (req, res) => {
    const p = await loadProject(config.workspace, req.params.id);
    const revision = p.revisions.find(r => r.id === req.params.revision);
    if (!revision) return res.sendStatus(404);
    const frameLoadMs = req.body?.frameLoadMs;
    const runtimeError = req.body?.runtimeError;
    if (frameLoadMs !== undefined && (!Number.isFinite(frameLoadMs) || frameLoadMs < 0 || frameLoadMs > 120000)) return res.status(400).json({ error: 'Invalid frame-load measurement.' });
    if (runtimeError !== undefined && runtimeError !== null && (typeof runtimeError !== 'string' || runtimeError.length > 400)) return res.status(400).json({ error: 'Invalid runtime error report.' });
    if (frameLoadMs === undefined && !runtimeError) return res.status(400).json({ error: 'No render measurement supplied.' });
    const previous = await json(path.join(projectDir(config.workspace, p.id), 'revisions', revision.id, 'render.json'), {});
    const metrics = { ...previous, revision: revision.id, ...(frameLoadMs !== undefined ? { frameLoadMs } : {}), ...(runtimeError !== undefined ? { runtimeError } : {}), recordedAt: now() };
    // Independent from project.json: a browser measurement cannot overwrite a running generation.
    await atomicJSON(path.join(projectDir(config.workspace, p.id), 'revisions', revision.id, 'render.json'), metrics);
    res.json(metrics);
  });
  app.post('/api/projects/:id/messages', upload.array('attachments', 8), async (req, res) => {
    const root = config.workspace, pid = req.params.id, key = generator.key(root, pid);
    if (generator.busy(root, pid) || submitting.has(key)) return res.status(409).json({ error: 'A generation is already running in this conversation.' });
    const content = String(req.body.message || '').trim();
    if (!content && !req.files?.length) return res.status(400).json({ error: 'Describe a mathematical problem or attach a file.' });
    if (content.length > 30000) return res.status(400).json({ error: 'Please keep each message under 30,000 characters.' });
    submitting.add(key);
    try {
      const p = await loadProject(root, pid);
      if (req.body.useSavedMatch !== undefined) {
        if (![true, false, 'true', 'false'].includes(req.body.useSavedMatch)) return res.status(400).json({ error: 'Invalid saved-match option.' });
        p.useSavedMatch = req.body.useSavedMatch === true || req.body.useSavedMatch === 'true';
      }
      const settings = generationSettings({ model: req.body.model ?? p.generationSettings?.model, effort: req.body.effort ?? p.generationSettings?.effort });
      const attachments = [];
      for (const file of req.files || []) {
        const name = path.basename(file.originalname).replace(/[^a-zA-Z0-9._ -]/g, '_').slice(-150) || 'attachment';
        const a = { id: id(), name, storedName: `${id()}-${name}`, size: file.size, type: file.mimetype, createdAt: now() };
        await fs.writeFile(path.join(projectDir(root, pid), 'attachments', a.storedName), file.buffer);
        attachments.push(a);
      }
      p.attachments.push(...attachments);
      p.generationSettings = settings;
      p.messages.push({ id: id(), role: 'user', content: content || 'Visualize the attached mathematical problem.', attachments, generationSettings: { ...settings }, createdAt: now() });
      p.status = 'generating';
      p.generationStartedAt = now();
      if (!p.currentRevision && p.title === 'Untitled exploration') p.title = (content || attachments[0]?.name || 'New exploration').slice(0, 70);
      await saveProject(root, p);
      generator.run(root, p).catch(error => console.error('Unable to save generation:', error.message));
      res.status(202).json(presentProject(p));
    } finally { submitting.delete(key); }
  });
  app.post('/api/projects/:id/cancel', async (req, res) => { generator.cancel(config.workspace, req.params.id); res.json({ ok: true }); });
  app.get('/api/projects/:id/attachments/:aid', async (req, res) => {
    const p = await loadProject(config.workspace, req.params.id);
    const a = p.attachments.find(a => a.id === req.params.aid);
    if (!a) return res.sendStatus(404);
    res.download(await safeFile(path.join(projectDir(config.workspace, p.id), 'attachments'), a.storedName), a.name, { dotfiles: 'allow' });
  });
  app.get('/api/projects/:id/source', async (req, res) => {
    const p = await loadProject(config.workspace, req.params.id);
    const revision = p.revisions.find(r => r.id === (req.query.revision || p.currentRevision));
    if (!revision) return res.status(404).json({ error: 'No saved source yet.' });
    const relative = String(req.query.file || 'index.html');
    if (!revision.files.includes(relative)) return res.sendStatus(404);
    const file = await safeFile(path.join(projectDir(config.workspace, p.id), 'revisions', revision.id, 'source'), relative);
    if (req.query.download) return res.download(file, path.basename(relative), { dotfiles: 'allow' });
    res.type('text/plain').send(await fs.readFile(file, 'utf8'));
  });
  artifacts.use((req, res, next) => {
    res.set({
      'Access-Control-Allow-Origin': '*',
      'Content-Security-Policy': "sandbox allow-scripts; default-src 'none'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://esm.sh https://unpkg.com; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; img-src 'self' data: blob:; font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net; connect-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'",
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
    }); next();
  });
  artifacts.use('/view/:project/:revision', async (req, res, next) => {
    try {
      const p = await loadProject(config.workspace, req.params.project);
      const rev = p.revisions.find(r => r.id === req.params.revision);
      const relative = decodeURIComponent(req.path).replace(/^\//, '') || 'index.html';
      if (!rev || !rev.files.includes(relative)) return res.sendStatus(404);
      const file = await safeFile(path.join(projectDir(config.workspace, p.id), 'revisions', rev.id, 'source'), relative);
      if (/\.html$/i.test(relative)) {
        const html = await fs.readFile(file, 'utf8');
        const rendered = /<head\b[^>]*>/i.test(html) ? html.replace(/<head\b[^>]*>/i, head => head + runtimeBridge) : html.replace(/^(\s*<!doctype[^>]*>)?/i, prefix => prefix + runtimeBridge);
        return res.type('html').send(rendered);
      }
      res.sendFile(file, { dotfiles: 'allow' });
    } catch (e) { next(e); }
  });
  app.use(express.static(path.join(here, 'public'), { etag: false }));
  for (const server of [app, artifacts]) server.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error instanceof multer.MulterError ? 400 : error.code === 'ENOENT' ? 404 : 400;
    res.status(status).json({ error: error.message || 'Request failed.' });
  });
  const listen = (app, port) => new Promise((resolve, reject) => { const server = app.listen(port, '127.0.0.1', () => resolve(server)); server.once('error', reject); });
  const artifactServer = await listen(artifacts, artifactPort);
  let server;
  try { server = await listen(app, port); } catch (e) { artifactServer.close(); throw e; }
  return { server, artifactServer, generator, url: `http://127.0.0.1:${server.address().port}`, close: async () => { await generator.close(); await Promise.all([new Promise(r => server.close(r)), new Promise(r => artifactServer.close(r))]); } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const running = await start();
  console.log(`\n  vizualearner → ${running.url}\n  Your mathematical playground, powered by local Codex.\n`);
  let closing = false;
  const shutdown = async () => { if (closing) return; closing = true; await running.close(); process.exit(0); };
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
}

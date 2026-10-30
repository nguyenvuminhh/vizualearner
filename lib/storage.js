import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateJavaScript } from './validate-javascript.js';

export const now = () => new Date().toISOString();
export const id = () => randomUUID();
export async function json(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT' && fallback !== undefined) return fallback; throw e; }
}
export async function atomicJSON(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${id()}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2));
  await fs.rename(temp, file);
}
export function projectDir(root, projectId) {
  if (!/^[a-f0-9-]{36}$/.test(projectId)) throw new Error('Invalid project ID');
  return path.join(root, 'visualizations', projectId);
}
export async function loadProject(root, projectId) {
  return json(path.join(projectDir(root, projectId), 'project.json'));
}
export async function saveProject(root, project) {
  project.updatedAt = now();
  await atomicJSON(path.join(projectDir(root, project.id), 'project.json'), project);
}
export async function listProjects(root) {
  const dirs = await fs.readdir(path.join(root, 'visualizations'), { withFileTypes: true }).catch(() => []);
  const items = await Promise.all(dirs.filter(d => d.isDirectory() && /^[a-f0-9-]{36}$/.test(d.name)).map(async d => {
    try {
      const p = await loadProject(root, d.name);
      return { id: p.id, title: p.title, updatedAt: p.updatedAt, currentRevision: p.currentRevision, status: p.status };
    } catch { return null; }
  }));
  return items.filter(Boolean).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function createProject(root) {
  const p = { id: id(), title: 'Untitled exploration', createdAt: now(), updatedAt: now(), status: 'idle', sessionId: null, useSavedMatch: false, currentRevision: null, revisions: [], messages: [], attachments: [] };
  await fs.mkdir(path.join(projectDir(root, p.id), 'attachments'), { recursive: true });
  await saveProject(root, p);
  return p;
}
export function validSource(files) {
  if (!Array.isArray(files) || !files.length || files.length > 100) throw new Error('Codex must return 1–100 browser source files.');
  const names = new Set();
  let size = 0;
  for (const f of files) {
    if (typeof f.path !== 'string' || !/^[a-zA-Z0-9_./-]+$/.test(f.path) || f.path.startsWith('/') || f.path.split('/').some(s => !s || s.startsWith('.')) || !/\.(html|css|js|mjs|json|svg|txt|csv|glsl|wgsl)$/i.test(f.path) || typeof f.content !== 'string') throw new Error('Codex returned an unsafe or unsupported source path.');
    if (names.has(f.path)) throw new Error('Codex returned duplicate source paths.');
    names.add(f.path); size += Buffer.byteLength(f.content);
  }
  if (!names.has('index.html') || !files.find(f => f.path === 'index.html').content.trim()) throw new Error('Codex did not return a working index.html entry point.');
  if (size > 8 * 1024 * 1024) throw new Error('Generated source exceeds the 8 MB limit.');
  validateJavaScript(files);
  return files;
}
export async function commitRevision(root, p, result, runId, cancelled = () => false) {
  validSource(result.files);
  const revision = id();
  const source = path.join(projectDir(root, p.id), 'revisions', revision, 'source');
  await fs.mkdir(source, { recursive: true });
  for (const f of result.files) {
    const dest = path.join(source, f.path);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, f.content);
  }
  if (cancelled()) throw new Error('Generation cancelled. Your last saved visualization is intact.');
  p.currentRevision = revision;
  p.revisions.push({ id: revision, createdAt: now(), runId, title: String(result.title).slice(0, 100), files: result.files.map(f => f.path) });
  p.title = String(result.title || p.title).slice(0, 100);
  return revision;
}
// Resolve real paths as well as lexical paths: saved work must not expose symlink targets.
export async function safeFile(base, relative) {
  const root = await fs.realpath(base);
  const target = await fs.realpath(path.resolve(root, relative));
  if (!target.startsWith(root + path.sep) || !(await fs.stat(target)).isFile()) throw new Error('File is outside the project.');
  return target;
}
export async function recover(root) {
  for (const entry of await listProjects(root)) {
    if (entry.status === 'generating') {
      const p = await loadProject(root, entry.id);
      p.status = 'interrupted';
      p.generationStartedAt = null;
      p.messages.push({ id: id(), role: 'assistant', content: 'Generation was interrupted when the app closed. Your last saved visualization is intact. Send a message to continue.', createdAt: now(), status: 'interrupted' });
      await saveProject(root, p);
    }
  }
}

import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { projectDir, safeFile } from './storage.js';

export async function readBaseline(root, project) {
  const revision = project.revisions.find(r => r.id === project.currentRevision);
  if (!revision) return [];
  const dir = path.join(projectDir(root, project.id), 'revisions', revision.id, 'source');
  return Promise.all(revision.files.map(async name => ({ path: name, content: await fs.readFile(await safeFile(dir, name), 'utf8') })));
}
export function leanContext(project, files) {
  return {
    protocolVersion: 2, projectId: project.id, title: project.title, baseRevision: project.currentRevision || '',
    source: files.map(f => ({ path: f.path, bytes: Buffer.byteLength(f.content), sha256: createHash('sha256').update(f.content).digest('hex') })),
    attachments: project.attachments.map(a => ({ name: a.name, path: `attachments/${a.storedName}`, type: a.type })),
    recentChanges: project.messages.filter(m => m.role !== 'user' && m.kind !== 'progress').slice(-3).map(m => ({ role: m.role, content: m.content, revision: m.revision || null, status: m.status || null }))
  };
}
export function restoredConversation(project) {
  // Preserve every conversational message; source lives once in current-source/.
  return {
    projectId: project.id, title: project.title, baseRevision: project.currentRevision,
    messages: project.messages.map(({ rawResponse, rawText, ...message }) => message)
  };
}

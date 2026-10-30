import path from 'node:path';
import { listProjects, loadProject, json, projectDir, validSource } from './storage.js';
import { readBaseline } from './context.js';

export async function findSavedMatch(root, project, request) {
  if (project.useSavedMatch !== true || project.currentRevision || project.messages.filter(m => m.role === 'user').length !== 1 || project.attachments.length || request.attachments?.length) return null;
  const settings = project.generationSettings || {};
  for (const entry of await listProjects(root)) {
    if (entry.id === project.id || entry.status !== 'ready' || !entry.currentRevision) continue;
    try {
      const candidate = await loadProject(root, entry.id);
      const requests = candidate.messages.filter(m => m.role === 'user');
      // Exact text only: case changes, mathematical symbols, and follow-up changes matter.
      if (requests.length !== 1 || requests[0].content !== request.content || candidate.attachments.length) continue;
      if ((candidate.generationSettings?.model || '') !== (settings.model || '') || (candidate.generationSettings?.effort || '') !== (settings.effort || '')) continue;
      const rendered = await json(path.join(projectDir(root, candidate.id), 'revisions', candidate.currentRevision, 'render.json'), null);
      if (!rendered || !Number.isFinite(rendered.frameLoadMs) || rendered.runtimeError) continue;
      const files = validSource(await readBaseline(root, candidate));
      return { title: candidate.title, files, projectId: candidate.id, revision: candidate.currentRevision };
    } catch { /* A malformed or unreadable saved project is not a reusable match. */ }
  }
  return null;
}

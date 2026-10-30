import { validSource } from './storage.js';

export class PatchError extends Error {}
const safePath = value => typeof value === 'string' && /^[a-zA-Z0-9_./-]+$/.test(value) && !value.startsWith('/') && !value.split('/').some(s => !s || s.startsWith('.'));
export function applyChanges(result, baseline, revision) {
  if (!result || typeof result.title !== 'string' || typeof result.summary !== 'string') throw new Error('Codex returned an invalid response. Previous source is intact.');
  // Old complete responses remain readable by tooling and existing integrations.
  const mode = result.mode || 'complete';
  if (result.baseRevision !== undefined && result.baseRevision !== (revision || '')) throw new PatchError('The response targets a different source revision.');
  if (!['complete', 'patch'].includes(mode) || !Array.isArray(result.files)) throw new Error('Invalid source update format.');
  const edits = result.edits || [], deleted = result.deletedFiles || [];
  if (!Array.isArray(edits) || !Array.isArray(deleted) || edits.length > 200 || deleted.length > 100 || result.files.length > 100) throw new Error('Too many source changes.');
  if (mode === 'complete') {
    if (edits.length || deleted.length) throw new PatchError('A complete response must contain only files.');
    return { title: result.title, summary: result.summary, files: validSource(result.files) };
  }
  if (!revision || !baseline.length) throw new PatchError('A patch requires an existing visualization.');
  if (result.baseRevision !== revision) throw new PatchError('A patch must name the exact current revision.');
  const files = new Map(baseline.map(f => [f.path, f.content]));
  const replaced = new Set(), removed = new Set();
  for (const file of result.files) {
    if (!safePath(file.path) || typeof file.content !== 'string') throw new Error('Unsafe source replacement.');
    if (replaced.has(file.path)) throw new PatchError('Duplicate file replacement.');
    replaced.add(file.path); files.set(file.path, file.content);
  }
  for (const edit of edits) {
    if (!safePath(edit.path) || typeof edit.find !== 'string' || !edit.find || typeof edit.replace !== 'string') throw new PatchError('An edit needs a path and a nonempty exact match.');
    if (replaced.has(edit.path)) throw new PatchError('Do not both replace and patch the same file.');
    const source = files.get(edit.path);
    if (source === undefined) throw new PatchError(`Cannot edit missing file ${edit.path}.`);
    const first = source.indexOf(edit.find);
    if (first < 0 || source.indexOf(edit.find, first + 1) >= 0) throw new PatchError(`Edit in ${edit.path} must match exactly once; reread the current source.`);
    files.set(edit.path, source.slice(0, first) + edit.replace + source.slice(first + edit.find.length));
  }
  for (const file of deleted) {
    if (!safePath(file) || removed.has(file) || replaced.has(file) || edits.some(e => e.path === file) || !files.has(file)) throw new PatchError('Invalid or conflicting file deletion.');
    removed.add(file); files.delete(file);
  }
  return { title: result.title, summary: result.summary, files: validSource([...files].map(([path, content]) => ({ path, content }))) };
}

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const efforts = ['', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
export function generationSettings(value = {}) {
  const model = value.model ?? '', effort = value.effort ?? '';
  if (typeof model !== 'string' || (model && !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,119}$/.test(model))) throw new Error('Enter a valid model ID.');
  if (!efforts.includes(effort)) throw new Error('Choose a valid reasoning effort.');
  return { model, effort };
}
export async function modelCatalog() {
  try {
    const cache = JSON.parse(await fs.readFile(path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'models_cache.json'), 'utf8'));
    return (cache.models || []).filter(m => m.visibility !== 'hide' && typeof m.slug === 'string').map(m => ({ id: m.slug, efforts: (m.supported_reasoning_levels || []).map(l => l.effort).filter(e => efforts.includes(e)) }));
  } catch { return []; }
}

// Opt-in: two real generations plus task-free preparation. Consumes model usage.
import fs from 'node:fs/promises';
import path from 'node:path';
import { Generator } from '../lib/generator.js';
import { createProject, id, now, projectDir, atomicJSON } from '../lib/storage.js';

const root = path.resolve(process.env.BENCH_ROOT || `.local/prewarm-benchmark/${new Date().toISOString().replace(/[:.]/g, '-')}`);
const prompt = process.env.BENCH_PROMPT || 'visualize a ill-conditioned curvature, un constrained';
const results = [];
await fs.mkdir(root, { recursive: true });
console.log('Benchmark directory: ' + root);
for (const variant of ['minimal-cold', 'minimal-prewarmed']) {
  const state = path.join(root, variant);
  const generator = new Generator({ prewarm: variant === 'minimal-prewarmed' });
  try {
    await generator.initialize(state);
    const seed = variant === 'minimal-prewarmed' ? await generator.prepare() : null;
    if (variant === 'minimal-prewarmed' && !seed) throw new Error(generator.prewarmError);
    const p = await createProject(state);
    p.status = 'generating'; p.generationStartedAt = now();
    p.messages.push({ id: id(), role: 'user', content: prompt, attachments: [], createdAt: now(), generationSettings: {} });
    console.log(variant + ': generating…');
    const timer = setInterval(() => console.log(variant + ': ' + (generator.jobs.get(generator.key(state, p.id))?.progress || 'preparing')), 30000);
    try { await generator.run(state, p); } finally { clearInterval(timer); }
    const result = { variant, prompt, projectId: p.id, source: path.join(projectDir(state, p.id), 'revisions', p.currentRevision || '', 'source'), seedPreparationMs: seed?.durationMs || 0, timing: p.lastRunTiming };
    results.push(result);
    await atomicJSON(path.join(root, 'results.json'), { controls: 'Same prompt and inherited model/effort/provider/service tier. Sequential cold then warm; single sample per variant. Seed preparation reported separately. No saved-match reuse. Syntax validation, not mathematical or visual equivalence.', results });
    console.log(JSON.stringify(result));
    if (p.status !== 'ready') throw new Error(p.messages.at(-1).content);
  } finally { await generator.close(); }
}

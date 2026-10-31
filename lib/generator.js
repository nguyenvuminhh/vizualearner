import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { atomicJSON, commitRevision, id, now, projectDir, saveProject } from './storage.js';
import { executeCodex } from './codex.js';
import { applyChanges, PatchError } from './changes.js';
import { leanContext, readBaseline, restoredConversation } from './context.js';
import { helperDocs, includeHelpers } from './helpers.js';
import { fullOutputSchema, generationPrompt, outputSchema } from './protocol.js';
import { findSavedMatch } from './saved-match.js';
import { minimalConfigArgs, SeedPool } from './prewarm.js';
export { instructions, outputSchema } from './protocol.js';

const usageKeys = ['input_tokens', 'cached_input_tokens', 'output_tokens', 'reasoning_output_tokens'];
export class Generator {
  constructor({ bin = process.env.CODEX_BIN || 'codex', timeout = Number(process.env.GENERATION_TIMEOUT_MS) || 900000, buildPrompt = generationPrompt, minimal = process.env.MATH_LAB_MINIMAL !== '0', prewarm = process.env.MATH_LAB_PREWARM === '1' } = {}) {
    this.bin = bin; this.timeout = timeout; this.buildPrompt = buildPrompt; this.jobs = new Map();
    this.minimal = minimal; this.prewarm = prewarm && minimal; this.configArgs = [];
  }
  async initialize(stateDir) {
    this.configArgs = this.minimal ? await minimalConfigArgs() : [];
    if (this.prewarm) this.seeds = new SeedPool({ bin: this.bin, stateDir, configArgs: this.configArgs });
  }
  prepare(settings = {}) {
    if (!this.seeds) return Promise.resolve(null);
    return this.seeds.prepare(settings).catch(error => { this.prewarmError = error.message; return null; });
  }
  key(root, pid) { return `${root}:${pid}`; }
  busy(root, pid) { return this.jobs.has(this.key(root, pid)); }
  cancel(root, pid) { const job = this.jobs.get(this.key(root, pid)); if (job) { job.cancelled = true; job.stop?.(); } }
  async run(root, p) {
    const key = this.key(root, p.id);
    if (this.jobs.has(key)) throw new Error('This visualization is already generating.');
    const job = { id: id(), cancelled: false, progress: 'Preparing your visualization…' };
    const startedAt = p.generationStartedAt || now(); p.generationStartedAt = startedAt;
    const deadline = Date.now() + this.timeout;
    let complete; job.done = new Promise(resolve => { complete = resolve; }); this.jobs.set(key, job);
    const dir = path.join(projectDir(root, p.id), 'runs', job.id);
    const phases = { preparationMs: 0, codexMs: 0, validationMs: 0, persistenceMs: 0 };
    const usage = Object.fromEntries(usageKeys.map(key => [key, 0]));
    const stats = { attempts: 0, responseBytes: 0, sourceBytes: 0, contextBytes: 0, outputMode: null, patchFallback: false, restoredSession: false, cacheHit: false, minimalEnvironment: this.minimal, prewarmed: false, seedSessionId: null, seedFallback: false, commandCount: 0 };
    const measure = async (phase, operation) => { const begin = performance.now(); try { return await operation(); } finally { phases[phase] += performance.now() - begin; } };
    let newSession = p.sessionId, baseline = [], request, settings, images, workDir;
    const restore = async () => atomicJSON(path.join(dir, 'conversation.json'), restoredConversation(p));
    const addProgress = content => p.messages.push({ id: id(), role: 'assistant', kind: 'progress', content, createdAt: now(), runId: job.id });
    const invoke = async ({ resume, seed = null, fullFallback = false, feedback = '' }) => {
      const fresh = !resume && !p.currentRevision && p.messages.length === 1 && p.messages[0].role === 'user';
      const prompt = this.buildPrompt({ request, resume, fresh, prepared: Boolean(seed), fullFallback, feedback });
      const attempt = ++stats.attempts;
      await measure('preparationMs', async () => {
        await atomicJSON(path.join(dir, 'schema.json'), fullFallback ? fullOutputSchema : outputSchema);
        await fs.writeFile(path.join(dir, 'prompt.txt'), prompt);
        await fs.writeFile(path.join(dir, `prompt-${attempt}.txt`), prompt);
        await fs.rm(path.join(dir, 'output.json'), { force: true });
      });
      job.progress = fullFallback ? 'Applying a safe full-file recovery…' : resume ? 'Updating your visualization…' : 'Building your visualization…';
      await measure('codexMs', () => executeCodex({
        bin: this.bin, cwd: workDir || dir, runDir: dir, configArgs: this.configArgs, prompt, sessionId: resume ? newSession : null, forkSessionId: seed?.sessionId, settings, images, job,
        timeout: Math.max(1, deadline - Date.now()),
        onEvent: async event => {
          if (event.type === 'item.completed' && event.item?.type === 'command_execution') stats.commandCount++;
          if (event.type === 'thread.started' && event.thread_id) {
            newSession = event.thread_id; p.sessionId = newSession;
            await saveProject(root, p);
          }
          if (event.type === 'turn.completed') for (const key of usageKeys) {
            const value = event.usage?.[key]; if (Number.isFinite(value) && value >= 0) usage[key] += value;
          }
          if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
            const text = event.item.text || '';
            let structured; try { const value = JSON.parse(text); if (typeof value.summary === 'string' && Array.isArray(value.files)) structured = value; } catch {}
            p.messages.push({ id: id(), role: 'assistant', content: structured?.summary || text, rawText: text, ...(structured ? { rawResponse: structured } : {}), kind: structured ? 'candidate' : 'progress', runId: job.id, attempt, createdAt: now() });
            await saveProject(root, p);
          }
        }
      }));
      return measure('validationMs', async () => {
        const raw = await fs.readFile(path.join(dir, 'output.json'), 'utf8');
        stats.responseBytes += Buffer.byteLength(raw);
        await fs.writeFile(path.join(dir, `output-${attempt}.json`), raw);
        return { result: JSON.parse(raw), raw };
      });
    };
    try {
      await measure('preparationMs', async () => {
        await fs.mkdir(dir, { recursive: true });
        baseline = await readBaseline(root, p);
        const context = leanContext(p, baseline);
        const serialized = JSON.stringify(context, null, 2); stats.contextBytes = Buffer.byteLength(serialized);
        await fs.writeFile(path.join(dir, 'context.json'), serialized);
        if (!newSession) await restore();
        if (p.currentRevision) await fs.cp(path.join(projectDir(root, p.id), 'revisions', p.currentRevision, 'source'), path.join(dir, 'current-source'), { recursive: true, dereference: false });
        await fs.cp(path.join(projectDir(root, p.id), 'attachments'), path.join(dir, 'attachments'), { recursive: true, dereference: false });
        await fs.writeFile(path.join(dir, 'helper-docs.md'), helperDocs);
        request = p.messages.findLast(m => m.role === 'user');
        settings = request.generationSettings || p.generationSettings || {};
        await atomicJSON(path.join(dir, 'settings.json'), settings);
        images = (request.attachments || []).filter(a => /\.(png|jpe?g|webp)$/i.test(a.storedName)).map(a => path.join(dir, 'attachments', a.storedName));
        if (this.minimal) {
          workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'math-lab-run-'));
          // The model sees project inputs, not run logs, sibling projects or the app repository.
          const fresh = !newSession && !p.currentRevision && p.messages.length === 1 && p.messages[0].role === 'user';
          for (const name of ['context.json', 'helper-docs.md', 'attachments', ...(p.currentRevision ? ['current-source'] : []), ...(!newSession && !fresh ? ['conversation.json'] : [])]) {
            await fs.cp(path.join(dir, name), path.join(workDir, name), { recursive: true });
          }
          images = images.map(image => path.join(workDir, 'attachments', path.basename(image)));
        }
      });
      const match = await measure('preparationMs', () => findSavedMatch(root, p, request));
      if (match && !job.cancelled) {
        job.progress = 'Opening an exact saved match…';
        stats.cacheHit = true; stats.outputMode = 'saved-match';
        stats.sourceBytes = match.files.reduce((sum, f) => sum + Buffer.byteLength(f.content), 0);
        const reusedFrom = { projectId: match.projectId, revision: match.revision };
        await measure('persistenceMs', () => commitRevision(root, p, match, job.id, () => job.cancelled));
        p.messages.push({ id: id(), role: 'assistant', origin: 'saved-match', runId: job.id, revision: p.currentRevision, reusedFrom, createdAt: now(), content: 'Reused an exact matching saved visualization. This is an independent project and conversation; the original is intact. No Codex call was needed. Follow-up messages will start this project’s own Codex session.' });
        p.status = 'ready';
        return;
      }
      let answer;
      const fresh = !newSession && !p.currentRevision && p.messages.length === 1 && p.messages[0].role === 'user';
      const seed = fresh ? this.seeds?.get(settings) : null;
      if (seed) { stats.prewarmed = true; stats.seedSessionId = seed.sessionId; }
      try { answer = await invoke({ resume: Boolean(newSession), seed }); }
      catch (error) {
        if ((!error.missingSession && !error.unsupportedFork) || job.cancelled) throw error;
        if (seed) { stats.seedFallback = true; stats.prewarmed = false; await this.seeds.invalidate(settings); }
        else {
          stats.restoredSession = true;
          p.messages.push({ id: id(), role: 'system', content: 'Original Codex session was unavailable. Restored context from the full saved conversation, attachments and codebase.', createdAt: now() });
        }
        newSession = null;
        await measure('preparationMs', restore);
        if (workDir) await fs.copyFile(path.join(dir, 'conversation.json'), path.join(workDir, 'conversation.json'));
        answer = await invoke({ resume: false });
      }
      const assemble = answer => measure('validationMs', async () => {
        job.progress = 'Checking source changes and JavaScript…';
        return includeHelpers({ ...applyChanges(answer.result, baseline, p.currentRevision), helpers: answer.result.helpers || [] }, baseline, !answer.result.mode || answer.result.mode === 'complete');
      });
      let assembled;
      try { assembled = await assemble(answer); }
      catch (error) {
        if (!(error instanceof PatchError) || job.cancelled) throw error;
        stats.patchFallback = true;
        addProgress('The proposed patch did not match the saved source. Retrying with a complete source response; the previous revision is intact.');
        // This is a continuation of the same session and user request, not a new conversation.
        answer = await invoke({ resume: Boolean(newSession), fullFallback: true, feedback: error.message });
        if (answer.result.mode !== 'complete') throw new Error('Patch recovery must return a complete codebase. Previous visualization preserved.');
        assembled = await assemble(answer);
      }
      if (job.cancelled) throw new Error('Generation cancelled. Your last saved visualization is intact.');
      stats.outputMode = answer.result.mode || 'complete';
      stats.sourceBytes = assembled.files.reduce((sum, file) => sum + Buffer.byteLength(file.content), 0);
      job.progress = 'Saving your visualization…';
      await measure('persistenceMs', () => commitRevision(root, p, assembled, job.id, () => job.cancelled));
      const response = p.messages.findLast(m => m.runId === job.id && m.kind === 'candidate');
      if (response) { response.revision = p.currentRevision; delete response.kind; }
      else p.messages.push({ id: id(), role: 'assistant', content: answer.result.summary, rawText: answer.raw, rawResponse: answer.result, createdAt: now(), runId: job.id, revision: p.currentRevision });
      p.status = 'ready';
    } catch (error) {
      p.status = job.cancelled ? 'cancelled' : 'error';
      p.messages.push({ id: id(), role: 'assistant', content: error.message, status: p.status, createdAt: now(), runId: job.id });
    } finally {
      p.sessionId = newSession;
      const completedAt = now();
      const timing = { runId: job.id, startedAt, completedAt, durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)), status: p.status, phases, usage, stats };
      p.lastRunTiming = timing; p.generationStartedAt = null;
      const response = p.messages.findLast(m => m.runId === job.id && m.role === 'assistant' && m.kind !== 'progress');
      if (response) Object.assign(response, timing);
      try { await atomicJSON(path.join(dir, 'timing.json'), timing); await saveProject(root, p); }
      finally { if (workDir) await fs.rm(workDir, { recursive: true, force: true }); this.jobs.delete(key); complete(); }
    }
  }
  async close() {
    await this.seeds?.close();
    const jobs = [...this.jobs.values()];
    for (const job of jobs) { job.cancelled = true; job.stop?.(); }
    await Promise.all(jobs.map(job => job.done));
  }
}

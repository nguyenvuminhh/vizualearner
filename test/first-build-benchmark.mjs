// Opt-in: makes real Codex calls and consumes model usage. Never run by npm test.
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { start } from '../server.js';
import { Generator } from '../lib/generator.js';
import { generationPrompt } from '../lib/protocol.js';

const cases = [
  { id: 'linear-map', prompt: 'Visualize a 2×2 linear transformation. Let me edit the matrix entries, see a grid and unit circle deform, and show real eigenvectors when they exist.' },
  { id: 'central-limit', prompt: 'Visualize the central limit theorem. Let me change the source distribution and sample size, draw samples repeatedly, and compare standardized sample means with the normal density.' },
  { id: 'fourier', prompt: 'Visualize how Fourier series approximate square and sawtooth waves. Let me change the number of harmonics and animate adding them.' },
  { id: 'complex-product', prompt: 'Show complex-number multiplication. Let me adjust both numbers and see their product, magnitudes, and angles.' }
];
const selected = process.env.BENCH_CASES ? cases.filter(c => process.env.BENCH_CASES.split(',').includes(c.id)) : cases.slice(0, 3);
if (!selected.length) throw new Error('No benchmark cases selected.');
const variants = (process.env.BENCH_VARIANTS || 'baseline,guided').split(',');
const root = path.resolve(process.env.BENCH_ROOT || `.local/first-build-benchmark/${new Date().toISOString().replace(/[:.]/g, '-')}`);
await fs.mkdir(root, { recursive: true });
await fs.writeFile(path.join(root, 'suite.json'), JSON.stringify({ startedAt: new Date().toISOString(), cases: selected, variants, controls: 'Fresh independent projects/sessions, no saved reuse, identical model/effort overrides (omitted), no Fast mode override; alternate variant order by topic. Guided adds only generic helper API guidance. Browser checks do not establish mathematical correctness.' }, null, 2));
console.log('Benchmark directory: ' + root);
const browser = await chromium.launch();
const results = [];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function inspect(url, outputDir) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const runtimeErrors = [];
  page.on('pageerror', e => runtimeErrors.push(e.message));
  try {
    await page.goto(url); await page.locator('#visualization-frame').waitFor({ state: 'visible', timeout: 15000 });
    const frame = page.frameLocator('#visualization-frame'); await frame.locator('body').waitFor(); await wait(1000);
    const signature = () => frame.locator('body').evaluate(body => {
      let text = [...body.querySelectorAll('canvas')].map(c => { try { return c.toDataURL(); } catch { return 'unreadable'; } }).join('') + [...body.querySelectorAll('svg')].map(s => s.outerHTML).join('');
      let hash = 2166136261; for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619); return hash >>> 0;
    });
    const before = await signature();
    const input = frame.locator('input[type=range]').first();
    let changedControl = null;
    if (await input.count()) {
      changedControl = await input.evaluate(el => {
        const min = Number(el.min || 0), max = Number(el.max || 100), step = Number(el.step) || 1, current = Number(el.value);
        const next = current + step <= max ? current + step : Math.max(min, current - step);
        el.value = next; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
        return { label: el.getAttribute('aria-label') || el.id, from: current, to: next };
      });
    }
    const action = frame.getByRole('button', { name: /sample|draw|step|play|animate|add/i }).first();
    if (await action.count()) await action.click();
    await wait(600); const after = await signature();
    const report = await frame.locator('body').evaluate(body => ({
      plotElements: body.querySelectorAll('canvas,svg').length,
      controls: body.querySelectorAll('input,select,button').length,
      inputs: [...body.querySelectorAll('input,select,button')].map(e => ({ tag: e.tagName, type: e.type, id: e.id, label: e.getAttribute('aria-label') || e.textContent?.slice(0, 80), value: e.value })).slice(0, 50)
    }));
    await page.screenshot({ path: path.join(outputDir, 'desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 }); await wait(300);
    report.mobileOverflow = await frame.locator('body').evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    await page.screenshot({ path: path.join(outputDir, 'mobile.png'), fullPage: true });
    return { ...report, runtimeErrors, changedControl, plotChanged: before !== after, mathematicalReview: 'pending' };
  } finally { await page.close(); }
}

try {
  for (let i = 0; i < selected.length; i++) {
    const item = selected[i], order = i % 2 ? [...variants].reverse() : variants;
    for (const variant of order) {
      if (!['baseline', 'guided'].includes(variant)) throw new Error('Unknown benchmark variant.');
      const dir = path.join(root, item.id, variant); await fs.mkdir(dir, { recursive: true });
      const cached = await fs.readFile(path.join(dir, 'result.json'), 'utf8').then(JSON.parse).catch(() => null);
      if (cached) { results.push(cached); continue; }
      const app = await start({ port: 0, artifactPort: 0, stateDir: dir, seed: false, generator: new Generator({ minimal: false, prewarm: false, buildPrompt: args => generationPrompt({ ...args, includeHelperQuickStart: variant === 'guided' }) }) });
      let result = { topic: item.id, variant, prompt: item.prompt };
      try {
        const config = await fetch(app.url + '/api/config').then(r => r.json());
        const post = async (url, body) => {
          const r = await fetch(app.url + url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Lab-Token': config.token }, body: JSON.stringify(body) });
          if (!r.ok) throw new Error(await r.text()); return r.json();
        };
        const project = await post('/api/projects', {});
        await post(`/api/projects/${project.id}/messages`, { message: item.prompt, useSavedMatch: false });
        let saved;
        for (let tick = 0; tick < 1000; tick++) {
          saved = await fetch(app.url + '/api/projects/' + project.id).then(r => r.json());
          if (saved.status !== 'generating') break;
          if (tick % 20 === 0) console.log(`${item.id} / ${variant}: ${tick}s · ${saved.progress}`);
          await wait(1000);
        }
        if (saved.status !== 'ready') throw new Error(saved.messages.at(-1)?.content || 'Generation failed.');
        if (saved.lastRunTiming.stats.cacheHit) throw new Error('Saved reuse invalidates this benchmark.');
        const raw = JSON.parse(await fs.readFile(path.join(config.workspace, 'visualizations', project.id, 'project.json')));
        const response = raw.messages.findLast(m => m.rawResponse)?.rawResponse;
        result = { ...result, projectId: project.id, workspace: config.workspace, codexVersion: config.codex.version, settings: raw.generationSettings, helpers: response?.helpers, timing: saved.lastRunTiming, browser: await inspect(app.url, dir) };
      } catch (error) { result.error = error.message; }
      finally { await app.close(); }
      await fs.writeFile(path.join(dir, 'result.json'), JSON.stringify(result, null, 2)); results.push(result);
      await fs.writeFile(path.join(root, 'results.json'), JSON.stringify(results, null, 2));
      console.log(JSON.stringify({ topic: result.topic, variant, durationMs: result.timing?.durationMs, responseBytes: result.timing?.stats?.responseBytes, helpers: result.helpers, runtimeErrors: result.browser?.runtimeErrors, error: result.error }));
    }
  }
} finally { await browser.close(); }
console.log('Results saved: ' + path.join(root, 'results.json'));

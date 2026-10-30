// Opt-in test: uses your actual Codex login and consumes model usage.
import { start } from '../server.js';
import { chromium, expect } from '@playwright/test';
import path from 'node:path';
const app = await start({ port: 0, artifactPort: 0, stateDir: path.resolve('.local/real-codex-check'), seed: false });
const config = await fetch(app.url + '/api/config').then(r => r.json());
const api = async (url, body) => {
  const r = await fetch(app.url + url, body ? { method: 'POST', headers: { 'X-Lab-Token': config.token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  if (!r.ok) throw new Error(await r.text()); return r.json();
};
let browser;
try {
  if (!config.codex.authenticated) throw new Error('Codex login is required.');
  const existing = process.env.REAL_CODEX_PROJECT;
  const p = existing ? await api('/api/projects/' + existing) : await api('/api/projects', {});
  const submit = async message => {
    await api(`/api/projects/${p.id}/messages`, { message });
    for (let i = 0; i < 900; i++) {
      const saved = await api(`/api/projects/${p.id}`);
      if (saved.status !== 'generating') {
        if (saved.status !== 'ready') throw new Error(saved.messages.at(-1).content);
        return saved;
      }
      if (i % 20 === 0) console.log('Codex is generating…');
      await new Promise(r => setTimeout(r, 1000));
    }
    throw new Error('Generation timed out.');
  };
  const first = existing ? p : await submit('Create a compact interactive unit circle in a single self-contained HTML file using SVG. Use a slider labeled Angle in degrees with id angle, ranging from 0 to 360, default 30. Show a draggable point, its x/y projections, live sine and cosine values, and a reset button. No external dependencies and no explanation.');
  console.log(`Generated ${first.title}; session saved: ${Boolean(first.sessionId)}`);
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(app.url);
  await expect(page.locator('#project-title')).toHaveText(first.title);
  const frame = page.frameLocator('#visualization-frame');
  await frame.locator('input[type=range]').first().fill('90');
  const second = await submit('Keep this visualization and all its controls. Add a button labeled Set 180° with id set180 that sets the angle slider and the rendered point to 180 degrees.');
  expect(second.sessionId).toBe(first.sessionId);
  expect(second.revisions).toHaveLength(first.revisions.length + 1);
  await expect(page.locator('#revision-select option')).toHaveCount(second.revisions.length, { timeout: 10000 });
  await frame.locator('#set180').click();
  await expect(frame.locator('input[type=range]').first()).toHaveValue('180');
  expect(errors).toEqual([]);
  await page.screenshot({ path: '.local/real-codex-preview.png', fullPage: true });
  console.log('Actual Codex CLI generation + original-session resume + browser interaction passed.');
  console.log('Saved test workspace: ' + config.workspace);
} finally { await browser?.close(); await app.close(); }

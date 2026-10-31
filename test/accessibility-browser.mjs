import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { start } from '../server.js';
import { Generator } from '../lib/generator.js';

const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vizualearner-accessibility-'));
const app = await start({ port: 0, artifactPort: 0, stateDir, generator: new Generator({ bin: fileURLToPath(new URL('./fake-codex.mjs', import.meta.url)), prewarm: false }) });
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  const scan = async name => {
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(result.violations.map(v => ({ rule: v.id, targets: v.nodes.map(n => n.target), details: v.nodes.map(n => n.failureSummary) })), name).toEqual([]);
  };
  await page.goto(app.url);
  await expect(page.frameLocator('#visualization-frame').locator('#objective')).toHaveText('9.1400');
  await scan('Local app and bundled example');
  await page.locator('#visual-tab').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#source-tab')).toBeFocused();
  await expect(page.locator('#source-tab')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#source-content')).toContainText('<!');
  await page.keyboard.press('Home');
  await expect(page.locator('#visual-tab')).toBeFocused();
  for (const id of ['help', 'history', 'workspace', 'ideas']) {
    await page.locator(`#${id}-button`).click();
    await scan(`${id} dialog`);
    await page.keyboard.press('Escape');
    await expect(page.locator(`#${id}-dialog`)).not.toBeVisible();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await scan('Mobile app');
  console.log('App accessibility passed: WCAG automated checks, tab keyboard controls and dialog dismissal.');
} finally { await browser.close(); await app.close(); await fs.rm(stateDir, { recursive: true, force: true }); }

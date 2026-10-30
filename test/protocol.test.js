import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generationPrompt } from '../lib/protocol.js';
const request = { content: 'Visualize a mathematical idea', attachments: [] };
test('fresh requests inline their empty state instead of requiring redundant context reads', () => {
  const prompt = generationPrompt({ request, resume: false, fresh: true });
  assert.match(prompt, /BRAND-NEW PROJECT/);
  assert.match(prompt, /Return baseRevision:""/);
  assert.doesNotMatch(prompt, /Read baseRevision from context.json/);
  assert.match(prompt, /createPlot/);
});
test('resume and missing-session restore keep their authoritative source and history context', () => {
  assert.match(generationPrompt({ request, resume: true }), /context.json/);
  assert.match(generationPrompt({ request, resume: false }), /RESTORE CONTEXT/);
  assert.match(generationPrompt({ request, resume: false }), /conversation.json/);
  assert.match(generationPrompt({ request, resume: true, fullFallback: true, feedback: 'ambiguous edit' }), /ambiguous edit/);
});

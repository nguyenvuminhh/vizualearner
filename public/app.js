import { formatDuration, formatPhase, responseTiming, workedLabel } from './timing.js';
const $ = id => document.getElementById(id);
const paths = {
  plus: '<path d="M12 5v14M5 12h14"/>', search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  sparkles: '<path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3ZM20 2v4M18 4h4"/>',
  folder: '<path d="M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11H3V7Z"/>',
  chevrons: '<path d="m9 8 3-3 3 3m-6 8 3 3 3-3"/>', flask: '<path d="M9 3h6m-5 0v7L4 20h16l-6-10V3M7 15h10"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 3h.01"/>',
  check: '<path d="m5 12 4 4L19 6"/>', chart: '<path d="M4 4v16h17M7 15l4-5 4 3 5-7"/>',
  code: '<path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18"/>', refresh: '<path d="M20 10a8 8 0 1 0-1 8m1-15v7h-7"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>', message: '<path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10Z"/>',
  'chevron-up': '<path d="m6 15 6-6 6 6"/>', paperclip: '<path d="m8 13 7-7a3 3 0 0 1 4 4l-9 9a5 5 0 0 1-7-7l9-9m-6 12 8-8"/>',
  'arrow-up-right': '<path d="M6 18 18 6M6 6h12v12"/>', download: '<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  x: '<path d="m6 6 12 12M6 18 18 6"/>', menu: '<path d="M4 6h16M4 12h16M4 18h16"/>'
};
function icon(name) { return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.chart}</svg>`; }
function hydrate(root = document) { root.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); }); }
hydrate();
let config, projects = [], current = null, files = [], tab = 'visual', previewRevision = null, loadedFrame = '', sending = false, polling = false, lastHistory = '', selectionVersion = 0, frameError = null, frameMeasurement = null;
let toastTimer;
const escape = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function toast(message, error = false) { $('toast').textContent = message; $('toast').classList.toggle('error', error); $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, error ? 10000 : 5000); }
async function api(url, { body, method = 'GET', ...options } = {}) {
  const headers = { 'X-Lab-Token': config?.token || '' };
  if (body && !(body instanceof FormData)) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
  const response = await fetch(url, { ...options, method, body, headers });
  if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || `Request failed (${response.status}).`); }
  return response.json();
}
function bind(id, fn, event = 'click') { $(id).addEventListener(event, async e => { try { await fn(e); } catch (error) { toast(error.message, true); } }); }
function savedKey() { return `math-lab:selected:${config.workspace}`; }
function draftKey(pid) { return `math-lab:draft:${config.workspace}:${pid}`; }
function settingsKey(pid) { return `math-lab:settings:${config.workspace}:${pid}`; }
function refreshEfforts() {
  const selected = $('effort-select').value;
  const known = config.models?.find(m => m.id === $('model-input').value.trim());
  const choices = known?.efforts.length ? known.efforts : ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
  $('effort-select').innerHTML = '<option value="">Default effort</option>' + choices.map(e => `<option value="${escape(e)}">${escape(({ xhigh: 'Extra high', max: 'Maximum' })[e] || e[0].toUpperCase() + e.slice(1))}</option>`).join('');
  $('effort-select').value = choices.includes(selected) ? selected : '';
}
function restoreSettings() {
  let saved; try { saved = JSON.parse(localStorage.getItem(settingsKey(current.id))); } catch {}
  const settings = saved || current.generationSettings || {};
  $('model-input').value = settings.model || '';
  refreshEfforts(); $('effort-select').value = settings.effort || '';
  $('use-saved-match').checked = current.useSavedMatch ?? localStorage.getItem('math-lab:use-saved-match') === 'true';
}
function saveSettings() {
  if (current) localStorage.setItem(settingsKey(current.id), JSON.stringify({ model: $('model-input').value.trim(), effort: $('effort-select').value }));
}
function saveDraft() { if (current) localStorage.setItem(draftKey(current.id), $('prompt').value); }
function relativeDate(value) { const d = new Date(value), today = new Date(); if (d.toDateString() === today.toDateString()) return 'Today'; const yesterday = new Date(Date.now() - 86400000); return d.toDateString() === yesterday.toDateString() ? 'Yesterday' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
function renderProjects() {
  const query = $('search').value.toLowerCase();
  const visible = projects.filter(p => p.title.toLowerCase().includes(query));
  $('project-count').textContent = projects.length;
  $('project-list').innerHTML = visible.length ? visible.map(p => `<button class="project-item ${p.id === current?.id ? 'active' : ''}" data-project="${p.id}" title="${escape(p.title)}"><span class="project-icon">${icon(p.status === 'generating' ? 'sparkles' : 'chart')}</span><span class="project-meta"><span class="project-name">${escape(p.title)}</span><span class="project-date">${relativeDate(p.updatedAt)} · ${p.status === 'generating' ? 'Creating…' : p.currentRevision ? 'Interactive visualization' : 'New exploration'}</span></span>${p.id === current?.id ? '<i class="project-active-dot"></i>' : ''}</button>`).join('') : `<div class="project-empty">${query ? 'No matching explorations.' : 'Your next idea belongs here.'}</div>`;
}
async function refreshProjects() { const workspace = config.workspace; const result = await api('/api/projects'); if (workspace !== config.workspace) return; projects = result; renderProjects(); }
function renderHealth() {
  const ready = config.codex.available && config.codex.authenticated;
  $('connection-dot').classList.toggle('ready', ready);
  $('connection-text').textContent = ready ? 'Codex connected' : config.codex.available ? 'Codex needs sign in' : 'Codex not found';
  $('codex-detail').textContent = [config.codex.version || 'Codex CLI not detected', config.codex.detail].filter(Boolean).join('\n');
}
function renderWorkspace() { $('workspace-short').textContent = config.workspace.replace(config.home, '~'); $('workspace-button').title = config.workspace; }
function breakdownMarkup(timing, renderMetrics) {
  if (!timing?.phases) return '';
  const rows = [['Preparation', timing.phases.preparationMs], ['Codex execution', timing.phases.codexMs], ['Validation', timing.phases.validationMs], ['Saving source', timing.phases.persistenceMs]];
  if (renderMetrics) rows.push(['Frame load (separate)', renderMetrics.frameLoadMs]);
  return `<dl>${rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${formatPhase(value)}</dd></div>`).join('')}</dl><div class="run-stats">${timing.stats?.cacheHit ? 'Exact saved match · no Codex call' : timing.stats?.outputMode === 'patch' ? 'Targeted edit' : 'Complete source'}${Number.isFinite(timing.stats?.responseBytes) && !timing.stats?.cacheHit ? ` · ${(timing.stats.responseBytes / 1024).toFixed(1)} KB response` : ''}${timing.stats?.patchFallback ? ' · recovered with full source' : ''}</div>${timing.usage?.output_tokens ? `<div class="run-stats" title="Codex-reported token totals may include previous turns in a resumed session.">CLI token totals · ${Number(timing.usage.input_tokens || 0).toLocaleString()} input · ${Number(timing.usage.output_tokens).toLocaleString()} output</div>` : ''}`;
}
function renderBreakdown() {
  const timing = current?.lastRunTiming;
  $('run-breakdown').hidden = !timing?.phases || current?.status === 'generating';
  $('run-breakdown-content').innerHTML = breakdownMarkup(timing, current?.renderMetrics);
}
function timingMarkup(message) {
  const timing = responseTiming(message, current?.messages || []);
  const renderMetrics = message.revision === current?.renderMetrics?.revision ? current.renderMetrics : null;
  return timing ? `<div class="response-timing" title="${timing.estimated ? 'Estimated from saved request and response timestamps' : 'Elapsed generation time and local completion time'}">${escape(workedLabel(timing))}</div>${message.phases ? `<details class="run-breakdown"><summary>Timing breakdown</summary>${breakdownMarkup(message, renderMetrics)}</details>` : ''}` : '';
}
function updateTiming() {
  const generating = current?.status === 'generating';
  const start = current?.generationStartedAt || current?.messages.findLast(m => m.role === 'user')?.createdAt;
  $('generation-elapsed').hidden = !generating || !start;
  if (generating && start) {
    const elapsed = formatDuration(Date.now() - Date.parse(start));
    $('generation-elapsed').textContent = elapsed;
    $('conversation-label').textContent = `Working for ${elapsed}`;
  } else if (current && current.status !== 'interrupted') {
    const response = current.messages.findLast(m => m.role === 'assistant' && m.runId && !m.kind && m.status !== 'interrupted');
    const timing = responseTiming(response, current.messages);
    if (timing) {
      $('conversation-label').textContent = workedLabel(timing);
      $('conversation-label').title = timing.estimated ? 'Estimated from saved request and response timestamps; timestamp is local completion time' : 'Elapsed generation time • local completion time';
    }
  }
}
function renderHistory() {
  const signature = current?.id + ':' + current?.messages.length + ':' + current?.status + ':' + current?.renderMetrics?.recordedAt;
  if (signature === lastHistory) return;
  lastHistory = signature;
  $('history-title').textContent = current?.title || 'Conversation';
  $('history-messages').innerHTML = current?.messages.length ? current.messages.map(m => `<article class="message ${escape(m.role)} ${escape(m.status || '')}"><div class="message-meta"><strong>${m.role === 'user' ? 'You' : m.role === 'system' ? 'Session restored' : m.origin === 'local-repair' ? 'Repair' : m.origin === 'saved-match' ? 'Saved match' : 'Codex'}</strong><span>${new Date(m.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>${m.kind === 'progress' ? '<span>· Progress</span>' : ''}</div>${timingMarkup(m)}<div class="message-content">${escape(m.content)}</div>${m.attachments?.length ? `<div class="message-attachments">${m.attachments.map(a => `<a href="/api/projects/${current.id}/attachments/${a.id}" download>${icon('paperclip')} ${escape(a.name)}</a>`).join('')}</div>` : ''}${m.revision ? `<span class="revision-link">${icon('check')} Source saved · revision ${current.revisions.findIndex(r => r.id === m.revision) + 1}</span>` : ''}</article>`).join('') : '<div class="history-empty">A blank page for a new idea. Describe a mathematical problem below to start this conversation.</div>';
}
function render() {
  const generating = current?.status === 'generating';
  const hasSource = Boolean(current?.currentRevision);
  $('project-title').textContent = current?.messages.length ? current.title : 'A new way to see mathematics.';
  $('breadcrumb-title').textContent = current?.title || 'Your exploration';
  $('project-subtitle').textContent = current?.messages.length ? 'Change a parameter. Notice a pattern. Follow your curiosity.' : 'Turn a question into something you can explore.';
  $('saved-indicator').hidden = !current;
  $('saved-indicator').innerHTML = icon(generating ? 'sparkles' : 'check') + (generating ? ' Generating · conversation saved' : ' Saved locally');
  const visibleMessages = current?.messages.filter(m => m.role !== 'system' && m.kind !== 'progress') || [];
  $('message-count').textContent = visibleMessages.length;
  const lastAssistant = current?.messages.filter(m => m.role === 'assistant' && m.kind !== 'progress').at(-1);
  $('conversation-label').textContent = generating ? 'An idea is taking shape…' : current?.messages.length ? (['error', 'cancelled', 'interrupted'].includes(current.status) ? 'Generation stopped · open conversation for details' : 'Keep the conversation going') : 'Your exploration starts here';
  $('conversation-label').title = lastAssistant?.content || '';
  $('history-button').disabled = !current;
  $('generation-status').hidden = !generating;
  $('generation-text').textContent = current?.progress || 'Codex is working. This can take a few minutes…';
  $('generate-button').disabled = sending || generating || !current;
  $('generate-label').textContent = sending ? 'Sending…' : generating ? 'Creating…' : hasSource ? 'Update visualization' : 'Visualize';
  $('prompt').placeholder = !current ? 'Choose New Visualization to start exploring…' : hasSource ? 'What would you like to change or explore next?' : 'Describe a concept, ask a question, or drop in a problem…';
  $('prompt').disabled = !current;
  $('model-input').disabled = !current;
  $('effort-select').disabled = !current;
  $('generation-options-note').textContent = generating ? 'Applies to your next message' : 'Saved with this exploration';
  $('saved-match-option').hidden = !current || Boolean(current.currentRevision) || current.messages.some(m => m.role === 'user');
  $('source-tab').disabled = !hasSource;
  $('reload-frame').disabled = !hasSource;
  $('revision-select').hidden = !hasSource;
  const revision = current?.revisions.find(r => r.id === previewRevision) || current?.revisions.at(-1);
  const isOld = revision && revision.id !== current.currentRevision;
  $('revision-select').innerHTML = (current?.revisions || []).map((r, i) => `<option value="${r.id}" ${r.id === revision?.id ? 'selected' : ''}>Revision ${i + 1}${r.id === current.currentRevision ? ' · latest' : ''}</option>`).reverse().join('');
  $('canvas-status').textContent = generating ? 'Generating · last saved version remains interactive' : hasSource ? isOld ? 'Previewing a saved revision' : 'Live canvas · changes update instantly' : 'An open space for your ideas';
  $('canvas-note').textContent = isOld ? 'Follow-ups always modify the latest version' : hasSource ? 'Sandboxed browser environment' : 'Interactive by design';
  $('empty-state').hidden = hasSource;
  $('visualization-frame').hidden = !hasSource || tab !== 'visual';
  $('source-panel').hidden = !hasSource || tab !== 'source';
  $('visual-tab').classList.toggle('active', tab === 'visual'); $('visual-tab').setAttribute('aria-selected', tab === 'visual');
  $('source-tab').classList.toggle('active', tab === 'source'); $('source-tab').setAttribute('aria-selected', tab === 'source');
  if (hasSource && revision) {
    const url = `${config.artifactOrigin}/view/${current.id}/${revision.id}/index.html`;
    if (loadedFrame !== url) { frameError = null; frameMeasurement = { projectId: current.id, revision: revision.id, url, started: performance.now() }; $('visualization-frame').src = url; loadedFrame = url; }
    const selected = $('source-file').value;
    $('source-file').innerHTML = revision.files.map(f => `<option ${f === selected ? 'selected' : ''}>${escape(f)}</option>`).join('');
  } else { $('visualization-frame').removeAttribute('src'); loadedFrame = ''; }
  if (frameError) $('canvas-status').textContent = 'Visualization error · ask Codex to fix it';
  updateTiming(); renderBreakdown(); renderHistory(); renderProjects();
}
async function selectProject(pid) {
  const version = ++selectionVersion;
  saveDraft();
  const p = await api(`/api/projects/${pid}`);
  if (version !== selectionVersion) return;
  current = p; previewRevision = null; tab = 'visual'; files = []; renderAttachments();
  restoreSettings();
  localStorage.setItem(savedKey(), pid);
  $('prompt').value = localStorage.getItem(draftKey(pid)) || '';
  $('sidebar').classList.remove('open');
  render();
}
async function newProject() {
  const button = $('new-project'); button.disabled = true;
  try { const p = await api('/api/projects', { method: 'POST' }); await refreshProjects(); await selectProject(p.id); $('prompt').focus(); }
  finally { button.disabled = false; }
}
async function readSource() {
  if (!current?.currentRevision) return;
  const pid = current.id, rev = previewRevision || current.currentRevision, file = $('source-file').value || 'index.html';
  const url = `/api/projects/${pid}/source?revision=${encodeURIComponent(rev)}&file=${encodeURIComponent(file)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Could not read this source file.');
  const text = await response.text();
  if (current?.id !== pid || (previewRevision || current.currentRevision) !== rev || $('source-file').value !== file) return;
  $('source-content').textContent = text; $('download-source').href = url + '&download=1'; $('download-source').download = file.split('/').at(-1);
}
function renderAttachments() {
  $('attachment-list').innerHTML = files.map((f, i) => `<span class="attachment-chip">${icon('paperclip')}${escape(f.name)}<button type="button" data-remove-file="${i}" aria-label="Remove ${escape(f.name)}">${icon('x')}</button></span>`).join('');
}
function addFiles(incoming) {
  if (files.length + incoming.length > 8) return toast('Attach up to 8 files per message.', true);
  if (incoming.some(f => f.size > 20 * 1024 * 1024)) return toast('Each attachment must be 20 MB or smaller.', true);
  files.push(...incoming); renderAttachments();
}
bind('new-project', newProject);
bind('project-list', async e => { const el = e.target.closest('[data-project]'); if (el) await selectProject(el.dataset.project); });
bind('search', renderProjects, 'input');
bind('prompt', saveDraft, 'input');
bind('model-input', () => { refreshEfforts(); saveSettings(); }, 'input');
bind('effort-select', saveSettings, 'change');
bind('use-saved-match', () => localStorage.setItem('math-lab:use-saved-match', String($('use-saved-match').checked)), 'change');
bind('prompt-form', async e => {
  e.preventDefault(); if (!current || sending || current.status === 'generating') return;
  const message = $('prompt').value.trim();
  if (!message && !files.length) { $('prompt').focus(); return toast('Start with a question, concept, or attachment.'); }
  const form = new FormData(); form.append('message', message); form.append('model', $('model-input').value.trim()); form.append('effort', $('effort-select').value); form.append('useSavedMatch', String($('use-saved-match').checked)); files.forEach(f => form.append('attachments', f));
  const pid = current.id; sending = true; render();
  try {
    const p = await api(`/api/projects/${pid}/messages`, { method: 'POST', body: form });
    localStorage.removeItem(draftKey(pid));
    if (current.id === pid) { current = p; previewRevision = null; $('prompt').value = ''; files = []; renderAttachments(); }
    await refreshProjects();
  } finally { sending = false; render(); }
}, 'submit');
bind('cancel-button', async () => { await api(`/api/projects/${current.id}/cancel`, { method: 'POST' }); toast('Stopping generation. Your saved visualization is preserved.'); });
bind('attach-button', () => { if (!current) return toast('Create a New Visualization first.'); $('file-input').click(); });
bind('file-input', e => { addFiles([...e.target.files]); e.target.value = ''; }, 'change');
bind('attachment-list', e => { const el = e.target.closest('[data-remove-file]'); if (el) { files.splice(Number(el.dataset.removeFile), 1); renderAttachments(); } });
bind('visual-tab', () => { tab = 'visual'; render(); });
bind('source-tab', async () => { tab = 'source'; render(); await readSource(); });
bind('source-file', readSource, 'change');
bind('revision-select', async e => { previewRevision = e.target.value; render(); if (tab === 'source') await readSource(); }, 'change');
bind('reload-frame', () => { frameError = null; const frame = $('visualization-frame'); frameMeasurement = { projectId: current.id, revision: previewRevision || current.currentRevision, url: frame.src, started: performance.now() }; frame.src = frame.src; render(); });
bind('fullscreen-button', async () => {
  const panel = $('visualization-panel');
  if (document.fullscreenElement) await document.exitFullscreen();
  else if (panel.requestFullscreen) await panel.requestFullscreen();
  else panel.classList.toggle('expanded');
});
bind('history-button', () => { renderHistory(); $('history-dialog').showModal(); const dialog = $('history-dialog'); dialog.scrollTop = dialog.scrollHeight; });
for (const el of document.querySelectorAll('.close-dialog')) el.onclick = () => el.closest('dialog').close();
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });
bind('ideas-button', () => $('ideas-dialog').showModal());
for (const el of document.querySelectorAll('[data-prompt]')) el.addEventListener('click', () => {
  if (!current) { toast('Click New Visualization to start an independent exploration.'); return; }
  $('prompt').value = el.dataset.prompt; saveDraft(); $('ideas-dialog').close(); $('prompt').focus();
});
bind('help-button', () => $('help-dialog').showModal()); bind('connection-info', () => $('help-dialog').showModal());
bind('recheck-codex', async () => { config.codex = await api('/api/health', { method: 'POST' }); renderHealth(); });
bind('menu-button', () => $('sidebar').classList.toggle('open'));
async function browseDirectory(dir) {
  $('directory-path').value = dir;
  const data = await api(`/api/directories?path=${encodeURIComponent(dir)}`);
  $('directory-path').value = data.path;
  $('directory-list').innerHTML = `<button data-dir="${escape(data.parent)}">${icon('chevron-up')} Parent folder</button>` + data.directories.map(name => `<button data-dir="${escape(data.path + '/' + name)}">${icon('folder')}${escape(name)}</button>`).join('');
}
bind('workspace-button', async () => { $('workspace-dialog').showModal(); await browseDirectory(config.workspace); });
bind('directory-form', async e => { e.preventDefault(); await browseDirectory($('directory-path').value); }, 'submit');
bind('directory-list', async e => { const el = e.target.closest('[data-dir]'); if (el) await browseDirectory(el.dataset.dir); });
bind('select-workspace', async () => {
  saveDraft(); const next = await api('/api/workspace', { method: 'POST', body: { path: $('directory-path').value } });
  selectionVersion++; config.workspace = next.workspace; current = null; files = []; renderAttachments(); renderWorkspace(); await refreshProjects();
  const selected = projects.find(p => p.id === localStorage.getItem(savedKey())) || projects[0];
  if (selected) await selectProject(selected.id); else { $('prompt').value = ''; render(); }
  $('workspace-dialog').close(); toast('Workspace selected. Your previous workspace is preserved.');
});
document.addEventListener('keydown', e => {
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); newProject().catch(err => toast(err.message, true)); }
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !document.querySelector('dialog[open]')) { e.preventDefault(); $('prompt-form').requestSubmit(); }
  if (e.key === '/' && !typing && !document.querySelector('dialog[open]')) { e.preventDefault(); $('search').focus(); }
  if (e.key === 'Escape') { $('sidebar').classList.remove('open'); $('visualization-panel').classList.remove('expanded'); }
});
document.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); document.body.classList.add('drop-active'); } });
document.addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('drop-active'); });
document.addEventListener('drop', e => { if (!e.dataTransfer.files.length) return; e.preventDefault(); document.body.classList.remove('drop-active'); if (!current) return toast('Create a New Visualization first.'); addFiles([...e.dataTransfer.files]); });
document.addEventListener('click', e => { if (innerWidth <= 600 && !e.target.closest('.sidebar') && !e.target.closest('#menu-button')) $('sidebar').classList.remove('open'); });
window.addEventListener('message', e => {
  if (e.source !== $('visualization-frame').contentWindow) return;
  if (e.data?.type === 'math-lab-frame-loaded') {
    const measurement = frameMeasurement;
    if (!measurement || e.data.href !== measurement.url || current?.id !== measurement.projectId) return;
    frameMeasurement = null;
    const frameLoadMs = Math.min(120000, Math.max(0, performance.now() - measurement.started));
    api(`/api/projects/${measurement.projectId}/revisions/${measurement.revision}/render`, { method: 'POST', body: { frameLoadMs, runtimeError: frameError || null } }).then(metrics => {
      if (current?.id === measurement.projectId && current.currentRevision === measurement.revision) { current.renderMetrics = metrics; renderBreakdown(); renderHistory(); }
    }).catch(() => {});
    return;
  }
  if (e.data?.type !== 'math-lab-runtime-error' || typeof e.data.message !== 'string') return;
  frameError = e.data.message.slice(0, 400);
  if (current && loadedFrame) api(`/api/projects/${current.id}/revisions/${previewRevision || current.currentRevision}/render`, { method: 'POST', body: { runtimeError: frameError } }).catch(() => {});
  $('canvas-status').textContent = 'Visualization error · ask Codex to fix it';
  toast('The visualization hit an error. Ask Codex to fix it:\n' + frameError, true);
});
async function poll() {
  if (!config || polling) return;
  polling = true;
  try {
    if (current) {
      const pid = current.id, previous = current, version = selectionVersion;
      const updated = await api(`/api/projects/${pid}`);
      if (current?.id !== pid || version !== selectionVersion) return;
      current = updated;
      if (previous.currentRevision !== updated.currentRevision) previewRevision = null;
      if (previous.status === 'generating' && updated.status !== 'generating') {
        const failed = updated.status !== 'ready';
        toast(failed ? updated.messages.at(-1)?.content || 'Generation stopped.' : 'Your visualization is ready. Try it out.', failed);
        await refreshProjects(); if (tab === 'source' && !failed) { render(); await readSource(); }
      }
      if (previous.updatedAt !== updated.updatedAt || previous.progress !== updated.progress) render();
    }
  } catch (error) { if (!document.hidden) $('canvas-status').textContent = 'Connection interrupted · reconnecting…'; }
  finally { polling = false; }
}
async function init() {
  config = await api('/api/config'); renderHealth(); renderWorkspace(); await refreshProjects();
  $('model-options').innerHTML = (config.models || []).map(m => `<option value="${escape(m.id)}"></option>`).join('');
  const selected = projects.find(p => p.id === localStorage.getItem(savedKey())) || projects[0];
  if (selected) await selectProject(selected.id); else render();
  setInterval(updateTiming, 1000); setInterval(poll, 1200); setInterval(() => refreshProjects().catch(() => {}), 7000);
}
init().catch(error => { toast(`Could not connect to vizualearner. ${error.message}`, true); $('connection-text').textContent = 'App connection unavailable'; });

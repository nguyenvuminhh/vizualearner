export function formatDuration(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
  return h ? `${h}h ${m}m ${s}s` : m ? `${m}m ${s}s` : `${s}s`;
}

export function responseTiming(message, messages = []) {
  if (!message || message.role !== 'assistant' || message.kind || !message.runId || message.status === 'interrupted') return null;
  if (Number.isFinite(message.durationMs) && message.durationMs >= 0) return { durationMs: message.durationMs, completedAt: message.completedAt || message.createdAt, estimated: false, cached: Boolean(message.stats?.cacheHit && message.status === 'ready') };
  // Older projects did not record run durations. Clearly mark timestamp-based estimates.
  const index = messages.findIndex(m => m.id === message.id);
  const request = messages.slice(0, index).findLast(m => m.role === 'user');
  const durationMs = Date.parse(message.createdAt) - Date.parse(request?.createdAt);
  return Number.isFinite(durationMs) && durationMs >= 0 ? { durationMs, completedAt: message.createdAt, estimated: true } : null;
}

export function workedLabel(timing) {
  const clock = new Date(timing.completedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  if (timing.cached) return `Reused saved visualization • ${clock}`;
  return `Worked for ${timing.estimated ? '~' : ''}${formatDuration(timing.durationMs)} • ${clock}`;
}

export function formatPhase(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return '—';
  return milliseconds < 1000 ? `${Math.round(milliseconds)}ms` : milliseconds < 60000 ? `${(milliseconds / 1000).toFixed(2)}s` : formatDuration(milliseconds);
}

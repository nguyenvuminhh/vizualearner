import { spawn } from 'node:child_process';

// Read account metadata only. No thread or model turn is created.
export function readCodexLimits(bin, { timeout = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ['app-server', '--listen', 'stdio://'], { stdio: ['pipe', 'pipe', 'ignore'], detached: process.platform !== 'win32' });
    let pending = '', total = 0, done = false;
    const finish = (error, result) => {
      if (done) return;
      done = true; clearTimeout(timer);
      try { process.platform === 'win32' ? child.kill('SIGTERM') : process.kill(-child.pid, 'SIGTERM'); } catch {}
      const force = setTimeout(() => {
        if (child.exitCode !== null || child.signalCode !== null) return;
        try { process.platform === 'win32' ? child.kill('SIGKILL') : process.kill(-child.pid, 'SIGKILL'); } catch {}
      }, 500); force.unref();
      child.once('close', () => clearTimeout(force));
      error ? reject(error) : resolve(result);
    };
    const timer = setTimeout(() => finish(new Error('Codex limits request timed out.')), timeout);
    const send = message => child.stdin.write(JSON.stringify(message) + '\n');
    child.stdin.on('error', () => finish(new Error('Could not communicate with Codex.')));
    child.on('error', () => finish(new Error('Codex CLI is unavailable.')));
    child.on('close', () => finish(new Error('This Codex CLI could not report account limits.')));
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      total += Buffer.byteLength(chunk);
      if (total > 1024 * 1024) return finish(new Error('Codex limits response was too large.'));
      pending += chunk;
      const lines = pending.split('\n'); pending = lines.pop();
      for (const line of lines) {
        let message; try { message = JSON.parse(line); } catch { continue; }
        if (!message || typeof message !== 'object' || Array.isArray(message)) continue;
        if (![1, 2].includes(message.id) || done) continue;
        if (message.error) return finish(new Error('Account limits are unavailable for this Codex account or CLI version.'));
        if (message.id === 1) {
          send({ method: 'initialized', params: {} });
          send({ id: 2, method: 'account/rateLimits/read' });
        } else {
          const result = message.result || {};
          // Never return account credentials or unrelated app-server messages.
          finish(null, { rateLimits: result.rateLimits || null, rateLimitsByLimitId: result.rateLimitsByLimitId || null, fetchedAt: new Date().toISOString() });
        }
      }
    });
    send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'vizualearner', title: 'vizualearner', version: '0.1.0' } } });
  });
}

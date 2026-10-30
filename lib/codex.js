import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

export function executeCodex({ bin, cwd, runDir = cwd, prompt, sessionId, forkSessionId, configArgs = [], settings, images, job, timeout, onEvent }) {
  return new Promise((resolve, reject) => {
    if (job.cancelled) return reject(new Error('Generation cancelled.'));
    const args = ['-a', 'never', '-s', 'read-only', '-C', cwd, ...configArgs, 'exec'];
    if (sessionId) args.push('resume', sessionId);
    else if (forkSessionId) args.push('fork', forkSessionId);
    if (settings.model) args.push('--model', settings.model);
    if (settings.effort) args.push('-c', `model_reasoning_effort=${JSON.stringify(settings.effort)}`);
    args.push('--skip-git-repo-check', '--json', '--output-schema', path.join(runDir, 'schema.json'), '-o', path.join(runDir, 'output.json'));
    for (const image of images) args.push('-i', image);
    args.push('-');
    const child = spawn(bin, args, { cwd, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } });
    let stderr = '', pending = '', total = 0, timedOut = false, overflow = false, writeError = null, reportedError = '';
    let writes = Promise.resolve();
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    job.stop = () => {
      try { process.platform === 'win32' ? child.kill('SIGTERM') : process.kill(-child.pid, 'SIGTERM'); } catch {}
      const force = setTimeout(() => { try { process.platform === 'win32' ? child.kill('SIGKILL') : process.kill(-child.pid, 'SIGKILL'); } catch {} }, 2000); force.unref();
    };
    const timer = setTimeout(() => { timedOut = true; job.stop(); }, timeout);
    const consume = line => {
      if (!line.trim()) return;
      writes = writes.then(async () => {
        await fs.appendFile(path.join(runDir, 'events.jsonl'), line + '\n');
        let event; try { event = JSON.parse(line); } catch { return; }
        if (event.type === 'error' || event.type === 'turn.failed') reportedError = String(event.message || event.error?.message || '');
        await onEvent(event);
      }).catch(error => { writeError ||= error; job.stop(); });
    };
    child.stdout.on('data', chunk => {
      total += Buffer.byteLength(chunk);
      if (total > 24 * 1024 * 1024) { overflow = true; job.stop(); return; }
      pending += chunk; const lines = pending.split('\n'); pending = lines.pop(); lines.forEach(consume);
    });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-16000); });
    child.stdin.on('error', () => {}); child.stdin.end(prompt);
    child.once('error', error => { clearTimeout(timer); reject(new Error(error.code === 'ENOENT' ? 'Codex CLI was not found. Install it and restart the app, or set CODEX_BIN to its executable path.' : error.message)); });
    child.once('close', async code => {
      clearTimeout(timer); consume(pending); await writes;
      try { await fs.appendFile(path.join(runDir, 'stderr.txt'), stderr); } catch (error) { writeError ||= error; }
      if (writeError) return reject(new Error('Unable to save generation progress: ' + writeError.message));
      if (job.cancelled) return reject(new Error('Generation cancelled. Your last saved visualization is intact.'));
      if (timedOut) return reject(new Error('Generation timed out. Your last saved visualization is intact. Try a smaller request.'));
      if (overflow) return reject(new Error('Codex produced too much event output. Your last saved visualization is intact. Try a smaller request.'));
      if (code !== 0) {
        const details = stderr || reportedError;
        const error = new Error(`Codex exited with code ${code}. ${details.slice(-1800) || 'See saved run events for details.'}`);
        error.missingSession = Boolean(sessionId || forkSessionId) && /(?:session|thread|rollout).{0,100}(?:not found|does not exist|missing)|no (?:session|rollout) found/i.test(details);
        error.unsupportedFork = Boolean(forkSessionId) && /(?:unrecognized|unknown|unexpected).{0,80}fork/i.test(details);
        return reject(error);
      }
      resolve();
    });
  });
}

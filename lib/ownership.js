import fs from 'node:fs/promises';
import path from 'node:path';
import lockfile from 'proper-lockfile';

// Canonicalize the parent so symlink aliases share the same ownership lease.
// Heartbeats let a later launch recover after a forced termination.
export async function acquireOwnership(directory, kind) {
  const real = await fs.realpath(directory);
  try {
    return await lockfile.lock(path.join(real, `.vizualearner-${kind}`), {
      realpath: false, stale: 10000, update: 2000, retries: 0
    });
  } catch (error) {
    if (error.code !== 'ELOCKED') throw error;
    throw Object.assign(new Error(`Another vizualearner instance is using this ${kind}. Open the already running app in your browser, or stop it before starting again. After a forced termination, wait 10 seconds and retry.`), { code: 'ELOCKED' });
  }
}

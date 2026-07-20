const { spawn } = require('child_process');

const PING_URL = 'http://127.0.0.1:26241/api/ping';
const START_TIMEOUT_MS = 15000;
const POLL_INTERVAL_MS = 300;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ping() {
  try {
    const res = await fetch(PING_URL);
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForPing(deadline) {
  while (Date.now() < deadline) {
    if (await ping()) return true;
    await sleep(POLL_INTERVAL_MS);
  }
  return false;
}

async function main() {
  const child = spawn('node', ['server.cjs'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env }
  });

  let exited = false;
  let exitCode = null;

  child.stdout.on('data', (buf) => {
    process.stdout.write(`[server] ${buf}`);
  });

  child.stderr.on('data', (buf) => {
    process.stderr.write(`[server:err] ${buf}`);
  });

  child.on('exit', (code) => {
    exited = true;
    exitCode = code;
  });

  const deadline = Date.now() + START_TIMEOUT_MS;
  const ok = await waitForPing(deadline);

  if (!ok) {
    if (!exited) child.kill('SIGTERM');
    throw new Error(`Server boot verification failed: /api/ping did not respond within ${START_TIMEOUT_MS}ms.`);
  }

  if (exited && exitCode !== 0) {
    throw new Error(`Server process exited unexpectedly with code ${exitCode}.`);
  }

  if (!exited) child.kill('SIGTERM');
  console.log('\n[verify-server-boot] PASS');
}

main().catch((err) => {
  console.error(`\n[verify-server-boot] FAIL: ${err.message}`);
  process.exit(1);
});

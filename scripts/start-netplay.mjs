import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { envPort, loadRootEnv } from './root-env.mjs';

loadRootEnv();
const PORT = envPort('NETPLAY_PORT', 3000);
const here = dirname(fileURLToPath(import.meta.url));
const netplayDir = join(here, '..', 'infra', 'emulatorjs-netplay');

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', cwd, env: process.env });
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

function hold(message) {
  console.warn(message);
  return new Promise(() => undefined);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function healthOk() {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/health`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return false;
    const body = await res.json();
    return body?.ok === true;
  } catch {
    return false;
  }
}

async function waitHealth(ms) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < ms) {
    if (await healthOk()) return true;
    await sleep(400);
  }
  return false;
}

if (await healthOk()) {
  await hold(`Netplay already listening on :${PORT}`);
}

try {
  await run('docker', ['compose', 'up', '-d', '--build', 'netplay']);
  if (await waitHealth(25000)) {
    await hold(`Netplay listening on :${PORT}`);
  }
  console.warn(`Docker netplay on :${PORT} did not become healthy; trying node…`);
  await run('docker', ['compose', 'stop', 'netplay']);
} catch {
  /* docker missing or compose failed — fall through to node */
}

if (await healthOk()) {
  await hold(`Netplay listening on :${PORT}`);
}

try {
  process.env.PORT = String(PORT);
  await run('npm', ['install', '--omit=dev'], netplayDir);
  await run('node', ['server.js'], netplayDir);
} catch (error) {
  const detail = error instanceof Error ? error.message : 'docker unavailable';
  await hold(`Netplay stays off (${detail}). SNES still lists; two browsers will not sync.`);
}

await hold('Netplay stopped. Restart docker compose up netplay to play online.');

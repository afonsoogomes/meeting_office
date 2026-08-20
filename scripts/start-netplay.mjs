import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { envPort, loadRootEnv } from './root-env.mjs';

loadRootEnv();
const PORT = envPort('NETPLAY_PORT', 3000);
const here = dirname(fileURLToPath(import.meta.url));
const netplayDir = join(here, '..', 'infra', 'emulatorjs-netplay');

function portOpen() {
  return new Promise((resolve) => {
    const socket = net.connect({ port: PORT, host: '127.0.0.1' }, () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
  });
}

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

if (await portOpen()) {
  await hold(`Netplay already listening on :${PORT}`);
}

try {
  await run('docker', ['compose', 'up', '-d', '--build', 'netplay']);
  await hold(`Netplay listening on :${PORT}`);
} catch {
  try {
    process.env.PORT = String(PORT);
    await run('npm', ['install', '--omit=dev'], netplayDir);
    await run('node', ['server.js'], netplayDir);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'docker unavailable';
    await hold(`Netplay stays off (${detail}). SNES still lists; two browsers will not sync.`);
  }
}

await hold('Netplay stopped. Restart docker compose up netplay to play online.');

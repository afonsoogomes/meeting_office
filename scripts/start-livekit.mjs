import { spawn } from 'node:child_process';
import net from 'node:net';
import { envPort, loadRootEnv } from './root-env.mjs';

loadRootEnv();
const PORT = envPort('LIVEKIT_PORT', 7880);

function portOpen() {
  return new Promise((resolve) => {
    const socket = net.connect({ port: PORT, host: '127.0.0.1' }, () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
  });
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env: process.env });
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

function hold(message) {
  console.warn(message);
  return new Promise(() => undefined);
}

if (await portOpen()) {
  await hold(`LiveKit already listening on :${PORT}`);
}

try {
  await run('docker', ['compose', 'up', 'livekit']);
} catch {
  try {
    await run('livekit-server', ['--dev', '--bind', '0.0.0.0']);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'docker unavailable';
    await hold(`Voice stays off (${detail}). Install Docker or \`brew install livekit\`.`);
  }
}

await hold('LiveKit stopped. Presence/chat keep running; restart livekit to talk.');

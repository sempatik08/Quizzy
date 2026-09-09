'use strict';

/**
 * Quizzy container supervisor.
 *
 * The app is two processes: the Next.js server and the Socket.io game server.
 * This starts both, forwards shutdown signals, and exits as soon as either one
 * dies so the container's restart policy can take over instead of leaving a
 * half-dead container that still passes a naive port check.
 *
 * docker-compose runs the same image twice with an explicit `command` instead,
 * giving one container per process. This script is only the default CMD.
 */

const { spawn } = require('node:child_process');

const SERVICES = [
  // Socket.io game server — server/server.js reads SOCKET_PORT
  { name: 'socket', args: ['server/server.js'] },
  // Next.js standalone output — server.js reads PORT / HOSTNAME
  { name: 'web', args: ['server.js'] },
];

/** @type {Map<string, import('node:child_process').ChildProcess>} */
const children = new Map();
let shuttingDown = false;
let exitCode = 0;

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  exitCode = code;

  for (const child of children.values()) child.kill('SIGTERM');

  // Escape hatch if a child ignores SIGTERM.
  setTimeout(() => {
    for (const child of children.values()) child.kill('SIGKILL');
    process.exit(exitCode);
  }, 8000).unref();
}

for (const service of SERVICES) {
  const child = spawn(process.execPath, service.args, { stdio: 'inherit' });
  children.set(service.name, child);

  child.on('error', (err) => {
    console.error(`[quizzy] could not start "${service.name}": ${err.message}`);
    shutdown(1);
  });

  child.on('exit', (code, signal) => {
    children.delete(service.name);

    if (!shuttingDown) {
      console.error(
        `[quizzy] "${service.name}" exited unexpectedly (code=${code} signal=${signal}) — stopping container`,
      );
      shutdown(code === 0 ? 1 : code ?? 1);
    }

    if (children.size === 0) process.exit(exitCode);
  });
}

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`[quizzy] received ${signal}, stopping services…`);
    shutdown(0);
  });
}

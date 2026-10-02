'use strict';

const { spawn } = require('child_process');
const crypto = require('crypto');
const config = require('../config');

const MAX_BUFFER = 256 * 1024;
const sessions = new Map();

// Strip ANSI escape sequences and control chars; the web console is plain text.
function sanitize(chunk) {
  let s = chunk.toString('utf8');
  s = s.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '');
  s = s.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
  s = s.replace(/\x1b[@-Z\\-_]/g, '');
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return s;
}

function broadcast(session, msg) {
  for (const send of session.listeners) {
    try { send(msg); } catch { session.listeners.delete(send); }
  }
}

function pushOutput(session, text) {
  if (!text) return;
  session.buffer += text;
  if (session.buffer.length > MAX_BUFFER) {
    session.buffer = session.buffer.slice(-MAX_BUFFER);
  }
  session.lastActivity = Date.now();
  broadcast(session, { type: 'output', data: text });
}

function killProcess(session, signal) {
  const pid = session.proc.pid;
  try {
    if (pid && process.platform !== 'win32') process.kill(-pid, signal);
    else session.proc.kill(signal);
  } catch {
    try { session.proc.kill(signal); } catch { /* already dead */ }
  }
}

function destroySession(id, message) {
  const session = sessions.get(id);
  if (!session) return;
  sessions.delete(id);
  if (message) pushOutput(session, message);
  broadcast(session, { type: 'exit', code: null });
  session.listeners.clear();
  killProcess(session, 'SIGTERM');
}

function createSession() {
  while (sessions.size >= config.terminalMaxSessions) {
    const oldest = sessions.keys().next().value;
    destroySession(oldest, '\n[sessão encerrada: limite de sessões atingido]\n');
  }

  const id = crypto.randomBytes(12).toString('hex');
  const shell = config.terminalShell;
  const args = /(?:^|\/)(?:ba)?sh$/.test(shell) ? ['-i'] : [];

  const proc = spawn(shell, args, {
    cwd: process.env.HOME || process.env.PWD || process.cwd(),
    env: { ...process.env, TERM: 'dumb', PS1: '$ ', PS2: '> ' },
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });

  const session = {
    id,
    proc,
    buffer: '',
    listeners: new Set(),
    lastActivity: Date.now(),
    createdAt: Date.now(),
  };
  sessions.set(id, session);

  proc.stdout.on('data', (d) => pushOutput(session, sanitize(d)));
  proc.stderr.on('data', (d) => pushOutput(session, sanitize(d)));
  proc.on('error', (err) => {
    pushOutput(session, `\n[erro ao iniciar shell "${shell}": ${err.message}]\n`);
    destroySession(id);
  });
  proc.on('exit', (code) => {
    broadcast(session, { type: 'exit', code });
    session.listeners.clear();
    sessions.delete(id);
    console.log(`[terminal] session ${id.slice(0, 6)} exited (code ${code})`);
  });

  console.log(`[terminal] session ${id.slice(0, 6)} started (shell: ${shell}, active: ${sessions.size})`);
  return session;
}

function write(id, data) {
  const session = sessions.get(id);
  if (!session) return false;
  session.lastActivity = Date.now();
  try {
    session.proc.stdin.write(data);
    return true;
  } catch (err) {
    console.error(`[terminal] write failed: ${err.message}`);
    return false;
  }
}

function signal(id, sig) {
  const session = sessions.get(id);
  if (!session) return false;
  const allowed = { SIGINT: 'SIGINT', SIGTERM: 'SIGTERM', SIGKILL: 'SIGKILL' };
  killProcess(session, allowed[sig] || 'SIGINT');
  return true;
}

function destroyAll() {
  for (const id of [...sessions.keys()]) destroySession(id);
}

// Idle reaper: kill sessions inactive for TERMINAL_IDLE_TIMEOUT.
const reaper = setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.lastActivity > config.terminalIdleTimeout) {
      console.log(`[terminal] session ${id.slice(0, 6)} killed (idle)`);
      destroySession(id, '\n[sessão encerrada por ociosidade]\n');
    }
  }
}, 30000);
reaper.unref();

module.exports = { createSession, destroySession, destroyAll, write, signal, sessions };

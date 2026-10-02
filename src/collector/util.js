'use strict';

const { execFile } = require('child_process');

// Run a command safely with timeout. Resolves { ok, stdout, stderr, code }.
// Never throws: missing binaries (ENOENT) are reported as ok:false.
function safeExec(cmd, args = [], timeoutMs = 3000) {
  return new Promise((resolve) => {
    try {
      execFile(cmd, args, { timeout: timeoutMs, encoding: 'utf8', windowsHide: true }, (err, stdout, stderr) => {
        if (err) {
          resolve({ ok: false, reason: err.code === 'ENOENT' ? 'command not found' : err.message, stdout: stdout || '', stderr: stderr || '' });
        } else {
          resolve({ ok: true, stdout: stdout || '', stderr: stderr || '' });
        }
      });
    } catch (err) {
      resolve({ ok: false, reason: err.message, stdout: '', stderr: '' });
    }
  });
}

const round = (v, d = 1) => (v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(d)));

const BYTES_PER_GB = 1024 ** 3;
const toGB = (bytes) => (bytes === null || bytes === undefined ? null : round(bytes / BYTES_PER_GB, 2));

module.exports = { safeExec, round, toGB, BYTES_PER_GB };

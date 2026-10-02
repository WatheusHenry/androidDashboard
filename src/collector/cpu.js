'use strict';

const fs = require('fs');
const { round } = require('./util');

// CPU usage from /proc/stat deltas between collections.
let prev = null;
let prevPerCore = [];
let lastLoggedError = null;

function parseCpuLine(line) {
  // cpu  user nice system idle iowait irq softirq steal guest guest_nice
  const parts = line.trim().split(/\s+/).slice(1).map(Number);
  if (parts.length < 4 || parts.some(Number.isNaN)) return null;
  const idle = parts[3] + (parts[4] || 0);
  const total = parts.reduce((a, b) => a + b, 0);
  return { idle, total };
}

function readStat() {
  const raw = fs.readFileSync('/proc/stat', 'utf8');
  const lines = raw.split('\n');
  const agg = parseCpuLine(lines[0]);
  if (!agg) throw new Error('unexpected /proc/stat format');
  const perCore = [];
  for (const line of lines.slice(1)) {
    if (!line.startsWith('cpu')) break;
    const c = parseCpuLine(line);
    if (c) perCore.push(c);
  }
  return { agg, perCore };
}

function deltaPercent(cur, old) {
  const totalDelta = cur.total - old.total;
  const idleDelta = cur.idle - old.idle;
  if (totalDelta <= 0) return null;
  return round(((totalDelta - idleDelta) / totalDelta) * 100, 1);
}

function readLoadAvg() {
  try {
    const parts = fs.readFileSync('/proc/loadavg', 'utf8').trim().split(/\s+/);
    const [l1, l5, l15] = [Number(parts[0]), Number(parts[1]), Number(parts[2])];
    if (Number.isNaN(l1)) return { loadAverage: null, error: 'unexpected /proc/loadavg format' };
    return { loadAverage: { '1m': l1, '5m': l5, '15m': l15 }, error: null };
  } catch (err) {
    return { loadAverage: null, error: `/proc/loadavg: ${err.code || err.message}` };
  }
}

function selinuxHint(err) {
  const denied = err.code === 'EACCES' || err.code === 'EPERM';
  if (!denied) return '';
  return ' (provável bloqueio SELinux: em Android 12+ alguns aparelhos negam leitura de /proc/stat para apps; sem root não há alternativa confiável)';
}

function collectCpu() {
  let usage = null;
  let perCore = null;
  let reason = null;

  try {
    const cur = readStat();
    lastLoggedError = null;
    if (prev) {
      usage = deltaPercent(cur.agg, prev.agg);
      if (cur.perCore.length === prevPerCore.length && cur.perCore.length > 0) {
        perCore = cur.perCore.map((c, i) => deltaPercent(c, prevPerCore[i])).filter((v) => v !== null);
      }
    }
    prev = cur.agg;
    prevPerCore = cur.perCore;
    if (usage === null) reason = 'primeira amostra, aguardando próximo ciclo (5s)';
  } catch (err) {
    reason = `/proc/stat: ${err.code || err.message}${selinuxHint(err)}`;
    if (reason !== lastLoggedError) {
      console.warn(`[collector:cpu] ${reason}`);
      lastLoggedError = reason;
    }
  }

  const load = readLoadAvg();

  return {
    available: usage !== null,
    usagePercent: usage,
    perCoreUsagePercent: perCore,
    cores: require('os').cpus().length,
    loadAverage: load.loadAverage,
    ...(usage === null ? { reason } : {}),
    ...(load.loadAverage === null && load.error ? { loadAverageError: load.error } : {}),
  };
}

module.exports = { collectCpu };

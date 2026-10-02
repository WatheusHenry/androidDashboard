'use strict';

const fs = require('fs');
const { round } = require('./util');

// CPU usage from /proc/stat deltas between collections.
let prev = null;

function readStat() {
  const line = fs.readFileSync('/proc/stat', 'utf8').split('\n')[0];
  // cpu  user nice system idle iowait irq softirq steal ...
  const parts = line.trim().split(/\s+/).slice(1).map(Number);
  if (parts.length < 4 || parts.some(Number.isNaN)) return null;
  const idle = parts[3] + (parts[4] || 0); // idle + iowait
  const total = parts.reduce((a, b) => a + b, 0);
  return { idle, total };
}

function readLoadAvg() {
  try {
    const parts = fs.readFileSync('/proc/loadavg', 'utf8').trim().split(/\s+/);
    return { load1: Number(parts[0]), load5: Number(parts[1]), load15: Number(parts[2]) };
  } catch {
    return { load1: null, load5: null, load15: null };
  }
}

function collectCpu() {
  let usage = null;
  try {
    const cur = readStat();
    if (cur && prev) {
      const totalDelta = cur.total - prev.total;
      const idleDelta = cur.idle - prev.idle;
      if (totalDelta > 0) usage = round(((totalDelta - idleDelta) / totalDelta) * 100, 1);
    }
    if (cur) prev = cur;
  } catch {
    // /proc/stat unavailable (non-Linux dev machine)
  }
  const load = readLoadAvg();
  return {
    available: usage !== null,
    usagePercent: usage,
    cores: require('os').cpus().length,
    loadAverage: load.load1 === null ? null : { '1m': load.load1, '5m': load.load5, '15m': load.load15 },
    ...(usage === null ? { reason: '/proc/stat unavailable' } : {}),
  };
}

module.exports = { collectCpu };

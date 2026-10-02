'use strict';

const fs = require('fs');
const os = require('os');
const { round } = require('./util');

// CPU metrics with graceful degradation:
// 1. /proc/stat deltas (accurate usage) — blocked by SELinux on many Android 12+ devices
// 2. /proc/loadavg -> usage estimate (load1/cores) + load numbers
// 3. /proc/pressure/cpu (PSI) and sysfs cpufreq as activity indicators

let prev = null;
let prevPerCore = [];
let lastLoggedError = null;
let statBlocked = false;
let blockedCycles = 0;
const STAT_RETRY_CYCLES = 60; // retry /proc/stat every ~5min when blocked

function parseCpuLine(line) {
  const parts = line.trim().split(/\s+/).slice(1).map(Number);
  if (parts.length < 4 || parts.some(Number.isNaN)) return null;
  const idle = parts[3] + (parts[4] || 0);
  const total = parts.reduce((a, b) => a + b, 0);
  return { idle, total };
}

function readStat() {
  const lines = fs.readFileSync('/proc/stat', 'utf8').split('\n');
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
  if (totalDelta <= 0) return null;
  return round(((totalDelta - (cur.idle - old.idle)) / totalDelta) * 100, 1);
}

function readLoadAvg() {
  try {
    const parts = fs.readFileSync('/proc/loadavg', 'utf8').trim().split(/\s+/);
    const [l1, l5, l15] = [Number(parts[0]), Number(parts[1]), Number(parts[2])];
    if (Number.isNaN(l1)) return null;
    return { '1m': l1, '5m': l5, '15m': l15 };
  } catch {
    return null;
  }
}

function readPsi() {
  try {
    const raw = fs.readFileSync('/proc/pressure/cpu', 'utf8');
    const parse = (kind) => {
      const m = raw.match(new RegExp(`^${kind} avg10=([\\d.]+) avg60=([\\d.]+) avg300=([\\d.]+)`, 'm'));
      return m ? { avg10: Number(m[1]), avg60: Number(m[2]), avg300: Number(m[3]) } : null;
    };
    const some = parse('some');
    if (!some) return null;
    return { some, full: parse('full') };
  } catch {
    return null;
  }
}

function readFreqs(cores) {
  const freqs = [];
  for (let i = 0; i < cores && i < 16; i++) {
    try {
      const khz = Number(fs.readFileSync(`/sys/devices/system/cpu/cpu${i}/cpufreq/scaling_cur_freq`, 'utf8').trim());
      if (Number.isFinite(khz) && khz > 0) freqs.push(Math.round(khz / 1000));
    } catch {
      break; // sysfs cpufreq not readable; stop probing
    }
  }
  return freqs.length ? freqs : null;
}

let freqRangeCache;
function readFreqRange(cores) {
  if (freqRangeCache !== undefined) return freqRangeCache;
  const min = [];
  const max = [];
  for (let i = 0; i < (cores || 8) && i < 16; i++) {
    try {
      min.push(Math.round(Number(fs.readFileSync(`/sys/devices/system/cpu/cpu${i}/cpufreq/cpuinfo_min_freq`, 'utf8')) / 1000));
      max.push(Math.round(Number(fs.readFileSync(`/sys/devices/system/cpu/cpu${i}/cpufreq/cpuinfo_max_freq`, 'utf8')) / 1000));
    } catch {
      break;
    }
  }
  freqRangeCache = min.length ? { min, max } : null;
  return freqRangeCache;
}

// cpuidle sysfs: cumulative microseconds per idle state per core.
// busy% = (wallDelta - idleDelta) / wallDelta. Works on devices where
// /proc/stat is SELinux-blocked but /sys cpufreq/cpuidle is readable.
let prevIdle = null;

function monotonicUs() {
  return Number(process.hrtime.bigint() / 1000n);
}

function readCpuidle() {
  const perCore = [];
  for (let i = 0; i < 16; i++) {
    const base = `/sys/devices/system/cpu/cpu${i}/cpuidle`;
    let states;
    try {
      states = fs.readdirSync(base).filter((d) => d.startsWith('state'));
    } catch {
      break;
    }
    if (!states.length) break;
    let sum = 0;
    let ok = false;
    for (const st of states) {
      try {
        const t = Number(fs.readFileSync(`${base}/${st}/time`, 'utf8'));
        if (Number.isFinite(t)) { sum += t; ok = true; }
      } catch { /* state not readable */ }
    }
    if (!ok) break;
    perCore.push(sum);
  }
  return perCore.length ? perCore : null;
}

function cpuidleUsage(cores) {
  const idleNow = readCpuidle();
  if (!idleNow) return null;
  const now = monotonicUs();
  let result = null;
  if (prevIdle && prevIdle.perCore.length === idleNow.length) {
    const wallDelta = now - prevIdle.wall;
    if (wallDelta > 0) {
      const usages = idleNow
        .map((v, i) => {
          const idleDelta = v - prevIdle.perCore[i];
          if (idleDelta < 0 || idleDelta > wallDelta * 1.05) return null;
          return round(Math.max(0, Math.min(100, ((wallDelta - idleDelta) / wallDelta) * 100)), 1);
        })
        .filter((v) => v !== null);
      if (usages.length === idleNow.length && usages.length > 0) {
        result = {
          usage: round(usages.reduce((a, b) => a + b, 0) / usages.length, 1),
          perCore: usages,
        };
      }
    }
  }
  prevIdle = { perCore: idleNow, wall: now };
  return result;
}

function getCores() {
  const n = os.cpus().length;
  if (n > 0) return n;
  try {
    return (fs.readFileSync('/proc/cpuinfo', 'utf8').match(/^processor\s*:/gm) || []).length || null;
  } catch {
    return null;
  }
}

function collectCpu() {
  const cores = getCores();
  let usage = null;
  let perCore = null;
  let source = null;
  let reason = null;

  if (!statBlocked) {
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
      if (usage !== null) source = 'proc.stat';
      else reason = 'primeira amostra, aguardando próximo ciclo (5s)';
    } catch (err) {
      statBlocked = err.code === 'EACCES' || err.code === 'EPERM';
      const msg = `/proc/stat: ${err.code || err.message}${statBlocked ? ' (SELinux bloqueia leitura para apps; usando fallbacks)' : ''}`;
      if (msg !== lastLoggedError) {
        console.warn(`[collector:cpu] ${msg}`);
        lastLoggedError = msg;
      }
      reason = msg;
    }
  } else {
    reason = 'SELinux: /proc/stat bloqueado neste aparelho';
    if (++blockedCycles >= STAT_RETRY_CYCLES) {
      statBlocked = false;
      blockedCycles = 0;
    }
  }

  const loadAverage = readLoadAvg();
  const needFallback = usage === null;
  const pressure = needFallback ? readPsi() : null;
  const freqsMHz = needFallback ? readFreqs(cores || 8) : null;
  const freqRange = needFallback && freqsMHz ? readFreqRange(cores) : null;

  if (needFallback) {
    const idle = cpuidleUsage(cores);
    if (idle) {
      usage = idle.usage;
      perCore = idle.perCore;
      source = 'cpuidle-sysfs';
    }
  }

  let estimated = null;
  if (usage === null && loadAverage && cores) {
    estimated = round(Math.min((loadAverage['1m'] / cores) * 100, 100), 1);
    source = 'loadavg-estimate';
  }

  const out = {
    available: usage !== null || estimated !== null || loadAverage !== null,
    usagePercent: usage,
    usageSource: source,
    perCoreUsagePercent: perCore,
    cores,
    loadAverage,
    ...(usage === null && estimated !== null ? { usageEstimatePercent: estimated } : {}),
    ...(pressure ? { pressure } : {}),
    ...(freqsMHz ? { freqsMHz } : {}),
    ...(freqRange ? { freqRangeMHz: freqRange } : {}),
    ...(usage === null && estimated === null ? { reason } : {}),
  };
  if (!out.available) out.reason = reason;
  return out;
}

module.exports = { collectCpu };

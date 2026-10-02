'use strict';

const fs = require('fs');
const os = require('os');
const { safeExec } = require('./util');

// Static-ish device info. Collected once, then cached (values never change
// at runtime); uptime is refreshed on every collect.

let cached = null;

async function getProp(name) {
  const res = await safeExec('getprop', [name], 2000);
  if (res.ok) {
    const v = res.stdout.trim();
    if (v) return v;
  }
  return null;
}

async function getPropFromBuildProp(name) {
  try {
    const raw = fs.readFileSync('/system/build.prop', 'utf8');
    const m = raw.match(new RegExp(`^${name.replace('.', '\\.')}=(.*)$`, 'm'));
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

async function prop(name) {
  return (await getProp(name)) || (await getPropFromBuildProp(name));
}

function readUptimeSec() {
  try {
    return Number(fs.readFileSync('/proc/uptime', 'utf8').split(/\s+/)[0]);
  } catch {
    // Fallback: Node's own os.uptime() (works on any OS)
    try { return os.uptime(); } catch { return null; }
  }
}

function formatUptime(sec) {
  if (sec === null || !Number.isFinite(sec)) return null;
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

async function collectSystem() {
  if (!cached) {
    const [model, manufacturer, brand, androidVersion, sdk, kernel] = await Promise.all([
      prop('ro.product.model'),
      prop('ro.product.manufacturer'),
      prop('ro.product.brand'),
      prop('ro.build.version.release'),
      prop('ro.build.version.sdk'),
      Promise.resolve(os.release()),
    ]);
    cached = {
      model: model || os.hostname(),
      manufacturer,
      brand,
      androidVersion,
      sdkLevel: sdk ? Number(sdk) : null,
      kernelVersion: kernel || null,
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      cpuCores: os.cpus().length,
      isTermux: process.env.PREFIX ? process.env.PREFIX.includes('com.termux') : false,
    };
  }

  const uptimeSec = readUptimeSec();
  return {
    available: true,
    ...cached,
    uptimeSec: uptimeSec === null ? null : Math.round(uptimeSec),
    uptime: formatUptime(uptimeSec),
  };
}

module.exports = { collectSystem };

'use strict';

const fs = require('fs');
const config = require('../config');
const { round, toGB } = require('./util');

// Storage via statfs(2) using Node's fs.statfsSync (no `df` dependency).
// Primary target is /data (Termux useful space). Other mounts are
// reported separately when readable, never mixed with /data numbers.
const EXTRA_MOUNTS = ['/', '/storage/emulated', '/product', '/vendor'];

function statfs(path) {
  try {
    const s = fs.statfsSync(path);
    const total = s.blocks * s.bsize;
    const available = s.bavail * s.bsize;
    const used = total - s.bfree * s.bsize;
    if (total <= 0) return null;
    return {
      path,
      totalBytes: total,
      usedBytes: used,
      availableBytes: available,
      usagePercent: round((used / total) * 100, 1),
      totalGB: toGB(total),
      usedGB: toGB(used),
      availableGB: toGB(available),
    };
  } catch {
    return null;
  }
}

function collectStorage() {
  const primary = statfs(config.storagePath);
  const mounts = {};
  for (const m of EXTRA_MOUNTS) {
    const s = statfs(m);
    if (s) mounts[m] = s;
  }

  if (!primary) {
    return { available: false, reason: `statfs failed for ${config.storagePath}`, mounts };
  }

  return { available: true, primary, mounts };
}

module.exports = { collectStorage };

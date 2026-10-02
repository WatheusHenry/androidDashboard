'use strict';

const fs = require('fs');
const { round, toGB } = require('./util');

// Memory from /proc/meminfo (kB values).
function collectMemory() {
  try {
    const raw = fs.readFileSync('/proc/meminfo', 'utf8');
    const get = (key) => {
      const m = raw.match(new RegExp(`^${key}:\\s+(\\d+) kB`, 'm'));
      return m ? Number(m[1]) * 1024 : null;
    };

    const total = get('MemTotal');
    const available = get('MemAvailable');
    const swapTotal = get('SwapTotal');
    const swapFree = get('SwapFree');

    if (total === null) return { available: false, reason: '/proc/meminfo incomplete' };

    const used = available !== null ? total - available : null;
    const swapUsed = swapTotal !== null && swapFree !== null ? swapTotal - swapFree : null;

    return {
      available: true,
      totalBytes: total,
      usedBytes: used,
      availableBytes: available,
      usagePercent: used !== null ? round((used / total) * 100, 1) : null,
      totalGB: toGB(total),
      usedGB: toGB(used),
      availableGB: toGB(available),
      swapTotalBytes: swapTotal,
      swapUsedBytes: swapUsed,
      swapTotalGB: toGB(swapTotal),
      swapUsedGB: toGB(swapUsed),
      swapUsagePercent: swapTotal ? round((swapUsed / swapTotal) * 100, 1) : null,
    };
  } catch (err) {
    return { available: false, reason: `/proc/meminfo unavailable: ${err.message}` };
  }
}

module.exports = { collectMemory };

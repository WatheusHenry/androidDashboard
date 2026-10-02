'use strict';

const { safeExec, round } = require('./util');

// Battery via termux-battery-status (Termux:API). Fully optional:
// if the app/package is missing we report unavailable and move on.
let apiMissingLogged = false;

// termux-battery-status talks to the Termux:API app via Android broadcast,
// which is relatively slow. Cache results for 10s to avoid hammering it.
const BATTERY_TTL_MS = 10000;
const BATTERY_FAIL_TTL_MS = 60000;
let batteryCache = { at: 0, value: null };

function normalizeStatus(s) {
  if (!s) return null;
  return s.toLowerCase().replace(/[\s-]/g, '');
}

async function readBattery() {
  const res = await safeExec('termux-battery-status', [], 5000);
  if (!res.ok) {
    if (!apiMissingLogged) {
      console.warn(`[collector:battery] termux-battery-status unavailable (${res.reason}). Install Termux:API app + 'pkg install termux-api' for battery metrics.`);
      apiMissingLogged = true;
    }
    return { available: false, reason: `termux-battery-status unavailable: ${res.reason}` };
  }

  try {
    const raw = JSON.parse(res.stdout);
    const percentage = typeof raw.percentage === 'number' ? Math.round(raw.percentage) : null;
    const temperature = typeof raw.temperature === 'number' ? round(raw.temperature, 1) : null;
    const status = normalizeStatus(raw.status); // charging | discharging | full | notcharging
    const plugged = raw.plugged ? String(raw.plugged).toLowerCase() : null; // ac | usb | wireless
    const health = normalizeStatus(raw.health); // good | overheat | dead | ...

    return {
      available: true,
      percentage,
      status,
      charging: status === 'charging' || status === 'full',
      temperatureC: temperature,
      health,
      powerSource: plugged,
      present: raw.present !== false,
    };
  } catch (err) {
    return { available: false, reason: `invalid termux-battery-status output: ${err.message}` };
  }
}

async function collectBattery() {
  if (batteryCache.value) {
    const ttl = batteryCache.value.available ? BATTERY_TTL_MS : BATTERY_FAIL_TTL_MS;
    if (Date.now() - batteryCache.at < ttl) return batteryCache.value;
  }
  const value = await readBattery();
  batteryCache = { at: Date.now(), value };
  return value;
}

module.exports = { collectBattery };

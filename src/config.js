'use strict';

const fs = require('fs');
const path = require('path');

// Minimal .env loader (no dotenv dependency). Real env vars take precedence.
function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env');
  try {
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      let val = trimmed.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch (err) {
    console.warn(`[config] could not read .env: ${err.message}`);
  }
}

loadEnvFile();

const num = (v, def) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : def;
};

const ROOT = path.join(__dirname, '..');

const config = {
  root: ROOT,
  port: num(process.env.PORT, 8080),
  host: process.env.HOST || '0.0.0.0',
  collectInterval: num(process.env.COLLECT_INTERVAL, 5000),
  historyInterval: num(process.env.HISTORY_INTERVAL, 60000),
  databasePath: process.env.DATABASE_PATH
    ? path.resolve(ROOT, process.env.DATABASE_PATH)
    : path.join(ROOT, 'data', 'monitor.db'),
  historyRetentionDays: num(process.env.HISTORY_RETENTION_DAYS, 7),
  storagePath: process.env.STORAGE_PATH || '/data',
  mock: process.env.MOCK_DATA === '1' || process.argv.includes('--mock'),
};

module.exports = config;

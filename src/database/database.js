'use strict';

const fs = require('fs');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  cpu_usage REAL,
  cpu_estimated INTEGER DEFAULT 0,
  load1 REAL,
  ram_total_bytes INTEGER,
  ram_used_bytes INTEGER,
  ram_available_bytes INTEGER,
  ram_percent REAL,
  swap_used_bytes INTEGER,
  storage_used_bytes INTEGER,
  storage_percent REAL,
  battery_percent INTEGER,
  battery_temp REAL
);
CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp);
`;
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

module.exports = function initDatabase(config) {
  let DatabaseSync;
  try {
    ({ DatabaseSync } = require('node:sqlite'));
  } catch (err) {
    throw new Error(`node:sqlite unavailable (need Node >= 22.5): ${err.message}`);
  }

  fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
  const db = new DatabaseSync(config.databasePath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  try {
    db.exec('ALTER TABLE metrics ADD COLUMN cpu_estimated INTEGER DEFAULT 0;');
    console.log('[history] migrated: added cpu_estimated column');
  } catch {
    // column already exists
  }

  const insert = db.prepare(`
    INSERT INTO metrics (timestamp, cpu_usage, cpu_estimated, load1, ram_total_bytes, ram_used_bytes,
      ram_available_bytes, ram_percent, swap_used_bytes, storage_used_bytes,
      storage_percent, battery_percent, battery_temp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const selectRange = db.prepare('SELECT * FROM metrics WHERE timestamp >= ? ORDER BY timestamp ASC');
  const deleteOld = db.prepare('DELETE FROM metrics WHERE timestamp < ?');
  const countRows = db.prepare('SELECT COUNT(*) AS n FROM metrics');

  return {
    saveSnapshot(state) {
      const cpu = state.cpu || {};
      const mem = state.memory || {};
      const sto = (state.storage && state.storage.primary) || {};
      const bat = state.battery || {};
      const cpuValue = num(cpu.usagePercent) ?? num(cpu.usageEstimatePercent);
      const cpuEstimated = num(cpu.usagePercent) === null && cpuValue !== null ? 1 : 0;
      insert.run(
        Date.now(),
        cpuValue,
        cpuEstimated,
        num(cpu.loadAverage && cpu.loadAverage['1m']),
        num(mem.totalBytes),
        num(mem.usedBytes),
        num(mem.availableBytes),
        num(mem.usagePercent),
        num(mem.swapUsedBytes),
        num(sto.usedBytes),
        num(sto.usagePercent),
        num(bat.percentage),
        num(bat.temperatureC)
      );
    },

    getHistory(hours) {
      const since = Date.now() - hours * 3600 * 1000;
      return selectRange.all(since);
    },

    cleanup() {
      const cutoff = Date.now() - config.historyRetentionDays * 24 * 3600 * 1000;
      const res = deleteOld.run(cutoff);
      const { n } = countRows.get();
      console.log(`[history] retention cleanup done, rows kept: ${n}`);
      return res;
    },

    close() {
      try { db.close(); } catch { /* already closed */ }
    },
  };
};

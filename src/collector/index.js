'use strict';

// In-memory current state + periodic collector orchestration.
// Every collector is isolated: a failure in one never affects the others.

const config = require('../config');
const { collectSystem } = require('./system');
const { collectCpu } = require('./cpu');
const { collectMemory } = require('./memory');
const { collectStorage } = require('./storage');
const { collectBattery } = require('./battery');
const { collectNetwork } = require('./network');
const mock = require('./mock');

const collectors = config.mock
  ? {
      system: mock.mockSystem,
      cpu: mock.mockCpu,
      memory: mock.mockMemory,
      storage: mock.mockStorage,
      battery: mock.mockBattery,
      network: mock.mockNetwork,
    }
  : {
      system: collectSystem,
      cpu: collectCpu,
      memory: collectMemory,
      storage: collectStorage,
      battery: collectBattery,
      network: collectNetwork,
    };

function createState() {
  return {
    mock: config.mock,
    db: null,
    lastCollectAt: null,
    system: null,
    cpu: null,
    memory: null,
    storage: null,
    battery: null,
    network: null,
  };
}

async function runCollector(name, state) {
  try {
    state[name] = await collectors[name]();
  } catch (err) {
    console.error(`[collector:${name}] failed, metric set unavailable: ${err.message}`);
    state[name] = { available: false, reason: err.message };
  }
}

async function collectAll(state) {
  await Promise.all(Object.keys(collectors).map((name) => runCollector(name, state)));
  state.lastCollectAt = Date.now();
}

let collectTimer = null;
let historyTimer = null;

function startCollector(state, cfg, db) {
  collectAll(state).catch((err) => console.error(`[collector] ${err.message}`));
  collectTimer = setInterval(() => {
    collectAll(state).catch((err) => console.error(`[collector] ${err.message}`));
  }, cfg.collectInterval);

  if (db) {
    historyTimer = setInterval(() => {
      try {
        db.saveSnapshot(state);
      } catch (err) {
        console.error(`[history] save failed: ${err.message}`);
      }
    }, cfg.historyInterval);
    try {
      db.cleanup();
    } catch (err) {
      console.error(`[history] cleanup failed: ${err.message}`);
    }
  }
}

function stopCollector() {
  if (collectTimer) clearInterval(collectTimer);
  if (historyTimer) clearInterval(historyTimer);
}

module.exports = { createState, collectAll, startCollector, stopCollector };

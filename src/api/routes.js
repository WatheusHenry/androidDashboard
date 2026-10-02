'use strict';

const express = require('express');

module.exports = function routes(state) {
  const router = express.Router();

  const startedAt = Date.now();

  const snapshot = () => ({
    timestamp: new Date().toISOString(),
    serverUptimeSec: Math.round((Date.now() - startedAt) / 1000),
    lastCollectAt: state.lastCollectAt ? new Date(state.lastCollectAt).toISOString() : null,
    mock: state.mock === true,
    history: state.db ? 'enabled' : 'disabled',
    system: state.system,
    cpu: state.cpu,
    memory: state.memory,
    storage: state.storage,
    battery: state.battery,
    network: state.network,
  });

  router.get('/status', (req, res) => res.json(snapshot()));
  router.get('/system', (req, res) => res.json(state.system));
  router.get('/cpu', (req, res) => res.json(state.cpu));
  router.get('/memory', (req, res) => res.json(state.memory));
  router.get('/storage', (req, res) => res.json(state.storage));
  router.get('/battery', (req, res) => res.json(state.battery));
  router.get('/network', (req, res) => res.json(state.network));

  router.get('/history', (req, res) => {
    if (!state.db) {
      return res.json({ available: false, reason: 'history disabled', rows: [] });
    }
    const hours = Math.min(Math.max(Number(req.query.hours) || 3, 0.1), 24 * 7);
    try {
      const rows = state.db.getHistory(hours);
      res.json({ available: true, hours, count: rows.length, rows });
    } catch (err) {
      console.error(`[api] history query failed: ${err.message}`);
      res.status(500).json({ available: false, reason: err.message, rows: [] });
    }
  });

  router.use((req, res) => res.status(404).json({ error: 'not found' }));

  return router;
};

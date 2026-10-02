'use strict';

const express = require('express');
const config = require('../config');
const terminal = require('../terminal');

module.exports = function terminalRoutes() {
  const router = express.Router();
  router.use(express.json({ limit: '64kb' }));

  const auth = (req, res, next) => {
    if (!config.terminalEnabled) {
      return res.status(403).json({ error: 'terminal disabled (TERMINAL_ENABLED=0)' });
    }
    if (!config.terminalToken) return next();
    const token = req.get('x-terminal-token') || req.query.token || (req.body && req.body.token);
    if (token !== config.terminalToken) {
      return res.status(401).json({ error: 'invalid or missing token' });
    }
    next();
  };

  router.post('/start', auth, (req, res) => {
    try {
      const session = terminal.createSession();
      res.json({ sessionId: session.id, idleTimeoutMs: config.terminalIdleTimeout });
    } catch (err) {
      console.error(`[terminal] start failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/stream/:id', auth, (req, res) => {
    const session = terminal.sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: 'session not found or expired' });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = (msg) => res.write(`data: ${JSON.stringify(msg)}\n\n`);
    if (session.buffer) send({ type: 'output', data: session.buffer });

    session.listeners.add(send);
    const heartbeat = setInterval(() => res.write(': hb\n\n'), 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      session.listeners.delete(send);
    });
  });

  router.post('/input/:id', auth, (req, res) => {
    const data = req.body && req.body.data;
    if (typeof data !== 'string' || data.length > 8192) {
      return res.status(400).json({ error: 'invalid input' });
    }
    const ok = terminal.write(req.params.id, data);
    if (!ok) return res.status(404).json({ error: 'session not found or expired' });
    res.json({ ok: true });
  });

  router.post('/signal/:id', auth, (req, res) => {
    const sig = (req.body && req.body.signal) || 'SIGINT';
    const ok = terminal.signal(req.params.id, sig);
    if (!ok) return res.status(404).json({ error: 'session not found or expired' });
    res.json({ ok: true, signal: sig });
  });

  router.post('/stop/:id', auth, (req, res) => {
    terminal.destroySession(req.params.id);
    res.json({ ok: true });
  });

  return router;
};

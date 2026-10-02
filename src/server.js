'use strict';

const config = require('./config');
const { createState, startCollector, stopCollector } = require('./collector');

function buildApp(state) {
  const express = require('express');
  const path = require('path');
  const app = express();

  app.disable('x-powered-by');
  app.use(express.static(path.join(config.root, 'public')));
  app.use('/api', require('./api/routes')(state));

  return app;
}

function main() {
  const state = createState();

  let db = null;
  try {
    db = require('./database/database')(config);
  } catch (err) {
    console.error(`[server] history disabled: ${err.message}`);
  }
  state.db = db;

  const app = buildApp(state);

  const server = app.listen(config.port, config.host, () => {
    console.log(`[server] android-monitor on http://${config.host}:${config.port}`);
    console.log(`[server] mock=${config.mock} collect=${config.collectInterval}ms history=${config.historyInterval}ms db=${db ? config.databasePath : 'disabled'}`);
  });

  startCollector(state, config, db);

  const shutdown = (sig) => {
    console.log(`[server] ${sig} received, shutting down`);
    stopCollector();
    server.close(() => {
      if (db) db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('uncaughtException', (err) => {
    console.error(`[server] uncaughtException (continuing): ${err.stack || err.message}`);
  });
}

main();

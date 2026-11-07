'use strict';
const config = require('./config');
const { migrate } = require('./migrate');
const { createApp } = require('./app');

(async () => {
  await migrate();
  createApp().listen(config.port, '127.0.0.1', () => console.log(`[ventureos] on ${config.port}`));
})().catch((e) => { console.error(e); process.exit(1); });

'use strict';
const config = require('./config');
const { migrate } = require('./migrate');
const { createApp } = require('./app');

(async () => {
  await migrate();
  createApp().listen(config.port, '127.0.0.1', () => console.log(`[ventureos] on ${config.port}`));
  // Meeting reminders the day before, checked every 15 minutes.
  const remind = () => require('./domain/portal').sendReminders().catch((e) => console.error('[reminders]', e.message));
  setTimeout(remind, 20e3);
  setInterval(remind, 15 * 60e3).unref();
})().catch((e) => { console.error(e); process.exit(1); });

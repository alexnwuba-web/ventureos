'use strict';
/* Applies migrations/*.sql in order, once each. */
const fs = require('fs');
const path = require('path');
const { getPool } = require('./db');

async function migrate({ log = console.log } = {}) {
  const c = await getPool().connect();
  try {
    await c.query('CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY, at timestamptz NOT NULL DEFAULT now())');
    const done = new Set((await c.query('SELECT name FROM _migrations')).rows.map((r) => r.name));
    const dir = path.join(__dirname, '..', 'migrations');
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
      if (done.has(f)) continue;
      await c.query('BEGIN');
      try {
        await c.query(fs.readFileSync(path.join(dir, f), 'utf8'));
        await c.query('INSERT INTO _migrations (name) VALUES ($1)', [f]);
        await c.query('COMMIT');
        log(`[migrate] ${f}`);
      } catch (e) { await c.query('ROLLBACK'); throw new Error(`${f}: ${e.message}`); }
    }
  } finally { c.release(); }
}

module.exports = { migrate };
if (require.main === module) migrate().then(() => require('./db').end()).catch((e) => { console.error(e); process.exit(1); });

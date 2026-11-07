'use strict';
const { Pool, types } = require('pg');
const config = require('./config');

types.setTypeParser(20, (v) => (v === null ? null : Number(v)));   // int8
types.setTypeParser(1700, (v) => (v === null ? null : Number(v))); // numeric
types.setTypeParser(1082, (v) => v);                                // date stays YYYY-MM-DD

let pool = null;
function getPool() {
  if (!pool) {
    pool = new Pool({ connectionString: config.databaseUrl, max: config.poolMax, ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined, options: '-c timezone=UTC' });
    // Times are stored as timestamptz, so the session time zone does not change any stored value.
    pool.on('error', (e) => console.error('[ventureos] idle client error:', e.message));
  }
  return pool;
}

const query = (t, p) => getPool().query(t, p);
const one = async (t, p) => (await query(t, p)).rows[0] || null;
const many = async (t, p) => (await query(t, p)).rows;

/** Runs fn(q) in one transaction; q has query/one/many. */
async function tx(fn) {
  const c = await getPool().connect();
  const q = { query: (t, p) => c.query(t, p), one: async (t, p) => (await c.query(t, p)).rows[0] || null, many: async (t, p) => (await c.query(t, p)).rows };
  try {
    await c.query('BEGIN');
    const r = await fn(q);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { c.release(); }
}

async function end() { if (pool) { const p = pool; pool = null; await p.end(); } }

const db = { query, one, many, tx };
module.exports = { db, end, getPool };

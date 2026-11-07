'use strict';
const { db } = require('../db');

/** Records who did what. Never throws: an audit failure must not break the action, but it is logged. */
async function audit(actorId, applicationId, action, detail = null, q = db) {
  try {
    await q.query('INSERT INTO audit (actor_id, application_id, action, detail) VALUES ($1,$2,$3,$4)', [actorId || null, applicationId || null, action, detail]);
  } catch (e) { console.error('[audit]', e.message); }
}

module.exports = { audit };

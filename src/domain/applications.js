'use strict';
/* Applications: create, read, save answers from a form, check what is missing, submit, move through the workflow. */
const { db } = require('../db');
const Q = require('./questions');
const D = require('./documents');
const W = require('./workflow');
const { audit } = require('../lib/audit');

const KIND_KEYS = Object.keys(Q.KINDS);
const cleanKinds = (k) => [...new Set((Array.isArray(k) ? k : [k]).filter((x) => KIND_KEYS.includes(x)))];
const err = (status, message) => Object.assign(new Error(message), { status });

async function create(person, { kinds, ventureName }) {
  const ks = cleanKinds(kinds);
  if (!ks.length) throw err(400, 'Choose at least one thing you are applying for.');
  const name = String(ventureName || '').trim().slice(0, 160);
  if (!name) throw err(400, 'Give your venture a name (a working name is fine).');
  return db.tx(async (q) => {
    const v = await q.one('INSERT INTO ventures (owner_id, name) VALUES ($1,$2) RETURNING *', [person.id, name]);
    const n = await q.one(`SELECT nextval('application_seq') AS n`);
    const ref = `VOS-${String(new Date().getUTCFullYear()).slice(2)}-${String(n.n).padStart(4, '0')}`;
    const a = await q.one('INSERT INTO applications (ref, venture_id, applicant_id, kinds) VALUES ($1,$2,$3,$4) RETURNING *', [ref, v.id, person.id, ks]);
    await q.query(`INSERT INTO answers (application_id, key, value) VALUES ($1, 'venture_name', $2)`, [a.id, JSON.stringify(name)]);
    await audit(person.id, a.id, 'created', { kinds: ks }, q);
    return a;
  });
}

async function byRef(ref) {
  return db.one(`SELECT a.*, v.name AS venture_name, v.pillar, v.owner_id, p.email AS applicant_email, p.name AS applicant_name, p.phone AS applicant_phone,
      c.name AS cohort_name
    FROM applications a JOIN ventures v ON v.id = a.venture_id JOIN people p ON p.id = a.applicant_id LEFT JOIN cohorts c ON c.id = a.cohort_id
    WHERE a.ref = $1`, [String(ref || '').toUpperCase()]);
}

async function answersOf(appId) {
  const out = {};
  for (const r of await db.many('SELECT key, value FROM answers WHERE application_id = $1', [appId])) out[r.key] = r.value;
  return out;
}

const numeric = (v) => {
  const s = String(v ?? '').replace(/[,\s₦$€£%]/g, '');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : String(v).trim().slice(0, 60);
};
const text = (v, max = 6000) => String(v ?? '').trim().slice(0, max);

/** Turns one posted value into what is stored for that field. */
function parseValue(f, raw) {
  switch (f.type) {
    case 'check': return raw === 'on' || raw === 'yes' || raw === true || raw === 'true';
    case 'number': case 'money': case 'percent': return numeric(raw);
    case 'multiselect': {
      const list = (Array.isArray(raw) ? raw : raw ? [raw] : []).map((x) => text(x, 200));
      const allowed = new Set(f.options.map((o) => (typeof o === 'string' ? o : o.value)));
      return list.filter((x) => allowed.has(x));
    }
    case 'select': case 'yesno': {
      const v = text(raw, 200);
      if (!v) return '';
      const allowed = f.type === 'yesno' ? ['yes', 'no'] : f.options.map((o) => (typeof o === 'string' ? o : o.value));
      return allowed.includes(v) ? v : '';
    }
    case 'table': {
      const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? Object.keys(raw).sort((a, b) => a - b).map((k) => raw[k]) : [];
      const rows = list.slice(0, 30).map((r, i) => {
        const row = {};
        for (const c of f.columns) row[c.key] = ['money', 'number', 'percent'].includes(c.type) ? numeric(r && r[c.key]) : text(r && r[c.key], 500);
        if (f.fixedRows) row.label = f.fixedRows[i];
        return row;
      });
      return f.fixedRows ? rows : rows.filter((r) => f.columns.some((c) => r[c.key] !== '' && r[c.key] !== null));
    }
    case 'url': { const v = text(raw, 500); return v && !/^https?:\/\//i.test(v) ? `https://${v}` : v; }
    default: return text(raw, f.max || 6000);
  }
}

/** Saves the fields of one section from a posted form (body.a). */
async function saveSection(app, sectionKey, body, actorId) {
  if (!W.editable(app.status)) throw err(409, 'This application has been sent and can no longer be changed.');
  const section = Q.sectionsFor(app.kinds).find((s) => s.key === sectionKey);
  if (!section) throw err(404, 'That part of the application does not exist.');
  const posted = (body && body.a) || {};
  await db.tx(async (q) => {
    for (const f of section.fields) {
      const v = parseValue(f, posted[f.key]);
      await q.query(`INSERT INTO answers (application_id, key, value, updated_at) VALUES ($1,$2,$3, now())
        ON CONFLICT (application_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [app.id, f.key, JSON.stringify(v)]);
    }
    // Keep the venture's headline facts in step.
    if (section.key === 'venture') {
      const pillar = ['make', 'grow', 'create'].includes(posted.pillar) ? posted.pillar : null;
      await q.query('UPDATE ventures SET name = COALESCE(NULLIF($2, \'\'), name), pillar = $3, country = $4, updated_at = now() WHERE id = $1',
        [app.venture_id, text(posted.venture_name, 160), pillar, text(posted.hq_country, 80) || null]);
    }
    await q.query('UPDATE applications SET updated_at = now() WHERE id = $1', [app.id]);
  });
  await audit(actorId, app.id, 'answers.saved', { section: sectionKey });
}

async function documentsOf(appId) {
  return db.many(`SELECT d.*, p.email AS uploader FROM documents d LEFT JOIN people p ON p.id = d.uploaded_by
    WHERE d.application_id = $1 AND NOT d.removed ORDER BY d.created_at`, [appId]);
}

/** Everything needed before sending: [] when ready. */
async function readiness(app, answers, docs) {
  const missing = Q.missing(app.kinds, answers);
  const docsMissing = D.missingDocs(app.kinds, answers, docs);
  let total = 0, done = 0;
  for (const s of Q.sectionsFor(app.kinds)) for (const f of s.fields) {
    if (Q.isRequired(f, s, app.kinds, answers)) { total++; if (Q.filled(f, answers[f.key])) done++; }
  }
  const reqDocs = D.docsFor(app.kinds, answers).filter((d) => d.isRequired).length;
  total += reqDocs; done += reqDocs - docsMissing.length;
  return { missing, docsMissing, ready: !missing.length && !docsMissing.length, percent: total ? Math.round((done / total) * 100) : 100 };
}

async function submit(app, person) {
  if (!W.editable(app.status)) throw err(409, 'This application has already been sent.');
  const answers = await answersOf(app.id);
  const r = await readiness(app, answers, await documentsOf(app.id));
  if (!r.ready) throw err(400, 'Some required answers or documents are still missing.');
  const to = app.status === 'info_requested' ? 'screening' : 'submitted';
  await db.query(`UPDATE applications SET status = $2, submitted_at = COALESCE(submitted_at, now()), updated_at = now() WHERE id = $1`, [app.id, to]);
  await audit(person.id, app.id, app.status === 'info_requested' ? 'resubmitted' : 'submitted', { from: app.status, to });
  return to;
}

async function move(app, to, actor, note) {
  if (!W.STATUSES[to]) throw err(400, 'Unknown status.');
  if (!W.canMove(app.status, to)) throw err(409, `An application that is ${W.STATUSES[app.status].label.toLowerCase()} cannot move to ${W.STATUSES[to].label.toLowerCase()}.`);
  if (W.isDecision(to) && !['admin', 'committee'].includes(actor.staff_role)) throw err(403, 'Decisions are recorded by the committee or an administrator.');
  if (!W.isDecision(to) && actor.staff_role !== 'admin') throw err(403, 'Only an administrator moves applications between stages.');
  await db.query(`UPDATE applications SET status = $2, updated_at = now(), decided_at = CASE WHEN $3 THEN now() ELSE decided_at END,
    decision_note = CASE WHEN $3 THEN $4 ELSE decision_note END WHERE id = $1`, [app.id, to, W.isDecision(to), note || null]);
  await audit(actor.id, app.id, 'status', { from: app.status, to, note: note || undefined });
}

async function setKinds(app, kinds, actorId) {
  if (app.status !== 'draft') throw err(409, 'What you are applying for can only be changed before sending.');
  const ks = cleanKinds(kinds);
  if (!ks.length) throw err(400, 'Choose at least one thing you are applying for.');
  await db.query('UPDATE applications SET kinds = $2, updated_at = now() WHERE id = $1', [app.id, ks]);
  await audit(actorId, app.id, 'kinds', { kinds: ks });
}

module.exports = { create, byRef, answersOf, saveSection, documentsOf, readiness, submit, move, setKinds, parseValue, cleanKinds, KIND_KEYS };
